import './Thread.css';
import Form from './Form';
import ReadableText from './ReadableText';
import { NostrContext, BBSContext } from './App';
import { useState, useEffect, useContext } from 'react';
import { nip19, getPublicKey, getEventHash, signEvent } from 'nostr-tools';
import { useParams } from 'react-router-dom';

const bbsRootReference = 'https://bbs-on-nostr.murakmii.dev';

function Thread() {
  const [thread, setThread] = useState(null);
  const [replies, setReplies] = useState([]);
  const [eose, setEOSE] = useState(false);
  const [at, setAt] = useState(new Date().getTime());

  const { id } = useParams();
  const { relay } = useContext(NostrContext);
  const { profiles, profilesDispatch } = useContext(BBSContext);

  const receiveThread = (event, relayURL) => {
    setThread({
      id: event.id,
      pubkey: event.pubkey, 
      createdAt: event.created_at,
      content: event.content,
      subject: event.tags.filter(t => t[0] == 'subject').map(t => t[1])[0] || 'No title',
      relayURL,
    });
  };

  const receiveReply = (event) => {
    setReplies(prevReplies => {
      const newReplies = prevReplies.concat({
        id: event.id,
        pubkey: event.pubkey, 
        createdAt: event.created_at,
        content: event.content,
      });
      return newReplies.sort((a, b) => b.createdAt - a.createdAt);
    });
  };

  // URLパスパラメータ中のIDで指定されるスレッド情報及びリプライ一覧を1つのsubscription内で取得する。
  // スレッド情報が受信されないままEOSEが受信された場合は404と判断できるが実装してない。
  // リプライはSNS用クライアント向けの仕様と同様、
  // 単にスレッドの元となっているイベントをe-tagで参照するテキストノートとしている。
  useEffect(() => relay.current.subscribe(
    [
      {
        ids: [id],
        kinds: [1],
        '#r': [bbsRootReference],
        limit: 1,
      },
      {
        kinds: [1], 
        '#e': [id],
        limit: 1000, 
      }
    ],
    (event, relayURL) => {
      if (event.id === id && event.tags.find(t => t[0] === 'r' && t[1] === bbsRootReference)) {
        receiveThread(event, relayURL);
      } else {
        receiveReply(event);
      }
    },
    () => setEOSE(true),
  ), []);

  // スレッド或いはリプライ一覧の変動に応じてプロフィール情報を取得する
  // この辺の処理はスレッド一覧の場合と同様。
  useEffect(() => {
    const exists = new Set(Object.keys(profiles));
    const pubkeys = replies.map(r => r.pubkey).concat(thread ? [thread.pubkey] : []).filter(p => !exists.has(p));

    if (!thread || pubkeys.length == 0 || !eose) {
      return;
    }

    profilesDispatch({ type: 'RECEIVING', pubkeys });

    const events = [];
    relay.current.subscribe(
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
  }, [thread, replies, eose]);

  // 返信作成。スレッドの作成とやることはほぼ同様。
  // e-tagでスレッドのイベントを参照し関連付けを行う。
  const createReply = ({ content, encodedPrivKey, useNIP07 }) => {
    (async () => {
      let event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['e', thread.id, thread.relayURL]],
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

      relay.current.publish(event)
        .then(() => {
          window.alert('返信しました！');
          setAt(new Date().getTime());
        })
        .catch(() => {
          window.alert(`返信に失敗しました...`);
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
            <ReadableText>{thread.content}</ReadableText>
          </div>
        </div> 
      )}

      {thread && <Form key={at} forThread={false} onSubmit={createReply} />}

      <div className="Replies">
        <h2>Recent replies: {replies.length}</h2>

        {replies.map(r => (
          <div className="Reply" key={r.id}>
            <a href={"https://snort.social/p/" + r.pubkey} target="_blank" rel="noreferrer">
              <img src={profiles[r.pubkey] && profiles[r.pubkey].picture} />
            </a>
            
            <div className="Detail">
              <h4>{profiles[r.pubkey] && profiles[r.pubkey].display_name} at {new Date(r.createdAt * 1000).toLocaleString()}</h4>
              <ReadableText>{r.content}</ReadableText>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Thread;