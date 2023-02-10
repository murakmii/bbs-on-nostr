import './App.css';
import ThreadList from './ThreadList';
import { useOutlet, Link } from 'react-router-dom';
import { useRef, useEffect, useState, createContext, useReducer } from 'react';
import { 
  bbsRootReference,
  MultiplexedRelays
} from './Nostr';

export const NostrContext = createContext();
export const BBSContext = createContext();

function profilesReducer(state, action) {
  let newState = state;

  switch (action.type) {
    // 受信中のプロフィールを重複してsubscribeしないよう、先にキーだけ登録しておく
    case 'RECEIVING':
      newState = { ...state };
      action.pubkeys.forEach(p => newState[p] = null);
      break;

    // 受信したkind: 0なイベントによるプロフィールの追加
    case 'RECEIVED':
      // pubkeyにつき複数のイベントがある可能性があるため、まずはpubkey毎にまとめる
      const eachPubKeys = {}
      action.events.forEach(e => {
        if (!eachPubKeys[e.pubkey]) {
          eachPubKeys[e.pubkey] = [];
        }
        eachPubKeys[e.pubkey].push({ ...JSON.parse(e.content), created_at: e.created_at });
      });

      // 時系列でマージして1つのプロフィールにする
      const mergedProfiles = {};
      Object.keys(eachPubKeys).forEach(p => {
        mergedProfiles[p] = eachPubKeys[p]
          .sort((a, b) => a.created_at - b.created_at)
          .reduce((a, b) => Object.assign(a, b));
      });

      newState = { ...state, ...mergedProfiles };
      break;
  }

  return newState;
}

function App() {
  const relayRef = useRef(null);
  if (relayRef.current === null) {
    relayRef.current = new MultiplexedRelays(1, [
      'wss://nostr-pub.wellorder.net',
      'wss://relay.snort.social',
    ]);
  }

  // スレッド一覧はスレッドを行き交う際頻繁に表示されるため、
  // 都度subscribeするとリレーのrate limitに達しやすい。
  // そのためスレッドとそのリアクションは常にメモリ上に保持し、かつsubscribeも維持し続けるようにしている。
  const [connected, setConnected] = useState(false);
  const [threads, setThreads] = useState([]);
  const [reactions, setReactions] = useState({});
  const [eose, setEOSE] = useState(false);

  const [profiles, profilesDispatch] = useReducer(profilesReducer, {});
  const [pubKey, setPubKey] = useState(null);
  
  // 受信したスレッドを保持
  const receiveThread = (event, relayURL) => {
    setThreads(prev => {
      if (prev.find(t => t.id === event.id)) {
        return prev;
      }

      const newThreads = JSON.parse(JSON.stringify(prev)).concat({
        id: event.id,
        pubkey: event.pubkey, 
        createdAt: event.created_at,
        content: event.content,
        subject: event.tags.filter(t => t[0] == 'subject').map(t => t[1])[0] || 'No title',
        relayURL, // スレッドに返信する際、e-tagのパラメータとして参照リレー先が必要なのでスレッドに保持しておく
      });

      return newThreads.sort((a, b) => b.createdAt - a.createdAt);
    });
  };

  // 受信したリアクションを保持
  const receiveReaction = (event) => {
    const threadID = (event.tags.filter(t => t[0] === 'e')[0] || [])[1];
    if (!threadID || event.content === '+' || event.content === '-') { // +, -は表示に困るのであえて無視
      return;
    }

    setReactions(prev => {
      const newState = JSON.parse(JSON.stringify(prev));
      
      if (!newState[threadID]) {
        newState[threadID] = {};
      }
      
      if (newState[threadID][event.content]) {
        newState[threadID][event.content] += 1;
      } else {
        newState[threadID][event.content] = 1;
      }

      return newState;
    });  
  };

  // スレッドとリアクションのためのsubscriptionを立ち上げる。
  // r-tag(https://github.com/nostr-protocol/nips/blob/master/12.md)に'https://bbs-on-nostr.murakmii.dev'を持つノートをスレッドとして扱う。
  // リアクションについては、今のところ、r-tagで絞り込みどのスレッドへのリアクションかはクライアント側で判定している。
  // subscriptionには複数のフィルタを設定できるため、1つのsubscriptionで両方を取得しコールバック内でどちらかを判断していく。
  useEffect(() => {
    let stop = null;
    (async () => {
      await relayRef.current.connect();
      setConnected(true);

      stop = relayRef.current.subscribe(
        [
          {
            kinds: [1],
            '#r': [bbsRootReference],
            limit: 1000,
          },
          {
            kinds: [7],
            '#r': [bbsRootReference],
          }
        ],
        (event, relayURL) => event.kind === 1 ? receiveThread(event, relayURL) : receiveReaction(event),
        () => {
          // NIP-15(https://github.com/nostr-protocol/nips/blob/master/15.md)に対応しているリレーなら、
          // 現時点でフィルタにマッチするイベントを送り切った時点でEOSE通知を送ってくれる。
          // ここではスレッドを一通り受信してからプロフィールを取得するため、EOSEを受信したことを記録している。
          setEOSE(true);
        }
      )
    })();

    return () => {
      if (stop) {
        stop();
      }
      relayRef.current.close();
    };
  }, []);

  // スレッド作成者情報の増加に応じたのプロフィール取得の取得。
  // 初回はEOSEにより全スレッド情報が送信されるまで待ってから1度に取得する。
  // (そうしないとsubscriptionが増えすぎる)
  useEffect(() => {
    // 未取得のプロフィールのみ取得
    const exists = new Set(Object.keys(profiles));
    const pubkeys = Array.from(new Set(threads.map(t => t.pubkey).filter(p => !exists.has(p))));

    if (pubkeys.length == 0 || !eose) {
      return;
    }

    profilesDispatch({ type: 'RECEIVING', pubkeys });

    const events = [];
    relayRef.current.subscribe(
      [
        { 
          kinds: [0],
          authors: pubkeys,
        },
      ],
      (event) => events.push(event),
      (stop) => {
        profilesDispatch({ type: 'RECEIVED', events });
        stop();
      },
    );
  }, [threads, eose]);

  const child = useOutlet();
  return (
    <div id="App">
      <h1><Link to="/">BBS on Nostr</Link></h1>
      <p>
        Nostr上に実験的に実装されたBBSです:
        <a href="https://github.com/murakmii/bbs-on-nostr" target="_blank" rel="noreferrer">https://github.com/murakmii/bbs-on-nostr</a><br />
        リレーは nostr-pub.wellorder.net, relay.snort.social を使用させていただいています。<br />
        認証情報を安全に扱うための<a href="https://github.com/nostr-protocol/nips/blob/master/07.md#implementation" target="_blank" rel="noreferrer">NIP-07対応のブラウザ拡張</a>の導入を推奨しています。
      </p>
      {connected && (
        <NostrContext.Provider value={{relay: relayRef, pubKey, setPubKey}}>
          <BBSContext.Provider value={{ threads, reactions, profiles, profilesDispatch}}>
            <div id="Main">
              {child || <ThreadList />}
            </div>
          </BBSContext.Provider>
        </NostrContext.Provider>
      )}
    </div>
  );
}

export default App;
