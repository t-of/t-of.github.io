---
name: new-app
description: T.OF... の新しいアプリの試作を作り、GitHub Pages に出してすぐ見られるようにする。名前・アイコン・ポータル掲載は後回し。オーナーが「新しいアプリを作りたい」「こんなゲームを作って」と言ったとき、または /new-app で使う。
---

# 新しいアプリを作る（試作）

まずアプリ本体だけを作り、GitHub Pages に出してオーナーがすぐ触れるようにする。
**名前・アイコン・共有画像・本物のポータルへの掲載（`approved: true`）はしない。** デモのポータル（/demo/）には出す（下の 3）。 それは下の「正式に公開する」でオーナーが言ったときに行う。
各段階の終わりでオーナーに短く報告する。

## 0. ボードに載せる

- docs/board.json の projects に足す（`stage: "build"`、`note: "試作"`）。以後、段階が進むたびに `stage` を進め、振った仕事は tasks に足して `doing` / `done` にする。
- 複数のアプリを同時に進めてよい。アプリごとに別のメンバーを並行で動かす。

## 1. 要点をまとめる（ディレクター）

- planner は呼ばない。権利の評価もしない（正式に公開するときにする）。
- オーナーの言葉から、遊び方・画面・操作を数行にまとめて engineer に渡す。分からない点は聞かずに一番素直な形にする（オーナーが触って直す）。
- `<id>` は内容がわかる仮の英字（例 `stack-puzzle`）。表示名もひとまず `<id>` のまま。

## 2. 最小の版を作る（engineer）

- `engineer` に: `tools/new-app.sh <id> "<id>"` でひな形を作り、**遊べる芯だけ**を書く。設定・効果音・共有・記録・演出は、オーナーが言うまで足さない。アイコンは仮のまま。designer は呼ばない。
- 終わりの条件は `npm run audit -- <id>`（ブラウザなし。アイコン関係を除く）の合格だけ。`audit:browser`、画面の撮影、テストの追加はしない。
- コミットはしてよい、push はしない。
- 出来の良し悪しはオーナーが触って決める。

## 3. GitHub に出す（ディレクター）

- 差分と audit の結果を確かめてから、オーナーの確認なしで出してよい（試作の push はオーナーの OK 済み、2026-09-29）。

```sh
cd ~/GitHub/tof/apps/<id>
gh repo create t-of/<id> --public --source . --push --description "試作" --homepage "https://t-of.github.io/<id>/"
gh api -X POST repos/t-of/<id>/pages -f 'source[branch]=main' -f 'source[path]=/'
gh api repos/t-of/<id>/pages/builds/latest --jq .status   # built になるまで待つ
curl -s -o /dev/null -w "%{http_code}\n" https://t-of.github.io/<id>/
```

- デモのポータルに出す（オーナーの指示、2026-09-30）: apps.js の先頭に `approved` なしで 1 件足す（name は `<id>`、tags に `'試作'`、icon は仮の `/<id>/icons/icon-192.png`、color は manifest の theme_color）。index.html の `?v=` を上げて `node tools/make-demo.mjs` を流し、本部をコミットして push する（確認なしでよい）。
- `https://t-of.github.io/<id>/` と遊び方の要約をオーナーに伝える。project の `stage` を `qa`（オーナーが試す段階）にする。
- 直しの要望が来たら engineer に直させ（終わりの条件は同じく `npm run audit -- <id>`）、差分と audit を確かめて確認なしで `git push` する（試作の push はオーナーの OK 済み、2026-09-30）。

## 正式に公開する（オーナーが言ったとき）

1. 名前: planner に候補と権利を出させ、オーナーに選んでもらう（`choices` のタスク ＋ `node tools/wait-choice.mjs <id>`）。id が変わるならリポジトリの名前を変える（`gh repo rename`）。
2. `designer` にアイコン一式と共有画像を作らせる。触るのは `icons/` だけ。表示名・説明は engineer に直させる。
3. planner に権利を調べさせる（RULES.md §1）。engineer に `npm run audit:browser -- <id>` を通させ、遊ぶ部分のテストを足させる。
4. `qa` に全体を確かめさせ、合格したらスクリーンショットを見せて **ポータルに載せる OK をもらう**。
5. `release` に docs/RELEASE.md の 5・6（apps.js・共有画像・記録）を進めさせる。project を `live` にし、タスクを `done` にする。
