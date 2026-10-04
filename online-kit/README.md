# online-kit

近くの人とスマホ 1 台ずつで遊ぶ「部屋」の共通部品（Firebase Realtime Database）。
ゲームのルールは知らない。正本はここ。使うアプリへは `room.js`・`database.rules.json` をそのままコピーする。

## 仕組み

- 部屋を作った端末（ホスト）だけが状態の正本を持ち、ゲームのエンジンを回す。ほかの端末（ゲスト）は操作を「お願い」として送り、ホストが当てた結果を受け取って描くだけ（ホスト方式）。
- 認証は匿名ログイン（Authentication の「匿名」を有効にする。段階 0 でオーナーが実施済み）。
- 通信は Realtime Database（`asia-southeast1`）。ゲームの状態は中身を見ずに **1 本の JSON 文字列** として置く（ほかのゲームにもそのまま使えるようにするため）。
- `database.rules.json` が「ゲストは状態を書けない」「他人の uid で `actions` を書けない」「他人の `priv` やホストでない人の `hostState` を読めない」を守る。アプリ側の確かめ（2-2 の操作の表）と合わせて二重に止める。
- 隠し情報（段階 10）: 状態は `pub`（参加者全員が読める。他人の手札などは枚数だけ）・`priv/$uid`（本人だけが読める、自分の手札はそのまま）・`hostState`（今のホストの uid だけが読める全部入り。ホストが引き継がれたら新しいホストがこれを読んで続きから動く）に分ける。隠す中身（何を枚数だけにするか）はゲーム側（例: catan の `engine.js` の `viewFor(game, seat)`）が決める。room.js は文字列として扱うだけ。

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
room.onPub((json, seq) => { ... });       // 参加者全員が読める状態（他人の手札などは枚数だけ）
room.onPriv((json, seq) => { ... });      // 自分の席ぶん。自分の手札はそのまま、他人は枚数だけ
room.onHostState((json, seq) => { ... }); // 今のホストの uid だけ。全部入り（ホストだけが使う）

room.setMeta({ status: 'playing', seats: JSON.stringify(seats) }); // ホストのみ
room.publish({ pub: pubJson, priv: { uidA: privJsonA, ... }, host: hostJson }); // ホストのみ。3つまとめて書く
room.send('rollDice', {});           // 全員。ホストは自分の操作ならこれを通さず engine を直接呼んでよい
room.onAction(({ uid, name, args }) => { ... }); // ホストのみ。処理したら自動で箱から消える
await room.fetchHostState(); // 引き継いだ直後、1回だけ全部入りを読む（続きから動くため）

await room.takeOver(); // ホストが切れたとき、代わってホストになる
await room.leave();    // 部屋を出る（自分の online を false に）
await room.close();    // ホストが部屋ごと消す（後片付け）

isValidCode('AB3C');            // 部屋コードの形か
sanitizeName(rawName);          // <>&"' を消して10字まで（空なら「名無し」）
roomLinkFor('AB3C');            // 今のページ + #room=AB3C
roomCodeFromHash(location.hash); // '#room=AB3C' → 'AB3C'（形が違えば null）
```

- 席の設定（人数・CPU・拡張）や「誰が何をしてよいか」の確かめ、engine を呼ぶことはゲーム側（`online.js`）の役目。
- 隠し情報（手札の内訳など）を `pub` / `priv` / `hostState` のどれに入れるかはゲーム側が決める（上の「仕組み」参照、仕様の 2-3・段階 10）。

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
    pub/
      seq: number                    ホストが publish するたびに +1
      json: string(〜200,000字)      隠し情報を抜いた状態（ゲーム側が JSON にする。Set は使わない）
      at: number
    priv/{uid}/
      seq, json, at                  その uid の席から見た状態（自分の手札はそのまま、他人は枚数だけ）
    hostState/
      seq, json, at                  全部入りの状態（今のホストの uid だけが読める。引き継ぎ用）
  actions/{pushId}/
    uid: string                      送り主（自分の uid でしか書けない）
    name: string(〜40)
    args: string(〜2,000)
    at: number
```

- 誰が書くか・読むか: `meta` はホストだけが書ける（`hostUid` だけ、切れた前のホストから引き継ぐときの特別な条件あり）。`members/$uid` は本人（待合の間、または既にいるとき）かホストが書ける。`state` 配下はどれもホストだけが書ける。`actions/$id` は本人が新しく作るときと、ホストが消すときだけ書ける。
- 誰が読むか: `state/pub` は部屋の `members` にいる人なら誰でも、`state/priv/$uid` は本人だけ、`state/hostState` は今の `meta/hostUid` と一致する人だけ。それ以外（`meta`・`members`）は `auth != null` の部屋の参加者、`actions` はホストだけ。
- 24 時間たった部屋は、新しい `createRoom` が上書きしてよい（rules の `createdAt` チェック）。サーバー側の自動削除は使わない。

## 確かめたこと（段階 3）

- Firebase Realtime Database Emulator に `database.rules.json` を読み込み、REST API の `auth_variable_override` で uid を変えながら確認：
  - ゲストの uid で `state` に書き込む → 拒否
  - 他人の uid で `actions/{id}` に書き込む → 拒否
  - 自分の uid での `actions` 書き込み・ホストでの `state` 書き込みは許可
- 2 つのブラウザ（ふつうのタブ・シークレットタブ）で `room.js` を小さなページから呼び、部屋を作る / コードで入る / 顔ぶれ（`onMembers`）/ タブを閉じたときの `online: false`（`onDisconnect`）/ `state` の書き込みと見張り（`publish` / `onState`）/ 操作の送受信（`send` / `onAction`）が動くことを確認。

## 確かめたこと（段階 10・隠し情報を分ける）

`@firebase/rules-unit-testing` で `database.rules.json` を読み込み、匿名ログインを模した uid ごとに確認（REST の `auth_variable_override` は検証用の値（極端に古い `createdAt` や、規則に合わない部屋コード）を使うと結果が紛らわしくなるため、`rules-unit-testing` の `authenticatedContext` を使った）：

- ゲストは自分の `state/priv/$uid` だけ読める。他人の `priv`・`state/hostState` は読めない（拒否を確認）。`state/pub` はホストもゲストも読める。
- `state/pub`・`state/priv/$uid`・`state/hostState` はどれもホストだけが書ける（ゲストはどれも拒否）。
- ホストが切れた（`members/$uid/online=false`）後、ゲストが `meta/hostUid` を自分に書き換えられる（引き継ぎ）。切れる前は拒否されることも確認。
- 引き継いだ直後、新しいホストは `state/hostState` を読める。元のホストはもう読めない。新しいホストは続けて `publish`（pub・priv 各席・hostState をまとめて書く）できる。
- 注意: `priv: { uidA: {...}, uidB: {...} }` のように**ネストしたオブジェクトで `state/priv` 全体を置き換える**書き方は、途中に `.write` のない `priv` の節を通るため拒否される（RTDB の `.write` は書く場所から見て祖先だけを見る。子の `$uid` の `.write` までは降りてこない）。room.js の `publish()` は `state/priv/<uid>` を **1 件ずつ別の更新パス**として渡しているので、これに当たらない。

本番の Firebase（`tof-online`）への実際の読み書きは、Authentication で匿名ログインが有効になっていること、Realtime Database に `database.rules.json` の内容が公開されていることが前提（段階 0 でオーナーが設定済み。rules の公開もオーナーが Realtime Database → ルール タブに貼って公開する）。
