# BBS on Nostr

Deployed on [https://bbs-on-nostr.vercel.app/](https://bbs-on-nostr.vercel.app/)

## これはなに？

NostrではSNS以外の見せ方も結構簡単に作れるよ、ということを示すための実験的な掲示板実装です。  
掲示板自体としての価値はあまり重要視していないので、Vercel上にデプロイしているものは気分で非公開にするかもしれません。

## どう実装されているの？

Nostrにおけるクライアントは、接続先リレーサーバーに対してリクエストを発行し、  
そのリクエストに設定されたフィルタ設定に一致するイベントをリレーサーバーから返してもらうことでクライアントとして動作します。  
フィルタ設定は比較的柔軟に設定可能で、一般的なSNS用クライアントでは使用しないようなフィルタも設定可能です。  
そしてフィルタの1つに、「イベントが参照しているURLをベースにフィルタする(もうちょっと詳細に言うとr-tagによる絞り込み)」というものがあり、  
この掲示板ではこのフィルタを利用してスレッド一覧を実現しています。  

具体的には、スレッド作成時に作成されるイベントは普段SNS用クライアントで作成しているノートとほぼ同様ですが、  
参照URL情報として https://bbs-on-nostr.murakmii.dev を付与しています。
掲示板のスレッド一覧表示時はこのURLでイベントをフィルタし、スレッド一覧としています。

ちなみにスレッドへのリプライはSNS用クライアントのリプライと同様の仕様で動作するため、特に何も工夫していません。

余談ですが、Nostrではこのように「あるURLに言及しているノート」をクエリすることができるため、  
これを利用してWebページにノートをコメントとして埋め込むような実装も存在します。  
[https://github.com/fiatjaf/nocomment](https://github.com/fiatjaf/nocomment)

## 実装について

* `src/Nostr.js`
* `src/ThreadList.js`
* `src/Thread.js`
* `src/Form.js`(NIP-07対応確認のみ)

にNostrリレーサーバーと通信する実装があります。  
そこ以外は読んでも何も面白くないです。  
あとあまりフロントを書かない人間が書いているので、多分動作に支障はないまでもちょっと変な箇所があります。