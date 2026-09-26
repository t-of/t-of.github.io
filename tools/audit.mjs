#!/usr/bin/env node
// 全アプリを RULES.md に照らして自動チェックする。
//
//   npm run audit                 ファイルだけ見る（速い）
//   npm run audit -- --browser    実際に Chrome で開いて、エラー・はみ出しも見る
//   npm run audit -- gear-align   1 本だけ
//   npm run audit -- --json       結果を JSON で出す（エージェント用）
//   npm run audit -- t-of.github.io   本部だけ（秘密の鍵などのチェック。全部を見るときは自動で入る）
//   node --test tools/audit.test.mjs   このチェック自身のテスト
//
// アプリの一覧は apps.js、各アプリは ../apps/<id>/（~/GitHub/tof/apps/<id>/）を見る。
// apps.js の host: 'cloudflare' は §14、paid: true は §13 のチェックを足す。
// 意図して残している違いは docs/DECISIONS.md に理由を書き、下の EXCEPTIONS に足す。
// warn: true の結果は警告（人が見る）。ok のままなので落ちない。

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HUB_ID = path.basename(HUB);                         // t-of.github.io
const WORKSPACE = path.join(path.dirname(HUB), 'apps');   // ~/GitHub/tof/apps
const ORIGIN = 'https://t-of.github.io';

// 意図して残している違い（docs/DECISIONS.md に理由がある）
const EXCEPTIONS = {
  'gear-align': ['webapp-kit'],
  'hue-hunter': ['webapp-kit'],
  'Half-Cut': ['webapp-kit'],
};

// 外から読んでよいスクリプトのホスト（§1）。版を URL に入れる（10.7.1、/v3、@1.2 など）。
// AdSense の公式のタグと Stripe.js は、読む URL が決まっていて版は相手が決めるので、版を見ない
const SCRIPT_HOSTS = ['www.gstatic.com', 'js.stripe.com', 'pagead2.googlesyndication.com'];
const UNVERSIONED_HOSTS = ['pagead2.googlesyndication.com', 'js.stripe.com'];

// ---------- 読み込み ----------

function loadApps() {
  const src = fs.readFileSync(path.join(HUB, 'apps.js'), 'utf8');
  const window = {};
  new Function('window', src)(window);
  return window.TOFO_APPS;
}

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const exists = (p) => fs.existsSync(p);

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || ['node_modules', 'tools', 'test', 'tests', 'archive', 'docs', 'vendor'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}

const attr = (html, re) => (html.match(re) || [])[1];
const metaContent = (html, key) =>
  attr(html, new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)`, 'i'))
  ?? attr(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`, 'i'));
const linkHref = (html, rel) =>
  attr(html, new RegExp(`<link[^>]+rel=["']${rel}["'][^>]*href=["']([^"']*)`, 'i'))
  ?? attr(html, new RegExp(`<link[^>]+href=["']([^"']*)["'][^>]*rel=["']${rel}["']`, 'i'));
const local = (dir, href) => href && path.join(dir, href.replace(/^\.\//, '').replace(/[?#].*$/, ''));

// ---------- ファイルのチェック ----------

function auditFiles(app) {
  const dir = path.join(WORKSPACE, app.id);
  const results = [];
  const add = (id, ok, detail = '', rule = '') => results.push({ id, ok, detail, rule });

  if (!exists(dir)) { add('repo', false, `${dir} がない（git clone が必要）`); return results; }
  const cloudflare = app.host === 'cloudflare';
  const html = read(path.join(dir, 'index.html'));
  if (!html) { add('index.html', false, 'index.html がない'); return results; }
  const sources = walk(dir, ['.html', '.js', '.mjs', '.css']);
  const code = sources.map(read).join('\n');
  const htmlAll = sources.filter((p) => p.endsWith('.html')).map(read).join('\n');

  // §1 リポジトリ
  let branch = '';
  try { branch = execFileSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* git でない */ }
  add('main ブランチ', branch === 'main', branch || 'git リポジトリでない', '§1');
  if (!cloudflare) add('.nojekyll', exists(path.join(dir, '.nojekyll')), '', '§1');
  add('相対パス', !/(?:src|href)=["']\/(?!\/)[^"']+["']/.test(html.replace(/href=["']\/["']/g, '')),
    'ルートから始まるパス（/xxx）がある', '§1');

  // §2 head
  add('viewport-fit=cover', /viewport-fit=cover/.test(html), '', '§2');
  add('black-translucent なし', !/<meta[^>]+content=["']black-translucent/i.test(htmlAll), 'iOS 26 で上部が隠れる', '§2');
  add('theme-color', !!metaContent(html, 'theme-color'), '', '§2');
  add('description', !!metaContent(html, 'description'), '', '§2');
  add('title の形', /<title>[^<]+ — [^<]+<\/title>/.test(html), '「名前 — ひとこと」', '§2');
  const ogImage = metaContent(html, 'og:image');
  const home = cloudflare ? app.url : `${ORIGIN}/${app.id}/`;   // 公開 URL（/ で終わる）
  const ogLocal = home && ogImage?.startsWith(home) && path.join(dir, ogImage.slice(home.length));
  add('OGP', !!(metaContent(html, 'og:title') && metaContent(html, 'og:site_name') && ogImage), '', '§2');
  add('og.png', !!(ogLocal && exists(ogLocal) && /og\.png$/.test(ogLocal)), ogImage || 'og:image なし', '§2');
  add('apple-touch-icon', !!exists(local(dir, linkHref(html, 'apple-touch-icon')) || ''), '', '§2');
  add('icon.svg', /<link[^>]+icon[^>]+\.svg|<link[^>]+\.svg[^>]+icon/i.test(html) && !/data:image\/svg/.test(linkHref(html, 'icon') || ''), '', '§2');
  add('favicon-32', exists(path.join(dir, 'icons', 'favicon-32.png')), '', '§2');

  // manifest
  const mHref = linkHref(html, 'manifest');
  const mText = mHref && read(local(dir, mHref));
  let m = null;
  try { m = mText && JSON.parse(mText); } catch { /* 下で失敗にする */ }
  add('manifest', !!m, mHref || 'manifest のリンクなし', '§2');
  if (m) {
    const missing = ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'lang', 'id']
      .filter((k) => !m[k]);
    add('manifest の項目', missing.length === 0 && m.display === 'standalone', missing.join(', '), '§2');
    const icons = m.icons || [];
    const iconFile = (i) => exists(path.join(path.dirname(local(dir, mHref)), i.src.replace(/[?#].*$/, '')));
    add('192/512 アイコン', ['192x192', '512x512'].every((s) => icons.some((i) => i.sizes === s && iconFile(i))), '', '§2');
    add('maskable アイコン', icons.some((i) => /maskable/.test(i.purpose || '') && iconFile(i)), '', '§2');
  }

  // §3 データ保存（キーの頭にアプリ名が付いているか、ざっくり）
  const bareKey = code.match(/localStorage\.(?:get|set)Item\(\s*['"`](best|settings|state|save|progress|score|sound)['"`]/);
  add('localStorage のキー', !bareKey, bareKey ? `素のキー "${bareKey[1]}"` : '', '§3');

  // §4 Service Worker（置くのは任意。置くなら他アプリのキャッシュを消さない）
  const sw = read(path.join(dir, 'sw.js'));
  if (sw) {
    const deletes = /caches\.delete/.test(sw);
    add('他アプリのキャッシュを消さない', !deletes || /startsWith\(|\.test\(k|\.test\(key/.test(sw), '古いキャッシュの削除が自分の接頭辞に限られていない', '§4');
  }

  // §5 スマホ表示
  add('safe-area', /env\(safe-area-inset-/.test(code), '', '§5');
  add('html の背景色', /(^|[\s,}])html\s*(,[^{]*)?\{[^}]*background/m.test(code), '', '§5');

  // §5 音（効果音は必須。Web Audio を使うなら、iPhone のマナーモードでも鳴るように）
  const hasSound = /AudioContext|new Audio\(/.test(code);
  add('効果音', hasSound || (EXCEPTIONS[app.id] || []).includes('sound'), '音を鳴らしていない', '§5');
  if (hasSound) {
    add('マナーモードでも音', /navigator\.audioSession/.test(code), 'navigator.audioSession.type を設定していない', '§5');
  }

  // §6 インストール・共有
  const hasKit = exists(path.join(dir, 'webapp-kit', 'webapp-kit.js'));
  add('webapp-kit', hasKit && /data-wak=["']install/.test(code) && /data-wak=["']share/.test(code) || (EXCEPTIONS[app.id] || []).includes('webapp-kit'),
    (EXCEPTIONS[app.id] || []).includes('webapp-kit') ? '独自 UI（DECISIONS.md）' : '', '§6');

  // §7 制作元（Cloudflare のアプリは別のオリジンなので、§14 のチェックで見る）
  if (!cloudflare) add('T.OF... へのリンク', /href=["']\/["']/.test(code) && /T\.OF\.\.\./.test(code), '', '§7');

  // §8 README
  const readme = read(path.join(dir, 'README.md')) || '';
  add('README の題', /^# .+ — .+/.test(readme), '1 行目を「# 名前 — ひとこと」に', '§8');
  const heads = ['リンク', '遊び方', 'アプリとして入れる', '開発'];
  const missingHeads = heads.filter((h) => !new RegExp(`^##\\s.*${h}`, 'm').test(readme));
  add('README の見出し', missingHeads.length === 0, missingHeads.join(', '), '§8');
  add('README に T.OF...', /T\.OF\.\.\./.test(readme), '', '§7');

  results.push(...safetyChecks(app, repoFiles(dir), { tsc: () => runTsc(dir) }));
  return results;
}

// ---------- 安全・課金・Cloudflare のチェック（§1・§13・§14） ----------

// git が見ているファイル（コミット済み＋これから入りうるもの）を { 相対パス: 中身 } で返す。
// 画像などの中身は null（名前だけ見る）。git でなければフォルダを全部見る。
export function repoFiles(dir) {
  let list;
  try {
    list = execFileSync('git', ['-C', dir, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 << 20 })
      .split('\0').filter(Boolean);
  } catch {
    list = walk(dir, ['.html', '.js', '.mjs', '.css', '.json', '.jsonc', '.toml', '.md', '.txt', '']).map((p) => path.relative(dir, p));
  }
  const files = {};
  for (const rel of list) {
    const p = path.join(dir, rel);
    let text = null;
    try {
      if (fs.statSync(p).size < 2 << 20) { const t = fs.readFileSync(p, 'utf8'); if (!t.includes('\0')) text = t; }
    } catch { /* 消えたファイル */ }
    files[rel] = text;
  }
  return files;
}

function runTsc(dir) {
  try {
    execFileSync('npx', ['--no-install', 'tsc', '--noEmit', '-p', '.'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, detail: '' };
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`.trim().split('\n');
    return { ok: false, detail: out.slice(0, 2).join(' / ') || 'tsc が動かない（npm i -D typescript）' };
  }
}

const SECRET_PATTERNS = [
  ['Stripe の秘密鍵', /\b[sr]k_(?:live|test)_[0-9A-Za-z]{10,}/],
  ['Webhook の署名の鍵', /\bwhsec_[0-9A-Za-z]{10,}/],
  ['秘密鍵（PEM）', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/],
  ['秘密鍵（JWK）', /"kty"[\s\S]{0,400}"d"\s*:\s*"[A-Za-z0-9_-]{32,}"|"d"\s*:\s*"[A-Za-z0-9_-]{32,}"[\s\S]{0,400}"kty"/],
];
const SKIP_DIR = /(^|\/)(node_modules|tools|test|tests|archive|docs|vendor)\//;   // walk() と同じ。アプリの本体だけ見るとき
const isCode = (p) => /\.(html|js|mjs)$/.test(p) && !SKIP_DIR.test(p);

// files: { 相対パス: 中身 | null }。opts.tsc: jsconfig.json があるとき型を確かめる関数（テストでは差し替える）
export function safetyChecks(app, files, opts = {}) {
  const results = [];
  const add = (id, ok, detail = '', rule = '', warn = false) => results.push(warn ? { id, ok: true, warn: !ok, detail: ok ? '' : detail, rule } : { id, ok, detail, rule });
  const entries = Object.entries(files);
  const texts = entries.filter(([, t]) => t != null);
  const code = texts.filter(([p]) => isCode(p));
  const except = (k) => (EXCEPTIONS[app.id] || []).includes(k);
  const has = (p) => p in files;

  // §1 全アプリ・本部
  const leaks = [];
  for (const [p, t] of texts) for (const [name, re] of SECRET_PATTERNS) if (re.test(t)) leaks.push(`${p}（${name}）`);
  add('秘密の鍵がない', leaks.length === 0, `${leaks.slice(0, 3).join(', ')} — 鍵を作り直し、履歴からも消す`, '§1');

  const envFiles = entries.map(([p]) => p).filter((p) => /(^|\/)(\.env|\.dev\.vars)(\.|$)/.test(p) && !/\.(example|sample)$/.test(p));
  add('.env / .dev.vars を入れない', envFiles.length === 0, envFiles.join(', '), '§1');

  const badScripts = [];
  for (const [p, t] of code) {
    const urls = [...t.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)/gi), ...t.matchAll(/(?:\bfrom|\bimport\s*\(?)\s*["'](https?:\/\/[^"']+)/g)].map((m) => m[1]);
    for (const u of urls) {
      let host = '';
      try { host = new URL(u).host; } catch { /* 壊れた URL */ }
      const versioned = /\d+\.\d+|\/v\d+\b|@\d/.test(u.replace(/^https?:\/\/[^/]+/, '')) && !/@latest\b/.test(u);
      if (!SCRIPT_HOSTS.includes(host)) badScripts.push(`${p}: ${host || u}（許していないホスト）`);
      else if (!versioned && !UNVERSIONED_HOSTS.includes(host)) badScripts.push(`${p}: ${u}（版がない）`);
    }
  }
  add('外のスクリプト', badScripts.length === 0, badScripts.slice(0, 3).join(', '), '§1');

  const outside = code.filter(([, t]) => /\.innerHTML\s*[+]?=|insertAdjacentHTML/.test(t) && /location\.(hash|search)|URLSearchParams|firestore|FileReader/i.test(t)).map(([p]) => p);
  add('外の文字を innerHTML', outside.length === 0, `${outside.slice(0, 5).join(', ')}${outside.length > 5 ? ` ほか ${outside.length - 5}` : ''} — URL などから来た文字を入れていないか人が見る`, '§1', true);

  // §13 課金・広告（apps.js で paid: true）
  if (app.paid) {
    add('置き場所', app.host === 'cloudflare' || except('host'), '課金のアプリは host: \'cloudflare\' にする', '§13');

    const csp = [
      ...code.filter(([p]) => p.endsWith('.html')).map(([, t]) => (t.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi) || []).join('\n')),
      ...(files._headers || '').split('\n').filter((l) => /^\s*Content-Security-Policy\s*:/i.test(l)),
    ].join('\n');
    add('CSP', /object-src\s+'none'/.test(csp) && /base-uri/.test(csp), csp ? 'object-src \'none\' か base-uri がない' : 'CSP がない（<meta> か _headers）', '§13');

    const testPay = code.filter(([, t]) => /buy\.stripe\.com\/test_|\bpk_test_/.test(t)).map(([p]) => p);
    add('テストの決済が残っていない', testPay.length === 0, testPay.join(', '), '§13');

    const adOnBuy = code.filter(([p, t]) => p.endsWith('.html') && /buy\.stripe\.com|\/claim\b/.test(t) && /adsbygoogle/.test(t)).map(([p]) => p);
    add('購入の画面に広告がない', adOnBuy.length === 0, adOnBuy.join(', '), '§13', true);

    if (code.some(([, t]) => /buy\.stripe\.com|\/claim\b|entitlement/.test(t))) {
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = code.map(([, t]) => t.match(/["'`]([\w-]+)[.:]entitlement["'`]/)).find(Boolean);
      add('権利の保存キー', has('entitlement.js') && !!key && norm(key[1]) === norm(app.id),
        !has('entitlement.js') ? 'entitlement.js がない' : `キーを "<アプリ名>.entitlement" に${key ? `（今は "${key[0].slice(1, -1)}"）` : ''}`, '§13');
    }

    if (has('jsconfig.json') && opts.tsc) {
      const r = opts.tsc();
      add('型（tsc --noEmit）', r.ok, r.detail, '§13');
    }
  }

  // §14 Cloudflare に置くアプリ（apps.js で host: 'cloudflare'）
  if (app.host === 'cloudflare') {
    add('apps.js の url', /^https:\/\/[^/]+\/$/.test(app.url || ''), 'url: \'https://…/\' を書く', '§14');
    const all = code.map(([, t]) => t).join('\n');
    add('ポータルへのリンク', /href=["']https:\/\/t-of\.github\.io\/["']/.test(all) && /T\.OF\.\.\./.test(all), 'href="https://t-of.github.io/" の T.OF... のリンクがない（href="/" は自分のオリジンに飛ぶ）', '§14');
    add('wrangler の設定', ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].some(has), '', '§14');
    const headers = files._headers || '';
    add('_headers の CSP と frame-ancestors', /^\s*Content-Security-Policy\s*:.*frame-ancestors/im.test(headers),
      headers ? 'Content-Security-Policy に frame-ancestors がない' : '_headers がない', '§14');
    // assets.directory がリポジトリの直下だと、何も除かずに全部配る（.git も手元の .dev.vars も）
    const wrangler = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].map((f) => files[f]).find(Boolean) || '';
    if (/["']?directory["']?\s*[:=]\s*["']\.\/?["']/.test(wrangler)) {
      const ai = files['.assetsignore'] || '';
      const missing = ['.git', '.dev.vars', '.env', 'node_modules', '.wrangler'].filter((x) => !new RegExp(`^/?${x.replaceAll('.', '\\.')}[*/]?\\s*$`, 'm').test(ai));
      add('.assetsignore', missing.length === 0, `${files['.assetsignore'] == null ? '.assetsignore がない。' : ''}配らないものに ${missing.join(', ')} を足す`, '§14');
    }
    const ignore = files['.gitignore'] || '';
    add('.gitignore に .env と .dev.vars', /^\/?\.env/m.test(ignore) && /^\/?\.dev\.vars/m.test(ignore), '', '§14');
  }
  return results;
}

// ---------- ブラウザのチェック ----------

function serve(root) {
  return new Promise((resolve) => {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
      '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(root, p);
      if (!f.startsWith(root) || !exists(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    server.listen(0, 'localhost', () => resolve(server));
  });
}

// 360・390・1280 幅で 1 枚ずつ開いて、はみ出し・コンソールのエラーを見る。390 はスクリーンショットも撮る（今までどおり失格になる）。
// 360・1280 と、オフラインでの再読み込みは警告どまり（人が見る。落とさない）
const SHEET_WIDTHS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

async function checkWidth(browser, base, appId, { width, height }) {
  const phone = width < 500;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: phone, isMobile: phone });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|firebase|firestore/i.test(m.text())) errors.push(m.text()); });
  let shot = null;
  let overflow = false;
  let opened = true;
  let offlineOk = true;
  try {
    await page.goto(`${base}/${appId}/`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(1200);
    overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    shot = await page.screenshot();
    // オフラインで再読み込み（Service Worker があれば表示できるはず）。失敗しても警告だけ
    await ctx.setOffline(true);
    try {
      await page.reload({ waitUntil: 'load', timeout: 8000 });
      offlineOk = (await page.evaluate(() => document.body.innerText.trim().length)) > 0;
    } catch { offlineOk = false; }
    await ctx.setOffline(false);
  } catch (e) {
    opened = false;
    errors.push(e.message.split('\n')[0]);
  }
  await ctx.close();
  return { width, height, opened, overflow, errors, shot, offlineOk };
}

// 撮った 3 枚を横に並べて 1 枚に縮める（外の画像ライブラリを使わず、Chromium 自身に描かせる）
async function makeSheet(browser, appId, shots, outFile) {
  const usable = shots.filter((s) => s.shot);
  if (usable.length === 0) return;
  const gap = 16;
  const targetWidth = 1200;
  const factor = (targetWidth - gap * (usable.length - 1)) / usable.reduce((s, x) => s + x.width, 0);
  const imgs = usable.map((s) => `<img src="data:image/png;base64,${s.shot.toString('base64')}" width="${Math.round(s.width * factor)}">`).join('');
  const maxH = Math.round(Math.max(...shots.map((s) => s.height)) * factor);
  const page = await browser.newPage({ viewport: { width: targetWidth, height: maxH + gap * 2 } });
  await page.setContent(`<body style="margin:0;background:#fff;display:flex;gap:${gap}px;padding:${gap}px;align-items:flex-start">${imgs}</body>`);
  await page.screenshot({ path: outFile });
  await page.close();
}

async function auditBrowser(apps) {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch {
    console.error('playwright-core がない。本部で npm install を実行する。');
    process.exit(2);
  }
  const server = await serve(WORKSPACE);
  const base = `http://localhost:${server.address().port}`;
  const shots = path.join(HUB, '.audit');
  fs.mkdirSync(shots, { recursive: true });
  // 撮影専用の chrome-headless-shell を使う。channel: 'chrome'（普段の Chrome）だと mac で窓が出てしまう
  const browser = await chromium.launch().catch(() => {
    console.error('撮影用のブラウザがない。本部で npx playwright-core install chromium-headless-shell を実行する。');
    process.exit(2);
  });
  const out = {};
  for (const app of apps) {
    const results = [];
    const add = (id, ok, detail = '', warn = false) => results.push(warn ? { id, ok: true, warn: !ok, detail: ok ? '' : detail, rule: 'browser' } : { id, ok, detail, rule: 'browser' });
    const widthResults = [];
    for (const w of SHEET_WIDTHS) widthResults.push(await checkWidth(browser, base, app.id, w));

    const main = widthResults.find((r) => r.width === 390);
    add('開ける', main.opened, main.errors[0] || '');
    if (main.opened) {
      add('エラーなし', main.errors.length === 0, main.errors.slice(0, 2).join(' / '));
      add('横にはみ出さない', !main.overflow);
      if (main.shot) fs.writeFileSync(path.join(shots, `${app.id}.png`), main.shot);
    }
    for (const r of widthResults) {
      if (r.width === 390) continue;   // 上ですでに失格つきで見た
      add(`開ける (${r.width}px)`, r.opened, r.errors[0] || '', true);
      if (r.opened) {
        add(`エラーなし (${r.width}px)`, r.errors.length === 0, r.errors.slice(0, 2).join(' / '), true);
        add(`横にはみ出さない (${r.width}px)`, !r.overflow, '', true);
      }
    }
    add('オフラインで再読み込み', widthResults.every((r) => !r.opened || r.offlineOk), '再読み込みで真っ白（Service Worker がないなら普通）', true);

    await makeSheet(browser, app.id, widthResults, path.join(shots, `${app.id}-sheet.png`));
    out[app.id] = results;
  }
  await browser.close();
  server.close();
  return out;
}

// ---------- 出力 ----------

async function main() {
  const args = process.argv.slice(2);
  const BROWSER = args.includes('--browser');
  const JSON_OUT = args.includes('--json');
  const only = args.filter((a) => !a.startsWith('--'));

  const listed = loadApps();
  // apps.js にまだ無い（公開前の）アプリも、id を指定すれば ~/GitHub/tof/apps/<id>/ を調べる
  const apps = only.length === 0 ? listed : only.filter((id) => id !== HUB_ID).map((id) => listed.find((a) => a.id === id) ?? { id });
  const report = {};
  // 本部は §1 の安全のチェックだけ（全部を見るときと、t-of.github.io を指定したとき）
  if (only.length === 0 || only.includes(HUB_ID)) report[HUB_ID] = safetyChecks({ id: HUB_ID }, repoFiles(HUB));
  for (const app of apps) report[app.id] = auditFiles(app);
  if (BROWSER) {
    const b = await auditBrowser(apps);
    for (const id in b) report[id].push(...b[id]);
  }

  let failed = 0;
  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
    failed = Object.values(report).flat().filter((r) => !r.ok).length;
  } else {
    let warned = 0;
    for (const [id, results] of Object.entries(report)) {
      const bad = results.filter((r) => !r.ok);
      const warns = results.filter((r) => r.warn);
      failed += bad.length;
      warned += warns.length;
      console.log(`${bad.length ? '✗' : '✓'} ${id.padEnd(20)} ${results.length - bad.length}/${results.length}${warns.length ? `  警告 ${warns.length}` : ''}`);
      for (const r of bad) console.log(`    ✗ ${r.rule.padEnd(7)} ${r.id}${r.detail ? ` — ${r.detail}` : ''}`);
      for (const r of warns) console.log(`    ! ${r.rule.padEnd(7)} ${r.id}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    console.log(failed ? `\n${failed} 件の未対応。docs/RULES.md を参照。` : '\nすべて合格。');
    if (warned) console.log(`警告 ${warned} 件（落とさない。人が見る）。`);
    if (BROWSER) console.log(`スクリーンショット: ${path.relative(process.cwd(), path.join(HUB, '.audit'))}/`);
  }
  process.exitCode = failed ? 1 : 0;   // exit() だとパイプに書ききる前に切れる（studio が JSON を読めない）
}

// テストから import したときは走らせない
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
