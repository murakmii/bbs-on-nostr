import './Thread.css';
import Form from './Form';
import { useState, useEffect, useRef } from 'react';
import { relayInit, nip19, getPublicKey, getEventHash, signEvent } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

const bbsRelayURL = 'wss://nostr-pub.wellorder.net';
const bbsRootReference = 'https://bbs-on-nostr.murakmii.dev';

function Thread() {
  const relayRef = useRef();

  const [thread, setThread] = useState(null);
  const [replies, setReplies] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [at, setAt] = useState(new Date().getTime());

  const { id } = useParams();

  // 初めにスレッド情報を取得する
  useEffect(() => {
    (async () => {
      try {
        relayRef.current = relayInit(bbsRelayURL);
        await relayRef.current.connect();

        const thread = relayRef.current.sub([
          {
            ids: [id],
            '#r': [bbsRootReference],
            limit: 1,
          }
        ]);

        thread.on('event', event => {
          setThread({
            id: event.id,
            pubkey: event.pubkey, 
            createdAt: event.created_at,
            content: event.content,
            subject: event.tags.filter(t => t[0] == 'subject').map(t => t[1])[0] || 'No title',
          });

          thread.unsub();
        });
      } catch (e) {
        toast.error('エラーが発生しました。ネットワークの調子が悪いかも?');
      }
    })();

    return () => relayRef.current.close();
  }, []);

  // スレッドが取得できたならリプライ一覧を取得する
  useEffect(() => {
    if (!thread) {
      return;
    }

    const replies = relayRef.current.sub([{'#e': [thread.id]}]);

    replies.on('event', event => {
      setReplies(prevReplies => {
        const newReplies = prevReplies.concat({
          id: event.id,
          pubkey: event.pubkey, 
          createdAt: event.created_at,
          content: event.content,
        });
        return newReplies.sort((a, b) => b.createdAt - a.createdAt);
      });
    });
  }, [thread]);

  // プロフィール情報を取得する
  useEffect(() => {
    const exists = new Set(Object.keys(profiles));
    const pubkeys = replies.map(r => r.pubkey).concat(thread ? [thread.pubkey] : []).filter(p => !exists.has(p));

    const newProfiles = { ...profiles };
    pubkeys.forEach(p => newProfiles[p] = null);
    setProfiles(newProfiles);

    const sub = relayRef.current.sub([
      {
        kinds: [0],
        authors: pubkeys,
      }
    ]);

    sub.on('event', (event) => {
      setProfiles(prev => ({ ...prev, [event.pubkey]: JSON.parse(event.content) }));
    });

    sub.on('eose', () => sub.unsub());

  }, [thread, replies]);

  const createReply = ({ content, encodedPrivKey, useNIP07 }) => {
    (async () => {
      let event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['e', thread.id, bbsRelayURL]],
        content: content,
      };

      if (useNIP07) {
        event = await window.nostr.signEvent(event);
      } else {
        const privkey = nip19.decode(encodedPrivKey).data;
        event.pubkey = getPublicKey(privkey)
        event.id = getEventHash(event);
        event.sig = signEvent(event, privkey);
      }      

      let pub = relayRef.current.publish(event);
      pub.on('ok', () => {
        toast.success('返信しました！');
        setAt(new Date().getTime());
      });
      pub.on('failed', reason => {
        toast.error(`返信に失敗しました...(${reason})`);
      });
    })();
  };

  return (
    <div id="Thread">
      {thread && (
        <div id="ThreadContent">
          <img src={profiles[thread.pubkey] && profiles[thread.pubkey].picture} />
          <div className="Detail">
            <h3>
              {thread.subject}<br/>
              <b>by {profiles[thread.pubkey] && profiles[thread.pubkey].display_name} created at {new Date(thread.createdAt * 1000).toLocaleString()}</b>
            </h3>
            <p>{thread.content}</p>
          </div>
        </div> 
      )}

      {thread && <Form key={at} forThread={false} onSubmit={createReply} />}

      <div className="Replies">
        <h2>Recent replies: {replies.length}</h2>

        {replies.map(r => (
          <div className="Reply" key={r.id}>
            <img src={profiles[r.pubkey] && profiles[r.pubkey].picture} />
            <div className="Detail">
              <h4>{profiles[r.pubkey] && profiles[r.pubkey].display_name} at {new Date(r.createdAt * 1000).toLocaleString()}</h4>
              <p>{r.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Thread;