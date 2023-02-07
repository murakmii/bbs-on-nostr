import './ThreadList.css';
import Form from './Form';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { relayInit, nip19, getPublicKey, getEventHash, signEvent } from 'nostr-tools';
import toast from 'react-hot-toast';

const bbsRelayURL = 'wss://nostr-pub.wellorder.net';
const bbsRootReference = 'https://bbs-on-nostr.murakmii.dev';

function ThreadList() {
  const relayRef = useRef();
  const threadSubRef = useRef();
  const profileSubRef = useRef();

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
        toast.error('エラーが発生しました。ネットワークの調子が悪いかも?');
      }
    })();

    return () => relayRef.current.close();
  }, []);

  // スレッド作成者のプロフィール情報を取得する。
  // このような取得は恐らくどのようなSNS用クライアントでも行っているはず。
  useEffect(() => {
    const pubkeys = Array.from(new Set(threads.map(t => t.pubkey)));

    if (!relayRef.current || pubkeys.length == 0) {
      return;
    }

    if (profileSubRef.current) {
      profileSubRef.current.unsub();
    }

    profileSubRef.current = relayRef.current.sub([
      { 
        kinds: [0],
        authors: pubkeys,
      },
    ]);

    profileSubRef.current.on('event', event => {
      setProfiles(prev => ({ ...prev, [event.pubkey]: JSON.parse(event.content) }));
    });

    profileSubRef.current.on('eose', event => {
      profileSubRef.current.unsub();
      profileSubRef.current = null;
    });
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
        toast.success('スレッドを作成しました！');
        setAt(new Date().getTime());
      });
      pub.on('failed', reason => {
        toast.error(`スレッドの作成に失敗しました...(${reason})`);
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
            <img src={profiles[t.pubkey] && profiles[t.pubkey].picture} />

            <div>
              <h3><Link to={`/threads/${t.id}`}>{t.subject}</Link></h3>
              <p>by {profiles[t.pubkey] && profiles[t.pubkey].display_name} created at {new Date(t.createdAt * 1000).toLocaleDateString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ThreadList;
