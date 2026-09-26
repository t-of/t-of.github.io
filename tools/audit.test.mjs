// audit.mjs の安全・課金・Cloudflare のチェック（safetyChecks）のテスト。
//   node --test tools/audit.test.mjs
// 鍵の形の文字列は、このファイル自体が「秘密の鍵」のチェックに引っかからないように、つないで作る。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { safetyChecks, repoFiles, maskableOverflow } from './audit.mjs';

const find = (results, id) => {
  const r = results.find((x) => x.id === id);
  assert.ok(r, `${id} の結果がない`);
  return r;
};
const run = (files, app = { id: 'demo' }, opts) => safetyChecks(app, files, opts);
const fails = (files, id, app, opts) => assert.equal(find(run(files, app, opts), id).ok, false, `${id} が落ちるはず`);
const passes = (files, id, app, opts) => {
  const r = find(run(files, app, opts), id);
  assert.equal(r.ok, true, `${id} が通るはず: ${r.detail}`);
  assert.ok(!r.warn, `${id} が警告を出さないはず`);
};
const warns = (files, id, app) => {
  const r = find(run(files, app), id);
  assert.equal(r.ok, true, `${id} は警告だけで落とさない`);
  assert.equal(r.warn, true, `${id} が警告を出すはず`);
};
const absent = (files, id, app) => assert.ok(!run(files, app).some((x) => x.id === id), `${id} は走らないはず`);

const PAID = { id: 'demo', paid: true, host: 'cloudflare', url: 'https://demo.example.workers.dev/' };
const CF = { id: 'demo', host: 'cloudflare', url: 'https://demo.example.workers.dev/' };
const k = (...parts) => parts.join('');

// ---------- §1 全アプリ・本部 ----------

test('秘密の鍵', () => {
  const id = '秘密の鍵がない';
  fails({ 'pay.js': `const key = '${k('sk', '_live_', 'a1B2c3D4e5F6g7H8')}';` }, id);
  fails({ 'pay.js': `const key = '${k('rk', '_test_', 'a1B2c3D4e5F6g7H8')}';` }, id);
  fails({ 'hook.js': k('wh', 'sec_', 'abcdefghij0123456789') }, id);
  fails({ 'key.pem': k('-----BEGIN ', 'PRIVATE KEY-----\nMC4CAQ...') }, id);
  fails({ 'jwk.json': `{"kty":"OKP","crv":"Ed25519","x":"abc","${'d'}":"${'A'.repeat(43)}"}` }, id);
  passes({ 'pay.js': "const pk = 'pk_live_abc'; // sk_ と rk_ は置かない", 'README.md': 'whsec_ は secret に入れる' }, id);
  passes({ 'jwk.json': '{"kty":"OKP","crv":"Ed25519","x":"' + 'B'.repeat(43) + '"}', 'icon.svg': '<path d="M0 0L10 10"/>' }, id);
});

test('.env / .dev.vars', () => {
  const id = '.env / .dev.vars を入れない';
  fails({ '.env': 'X=1' }, id);
  fails({ 'worker/.dev.vars': 'X=1' }, id);
  fails({ '.env.production': 'X=1' }, id);
  passes({ '.env.example': 'X=', '.gitignore': '.env*\n', 'env.js': '' }, id);
});

test('外のスクリプト', () => {
  const id = '外のスクリプト';
  fails({ 'index.html': '<script src="https://cdn.example.com/lib@1.2.3/x.js"></script>' }, id);   // 許していないホスト
  fails({ 'index.html': '<script type="module">import { a } from "https://www.gstatic.com/firebasejs/latest/app.js";</script>' }, id);   // 版がない
  fails({ 'main.js': 'import("https://www.gstatic.com/lib@latest/x.js")' }, id);
  passes({ 'index.html': '<script type="module">import { a } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";</script>' }, id);
  passes({ 'index.html': '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1"></script><script src="https://js.stripe.com/basil/stripe.js"></script>' }, id);
  passes({ 'index.html': '<script src="./main.js"></script>', 'tests/run.mjs': 'import x from "https://cdn.example.com/x.js"' }, id);   // テストは見ない
});

test('外の文字を innerHTML（警告だけ）', () => {
  const id = '外の文字を innerHTML';
  warns({ 'main.js': 'const q = new URLSearchParams(location.search); el.innerHTML = q.get("n");' }, id);
  warns({ 'main.js': 'const h = location.hash; list.insertAdjacentHTML("beforeend", h);' }, id);
  passes({ 'main.js': 'const q = new URLSearchParams(location.search); el.textContent = q.get("n");', 'ui.js': 'el.innerHTML = "<b>固定</b>";' }, id);
});

// ---------- §13 課金・広告（paid: true） ----------

test('§13 は paid のときだけ走る', () => {
  for (const id of ['置き場所', 'CSP', 'テストの決済が残っていない', '購入の画面に広告がない']) absent({ 'index.html': '' }, id);
});

test('置き場所', () => {
  fails({}, '置き場所', { id: 'demo', paid: true });
  passes({}, '置き場所', PAID);
});

test('CSP', () => {
  const id = 'CSP';
  fails({ 'index.html': '<html></html>' }, id, PAID);
  fails({ 'index.html': `<meta http-equiv="Content-Security-Policy" content="script-src 'self'">` }, id, PAID);
  passes({ 'index.html': `<meta http-equiv="Content-Security-Policy" content="object-src 'none'; base-uri 'none'">` }, id, PAID);
  passes({ _headers: "/*\n  Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'\n" }, id, PAID);
});

test('テストの決済', () => {
  const id = 'テストの決済が残っていない';
  fails({ 'buy.js': "location.href = 'https://buy.stripe.com/test_abc123';" }, id, PAID);
  fails({ 'buy.js': "const pk = 'pk_test_abc';" }, id, PAID);
  passes({ 'buy.js': "location.href = 'https://buy.stripe.com/abc123';" }, id, PAID);
});

test('購入の画面に広告（警告だけ）', () => {
  const id = '購入の画面に広告がない';
  warns({ 'buy.html': '<a href="https://buy.stripe.com/abc">買う</a><ins class="adsbygoogle"></ins>' }, id, PAID);
  passes({ 'buy.html': '<a href="https://buy.stripe.com/abc">買う</a>', 'index.html': '<ins class="adsbygoogle"></ins>' }, id, PAID);
});

test('権利の保存キー', () => {
  const id = '権利の保存キー';
  fails({ 'buy.js': "location.href = 'https://buy.stripe.com/abc';" }, id, PAID);   // entitlement.js がない
  fails({ 'entitlement.js': "localStorage.setItem('entitlement', t);" }, id, PAID);    // 素のキー
  fails({ 'entitlement.js': "localStorage.setItem('other.entitlement', t);" }, id, PAID);
  passes({ 'entitlement.js': "const KEY = 'demo.entitlement';" }, id, PAID);
  absent({ 'index.html': '<ins class="adsbygoogle"></ins>' }, id, PAID);   // 買うものがない（広告だけ）なら見ない
});

test('型（tsc）', () => {
  const id = '型（tsc --noEmit）';
  fails({ 'jsconfig.json': '{}' }, id, PAID, { tsc: () => ({ ok: false, detail: 'main.js(1,1): error' }) });
  passes({ 'jsconfig.json': '{}' }, id, PAID, { tsc: () => ({ ok: true, detail: '' }) });
  assert.ok(!run({}, PAID, { tsc: () => assert.fail('jsconfig.json がないのに tsc を呼んだ') }).some((x) => x.id === id));
});

// ---------- §14 Cloudflare（host: 'cloudflare'） ----------

test('§14 は cloudflare のときだけ走る', () => {
  for (const id of ['apps.js の url', 'ポータルへのリンク', 'wrangler の設定', '_headers の CSP と frame-ancestors', '.gitignore に .env と .dev.vars']) absent({}, id);
});

test('apps.js の url', () => {
  fails({}, 'apps.js の url', { id: 'demo', host: 'cloudflare' });
  fails({}, 'apps.js の url', { ...CF, url: 'http://demo.example.workers.dev/' });
  passes({}, 'apps.js の url', CF);
});

test('wrangler の設定', () => {
  fails({ 'index.html': '' }, 'wrangler の設定', CF);
  passes({ 'wrangler.jsonc': '{}' }, 'wrangler の設定', CF);
});

test('_headers の CSP と frame-ancestors', () => {
  const id = '_headers の CSP と frame-ancestors';
  fails({}, id, CF);
  fails({ _headers: "/*\n  Content-Security-Policy: default-src 'self'\n" }, id, CF);
  fails({ _headers: "/*\n  X-Frame-Options: DENY\n  frame-ancestors: 'none'\n" }, id, CF);
  passes({ _headers: "/*\n  Content-Security-Policy: default-src 'self'; frame-ancestors 'none'\n" }, id, CF);
});

test('.gitignore に .env と .dev.vars', () => {
  const id = '.gitignore に .env と .dev.vars';
  fails({ '.gitignore': '.DS_Store\n' }, id, CF);
  fails({ '.gitignore': '.env*\n' }, id, CF);
  passes({ '.gitignore': '.env*\n.dev.vars*\n' }, id, CF);
});

test('ポータルへのリンク', () => {
  const id = 'ポータルへのリンク';
  fails({ 'index.html': '<a href="/">T.OF...</a>' }, id, CF);
  passes({ 'index.html': '<a href="https://t-of.github.io/">T.OF...</a>' }, id, CF);
});

test('.assetsignore（assets.directory が直下のとき）', () => {
  const id = '.assetsignore';
  const root = { 'wrangler.jsonc': '{ "name": "demo", "assets": { "directory": "./" } }' };
  fails(root, id, CF);
  fails({ ...root, '.assetsignore': '.git\nnode_modules\n' }, id, CF);
  fails({ ...root, '.assetsignore': '.gitignore\n.dev.vars*\n.env*\nnode_modules\n.wrangler\n' }, id, CF);   // .gitignore は .git ではない
  passes({ ...root, '.assetsignore': '.git\n.dev.vars*\n.env*\nnode_modules\n.wrangler\nwrangler.jsonc\n' }, id, CF);
  absent({ 'wrangler.jsonc': '{ "name": "demo", "assets": { "directory": "./public" } }' }, id, CF);
});

test('repoFiles: コミット前のファイルも見る、.gitignore のものは見ない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  try {
    execFileSync('git', ['init', '-q', dir]);
    fs.writeFileSync(path.join(dir, '.gitignore'), '.dev.vars*\n');
    fs.writeFileSync(path.join(dir, '.dev.vars'), 'X=1');           // 無視されているので出ない
    fs.writeFileSync(path.join(dir, 'pay.js'), `const k = '${k('sk', '_live_', 'a1B2c3D4e5F6g7H8')}';`);   // まだコミットしていない
    fs.writeFileSync(path.join(dir, 'icon.png'), Buffer.from([0x89, 0x50, 0, 1]));
    const files = repoFiles(dir);
    assert.ok(!('.dev.vars' in files));
    assert.equal(files['icon.png'], null);
    assert.equal(find(safetyChecks({ id: 'demo' }, files), '秘密の鍵がない').ok, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- maskable-512.png の絵柄が中央 80% に収まっているか（§2） ----------

// w×h の RGBA 配列を作る。bg(x, y) が背景の色、fg があれば重ねて描く（中心からの距離・角度で判定する）
function makeIcon(w, h, bg, fg) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b, a = 255] = fg?.(x, y) ?? bg(x, y);
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return data;
}
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);

test('maskable: 背景だけなら合格（0px）', () => {
  const w = 256, h = 256;
  const data = makeIcon(w, h, () => [200, 200, 200]);
  const r = maskableOverflow(data, w, h);
  assert.equal(r.maxR, 0);
  assert.ok(r.maxR <= r.limit);
});

test('maskable: 安全円の中の絵柄だけなら合格', () => {
  const w = 256, h = 256, cx = w / 2, cy = h / 2;
  const data = makeIcon(w, h, (x, y) => (dist(x, y, cx, cy) <= 40 ? [10, 10, 10] : [200, 200, 200]));
  const r = maskableOverflow(data, w, h);
  assert.ok(r.maxR <= r.limit, `はみ出し扱いになった: ${r.maxR}`);
});

test('maskable: 安全円の外に色の違う点があれば不合格', () => {
  const w = 256, h = 256, cx = w / 2, cy = h / 2;
  // 204.8 と 230 の間（安全円のすぐ外・背景の見本より内側）に、背景と離れた色の点を置く
  const data = makeIcon(w, h, () => [255, 255, 255], (x, y) => (dist(x, y, cx + 108, cy) <= 4 ? [0, 0, 0] : null));
  const r = maskableOverflow(data, w, h);
  assert.ok(r.maxR > r.limit, `はみ出しを見つけられなかった: ${r.maxR}`);
});

test('maskable: 背景がグラデーションでも誤判定しない', () => {
  const w = 256, h = 256;
  // 横一直線に白 → 黒（画像いっぱいに変わる、きつめのグラデーション）
  const data = makeIcon(w, h, (x) => { const v = Math.round((x / (w - 1)) * 255); return [v, v, v]; });
  const r = maskableOverflow(data, w, h);
  assert.ok(r.maxR <= r.limit, `グラデーションを絵柄と誤判定した: ${r.maxR}`);
});

test('maskable: 透明な隅は絵柄として数えない', () => {
  const w = 256, h = 256, cx = w / 2, cy = h / 2;
  const data = makeIcon(w, h, (x, y) => (dist(x, y, cx, cy) > 120 ? [200, 200, 200, 0] : [200, 200, 200]));
  const r = maskableOverflow(data, w, h);
  assert.equal(r.maxR, 0);
});
