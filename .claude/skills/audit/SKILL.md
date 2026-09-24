---
name: audit
description: T.OF... の全アプリを RULES.md に照らして自動チェックし、直すべき点をまとめる。/audit で使う。ルールを変えたあとや、定期的な点検で使う。
---

# 全アプリの点検

1. `cd ~/GitHub/sora3141.github.io && npm run audit:browser` を実行する（時間がかかる。速く見るだけなら `npm run audit`）。
   各アプリのリポジトリが古いかもしれないので、先に `git -C ~/GitHub/<id> pull --ff-only` で最新にする（編集中の変更があるリポジトリは飛ばす）。
2. 落ちた項目をアプリごとにまとめる。docs/DECISIONS.md にある例外は数えない。
3. `.audit/*.png` のスクリーンショットをざっと見て、崩れていそうなものがあれば `qa` に詳しく見させる。
4. オーナーに、合格の数、直すべき点（重い順）、直し方の案を短く報告する。
5. 直すことになったら、アプリごとに `engineer` へ並行で頼む。終わったら `/release <id>`。
6. 直すことになったものは docs/board.json に tasks として足す。
