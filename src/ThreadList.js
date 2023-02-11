import './ThreadList.css';
import Form from './Form';
import Author from './Author';
import { NostrContext, BBSContext } from './App';
import { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { nip19, getPublicKey, getEventHash, signEvent } from 'nostr-tools';
import EmojiPicker from 'emoji-picker-react';
import { bbsRootReference } from './Nostr';

function ThreadList() {
  const [at, setAt] = useState(new Date().getTime());
  const [emojiSelectingFor, setEmojiSelectingFor] = useState(null);

  const { relay } = useContext(NostrContext);
  const { threads, reactions, profiles } = useContext(BBSContext);

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
          ['p', emojiSelectingFor.pubkey],
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
                <Author pubKey={t.pubkey} atUnix={t.createdAt} />
                <b className="Reaction" onClick={() => setEmojiSelectingFor(t)}>+ Reaction</b>
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
