import './App.css';
import ThreadList from './ThreadList';
import { useOutlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <div id="App">
      <Toaster />
      <h1>BBS on Nostr</h1>
      <p>
        Nostr上に実験的に実装されたBBSです:
        <a href="https://github.com/murakmii/bbs-on-nostr" target="_blank" rel="noopener">https://github.com/murakmii/bbs-on-nostr</a><br />
        リレーは nostr-pub.wellorder.net のみを使用させていただいています。<br />
        不安な人は捨て垢でやるといいよ。
      </p>
      {useOutlet() || <ThreadList />}
    </div>
  );
}

export default App;
