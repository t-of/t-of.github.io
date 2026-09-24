# 決めたこと

あとから「なぜこうなっているのか」が分かるように、ルールから外したことや、方針を決めたことを残す。
新しい決定は上に足す。ルールの例外を足したら `tools/audit.mjs` の `EXCEPTIONS` も直す。

## 2026-09-24

### リポジトリは公開のまま、メールは noreply に
無料プランの Pages は公開リポジトリでしか動かず、公開したサイトの HTML/JS はどのみち誰でも見られるので、非公開にしても隠せるものはほとんどない。
コミット履歴に Gmail アドレスが出ていたので、今後のコミットは noreply にする。過去の履歴は書き換えない（全リポジトリの force push が要り、手間のわりに効果が薄い）。

### ローカルは `~/GitHub/<id>/` に横並び、段階はフォルダの色で見る
サブフォルダに分けると audit とスタジオの前提が崩れるので、階層は増やさない。代わりに Finder のタグで段階を色分けする（RULES §1「ローカルの置き場所」）。
色の元は board.json と apps.js だけにして、手で色を塗らない（ずれるから）。

### iPhone のマナーモードでも音を出す
`navigator.audioSession.type` を、アプリの音がオンのときだけ `'playback'` にする（RULES §5「音」）。オフのときは `'auto'` に戻し、ほかのアプリの音楽を止めない。全 10 本に入れ、iPhone の実機でマナーモードでも鳴ることを確かめた。

### 全リポジトリのブランチは `main`
pentris だけ `master` だったので `main` に揃えた（既定ブランチ・Pages の公開元とも）。`npm run audit` で確かめる。

### Firebase のルールはリポジトリが正本
hue-hunter の `firestore.rules` を変えたら、Firebase に公開するまで本番には効かない（公開し忘れて、シーズン 2 のランキングが読めなくなっていた）。公開はオーナーが行う。手順は hue-hunter の README。

### 名前は「T.OF...」
- 表記は大文字、T の後にピリオド 1 つ、最後に半角ピリオド 3 つ。最初は「T.OFO」だったが変更した。
- ロゴは T の「.」と F の「...」を字の下にもぐらせた形。「...」は右へ行くほど小さくする。→ [BRAND.md](BRAND.md)
- 内部の名前（`TOFO_APPS`、`tofo.portal.filter`）は画面に出ないのでそのまま。

### ポータル（ルート）には Service Worker を置かない
全アプリと同じオリジンなので、`/` の SW は全アプリの通信を横取りしてしまう。

### アプリごとの例外

| アプリ | 例外 | 理由 |
|---|---|---|
| gear-align / hue-hunter | webapp-kit ではなく独自のインストール・共有 UI | iPhone 向けの案内とコピーの代替まで独自に対応済み。両方置くとボタンが重なる |
| gear-align | manifest の名前が `manifest.json` | インストール済みの人への影響を避ける |
| hue-hunter / core-image-english / pentris | localStorage のキーが `hueHunter_` / `coreEn.` / `pent.` | すでにアプリ名で区切られている。変えると記録が消える |
| core-image-english | `html` の背景が `theme-color` と違う | 下端のタブバーと色を合わせるため（CSS にコメントあり） |
| cube-othello / glyph-shift | `orientation` を固定しない | 横画面・PC でも遊べる作り |
| Half-Cut | 独自のインストール・共有 UI | Android のインストール・iPhone の手順・シェアまで独自に対応済み |
| Half-Cut | ブラウザのタブのアイコンが `icon.svg` ではなく `icons/favicon.svg` | 小さいサイズ用に線を太くした別デザイン。32px でも読める |
| Half-Cut | リポジトリ名に大文字（`Half-Cut`） | URL が変わるので変えない |
