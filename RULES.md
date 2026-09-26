# T.OF... アプリ制作ルール

T.OF...（https://t-of.github.io/）で公開する Web アプリに共通するルールと必須事項。
新しいアプリを作るときも、既存のアプリを直すときも、これに合わせる。

- 必須 = 公開前に必ず満たす
- 推奨 = 理由がなければそうする

---

## 0. 大前提：全アプリが同じオリジンに住んでいる

すべてのアプリは `https://t-of.github.io/<リポジトリ名>/` で公開される。
ブラウザから見ると **全部ひとつのサイト（同じオリジン）** なので、次のものが全アプリで共有される。

| 共有されるもの | 起きうる事故 | 対策 |
|---|---|---|
| `localStorage` / `sessionStorage` / IndexedDB | 別のアプリが同じキー（`best` など）を上書きする | キーは必ずアプリ名で始める → [3](#3-データ保存) |
| CacheStorage（Service Worker のキャッシュ） | 古いキャッシュを消す処理で**他アプリのキャッシュまで消す** | 自分の接頭辞のものだけ消す → [4](#4-service-worker) |
| Service Worker のスコープ | `/` に置いた SW が全アプリの通信を横取りする | SW は各アプリのフォルダに置く。ポータル（ルート）には置かない |
| Cookie | ほぼ使っていないが同じく共有 | 使うなら `path=/<id>/` を付ける |

課金・広告を入れるアプリは、ここに置かず Cloudflare の別のオリジンに置く → [13](#13-課金広告を入れるアプリappsjs-で-paid-true)・[14](#14-cloudflare-に置くアプリappsjs-で-host-cloudflare)。

---

## 1. リポジトリと公開

- **必須** リポジトリ名 = URL のパス。英小文字・数字・`-` を推奨（例: `gear-align`）。
  既存の `Half-Cut` のように大文字を使うと URL も大文字になる。
- **必須** GitHub Pages（`main` ブランチの `/`）で公開する。ビルドが要らない構成にする。
  課金・広告のアプリは Cloudflare に置く（[14](#14-cloudflare-に置くアプリappsjs-で-host-cloudflare)）。
- **必須** `.nojekyll` を置く（`_` で始まるファイルや Markdown が Jekyll に処理されないように）。
- **必須** リポジトリの About に **説明文** と **Website（公開 URL）** を入れる。
- **必須** ページ内のパスは相対パス（`./style.css`）にする。`/style.css` のようにルートから書くとポータルのファイルを指してしまう。
  例外はポータルへのリンク `href="/"` だけ。
- **推奨** `.gitignore` に `.DS_Store` を入れる。
- **必須** リポジトリは公開（public）にする（無料プランの Pages は公開リポジトリでしか動かない）。
  そのため、パスワード・トークン・個人情報をコミットしない。Firebase の web 用 `apiKey` は公開する前提の値なので置いてよい（守りは `firestore.rules` 側）。
- **必須** 秘密の値（Stripe の `sk_` / `rk_`、Webhook の `whsec_`、署名の秘密鍵、API トークン）をコミットしない。`.env` と `.dev.vars` もコミットしない。
  1 回でも入れたら、消すだけでなく鍵を作り直す（履歴に残る）。
- **必須** 外のサーバーのスクリプトは、決まったホスト（`www.gstatic.com`・`js.stripe.com`・`pagead2.googlesyndication.com`）から、版を固定して読む（`@latest` や版なしの URL を使わない）。
  AdSense の公式のタグと Stripe.js は、相手の決めた URL のまま読む。ほかのホストを足すときは `tools/audit.mjs` の `SCRIPT_HOSTS` にも足す。
- **推奨** 外から来た文字（URL の `#` と `?`、共有されたデータ、Firestore、読み込んだファイル）は `textContent` で入れる。`innerHTML` に入れない。
  全アプリが同じオリジンなので、1 本の穴がほかのアプリの記録にも届く。課金のアプリでは必須（[13](#13-課金広告を入れるアプリappsjs-で-paid-true)）。
- **必須** コミットのメールアドレスは noreply（`207500187+Sora3141@users.noreply.github.com`）。git の全体設定に入れてある。

### 権利（著作権・商標）

- **必須** 企画の段階で、既存の作品の権利に触れないかを調べ、仕様（`docs/private/specs/<id>.md`）の「権利」に書く。オーナーが結果を見て決めるまで作り始めない。
- **必須** 仕様と権利の調べは `docs/private/` に置く。ここは本部とは別の非公開リポジトリ `t-of/hq-private` で、本部の `.gitignore` に入れてある。
  権利の調べ（自己分析）を公開リポジトリに出さないため。書き足したら `docs/private/` の中でコミットして push する。
- 調べること:

  | 項目 | 見るところ |
  |---|---|
  | 名前 | アプリ名・リポジトリ名が、既存の商標やゲーム名と同じ・似ていないか（Web 検索、WIPO Global Brand Database、App Store / Google Play / Steam / itch.io の検索）。「-tris」のように有名作を思わせる形も避ける。英字の名前はカタカナの読みも書く（J-PlatPat の称呼検索に使う） |
  | 見た目 | 既存作品の画面、駒の形と色、配置を真似ていないか。ルールは真似てよくても、見た目は守られることがある（テトリスの見た目を真似たゲームが裁判で負けた例がある） |
  | ルール | ルールやアイデアそのものは著作権では守られない。ただし特許やライセンスで守られているゲームもある。公式にファンゲームやデジタル化の方針が出ていれば読む |
  | 素材 | 画像・音・フォント・ライブラリのライセンスが商用で使えるか（MIT / CC0 / OFL など）。表記が要るものは README に書く |
  | 固有名詞 | 実在の人物・キャラクター・作品名・ロゴを使っていないか |

- 判定は 3 段階で書く。
  - **問題なし**: 収益化してもよい
  - **注意**: 無料・広告なしなら問題になりにくいが、収益化はしない
  - **危険**: 名前か見た目を変えないと出せない
- オーナーが次の 4 つから選ぶ（ボードのタスクの `choices`）。選んだ結果は仕様の「権利」に書き残す。
  「作る（収益化できる）」/「作る（収益化しない）」/「変えて作る」/「作らない」
- 収益化（広告・課金・有料化）を始める前に、もう一度調べ直す。このとき**オーナーが J-PlatPat の称呼検索を手で引く**（商標検索 → 称呼（類似検索）→ 区分 9・28・41）。ディレクターは読みの一覧と手順を出す。
  **エージェントは J-PlatPat を自動で引かない**（利用規約でプログラムによる自動取得が禁止。自動のブラウザははじかれる）。
- これは危なそうなところを見つけるための確認で、法律の判断ではない。迷ったら「変える」か「作らない」に倒す。

### ローカルの置き場所

- **必須** T.OF... のものは `~/GitHub/tof/` にまとめる。本部は `~/GitHub/tof/t-of.github.io/`、アプリは `~/GitHub/tof/apps/<リポジトリ名>/`、note は `~/GitHub/tof/note/`。
  フォルダ 1 つ = リポジトリ 1 つで、名前は GitHub のリポジトリ名と同じにする。audit とスタジオはこの形を前提にしているので、`apps/` の中をさらにサブフォルダに分けない。
- **必須** `~/GitHub/tof/` と `~/GitHub/tof/apps/` の直下にファイルを置かない。
- **必須** 作業の終わりに、コミットしていない変更を残さない（コミットするか、元に戻す）。
- **必須** スクリーンショットなどの作業用ファイルは `.audit/` かスクラッチパッドに置き、リポジトリに入れない。
- `.DS_Store` と `.vscode/` は git の全体設定（`~/.config/git/ignore`）で無視しているので、リポジトリごとに書かなくてよい。
- フォルダの色（Finder のタグ）は段階を表す。`npm run colors` で付け直せる（スタジオは board.json が変わるたびに自動で付ける）。

  | 色 | タグ | 段階（board.json の `stage`） |
  |---|---|---|
  | グレー | トフ 作成前 | `idea` / `planning` |
  | 黄 | トフ 作成中 | `design` / `build` |
  | 青 | トフ リリース前 | `qa` / `release` |
  | 緑 | トフ リリース完了 | 公開済み（apps.js に載っている） |

## 2. `<head>` と PWA

### 必須の `<head>`

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#背景色">
<meta name="description" content="1〜2 文の説明">
<title>アプリ名 — ひとこと</title>

<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="短いアプリ名">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">
<link rel="icon" type="image/png" sizes="32x32" href="./icons/favicon-32.png">
<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">
```

- **必須** `apple-mobile-web-app-status-bar-style` に **`black-translucent` を使わない**。付けないか `default`。
  iOS 26 以降、ホーム画面から起動したときに画面上部が Liquid Glass のぼかしで隠れる（`env(safe-area-inset-top)` では避けられない）。
  すでにホーム画面に追加している人は、一度削除して追加し直さないと直らない。
- **必須** OGP（共有したときのカード）を入れる。`og:image` は 1200×630 の `icons/og.png`、URL は絶対 URL。

```html
<meta property="og:type" content="website">
<meta property="og:site_name" content="アプリ名">
<meta property="og:title" content="アプリ名 — ひとこと">
<meta property="og:description" content="説明">
<meta property="og:url" content="https://t-of.github.io/<id>/">
<meta property="og:image" content="https://t-of.github.io/<id>/icons/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
```

### manifest（`manifest.webmanifest`）

- **必須** `name` / `short_name` / `description` / `start_url: "./"` / `scope: "./"` / `display: "standalone"` /
  `background_color` / `theme_color` / `lang: "ja"` / 192px と 512px のアイコン。
- **推奨** `id: "./"` を入れる（あとで `start_url` を変えても別アプリ扱いにならない）。
- **推奨** 縦画面のゲームは `orientation: "portrait"`。

### アイコン（`icons/`）

| ファイル | サイズ | 用途 |
|---|---|---|
| `icon.svg` | — | favicon（ブラウザのタブ） |
| `favicon-32.png` | 32×32 | SVG 非対応ブラウザの favicon |
| `apple-touch-icon.png` | 180×180、**透過なし** | iPhone のホーム画面 |
| `icon-192.png` / `icon-512.png` | 192 / 512 | manifest、**ポータルの一覧にも使う** |
| `maskable-512.png` | 512、絵柄を中央 80% に収める | Android の丸・角丸アイコン |
| `og.png` | 1200×630 | 共有カード |

## 3. データ保存

- **必須** `localStorage` のキーは **`<アプリ名>.` で始める**（例: `gearalign.best`、`half-cut:settings`）。
  `best` や `settings` のような素のキーは禁止（全アプリで共有されるため）。
- **必須** 読み書きは `try { … } catch {}` で囲む。プライベートモードや容量超過で例外が出ても遊べるようにする。
- **推奨** 保存する値に版番号を入れる（`{ v: 1, … }`）。形式を変えたときに古いデータを読み違えない。
- **推奨** 記録は端末内に保存し、アカウントやサーバを必要としない。使う場合（Firebase など）は README に書く。
- **必須** 端末の外に保存するデータ（Firestore、購入の関数、権利のトークンなど）は、README の `## データ` に形を書く。
  入れ物（コレクション・キー）ごとに、何が id か、項目と型と範囲、誰が書くか・読むか、版番号。形を変えるときは README とルール（`firestore.rules` など）を同じコミットで直す。
  ルールで形を確かめられるものは、ルールでも確かめる（README は説明、効くのはルール）。

## 4. Service Worker

- オフラインで動くことは求めない。`sw.js` は置いても置かなくてもよい（ひな形には入っている）。
  広告など、ネットにつながっていないと動かないものを入れてもよい。
- 置くときは、アプリのフォルダ直下に置く（スコープが `/<id>/` になる）。同じオリジンに全アプリが並ぶので、下の 2 つは必須。
- **必須** キャッシュ名は **`<id>-` で始める**（例: `gear-align-v1`）。
- **必須** `activate` で古いキャッシュを消すときは、**自分の接頭辞のものだけ**消す。

```js
// ✗ 同じオリジンの他アプリのキャッシュまで全部消える
keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))

// ○ 自分のものだけ
keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))
```

- **推奨** 自分のファイルは network-first（つながっていれば常に最新、圏外なら保存版）。
  こうしておけば更新のたびにバージョンを上げ忘れても古い画面が残らない。Google Fonts は cache-first。
- **推奨** 更新してもキャッシュに残る「どうも古いまま」のときの最終手段として `VERSION` を上げる。
- ひな形: [`template/sw.js`](template/sw.js)

## 5. スマホ表示

- **必須** 画面の端に置く要素は `env(safe-area-inset-*)` 分の余白をとる。
  `padding: max(12px, env(safe-area-inset-top)) …`
- **必須** `html` と `body` の両方に背景色を指定する（Safari 26 の上下バーの色は `html` から取られる）。`theme-color` と同じ色にする。
- **必須** 高さは `100vh` ではなく `100dvh`。
- **必須** 全画面のオーバーレイ・モーダルを隠すときは `opacity: 0` ではなく **`display: none`**（見えなくても Safari がバーの色を拾う）。
- **必須** 縦画面のタッチ操作だけで最後まで遊べる。キーボード操作は PC 用の追加。
- **推奨** 操作する領域に `touch-action: manipulation` と `user-select: none`（ダブルタップ拡大や長押し選択を防ぐ）。
- **推奨** 押せるものは 44×44px 以上。
- **推奨** `prefers-reduced-motion` で大きなアニメーションを弱める。

### 音

- **必須** 効果音を付ける。タップ・置く・消す・そろう・勝ち負けなど、操作と結果に短い音を返す。
  音声ファイルを使わず Web Audio（`OscillatorNode` など）で作ってよい（素材のライセンスを気にしなくてよい）。付けないアプリは理由を DECISIONS.md に書き、`tools/audit.mjs` の `EXCEPTIONS` に `'sound'` を足す。
- **必須** iPhone のマナーモードでも音が出るようにする。何もしないと、Web Audio の音は着信音と同じ扱いになり、マナーモードで消える。
  音を鳴らす前（最初のタップで `AudioContext` を作る・`resume()` する直前）と、アプリの音の設定を切り替えたときに次を呼ぶ。

```js
// iPhone のマナーモードでも鳴らす（Safari 16.4 以降）。
// 'playback' にすると音楽アプリの曲が止まるので、アプリの音がオンのときだけにする。
function setAudioSession(soundOn) {
  try { if (navigator.audioSession) navigator.audioSession.type = soundOn ? 'playback' : 'auto'; } catch { /* 対応していない */ }
}
```

- **必須** 音のオン・オフの設定を置き、覚えておく（localStorage）。オフのときは `setAudioSession(false)` にして、ほかのアプリの音楽を止めない。
- **推奨** 最初の音は、ユーザーが触ったとき（`pointerdown` など）に鳴らす。ブラウザは触る前の音を止める。

## 6. インストール・共有ボタン（webapp-kit）

- **必須** [`webapp-kit/`](webapp-kit/) をアプリにコピーして、「アプリにする」と「共有」ボタンを置く。

```html
<link rel="stylesheet" href="./webapp-kit/webapp-kit.css">
<script src="./webapp-kit/webapp-kit.js"></script>
<button data-wak="install" hidden>アプリにする</button>
<button data-wak="share">共有</button>
```

- 「アプリにする」はインストール済み・インストールできない環境では自動で隠れる。iPhone / Mac Safari では手順を案内する。
- スコアなどを共有するときは ``WebAppKit.share({ text: `スコア ${score} 点！` })``。
- webapp-kit の正本はこのリポジトリ。直したらここを更新し、各アプリへコピーし直す。詳細は [webapp-kit/README.md](webapp-kit/README.md)。

## 7. 制作元の表記

- **必須** アプリのどこか（タイトル画面の下、設定、フッターなど）に **T.OF... へのリンク** を置く。
  `<a href="/">T.OF...</a>` でポータルに戻れる。ゲーム画面を邪魔しない場所でよい。
  Cloudflare に置くアプリは `href="https://t-of.github.io/"`（`/` だと自分のオリジンに飛ぶ）。
- **推奨** README の「リンク」に `制作: [T.OF...](https://t-of.github.io/)` を入れる。
- 名前の表記は **T.OF...**（大文字。T の後にピリオド 1 つ、最後に半角ピリオド 3 つ）。
- ロゴは [`logo/`](logo/) にある（作り直すときは `python3 tools/make-logo.py`）。

## 8. README

- **必須** 次の見出しを入れる。順番もこの通り。

```markdown
# アプリ名 — ひとこと
説明 1〜2 文

## 🔗 リンク          遊ぶ URL / 制作: T.OF...
## 遊び方             ルールと操作
## アプリとして入れる（PWA）
## 開発               ローカルでの動かし方・テストの走らせ方
```

- 1 行目は必ず `# アプリ名 — ひとこと`。画像や中央寄せの飾りはその下に置く。
- 設計メモや実装の工夫はその後ろに好きなだけ書いてよい。

## 9. ポータルへの登録

公開したら、このリポジトリの [`apps.js`](apps.js) の **先頭** に 1 件足して push する。

```js
{
  id: 'dot-rush',                          // リポジトリ名
  name: 'DOT RUSH',                        // short_name
  title: '点を集めるアクション',
  desc: '1〜2 文の説明。',
  category: 'game',                        // 'game' か 'tool'
  tags: ['アクション'],
  icon: '/dot-rush/icons/icon-192.png',
  color: '#4fd6e8',                        // カードのアクセント（アイコンの主な色）
},
```

- 課金・広告のアプリは、さらに `paid: true` を書く。Cloudflare に置くアプリは `host: 'cloudflare'` と `url`（公開 URL）を書き、`icon` も絶対 URL にする。
  ポータルのリンクは `url` へ飛ぶ。書かなければ今までどおり（GitHub Pages、課金なし）。

- OGP 画像を作り直すときは `python3 tools/make-icons.py`（apps.js のアイコンを並べて `icons/og.png` を作る）。

## 10. 公開前チェックリスト

コピーして使う。

```markdown
- [ ] 仕様の「権利」でオーナーが選んだとおりになっている（名前・見た目・収益化の有無）
- [ ] GitHub Pages で開ける（https://t-of.github.io/<id>/）
- [ ] リポジトリの About に説明と Website を入れた
- [ ] パスはすべて相対パス（./ 始まり）
- [ ] <head>: viewport-fit=cover / theme-color / description / OGP / manifest / アイコン
- [ ] black-translucent を使っていない
- [ ] manifest: name, short_name, start_url "./", scope "./", standalone, 192/512 アイコン
- [ ] icons/: icon.svg, favicon-32, apple-touch-icon(180, 透過なし), icon-192, icon-512, maskable-512, og.png
- [ ] localStorage のキーが <アプリ名>. で始まる、try/catch で囲んである
- [ ] 端末の外に保存するなら、README の「## データ」に形を書いた（ルールと合っている）
- [ ] sw.js（置くなら）: キャッシュ名が <id>- 始まり、古いキャッシュは自分のものだけ消す
- [ ] 機内モードで再読み込みしても動く
- [ ] iPhone でホーム画面に追加 → 上部が隠れない、下端のボタンが押せる
- [ ] Android / PC Chrome で「アプリにする」が出る、インストール後は消える
- [ ] 共有ボタンが動く（共有シート or リンクコピー）
- [ ] 効果音がある。iPhone のマナーモードでも鳴る、音をオフにできる
- [ ] T.OF... へのリンクがある
- [ ] README の見出しがそろっている
- [ ] ポータルの apps.js に追加した
- [ ] 課金・広告を入れるなら、§13 と §14 のチェックリストも通した
```

## 11. 新しいアプリの始め方

```sh
cd ~/GitHub/tof/t-of.github.io
tools/new-app.sh <id> "<アプリ名>" "<ひとこと>" "<説明>" "<背景色>"
# 例: tools/new-app.sh dot-rush "DOT RUSH" "点を集めるアクション" "点を集めて…" "#0d1017"
```

`~/GitHub/tof/apps/<id>/` に、上のルールを満たしたひな形（`<head>`、manifest、sw.js、webapp-kit、仮アイコン、README）ができる。
あとは本体を書き、アイコンを差し替え、`npm run audit -- <id>` が通るまで直す。
Claude Code では本部で `/new-app` を使うと、企画からリリースまで役割を分けて進められる（[CLAUDE.md](CLAUDE.md)）。

GitHub への公開:

```sh
cd ~/GitHub/tof/apps/<id>
git add -A && git commit -m "最初の版"
gh repo create t-of/<id> --public --source . --push --description "<説明>" --homepage "https://t-of.github.io/<id>/"
gh api -X POST repos/t-of/<id>/pages -f 'source[branch]=main' -f 'source[path]=/'
```

---

## 12. 自動チェック

公開前と、ルールを変えたあとに必ず実行する。

```sh
cd ~/GitHub/tof/t-of.github.io
npm run audit              # ファイルを見るチェック（速い）
npm run audit:browser      # Chrome で開いて、エラー・はみ出しも見る
npm run audit -- <id>      # 1 本だけ
node --test tools/audit.test.mjs   # audit のチェック自身のテスト（audit.mjs を直したら）
```

- 全部を見るときは、本部（`t-of.github.io`）の秘密の鍵・外のスクリプトも見る。
- `!` の行は警告（落とさない）。外の文字を `innerHTML` に入れていそうなファイルなど、人が見て確かめる。

- チェックの中身は [`tools/audit.mjs`](tools/audit.mjs)。このルールを変えたら、機械で判定できる項目はそこにも足す。
- 意図して残している違いは [docs/DECISIONS.md](docs/DECISIONS.md) に理由を書き、`audit.mjs` の `EXCEPTIONS` に足す。
- まだ直していないものは [docs/board.json](docs/board.json) のタスクにある（スタジオで見られる）。

---

## 13. 課金・広告を入れるアプリ（apps.js で `paid: true`）

広告・課金・紹介料を 1 つでも入れるアプリに当てる。§0〜12 に足して守る。最初は買い切りから始め、サブスクは後にする（決まりが一気に増える）。

### お金の受け取り方

- **必須** カードの情報を自分のページで受けない。買うボタンは決済サービスのページ（Stripe の Payment Link / Checkout、ストアの課金）へのリンクだけ。
- **必須** 秘密の値は購入の関数（Cloudflare Workers）の secret（`wrangler secret put`）に置く。手元の `.dev.vars` / `.env` は `.gitignore` に入れる。
- **必須** アプリに置いてよいのは、publishable key（`pk_`）、Payment Link の URL、権利を確かめる公開鍵、RevenueCat の public key だけ。
- **必須** テストと本番を分ける。テストの Payment Link（`buy.stripe.com/test_`）・`pk_test_`・テストの公開鍵を本番のファイルに残さない。購入の関数もテスト用と本番用を別に出し、鍵も別にする。
- **必須** 「買った」はサーバー（購入の関数かストア）が決める。成功ページに来たこと・localStorage の値だけで開けない。権利は署名つきのトークンにし、アプリは公開鍵で確かめて `<アプリ名>.entitlement` に保存する（`entitlement.js`）。
  トークンの中身（項目・型・期限）は §3 のとおり README の `## データ` に書く。最初の課金アプリで決め、それを後のアプリの正本にする。
- **必須** 購入の関数の戻り先は、関数の中に書いた決まった URL だけ。URL のクエリで戻り先を受けない。
- **必須** Webhook を受けるなら、署名を生の本文で確かめ、イベント ID で二重の処理を防ぎ、すぐ 2xx を返す。
- **必須** 返金・チャージバックになった購入には、新しい権利を出さない。
- **必須** 個人の情報（メール・国・カード）を T.OF... の関数・ログに持たない。決済サービスに置いたままにする。
- **必須** 書いたもの（日記・気分・カードなど）は端末の外に出さない。

### 画面に出すもの・出さないもの

- **必須** 買うボタンの直前に確認の画面を置き、1 画面に次の 6 つを出す（決済サービスの画面で足りないものをここで補う）。
  分量（回数・期間）／値段／支払いの時期と方法／使えるようになる時期／申込みの期間（あれば。「今だけ」は使わない）／キャンセル・返金の決まり。
  サブスクなら、次の更新日・金額・ネットだけでできる解約の方法も出す。
- **必須** 確認の画面から、利用規約・返金の方針・特定商取引法に基づく表記へリンクし、「同意して購入」のボタンにする。
- **必須** EU・英国の人に売るなら、「すぐに使えるようにすることに同意し、撤回の権利がなくなることを認めます」のチェックを置く（最初から付けておかない）。付けないなら、返金の方針で全員に 14 日の返金を認める。
- **必須** ゲーム内の通貨（コイン・ジェム・チケット）を売らない。品は円でそのまま売る。ごほうび広告でもらうものは、その場で使う（引き直し・ヒントなど）にし、貯められる通貨にしない。
- **必須** 広告・紹介料の枠のそば（上か左）に「広告」か「PR」を、読める大きさで出す（英語なら「Ad」「Paid link」）。
- **必須** 効き目をうたわない（「認知症を防ぐ」「うつが分かる」など）。値引きは期間を書く（「9/30 まで」）。利用者の声を作らない。
- **必須** 広告のタグを入れたら、プライバシーポリシーの「外部送信」の表（送り先の会社・送る情報・目的・相手のポリシー）に足し、広告のある画面の下からそのページへリンクする。
- **必須** EU・英国・スイスの人に広告を出すなら、Google の同意の画面（AdSense / AdMob の「プライバシーとメッセージ」）を入れる。入れないなら、その地域には広告を出さない。
- **必須** 広告の置き方は規約に合わせる。押してと頼まない、遊ぶボタン・盤から離す。全画面の広告は自然な区切り（結果の画面のあと）だけで、起動時に出さない。ごほうび広告は、見る前に何がもらえるかを書き、見なくても遊べるようにする。印刷するページには出さない。
- **必須** 購入・復元の画面に広告を出さない。広告を消す権利がある人には、広告のスクリプトも同意の画面も読み込まない（`display: none` で隠すのではない）。
- **必須** 子ども向けと名乗らない（「キッズ」などの言葉、子どものキャラクター）。

### 作り

- **必須** 外から来た文字は `textContent` で入れる。`innerHTML` に入れない。
- **必須** 外のスクリプトは §1 のとおり。広告のタグは AdSense の公式の 1 つだけにし、ほかの広告ネットワークを足さない。
- **必須** CSP を入れる。広告のない画面は `script-src` を絞る（ハッシュか自分のファイルだけ）。広告のある画面も `object-src 'none'` と `base-uri 'none'` は入れる。
- **必須** 課金のアプリは別のオリジンに置く（§14）。書いたものを持つアプリは、最初の公開から別のオリジンに置く（あとで移すと記録が移らない）。
- **推奨** 型は JSDoc と `// @ts-check` で付け、`jsconfig.json`（`checkJs: true`）を置いて `npx tsc --noEmit` を通す。ビルドは足さない。
- 購入の関数は 1 本の非公開リポジトリにまとめ、アプリごとに作らない。push protection をオンにし、`package-lock.json` をコミットして `npm ci` で入れる。ログにメール・トークン・セッション ID をそのまま出さない。

### チェックリスト（公開前、§10 に足す）

```markdown
- [ ] apps.js に paid: true と host: 'cloudflare' を書いた、npm run audit が通る
- [ ] 買うボタンは決済サービスのページへのリンクだけ
- [ ] 確認の画面に 6 項目、規約・返金の方針・特商法の表記へのリンク、「同意して購入」
- [ ] ゲーム内の通貨を売っていない
- [ ] 広告・紹介の枠に「広告」「PR」がある。効き目の言葉・「今だけ」を使っていない
- [ ] プライバシーポリシーの外部送信の表に、入れた広告・決済を足した。広告の画面からリンクした
- [ ] EU・英国・スイス: 同意の画面を入れたか、広告を出さない設定にした
- [ ] 購入・復元の画面に広告がない。広告を消した人には広告のスクリプトを読み込まない
- [ ] 決済サービスの本番の戻り先が、本番の購入の関数になっている
- [ ] 本番の関数に本番の鍵が入っている（テストの鍵ではない）
- [ ] テストのカードで、買う → 別の端末で復元 → 返金したら権利が出ない、まで通した
```

## 14. Cloudflare に置くアプリ（apps.js で `host: 'cloudflare'`）

課金・広告のアプリの置き場所。GitHub Pages は商売・EC に使えず、全アプリが同じオリジンにあるため（§0）。
Cloudflare Workers の静的アセットで配り、`https://<id>.<名前>.workers.dev/` のようにアプリごとに別のオリジンになる。公開の手順は [docs/RELEASE.md](docs/RELEASE.md)。

- **必須** リポジトリに `wrangler.jsonc` を置く（`name` はリポジトリ名）。ビルドは要らない構成のまま。
- **必須** `_headers` で `Content-Security-Policy` を付け、その中に `frame-ancestors 'none'`（よそのページに埋め込ませない）を入れる。`<meta>` の CSP では `frame-ancestors` が効かない。
- **必須** `.gitignore` に `.env*` と `.dev.vars*` を入れる。`.assetsignore` に、配らないファイル（`.git`、`wrangler.jsonc`、テスト、README など）を入れる。
- **必須** ポータルへのリンクは `https://t-of.github.io/`（`href="/"` ではない）。
- **必須** apps.js に `host: 'cloudflare'` と `url`（`https://…/`）を書き、`icon` も絶対 URL にする。OGP の `og:url`・`og:image` もそのアプリの URL にする。
- **必須** §1 のうち GitHub Pages と `.nojekyll` は当てはまらない。About の Website には Cloudflare の URL を入れる。ほかの決まりは今までどおり。
- **推奨** §0 の localStorage の接頭辞とキャッシュ名の接頭辞は今までどおり付ける（別のオリジンでも害はなく、作りをそろえられる）。
