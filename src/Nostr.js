import { relayInit } from 'nostr-tools';

export const bbsRootReference = 'https://bbs-on-nostr.murakmii.dev';

// NIP-07(https://github.com/nostr-protocol/nips/blob/master/07.md)対応状況を確認する。
// 確認といってもwindowオブジェクトのプロパティを確認するだけ。
export const enableNIP07 = () => window.nostr && window.nostr.getPublicKey && window.nostr.signEvent;

// リレーサーバーに接続する。
// 接続に成功した場合は履行値としてRelay、
// 失敗した場合は拒否理由として接続先URLを返すようなPromiseを返す。
function connectToRelay(url) {
  return new Promise((resolve, reject) => {
    const relay = relayInit(url);

    relay.connect()
      .then(() => resolve(relay))
      .catch(() => reject(url));
  });
}

export class MultiplexedRelays {
  constructor(guarantee, relayURLs) {
    this.guarantee = guarantee;
    this.relayURLs = relayURLs;
    this.activeRelays = [];
    this.conn = null;
  }

  connect() {
    if (this.conn) {
      return this.conn;
    }

    this.conn = new Promise((resolve, reject) => {
      Promise.allSettled(this.relayURLs.map(connectToRelay))
        .then(result => {
          const connected = [];
          result.forEach(r => {
            if (r.status === 'fulfilled') {
              connected.push(r.value);
            } else {
              console.warn(`failed to connect relay server: ${r.reason}`);
            }
          });

          if (connected.length < this.guarantee) {
            connected.forEach(c => c.close());
            reject();
          } else {
            this.activeRelays = connected;
            console.info(`connected ${this.activeRelays.length} relay servers`);
            resolve();
          }
      });
    });

    return this.conn;
  }

  // 一連のリレーサーバーへイベントを送信し、1件でも送信できたなら履行されるPromiseを返す
  publish(event) {
    return Promise.any(this.activeRelays.map(r => {
      console.log(`publish event to ${r.url}`);
      return new Promise((resolve, reject) => {
        const pub = r.publish(event);
        pub.on('ok', resolve);
        pub.on('seen', resolve);
        pub.on('failed', (reason) => {
          console.warn(`failed to publish event to ${r.url}: ${reason}`);
          reject();
        });
      });
    }));
  }

  // 戻り値の関数を呼び出し停止するまで行われるsubscribeを実行する。
  // イベント受信時にはhandleEventが、全リレーサーバーでEOSEが返却された時点でhandleEOSEが呼び出される。
  // リレーサーバーによってEOSEが返されるタイミングはまちまちであるため、handleEOSEが呼び出されるよりも前に、
  // 一部サーバーのEOSE後のイベントがhandleEventに渡される可能性がある点に留意する。
  subscribe(filters, handleEvent, handleEOSE) {
    const receivedIDs = new Set();
    const subscriptions = [];
    const allEOSE = [];

    const stop = () => subscriptions.forEach(s => {
      s.sub.unsub();
      console.info(`close subscription for ${s.relayURL}`);
    });

    this.activeRelays.forEach(r => {
      const sub = r.sub(filters);
      subscriptions.push({sub, relayURL: r.url});

      console.info(`start subscription for ${r.url}`, filters);

      sub.on('event', (event) => {
        // 複数のリレーサーバーから重複してイベントを受信した場合は後続を無視する。
        // SetにイベントIDがたまり続けるが、掲示板程度であれば問題ないと判断。
        if (receivedIDs.has(event.id)) {
          return;
        }

        receivedIDs.add(event.id);
        handleEvent(event, r.url, stop);
      });
      allEOSE.push(new Promise((resolve => sub.on('eose', resolve))));
    });

    Promise.all(allEOSE).then(() => handleEOSE && handleEOSE(stop))

    return stop;
  }

  close() {
    // RelayのcloseはPromiseを返すが、これを待つケースは当掲示板では無さそうなので無視する
    this.activeRelays.forEach(r => r.close());
  }
};
