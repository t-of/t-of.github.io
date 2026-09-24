---
name: release
description: T.OF... のアプリ 1 本を公開・更新する。直したアプリを出すとき、または /release <id> で使う。
---

# 公開する

引数はアプリの id（リポジトリ名）。

1. `cd ~/GitHub/tof/t-of.github.io && npm run audit:browser -- <id>` を実行する。落ちたら止めて、何が落ちたかをオーナーに伝える（直すなら `engineer` に頼む）。
2. `git -C ~/GitHub/tof/apps/<id> status` と差分を見て、何が公開されるかを確かめる。オーナーが編集中らしい変更（自分たちが触っていないもの）があれば、それは入れない。
3. `release` エージェントに、公開する範囲（コミット済みか、何をコミットするか）を伝えて任せる。新しいアプリなら、オーナーの OK が出ていることも伝える。
4. `release` の報告を、本番の URL と Pages のビルド状態で確かめてから、オーナーに伝える。
