import './App.css';
import ThreadList from './ThreadList';
import { useOutlet, Link } from 'react-router-dom';
import { useRef, useEffect, useState, createContext, useReducer } from 'react';
import { 
  bbsRootReference,
  parseNIP05Identifier,
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

      // 時系列でマージして1つのプロフィールにする。
      // また、ドメイン認証情報の結果を'nip05Result'プロパティで保持するようにする
      const mergedProfiles = {};
      Object.keys(eachPubKeys).forEach(p => {
        mergedProfiles[p] = eachPubKeys[p]
          .sort((a, b) => a.created_at - b.created_at)
          .reduce((a, b) => Object.assign(a, b));

        mergedProfiles[p].nip05Result = parseNIP05Identifier(mergedProfiles[p].nip05 || '') ? 'pending' : 'none';
        if (!mergedProfiles[p].picture) {
          mergedProfiles[p].picture = '/default-icon.jpg';
        }
      });

      // 取得できなかったプロフィールについてはデフォルト値を設定
      action.expected.forEach(p => {
        if (mergedProfiles[p]) {
          return;
        }
        mergedProfiles[p] = {name: 'Nostrich', picture: '/default-icon.jpg'};
      });

      newState = { ...state, ...mergedProfiles };
      break;

    case 'CHECKING_DOMAIN_IDENTIFIER':
      newState = { ...state, [action.pubKey]: { ...state[action.pubKey], nip05Result: 'checking' } };
      break;

    case 'SET_DOMAIN_IDENTIFIER_RESULT':
      newState = { ...state, [action.pubKey]: { ...state[action.pubKey], nip05Result: action.result } };
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
  const [threads, setThreads] = useState({});
  const [lastReplyTimes, setLastReplyTimes] = useState({});
  const [reactions, setReactions] = useState({});
  const [eose, setEOSE] = useState(false);

  const [profiles, profilesDispatch] = useReducer(profilesReducer, {});
  const [pubKey, setPubKey] = useState(null);
  
  // 受信したテキストイベントを処理。
  // ここで受信するテキストイベントはスレッドとリプライ両方を取得している。
  // リプライは更新日時計算用で、e-tagの有無でスレッドかどうかを判断できる。
  const receiveText = (event, relayURL) => {
    const eTag = event.tags.find(t => t[0] === 'e');
    if (eTag && eTag[1]) {
      setLastReplyTimes(prev => {
        const newState = { ...prev };
        newState[eTag[1]] = Math.max(newState[eTag[1]] || 0, event.created_at);

        return newState;
      });
      return;
    }

    setThreads(prev => ({ ...prev, [event.id]: {
      id: event.id,
      pubkey: event.pubkey, 
      createdAt: event.created_at,
      content: event.content,
      subject: event.tags.filter(t => t[0] === 'subject').map(t => t[1])[0] || 'No title',
      relayURL, // スレッドに返信する際、e-tagのパラメータとして参照リレー先が必要なのでスレッドに保持しておく
    }}));
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
  // r-tag(https://github.com/nostr-protocol/nips/blob/master/12.md)に'https://bbs-on-nostr.murakmii.dev'を持つノートを
  // 掲示板関連のテキストイベントとして取得する。
  //
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
            limit: 300,
          },
          {
            kinds: [7],
            '#r': [bbsRootReference],
          }
        ],
        (event, relayURL) => event.kind === 1 ? receiveText(event, relayURL) : receiveReaction(event),
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
    const pubkeys = Array.from(new Set(Object.values(threads).map(t => t.pubkey).filter(p => !exists.has(p))));

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
        profilesDispatch({ type: 'RECEIVED', events, expected: pubkeys });
        stop();
      },
    );
  }, [threads, eose]);

  // 更新日時をマージしてソート済みスレッド一覧を生成。EOSEまでは頻繁に内容が変わるので空にして見せないようにしておく
  // TODO: レンダリングの度にソートするのは微妙そう
  const sortedThreads = !eose ? [] : Object.values(threads).map(t => (
    { ...t, updatedAt: lastReplyTimes[t.id] || t.createdAt }

  )).sort((a, b) => (
    Math.max(b.updatedAt, b.createdAt) - Math.max(a.updatedAt, a.createdAt)
  ));

  const child = useOutlet();
  return (
    <div id="App">
      <h1><Link to="/">BBS on Nostr</Link></h1>
      <p className="Description">
        Nostr上に実験的に実装されたBBSです:
        <a href="https://github.com/murakmii/bbs-on-nostr" target="_blank" rel="noreferrer">https://github.com/murakmii/bbs-on-nostr</a><br />
        リレーは nostr-pub.wellorder.net, relay.snort.social を使用させていただいています。<br />
      </p>

      <p className="Links">
        <b>Nostr project links: </b>
        <a href="https://nostr.hoku.in" target="_blank" rel="noreferrer">Nostr検索ポータル</a>
      </p>

      {connected && (
        <NostrContext.Provider value={{relay: relayRef, pubKey, setPubKey}}>
          <BBSContext.Provider value={{ threads: sortedThreads, reactions, profiles, profilesDispatch}}>
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
