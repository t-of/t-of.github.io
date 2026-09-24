# T.OF... アプリ制作ルール

T.OF...（https://sora3141.github.io/）で公開する Web アプリに共通するルールと必須事項。
新しいアプリを作るときも、既存のアプリを直すときも、これに合わせる。

- 必須 = 公開前に必ず満たす
- 推奨 = 理由がなければそうする

---

## 0. 大前提：全アプリが同じオリジンに住んでいる

すべてのアプリは `https://sora3141.github.io/<リポジトリ名>/` で公開される。
ブラウザから見ると **全部ひとつのサイト（同じオリジン）** なので、次のものが全アプリで共有される。

| 共有されるもの | 起きうる事故 | 対策 |
|---|---|---|
| `localStorage` / `sessionStorage` / IndexedDB | 別のアプリが同じキー（`best` など）を上書きする | キーは必ずアプリ名で始める → [3](#3-データ保存) |
| CacheStorage（Service Worker のキャッシュ） | 古いキャッシュを消す処理で**他アプリのキャッシュまで消す** | 自分の接頭辞のものだけ消す → [4](#4-service-worker) |
| Service Worker のスコープ | `/` に置いた SW が全アプリの通信を横取りする | SW は各アプリのフォルダに置く。ポータル（ルート）には置かない |
| Cookie | ほぼ使っていないが同じく共有 | 使うなら `path=/<id>/` を付ける |

---

## 1. リポジトリと公開

- **必須** リポジトリ名 = URL のパス。英小文字・数字・`-` を推奨（例: `gear-align`）。
  既存の `Half-Cut` のように大文字を使うと URL も大文字になる。
- **必須** GitHub Pages（`main` ブランチの `/`）で公開する。ビルドが要らない構成にする。
- **必須** `.nojekyll` を置く（`_` で始まるファイルや Markdown が Jekyll に処理されないように）。
- **必須** リポジトリの About に **説明文** と **Website（公開 URL）** を入れる。
- **必須** ページ内のパスは相対パス（`./style.css`）にする。`/style.css` のようにルートから書くとポータルのファイルを指してしまう。
  例外はポータルへのリンク `href="/"` だけ。
- **推奨** `.gitignore` に `.DS_Store` を入れる。

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
<meta property="og:url" content="https://sora3141.github.io/<id>/">
<meta property="og:image" content="https://sora3141.github.io/<id>/icons/og.png">
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

## 4. Service Worker

- **必須** オフラインで動くように `sw.js` を置き、`navigator.serviceWorker.register('./sw.js')` で登録する。
  SW はアプリのフォルダ直下に置く（スコープが `/<id>/` になる）。
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
- **推奨** README の「リンク」に `制作: [T.OF...](https://sora3141.github.io/)` を入れる。
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

- OGP 画像を作り直すときは `python3 tools/make-icons.py`（apps.js のアイコンを並べて `icons/og.png` を作る）。

## 10. 公開前チェックリスト

コピーして使う。

```markdown
- [ ] GitHub Pages で開ける（https://sora3141.github.io/<id>/）
- [ ] リポジトリの About に説明と Website を入れた
- [ ] パスはすべて相対パス（./ 始まり）
- [ ] <head>: viewport-fit=cover / theme-color / description / OGP / manifest / アイコン
- [ ] black-translucent を使っていない
- [ ] manifest: name, short_name, start_url "./", scope "./", standalone, 192/512 アイコン
- [ ] icons/: icon.svg, favicon-32, apple-touch-icon(180, 透過なし), icon-192, icon-512, maskable-512, og.png
- [ ] localStorage のキーが <アプリ名>. で始まる、try/catch で囲んである
- [ ] sw.js: キャッシュ名が <id>- 始まり、古いキャッシュは自分のものだけ消す
- [ ] 機内モードで再読み込みしても動く
- [ ] iPhone でホーム画面に追加 → 上部が隠れない、下端のボタンが押せる
- [ ] Android / PC Chrome で「アプリにする」が出る、インストール後は消える
- [ ] 共有ボタンが動く（共有シート or リンクコピー）
- [ ] 音があるなら: iPhone のマナーモードでも鳴る、音をオフにできる
- [ ] T.OF... へのリンクがある
- [ ] README の見出しがそろっている
- [ ] ポータルの apps.js に追加した
```

## 11. 新しいアプリの始め方

```sh
cd ~/GitHub/sora3141.github.io
tools/new-app.sh <id> "<アプリ名>" "<ひとこと>" "<説明>" "<背景色>"
# 例: tools/new-app.sh dot-rush "DOT RUSH" "点を集めるアクション" "点を集めて…" "#0d1017"
```

`~/GitHub/<id>/` に、上のルールを満たしたひな形（`<head>`、manifest、sw.js、webapp-kit、仮アイコン、README）ができる。
あとは本体を書き、アイコンを差し替え、`npm run audit -- <id>` が通るまで直す。
Claude Code では本部で `/new-app` を使うと、企画からリリースまで役割を分けて進められる（[CLAUDE.md](CLAUDE.md)）。

GitHub への公開:

```sh
cd ~/GitHub/<id>
git add -A && git commit -m "最初の版"
gh repo create Sora3141/<id> --public --source . --push --description "<説明>" --homepage "https://sora3141.github.io/<id>/"
gh api -X POST repos/Sora3141/<id>/pages -f 'source[branch]=main' -f 'source[path]=/'
```

---

## 12. 自動チェック

公開前と、ルールを変えたあとに必ず実行する。

```sh
cd ~/GitHub/sora3141.github.io
npm run audit              # ファイルを見るチェック（速い）
npm run audit:browser      # Chrome で開いて、エラー・SW・オフライン起動・はみ出しも見る
npm run audit -- <id>      # 1 本だけ
```

- チェックの中身は [`tools/audit.mjs`](tools/audit.mjs)。このルールを変えたら、機械で判定できる項目はそこにも足す。
- 意図して残している違いは [docs/DECISIONS.md](docs/DECISIONS.md) に理由を書き、`audit.mjs` の `EXCEPTIONS` に足す。
- まだ直していないものは [docs/board.json](docs/board.json) のタスクにある（スタジオで見られる）。
