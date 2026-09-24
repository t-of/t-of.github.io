# 公開の手順

新しいアプリを公開するときと、既存のアプリを更新するときの手順。
`/release <id>` を使うと、リリース担当がこの通りに進める。

## 1. 公開前

- [ ] `npm run audit:browser -- <id>` がすべて合格（例外は [DECISIONS.md](DECISIONS.md) にあるものだけ）
- [ ] アプリのテストがあれば通る
- [ ] スクリーンショット（`.audit/<id>.png`）を目で見て、崩れていない
- [ ] 新しいアプリのとき: 名前・アイコン・説明をオーナーが確認した

## 2. コミット

- メッセージは日本語。1 行目に何をしたか、空行、必要なら本文（箇条書き）。
- 最後に `Co-Authored-By: Claude …` の行を付ける（エージェントが作ったとき）。
- 関係ないファイル（`.vscode/` など）や、オーナーが編集中のファイルは入れない。

## 3. GitHub に出す

新しいアプリ:

```sh
cd ~/GitHub/<id>
gh repo create Sora3141/<id> --public --source . --push \
  --description "<説明>" --homepage "https://sora3141.github.io/<id>/"
gh api -X POST repos/Sora3141/<id>/pages -f 'source[branch]=main' -f 'source[path]=/'
```

既存のアプリ: `git push`

## 4. 反映を確かめる

```sh
gh api repos/Sora3141/<id>/pages/builds/latest --jq .status   # built になるまで待つ
curl -s -o /dev/null -w "%{http_code}\n" https://sora3141.github.io/<id>/
```

## 5. ポータルに載せる（新しいアプリのとき）

1. [`apps.js`](../apps.js) の **先頭** に 1 件足す（書き方はファイルの頭のコメント）。
2. `python3 tools/make-icons.py` で共有画像（`icons/og.png`）を作り直す。
3. 本部をコミットして push し、ポータルにカードが出ることを確かめる。

## 6. 記録

- [BACKLOG.md](BACKLOG.md) の該当項目を消す。
- ルールから外したことがあれば [DECISIONS.md](DECISIONS.md) に書く。
