# 決めたこと

あとから「なぜこうなっているのか」が分かるように、ルールから外したことや、方針を決めたことを残す。
新しい決定は上に足す。ルールの例外を足したら `tools/audit.mjs` の `EXCEPTIONS` も直す。

## 2026-09-24

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
| pentris | GitHub Pages の公開元が `master` ブランチ | 切り替えると公開が止まるおそれがある |
| gear-align / hue-hunter | webapp-kit ではなく独自のインストール・共有 UI | iPhone 向けの案内とコピーの代替まで独自に対応済み。両方置くとボタンが重なる |
| gear-align | manifest の名前が `manifest.json` | インストール済みの人への影響を避ける |
| hue-hunter / core-image-english / pentris | localStorage のキーが `hueHunter_` / `coreEn.` / `pent.` | すでにアプリ名で区切られている。変えると記録が消える |
| core-image-english | `html` の背景が `theme-color` と違う | 下端のタブバーと色を合わせるため（CSS にコメントあり） |
| cube-othello / glyph-shift | `orientation` を固定しない | 横画面・PC でも遊べる作り |
| Half-Cut | 独自のインストール・共有 UI | 未整理（[BACKLOG.md](BACKLOG.md)） |
