import './ThreadList.css';
import Form from './Form';
import { NostrContext } from './App';
import { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { nip19, getPublicKey, getEventHash, signEvent } from 'nostr-tools';
import EmojiPicker from 'emoji-picker-react';

const bbsRootReference = 'https://bbs-on-nostr.murakmii.dev';

function ThreadList() {
  const [at, setAt] = useState(new Date().getTime());
  const [threads, setThreads] = useState([]);
  const [threadEOSE, setThreadEOSE] = useState(false);
  const [profiles, setProfiles] = useState({});
  const [emojiSelectingFor, setEmojiSelectingFor] = useState(null);
  const [reactions, setReactions] = useState({});

  const { relay } = useContext(NostrContext);

  // スレッドとリアクションのsubscribeを開始する
  useEffect(() => {
    // r-tag(https://github.com/nostr-protocol/nips/blob/master/12.md)に'https://bbs-on-nostr.murakmii.dev'を持つノートをスレッドとして扱う。
    // 以下ではその条件に該当するノートを返すようフィルターを設定しsubscribeしている(念のため1000件でフィルタ)
    const stopThread = relay.current.subscribe(
      {
        kinds: [1],
        '#r': [bbsRootReference],
        limit: 1000,
      },
      (event, relayURL) => {
        setThreads(prev => {
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
      },
      () => {
        // NIP-15(https://github.com/nostr-protocol/nips/blob/master/15.md)に対応しているリレーなら、
        // 現時点でフィルタにマッチするイベントを送り切った時点でEOSE通知を送ってくれる。
        // ここではスレッドを一通り受信してからプロフィールを取得するため、EOSEを受信したことを記録している。
        setThreadEOSE(true);
      }, 
    );

    // リアクションを恒久的にsubscribeする
    // 今のところ、r-tagで絞り込みどのスレッドへのリアクションかはクライアント側で判定している
    // (個別のe-tag指定でも取得できるが、r-tag1つの方がリレーの負荷が少ないのでは？と予想)
    // リアクションはこれに依存するリソースがなくEOSEを検知する必要がないのでハンドラは省略、
    // またイベントをどのリレーから受信したのかも必要ないので保持しない(リアクションがe-tagで参照されることがないので)
    const stopReaction = relay.current.subscribe(
      {
        kinds: [7],
        '#r': [bbsRootReference],
      },
      (event) => {
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
      }
    );

    return () => {
      stopThread();
      stopReaction();
    };
  }, []);

  // スレッド数の変動に応じてプロフィール情報を取得する(kind: 0と公開鍵により絞り込み)。
  // このような取得は恐らくどのようなSNS用クライアントでも行っているはず。
  // スレッドの取得がEOSEした時点で一気に取得し、以降はスレッドの追加に合わせて取得する。
  useEffect(() => {
    // 未取得のプロフィールのみ取得
    const exists = new Set(Object.keys(profiles));
    const pubkeys = Array.from(new Set(threads.map(t => t.pubkey).filter(p => !exists.has(p))));

    if (pubkeys.length == 0 || !threadEOSE) {
      return;
    }

    // subscribeを始めたプロフィールについてはキーだけ作っておいて、スレッド更新時に重複取得しないように
    const newProfiles = { ...profiles };
    pubkeys.forEach(p => newProfiles[p] = null);
    setProfiles(newProfiles);

    // 複数サーバーから取得すると複数のプロフィールが見つかるかもしれないので、
    // 一旦全てpubkeyをキーに配列にまとめる。
    const receivingProfiles = {};
    relay.current.subscribe(
      { 
        kinds: [0],
        authors: pubkeys,
      },
      (event) => {
        if (!receivingProfiles[event.pubkey]) {
          receivingProfiles[event.pubkey] = [];
        }
        receivingProfiles[event.pubkey].push({ ...JSON.parse(event.content), created_at: event.created_at });
      },
      (stop) => {
        // プロフィールを時系列でマージして更新
        const addedProfiles = {};
        Object.keys(receivingProfiles).forEach(pubkey => {
          addedProfiles[pubkey] = receivingProfiles[pubkey]
            .sort((a, b) => a.created_at - b.created_at)
            .reduce((a, b) => Object.assign(a, b));
        });

        setProfiles(prev => ({ ...prev, ...addedProfiles }))

        // プロフィールをリアルタイムで監視する必要は薄いのでEOSEと同時に止めておく
        stop();
      },
    );
  }, [threads, threadEOSE]);

  // スレッドの作成。
  // この時作成されるノートにはスレッドのタイトルを設定したいので、
  // NIP-14(https://github.com/nostr-protocol/nips/blob/master/14.md)に従ってタイトル情報をタグに設定する。
  // また、このノートがスレッド一覧取得のフィルタにマッチするようr-tagを設定しておく。
  // このように作成されたノートはSNS用クライアントからは通常のノートのように表示されるはず。
  const createThread = ({ subject, content, encodedPrivKey, useNIP07 }) => {
    (async () => {
      let event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['subject', subject],
          ['r', bbsRootReference],
        ],
        content: content,
      };
  
      // Form側でNIP-07対応確認が取れているならそれを使って署名する
      if (useNIP07) {
        event = await window.nostr.signEvent(event);
      } else {
        const privkey = nip19.decode(encodedPrivKey).data;
        event.pubkey = getPublicKey(privkey);
        event.id = getEventHash(event);
        event.sig = signEvent(event, privkey);
      }

      relay.current.publish(event)
        .then(() => {
          window.alert('スレッドを作成しました！');
          setAt(new Date().getTime());
        })
        .catch(() => {
          window.alert(`スレッドの作成に失敗しました...`);
        });
    })();
  };

  // Emojiによるリアクション。Kind: 7であればよく、制限は少ない。
  // contentに絵文字を含むことは可能だが、絵文字を使用した場合それがどのように解釈されるかはクライアント依存となっている。
  const reaction = (emojiData) => {
    (async () => {
      let event = {
        kind: 7,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['r', bbsRootReference],
          ['e', emojiSelectingFor.id, emojiSelectingFor.relayURL],
        ],
        content: emojiData.emoji,
      };

      setEmojiSelectingFor(null);
      relay.current.publish(await window.nostr.signEvent(event))
        .catch(() => {
          window.alert(`リアクションに失敗しました...`);
        });
    })();
  };

  const enableNIP07 = window.nostr && window.nostr.signEvent; 

  return (
    <div id="ThreadList">
      {emojiSelectingFor && (
        <div id="EmojiSelector" onClick={(e) => e.target.id == 'EmojiSelector' && setEmojiSelectingFor(null)}>
          <EmojiPicker onEmojiClick={reaction} />
        </div>
      )}

      <Form forThread={true} key={at} onSubmit={createThread} />

      <div className="Threads">
        <h2>Thread List</h2>
        {threads.map((t, i) => (
          <div key={i} className={"Thread " + (enableNIP07 ? 'EnableNIP07' : '')}>
            <a href={"https://snort.social/p/" + t.pubkey} target="_blank" rel="noreferrer">
              <img src={profiles[t.pubkey] && profiles[t.pubkey].picture} />
            </a>

            <div>
              <h3><Link to={`/threads/${t.id}`}>{t.subject}</Link></h3>
              <p>
                by {profiles[t.pubkey] && (profiles[t.pubkey].display_name || profiles[t.pubkey].name)} created at {new Date(t.createdAt * 1000).toLocaleString()} 
                <b onClick={() => setEmojiSelectingFor(t)}>+ Reaction</b>
              </p>
              <div className="Reactions">
                {reactions[t.id] && Object.keys(reactions[t.id]).map(emoji => {
                  return <span key={emoji}>{emoji}:{reactions[t.id][emoji]}</span>
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ThreadList;
