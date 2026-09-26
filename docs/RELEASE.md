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
cd ~/GitHub/tof/apps/<id>
gh repo create t-of/<id> --public --source . --push \
  --description "<説明>" --homepage "https://t-of.github.io/<id>/"
gh api -X POST repos/t-of/<id>/pages -f 'source[branch]=main' -f 'source[path]=/'
```

既存のアプリ: `git push`

## 4. 反映を確かめる

```sh
gh api repos/t-of/<id>/pages/builds/latest --jq .status   # built になるまで待つ
curl -s -o /dev/null -w "%{http_code}\n" https://t-of.github.io/<id>/
```

## 5. ポータルに載せる（新しいアプリのとき）

1. [`apps.js`](../apps.js) の **先頭** に 1 件足す（書き方はファイルの頭のコメント）。
2. `python3 tools/make-icons.py` で共有画像（`icons/og.png`）を作り直す。
3. 本部をコミットして push し、ポータルにカードが出ることを確かめる。

## 6. 記録

- [board.json](board.json) の該当タスクを `done` にし、プロジェクトの `stage` を `live` にする（ディレクターが行う）。
- ルールから外したことがあれば [DECISIONS.md](DECISIONS.md) に書く。

## Cloudflare に置くアプリ（apps.js で `host: 'cloudflare'`）

課金・広告のアプリは GitHub Pages ではなく Cloudflare に置く（RULES.md §13・§14、DECISIONS.md「課金・広告のアプリは Cloudflare に置く」）。
上の 1〜2・6 はそのまま。3〜5 を次に替える。

**Workers の静的アセット ＋ Workers Builds（GitHub のリポジトリをつなぎ、`main` に push すると出る）** にする。
Cloudflare は Pages より Workers を推している（「Start new projects with Workers.」[Pages の文書](https://developers.cloudflare.com/pages/)）。
`_headers` は Workers の静的アセットでも使える（[Headers](https://developers.cloudflare.com/workers/static-assets/headers/)）。
手元の `wrangler deploy` は使わない（手元の `.dev.vars` などを配ってしまうおそれがあり、出した中身がリポジトリとずれる）。

### 最初に一度だけ（オーナー）

- Cloudflare のアカウントを作り、2 段階認証を入れる。`workers.dev` の名前（`<名前>.workers.dev`）を決める。
- GitHub の `t-of` に「Cloudflare Workers and Pages」の GitHub App を入れる。入れる先は「Only select repositories」で、Cloudflare に置くアプリだけにする。

### アプリのリポジトリに置くもの

`wrangler.jsonc`（`name` はリポジトリ名。ダッシュボードの Worker の名前と同じでないとビルドが落ちる）:

```jsonc
{
  "name": "<id>",
  "compatibility_date": "2026-09-26",
  "assets": { "directory": "./" }
}
```

`.assetsignore`（`directory` が直下だと、何も除かずに `.git` まで配る。書き方は `.gitignore` と同じ）:

```
.git
.github
.wrangler
.dev.vars*
.env*
node_modules
tests
wrangler.jsonc
README.md
```

`_headers`（CSP と `frame-ancestors`。広告のない画面の例。広告を入れるなら `script-src` を AdSense に合わせ、`object-src 'none'` と `base-uri 'none'` は残す）:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

`.gitignore` に `.env*` と `.dev.vars*`。`.nojekyll` は要らない。

### GitHub に出して、Cloudflare につなぐ

```sh
cd ~/GitHub/tof/apps/<id>
gh repo create t-of/<id> --public --source . --push --description "<説明>"
```

1. Cloudflare のダッシュボード → Workers & Pages → 作成 → リポジトリをインポート（Import a repository）→ `t-of/<id>` を選ぶ。
2. プロジェクト名は `<id>`、本番のブランチは `main`、デプロイのコマンドは既定の `npx wrangler deploy`、ビルドのコマンドは空のまま。
3. 最初のビルドが終わると `https://<id>.<名前>.workers.dev/` で開ける。
4. `gh repo edit t-of/<id> --homepage "https://<id>.<名前>.workers.dev/"` で About の Website を入れる。

更新は `git push` だけ（`main` に push すると Workers Builds が出す）。

### 反映を確かめる

```sh
curl -s -o /dev/null -w "%{http_code}\n" https://<id>.<名前>.workers.dev/
curl -sI https://<id>.<名前>.workers.dev/ | grep -i -E "content-security-policy|x-content-type"   # frame-ancestors が入っている
curl -s -o /dev/null -w "%{http_code}\n" https://<id>.<名前>.workers.dev/.git/config           # 404 になる（.assetsignore が効いている）
```

### ポータルに載せる

`apps.js` に、いつもの項目に加えて次を書く（`icon` は絶対 URL）。

```js
  host: 'cloudflare',
  url: 'https://<id>.<名前>.workers.dev/',
  icon: 'https://<id>.<名前>.workers.dev/icons/icon-192.png',
  paid: true,
```

`npm run audit -- <id>` で §13・§14 のチェックが通ることを確かめてから、本部をコミットして push する。
