---
name: new-app
description: T.OF... の新しいアプリの試作を作り、GitHub Pages に出してすぐ見られるようにする。名前・アイコン・ポータル掲載は後回し。オーナーが「新しいアプリを作りたい」「こんなゲームを作って」と言ったとき、または /new-app で使う。
---

# 新しいアプリを作る（試作）

まずアプリ本体だけを作り、GitHub Pages に出してオーナーがすぐ触れるようにする。
**名前・アイコン・共有画像・ポータル（apps.js）への掲載はしない。** それは下の「正式に公開する」でオーナーが言ったときに行う。
各段階の終わりでオーナーに短く報告する。

## 0. ボードに載せる

- docs/board.json の projects に足す（`stage: "planning"`、`note: "試作"`）。以後、段階が進むたびに `stage` を進め、振った仕事は tasks に足して `doing` / `done` にする。
- 複数のアプリを同時に進めてよい。アプリごとに別のメンバーを並行で動かす。

## 1. 企画（planner、短く）

- オーナーのアイデアを `planner` に渡し、`docs/private/specs/<id>.md` を作らせる。中身はルール・画面の流れ・保存するデータ・権利だけ。**名前の候補やひとことは考えさせない。**
- `<id>` は内容がわかる仮の英字（例 `stack-puzzle`）でよい。表示名もひとまず `<id>` のまま。
- 権利（RULES.md §1）の判定が「危険」のときだけ、オーナーに見せて止まる。それ以外はチャットで一言伝えて進める。

## 2. 実装（engineer）

- `engineer` に: `tools/new-app.sh <id> "<id>"` でひな形を作り、仕様どおりに本体を書く。アイコンはひな形の仮アイコンのまま。
- 終わりの条件は `npm run audit:browser -- <id>` の合格（アイコン関係を除く）と、アプリのテスト。コミットはしてよい、push はしない。
- designer は呼ばない。

## 3. GitHub に出す（ディレクター）

- 差分と audit の結果を確かめてから、オーナーの確認なしで出してよい（試作の push はオーナーの OK 済み、2026-09-29）。

```sh
cd ~/GitHub/tof/apps/<id>
gh repo create t-of/<id> --public --source . --push --description "試作" --homepage "https://t-of.github.io/<id>/"
gh api -X POST repos/t-of/<id>/pages -f 'source[branch]=main' -f 'source[path]=/'
gh api repos/t-of/<id>/pages/builds/latest --jq .status   # built になるまで待つ
curl -s -o /dev/null -w "%{http_code}\n" https://t-of.github.io/<id>/
```

- `https://t-of.github.io/<id>/` と遊び方の要約をオーナーに伝える。project の `stage` を `qa`（オーナーが試す段階）にする。
- 直しの要望が来たら engineer に直させ、`git push` する（`tools/release.sh <id>` でもよい）。

## 正式に公開する（オーナーが言ったとき）

1. 名前: planner に候補と権利を出させ、オーナーに選んでもらう（`choices` のタスク ＋ `node tools/wait-choice.mjs <id>`）。id が変わるならリポジトリの名前を変える（`gh repo rename`）。
2. `designer` にアイコン一式と共有画像を作らせる。触るのは `icons/` だけ。表示名・説明は engineer に直させる。
3. `qa` に全体を確かめさせ、合格したらスクリーンショットを見せて **ポータルに載せる OK をもらう**。
4. `release` に docs/RELEASE.md の 5・6（apps.js・共有画像・記録）を進めさせる。project を `live` にし、タスクを `done` にする。
