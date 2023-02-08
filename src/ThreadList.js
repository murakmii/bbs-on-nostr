import './ThreadList.css';
import Form from './Form';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { relayInit, nip19, getPublicKey, getEventHash, signEvent } from 'nostr-tools';

const bbsRelayURL = 'wss://nostr-pub.wellorder.net';
const bbsRootReference = 'https://bbs-on-nostr.murakmii.dev';

function ThreadList() {
  const relayRef = useRef();
  const threadSubRef = useRef();

  const [at, setAt] = useState(new Date().getTime());
  const [threads, setThreads] = useState([]);
  const [profiles, setProfiles] = useState({});
  
  // リレーとの接続を確立し、スレッド一覧を取得する
  useEffect(() => {
    (async () => {
      try {
        relayRef.current = relayInit(bbsRelayURL);
        await relayRef.current.connect();

        // r-tag(https://github.com/nostr-protocol/nips/blob/master/12.md)に'https://bbs-on-nostr.murakmii.dev'を持つノートをスレッドとして扱う。
        // 以下ではその条件に該当するノートを返すようフィルターを設定しsubscribeしている(念のため1000件でフィルタ)
        threadSubRef.current = relayRef.current.sub([
          {
            kinds: [1],
            '#r': [bbsRootReference],
            limit: 1000,
          }
        ]);

        threadSubRef.current.on('event', event => {
          setThreads(prevThreads => {
            const newThreads = prevThreads.concat({
              id: event.id,
              pubkey: event.pubkey, 
              createdAt: event.created_at,
              content: event.content,
              subject: event.tags.filter(t => t[0] == 'subject').map(t => t[1])[0] || 'No title',
            });

            return newThreads.sort((a, b) => b.createdAt - a.createdAt);
          });
        });
      } catch (e) {
        window.alert('スレッド一覧取得中にエラーが発生しました。ネットワークの調子が悪いかも?');
      }
    })();

    return () => relayRef.current.close();
  }, []);

  // スレッド数の変動に応じてプロフィール情報を取得する(kind: 0と公開鍵により絞り込み)。
  // このような取得は恐らくどのようなSNS用クライアントでも行っているはず。
  useEffect(() => {
    // 未取得のプロフィールのみ取得
    const exists = new Set(Object.keys(profiles));
    const pubkeys = Array.from(new Set(threads.map(t => t.pubkey).filter(p => !exists.has(p))));

    if (pubkeys.length == 0) {
      return;
    }

    // subscribeを始めたプロフィールについてはキーだけ作っておいて、スレッド更新時に重複取得しないように
    const newProfiles = { ...profiles };
    pubkeys.forEach(p => newProfiles[p] = null);
    setProfiles(newProfiles);

    const sub = relayRef.current.sub([
      { 
        kinds: [0],
        authors: pubkeys,
      },
    ]);

    sub.on('event', event => {
      setProfiles(prev => ({ ...prev, [event.pubkey]: JSON.parse(event.content) }));
    });

    // NIP-15(https://github.com/nostr-protocol/nips/blob/master/15.md)に対応しているリレーなら、
    // 現時点でフィルタにマッチするイベントを送り切った時点でEOSE通知を送ってくれる。
    // このBBSではスレッドの変動に応じて都度プロフィールを取得しており、恒久的にsubscribeをする必要がないため、
    // EOSEの時点でこれを終了する。
    sub.on('eose', () => sub.unsub());
  }, [threads]);

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
  
      let pub = relayRef.current.publish(event);
      pub.on('ok', () => {
        window.alert('スレッドを作成しました！');
        setAt(new Date().getTime());
      });
      pub.on('failed', reason => {
        window.alert(`スレッドの作成に失敗しました...(${reason})`);
      });
    })();
  };

  return (
    <div id="ThreadList">
      <Form forThread={true} key={at} onSubmit={createThread} />

      <div className="Threads">
        <h2>Thread List</h2>

        {threads.map((t, i) => (
          <div key={i} className="Thread">
            <a href={"https://snort.social/p/" + t.pubkey} target="_blank" rel="noreferrer">
              <img src={profiles[t.pubkey] && profiles[t.pubkey].picture} />
            </a>

            <div>
              <h3><Link to={`/threads/${t.id}`}>{t.subject}</Link></h3>
              <p>by {profiles[t.pubkey] && profiles[t.pubkey].display_name} created at {new Date(t.createdAt * 1000).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ThreadList;
