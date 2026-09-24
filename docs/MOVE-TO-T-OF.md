# t-of.github.io への引っ越し

2026-09-24 に決めた。`sora3141.github.io`（個人アカウント）から Organization **`t-of`** に移し、
ポータルを `https://t-of.github.io/`、各アプリを `https://t-of.github.io/<id>/` にする。独自ドメインは今は取らない（無料の範囲でやる）。
ボードのタスクは t13〜t16。終わったらこのファイルは消し、DECISIONS.md に 1 項目残す。

## 1. 移す前の準備（ローカルだけ。公開中のサイトには影響しない）

1. アドレスの書き換え（10 本のアプリと本部。`docs/DECISIONS.md` と `docs/board.json` は履歴なので除く）
   - `sora3141.github.io` → `t-of.github.io`（大文字小文字を問わない。ローカルのフォルダ名 `~/GitHub/sora3141.github.io/` もこれで直る）
   - `github.com/Sora3141` → `github.com/t-of`
   - 素の `Sora3141` は作者名なので残す（core-image-english の LICENSE など）。`gh repo create Sora3141/<id>` や `.claude/settings.json` の `repos/Sora3141/*` は `t-of` に直す
   - `tools/audit.mjs` の `ORIGIN`、`studio/app.js` のアイコンの URL も含まれる
2. 各アプリの `<head>` の先頭（どのスクリプトより前）に、記録の受け取りを入れる。
   古いアドレスの中継ページが `#tof-move=<データ>&<元の hash>` を付けて送ってくるので、無い鍵だけ書き込み、hash を元に戻す。
   gear-align は hash を共有に使っているので、元の hash を必ず戻す。

   ```html
   <script>/* sora3141.github.io から移ってきた記録を受け取る。ponytail: 2027-09 ごろに消す */
   (function(){var m=location.hash.match(/^#tof-move=([^&]*)&?(.*)$/);if(!m)return;
   try{var d=JSON.parse(decodeURIComponent(m[1]));for(var k in d)if(localStorage.getItem(k)===null)localStorage.setItem(k,d[k]);}catch(e){}
   history.replaceState(null,'',location.pathname+location.search+(m[2]?'#'+m[2]:''));})();</script>
   ```
3. 中継サイト（個人アカウントに新しく作る `Sora3141/sora3141.github.io`、ローカルは `~/GitHub/sora3141.github.io/`）
   - `index.html` と `404.html`（同じ中身）: localStorage を全部読み、同じパスの t-of.github.io へ `location.replace` する。
     「新しいアドレスに移りました。ホーム画面に入れている人は入れ直してください」と一言出す。
     ```js
     var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}
     var h=location.hash.slice(1);
     location.replace('https://t-of.github.io'+location.pathname+location.search+'#tof-move='+encodeURIComponent(JSON.stringify(d))+(h?'&'+h:''));
     ```
     404.html はアプリのフォルダが無いパス（`/pentris/` など）を全部受け止める。
   - `<id>/sw.js`（10 本とも同じ中身）: 古い Service Worker を消す。これが無いと、キャッシュ優先の古い SW が古いアプリを出し続けて、中継ページにたどり着かない。
     ```js
     // T.OF... は t-of.github.io に移った。古い SW とキャッシュを消して、中継ページを読み直させる。
     self.addEventListener('install', () => self.skipWaiting());
     self.addEventListener('activate', (e) => e.waitUntil((async () => {
       for (const k of await caches.keys()) await caches.delete(k);
       await self.registration.unregister();
       for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
     })()));
     ```
   - `.nojekyll` も置く。中継サイトは audit の対象外（apps.js に載せない）。

## 2. 移す（オーナーの OK をもらってから）

1. Organization `t-of` ができていることを確かめる（`gh api orgs/t-of`）
2. アプリ 10 本: `gh api repos/Sora3141/<id>/transfer -f new_owner=t-of`
3. 本部: `gh api repos/Sora3141/sora3141.github.io/transfer -f new_owner=t-of -f new_name=t-of.github.io`
4. 各リポジトリの Pages が `main` の `/` で動いていること、About の Website が新しい URL になっていることを確かめて直す
5. 準備した変更を push する
6. 中継サイトを `gh repo create Sora3141/sora3141.github.io --public` で作り、Pages を有効にして push する
   （本部を移したあとでないと、同じ名前のリポジトリを作れない）

## 3. ローカルと Claude の設定

- `~/GitHub/sora3141.github.io/` → `~/GitHub/t-of.github.io/` に名前を変え、各リポジトリの `origin` を `github.com/t-of/<id>` にする
- 中継サイトを `~/GitHub/sora3141.github.io/` に置く
- `~/.claude/CLAUDE.md` と各アプリの `CLAUDE.md` の `~/GitHub/sora3141.github.io/` を直す（1 の書き換えで各アプリの分は直る）
- Claude のメモリ `~/.claude/projects/-Users-kases-GitHub-sora3141-github-io/memory/` があれば `-Users-kases-GitHub-t-of-github-io/` にコピーする
- スタジオを起動し直す

## 4. 確かめる

- `npm run audit:browser` が全部通る
- `https://sora3141.github.io/pentris/` を開くと `https://t-of.github.io/pentris/` に移り、記録（`pent.` の鍵など）が引き継がれている（Playwright で古い側に鍵を入れてから開く）
- 古い SW が入ったブラウザでも移動する（先に古いサイトで SW を入れてから試す）
- gear-align の共有リンク（`#...`）が移動後も効く

## オーナーの作業

- t13: Organization `t-of` を作る
- t16: Firebase コンソール → Authentication → 設定 → 承認済みドメインに `t-of.github.io` を足す（hue-hunter の Google ログイン）
- スマホのホーム画面のアプリを入れ直す

## 限界（あらかじめ伝えておくこと）

- iPhone のホーム画面から開いたアプリは Safari と記録の置き場所が別なので、引き継ぎがうまくいかないことがある
- hue-hunter のログイン状態は引き継げない（もう一度ログインする）。ランキングなど Firebase 側のデータはそのまま
