import './App.css';
import ThreadList from './ThreadList';
import { useOutlet, Link } from 'react-router-dom';
import { useRef, useEffect, useState, createContext } from 'react';
import { MultiplexedRelays } from './Nostr';

export const NostrContext = createContext();

function App() {
  const relayRef = useRef(null);
  if (relayRef.current === null) {
    relayRef.current = new MultiplexedRelays(1, [
      'wss://nostr-pub.wellorder.net',
      'wss://relay.snort.social',
    ]);
  }

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    relayRef.current.connect().then(() => setConnected(true));
  }, []);

  const child = useOutlet();

  return (
    <div id="App">
      <h1><Link to="/">BBS on Nostr</Link></h1>
      <p>
        Nostr上に実験的に実装されたBBSです:
        <a href="https://github.com/murakmii/bbs-on-nostr" target="_blank" rel="noreferrer">https://github.com/murakmii/bbs-on-nostr</a><br />
        リレーは nostr-pub.wellorder.net のみを使用させていただいています。<br />
        不安な人は捨て垢でやるか、拡張機能を入れるといいよ(Emoji Reactionは拡張機能限定)。
      </p>
      {connected && <NostrContext.Provider value={{relay: relayRef}}>
        <div id="Main">
          {child || <ThreadList />}
        </div>
      </NostrContext.Provider>}
    </div>
  );
}

export default App;
