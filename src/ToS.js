import './ToS.css';

function ToS() {
  return (
    <div id="ToS">
      <h2>利用規約</h2>
      <ul>
        <li>
          本サイトでスレッド、リプライの作成を行うユーザーは、以下の規約に同意の上、それらを行うものとします
        </li>
        <li>
          本サイトは<a href="https://snort.social/p/npub1rpqr4ygerl4357lsn02c8cm8qq4tv55tapnmmnslld37prkcprzs0flhga" target="_blank" rel="noopener">murakmii</a>(以下、開発者)が実験的に公開しているサイトです。
          そのため、都合により断りなく停止、非公開化を行う場合があります
        </li>
        <li>
          本サイトはデータを<a href="https://github.com/nostr-protocol/nostr" target="_blank" rel="noopener">Nostr</a>に登録します。
          従って、本サイトで作成したスレッド、リプライの内容はインターネット上に公開され、かつ削除できないものであることに同意するものとします
        </li>
        <li>
          誹謗中傷、なりすまし、スパム行為、Nostrリレーサーバー運用の妨害、その他法令に抵触し得る行為をスレッド、リプライ機能を用いて行うことを禁止します
        </li>
        <li>
          本サイトを利用することによって生じたいかなる損害に対しても、開発者は責任を負わないものとします
        </li>
      </ul>
    </div>
  )
}

export default ToS;
