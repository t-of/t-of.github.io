# online-kit

近くの人とスマホ 1 台ずつで遊ぶ「部屋」の共通部品（Firebase Realtime Database）。
ゲームのルールは知らない。正本はここ。使うアプリへは `room.js`・`database.rules.json` をそのままコピーする。

## 仕組み

- 部屋を作った端末（ホスト）だけが状態の正本を持ち、ゲームのエンジンを回す。ほかの端末（ゲスト）は操作を「お願い」として送り、ホストが当てた結果を受け取って描くだけ（ホスト方式）。
- 認証は匿名ログイン（Authentication の「匿名」を有効にする。段階 0 でオーナーが実施済み）。
- 通信は Realtime Database（`asia-southeast1`）。ゲームの状態は中身を見ずに **1 本の JSON 文字列** として置く（ほかのゲームにもそのまま使えるようにするため）。
- `database.rules.json` が「ゲストは `state` を書けない」「他人の uid で `actions` を書けない」を守る。アプリ側の確かめ（2-2 の操作の表）と合わせて二重に止める。

## 導入手順

1. `room.js`・`database.rules.json` をアプリのフォルダにコピーする（例 `online.js` から `import { createRoom, ... } from './room.js'`）。
2. Firebase のスクリプトは `room.js` の中で**動的 import**（「通信で遊ぶ」を押すなど、実際に使うときだけ）。アプリの起動時に読み込まない。圏外での起動・audit のオフライン再読み込みを壊さないため。
3. Firebase プロジェクトの設定値（`apiKey` など）は `room.js` の `FIREBASE_CONFIG` に置いてある（全ゲーム共通の 1 プロジェクト `tof-online`）。公開してよい値（RULES.md §1）。守りは rules 側。
4. `database.rules.json` は Firebase コンソールの Realtime Database → ルール タブに貼って公開する（正本はこのリポジトリ。公開はオーナーが行う。DECISIONS.md「Firebase のルールはリポジトリが正本」）。

## room.js が出すもの

```js
import { createRoom, joinRoom, isValidCode, sanitizeName, roomLinkFor, roomCodeFromHash } from './room.js';

const room = await createRoom({ game: 'catan', name: 'たろう', settings: {...}, seats: [...] });
// または
const room = await joinRoom('AB3C', { game: 'catan', name: 'はなこ' });

room.code        // 'AB3C'
room.uid         // 自分の匿名ログインの uid
room.isHost       // 自分がホストか

room.onMeta(meta => { ... });       // meta.settings / meta.seats は JSON 文字列のまま渡される
room.onMembers(members => { ... }); // { [uid]: { name, online, joinedAt } }
room.onState((json, seq) => { ... }); // ホストが publish するたびに呼ばれる

room.setMeta({ status: 'playing', seats: JSON.stringify(seats) }); // ホストのみ
room.publish(JSON.stringify(game));  // ホストのみ。seq を +1
room.send('rollDice', {});           // 全員。ホストは自分の操作ならこれを通さず engine を直接呼んでよい
room.onAction(({ uid, name, args }) => { ... }); // ホストのみ。処理したら自動で箱から消える

await room.takeOver(); // ホストが切れたとき、代わってホストになる
await room.leave();    // 部屋を出る（自分の online を false に）
await room.close();    // ホストが部屋ごと消す（後片付け）

isValidCode('AB3C');            // 部屋コードの形か
sanitizeName(rawName);          // <>&"' を消して10字まで（空なら「名無し」）
roomLinkFor('AB3C');            // 今のページ + #room=AB3C
roomCodeFromHash(location.hash); // '#room=AB3C' → 'AB3C'（形が違えば null）
```

- 席の設定（人数・CPU・拡張）や「誰が何をしてよいか」の確かめ、engine を呼ぶことはゲーム側（`online.js`）の役目。
- 隠し情報の割り切り（最初の版は部屋の参加者なら `state` の中身を開発ツールで読める）は仕様の 2-3 のとおり。

## データ

Realtime Database、版 `v: 1`。rules（`database.rules.json`）が項目ごとに読み書きを確かめる。

```
rooms/{CODE}                         CODE = 4字（0 O 1 I L を除いた31字、23456789ABCDEFGHJKMNPQRSTUVWXYZ）
  meta/
    v: 1
    game: string(〜40)              どのゲームの部屋か（共通の Firebase を全ゲームで使うため。room.js が確かめる）
    hostUid: string                  今のホストの uid
    status: "lobby" | "playing" | "ended"
    createdAt: number
    settings: string(〜2,000)        ゲーム側が決める JSON（catan: {"playerCount":4,"expansion":"none"}）
    seats: string(〜2,000)           ゲーム側が決める JSON（catan: [{"type":"human","uid":"…"},{"type":"cpu","level":"normal"},…]）
  members/{uid}/
    name: string(1〜10)
    online: boolean                  onDisconnect で false
    joinedAt: number
  state/
    seq: number                      ホストが publish するたびに +1
    json: string(〜200,000字)        ゲームの状態まるごと（ゲーム側が JSON にする。Set は使わない）
    at: number
  actions/{pushId}/
    uid: string                      送り主（自分の uid でしか書けない）
    name: string(〜40)
    args: string(〜2,000)
    at: number
```

- 誰が書くか・読むか: `meta` はホストだけが書ける（`hostUid` だけ、切れた前のホストから引き継ぐときの特別な条件あり）。`members/$uid` は本人（待合の間、または既にいるとき）かホストが書ける。`state` はホストだけが書ける。`actions/$id` は本人が新しく作るときと、ホストが消すときだけ書ける。
- 誰が読むか: どれも `auth != null` の部屋の参加者（`state` は `members` に自分がいること、`actions` はホストだけ）。
- 24 時間たった部屋は、新しい `createRoom` が上書きしてよい（rules の `createdAt` チェック）。サーバー側の自動削除は使わない。

## 確かめたこと（段階 3）

- Firebase Realtime Database Emulator に `database.rules.json` を読み込み、REST API の `auth_variable_override` で uid を変えながら確認：
  - ゲストの uid で `state` に書き込む → 拒否
  - 他人の uid で `actions/{id}` に書き込む → 拒否
  - 自分の uid での `actions` 書き込み・ホストでの `state` 書き込みは許可
- 2 つのブラウザ（ふつうのタブ・シークレットタブ）で `room.js` を小さなページから呼び、部屋を作る / コードで入る / 顔ぶれ（`onMembers`）/ タブを閉じたときの `online: false`（`onDisconnect`）/ `state` の書き込みと見張り（`publish` / `onState`）/ 操作の送受信（`send` / `onAction`）が動くことを確認。

本番の Firebase（`tof-online`）への実際の読み書きは、Authentication で匿名ログインが有効になっていること、Realtime Database に `database.rules.json` の内容が公開されていることが前提（段階 0 でオーナーが設定済み。rules の公開もオーナーが Realtime Database → ルール タブに貼って公開する）。
