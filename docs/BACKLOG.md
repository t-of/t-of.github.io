# やること

上ほど優先。終わったら消して、必要なら [DECISIONS.md](DECISIONS.md) に残す。
担当の目安: 企画 / デザイン / 実装 / 品質 / リリース / オーナー（本人が決める・操作する）

## いまやること

- [ ] **hue-hunter**: ランキングが出ない。原因は本番の Firestore のルールが古いまま（シーズン 1 の `rankings` しか読めず、`rankings_v2` は読み書きとも拒否）。コードは正しい。リポジトリの `firestore.rules` を Firebase に公開すれば直る（手順は hue-hunter の README）。公開後に `rankings_v2` が読めるか確かめる。— オーナー（公開）→ 品質（確認）

## あとでやること

- [ ] **Half-Cut**: README に T.OF...、`.nojekyll`、`icon.svg`、`favicon-32.png`、README の見出し（§8）。README はオーナーが編集中なので、オーナーの合図を待つ。— 実装
- [ ] **全アプリ**: 実機での確認（iPhone のホーム画面、Android のインストール、共有シート）。— オーナー
- [ ] **pentris**: GitHub Pages を `main` から公開するか決める（今は `master`）。— オーナー

## アイデア

新しいアプリの案はここに書く。`/new-app` で企画に回す。

- 
