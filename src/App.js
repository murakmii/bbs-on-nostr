import './App.css';
import ThreadList from './ThreadList';
import { useOutlet, Link } from 'react-router-dom';

function App() {
  return (
    <div id="App">
      <h1><Link to="/">BBS on Nostr</Link></h1>
      <p>
        Nostr上に実験的に実装されたBBSです:
        <a href="https://github.com/murakmii/bbs-on-nostr" target="_blank" rel="noreferrer">https://github.com/murakmii/bbs-on-nostr</a><br />
        リレーは nostr-pub.wellorder.net のみを使用させていただいています。<br />
        不安な人は捨て垢でやるか、拡張機能を入れるといいよ(Emoji Reactionは拡張機能限定)。
      </p>
      <div id="Main">
        {useOutlet() || <ThreadList />}
      </div>
    </div>
  );
}

export default App;
