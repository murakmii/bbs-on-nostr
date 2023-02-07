import './ThreadList.css';
import Button from './Button';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { relayInit, nip19, getPublicKey, getEventHash, signEvent } from 'nostr-tools';

const bbsRelayURL = 'wss://nostr-pub.wellorder.net';
const bbsRootReference = 'https://bbs-on-nostr.murakmii.dev';

function ThreadList() {
  const relayRef = useRef();
  const threadSubRef = useRef();
  const profileSubRef = useRef();

  const [threads, setThreads] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [validInput, setValidInput] = useState(false);
  
  useEffect(() => {
    (async () => {
      try {
        relayRef.current = relayInit(bbsRelayURL);
        await relayRef.current.connect();

        threadSubRef.current = relayRef.current.sub([
          {
            kinds: [1],
            '#r': [bbsRootReference],
            limit: 100,
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

        threadSubRef.current.on('eose', () => threadSubRef.current.unsub());
      } catch (e) {
        console.log('error', e);
      }
    })();

    return () => relayRef.current.close();
  }, []);

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
      console.log('profile', event);
      setProfiles(prev => ({ ...prev, [event.pubkey]: JSON.parse(event.content) }));
    });
    profileSubRef.current.on('eose', event => {
      profileSubRef.current.unsub();
      profileSubRef.current = null;
    });
  }, [threads]);

  const validate = () => {
    const subject = document.thread.subject.value;
    const content = document.thread.content.value;
    const privkey = document.thread.privkey.value;

    return (
      subject.length > 0 && subject.length < 100 && !subject.includes('nsec') &&
      content.length > 0 && content.length < 1000 && !content.includes('nsec') &&
      privkey.length > 0 &&
      document.thread.tos.checked
    );
  };

  const createThread = (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    const privkey = nip19.decode(document.thread.privkey.value).data;
    const pubkey = getPublicKey(privkey);

    let event = {
      kind: 1,
      pubkey: pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['subject', document.thread.subject.value],
        ['r', bbsRootReference],
      ],
      content: document.thread.content.value,
    };

    event.id = getEventHash(event);
    event.sig = signEvent(event, privkey);

    console.log('complete event', event);
    
    let pub = relayRef.current.publish(event);
    pub.on('ok', () => {
      console.log(`${relayRef.current.url} has accepted our event`)
    });
    pub.on('failed', reason => {
      console.log(`failed to publish to ${relayRef.current.url}: ${reason}`)
    });
  };

  return (
    <div id="ThreadList">
      <form name="thread" onSubmit={() => false}>
        <table>
          <tbody>
            <tr>
              <th>タイトル</th>
              <td><input type="text" name="subject" onChange={() => setValidInput(validate())} /></td>
            </tr>
            <tr>
              <th>本文</th>
              <td>
                <textarea 
                  name="content" 
                  placeholder="安全のため、'nsec'という文字が含まれるテキストを持つスレッドは作成できません"
                  onChange={() => setValidInput(validate())}
                />
              </td>
            </tr>
            <tr>
              <th>秘密鍵</th>
              <td>
                <input type="text" name="privkey" placeholder="nsecXXX..." onChange={() => setValidInput(validate())} /><br />
              </td>
            </tr>
            <tr>
              <td colSpan="2">
                <input type="checkbox" id="ReadTOS" name="tos" onChange={() => setValidInput(validate())} />
                <label htmlFor="ReadTOS"><a href="/tos" target="_blank" rel="noopener">利用規約</a>に同意します</label>
                <Button disabled={!validInput} onClick={createThread}>スレッドを作成</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </form>

      <div className="Threads">
        <h2>Threads</h2>

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
