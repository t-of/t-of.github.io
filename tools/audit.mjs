#!/usr/bin/env node
// 全アプリを RULES.md に照らして自動チェックする。
//
//   npm run audit                 ファイルだけ見る（速い）
//   npm run audit -- --browser    実際に Chrome で開いて、エラー・はみ出しも見る
//   npm run audit -- gear-align   1 本だけ
//   npm run audit -- --json       結果を JSON で出す（エージェント用）
//
// アプリの一覧は apps.js、各アプリは ../<id>/（~/GitHub/<id>/）を見る。
// 意図して残している違いは docs/DECISIONS.md に理由を書き、下の EXCEPTIONS に足す。

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WORKSPACE = path.dirname(HUB);
const ORIGIN = 'https://t-of.github.io';

// 意図して残している違い（docs/DECISIONS.md に理由がある）
const EXCEPTIONS = {
  'gear-align': ['webapp-kit'],
  'hue-hunter': ['webapp-kit'],
  'Half-Cut': ['webapp-kit'],
};

const args = process.argv.slice(2);
const BROWSER = args.includes('--browser');
const JSON_OUT = args.includes('--json');
const only = args.filter((a) => !a.startsWith('--'));

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
  const html = read(path.join(dir, 'index.html'));
  if (!html) { add('index.html', false, 'index.html がない'); return results; }
  const sources = walk(dir, ['.html', '.js', '.mjs', '.css']);
  const code = sources.map(read).join('\n');
  const htmlAll = sources.filter((p) => p.endsWith('.html')).map(read).join('\n');

  // §1 リポジトリ
  let branch = '';
  try { branch = execFileSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* git でない */ }
  add('main ブランチ', branch === 'main', branch || 'git リポジトリでない', '§1');
  add('.nojekyll', exists(path.join(dir, '.nojekyll')), '', '§1');
  add('相対パス', !/(?:src|href)=["']\/(?!\/)[^"']+["']/.test(html.replace(/href=["']\/["']/g, '')),
    'ルートから始まるパス（/xxx）がある', '§1');

  // §2 head
  add('viewport-fit=cover', /viewport-fit=cover/.test(html), '', '§2');
  add('black-translucent なし', !/<meta[^>]+content=["']black-translucent/i.test(htmlAll), 'iOS 26 で上部が隠れる', '§2');
  add('theme-color', !!metaContent(html, 'theme-color'), '', '§2');
  add('description', !!metaContent(html, 'description'), '', '§2');
  add('title の形', /<title>[^<]+ — [^<]+<\/title>/.test(html), '「名前 — ひとこと」', '§2');
  const ogImage = metaContent(html, 'og:image');
  const ogLocal = ogImage?.startsWith(`${ORIGIN}/${app.id}/`) && path.join(dir, ogImage.slice(`${ORIGIN}/${app.id}/`.length));
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

  // §7 制作元
  add('T.OF... へのリンク', /href=["']\/["']/.test(code) && /T\.OF\.\.\./.test(code), '', '§7');

  // §8 README
  const readme = read(path.join(dir, 'README.md')) || '';
  add('README の題', /^# .+ — .+/.test(readme), '1 行目を「# 名前 — ひとこと」に', '§8');
  const heads = ['リンク', '遊び方', 'アプリとして入れる', '開発'];
  const missingHeads = heads.filter((h) => !new RegExp(`^##\\s.*${h}`, 'm').test(readme));
  add('README の見出し', missingHeads.length === 0, missingHeads.join(', '), '§8');
  add('README に T.OF...', /T\.OF\.\.\./.test(readme), '', '§7');

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
  const browser = await chromium.launch({ channel: 'chrome' });
  const out = {};
  for (const app of apps) {
    const results = [];
    const add = (id, ok, detail = '') => results.push({ id, ok, detail, rule: 'browser' });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|firebase|firestore/i.test(m.text())) errors.push(m.text()); });
    try {
      await page.goto(`${base}/${app.id}/`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(1500);
      add('エラーなし', errors.length === 0, errors.slice(0, 2).join(' / '));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      add('横にはみ出さない', !overflow);
      await page.screenshot({ path: path.join(shots, `${app.id}.png`) });
    } catch (e) {
      add('開ける', false, e.message.split('\n')[0]);
    }
    await ctx.close();
    out[app.id] = results;
  }
  await browser.close();
  server.close();
  return out;
}

// ---------- 出力 ----------

const listed = loadApps();
// apps.js にまだ無い（公開前の）アプリも、id を指定すれば ~/GitHub/<id>/ を調べる
const apps = only.length === 0 ? listed : only.map((id) => listed.find((a) => a.id === id) ?? { id });
const report = {};
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
  for (const [id, results] of Object.entries(report)) {
    const bad = results.filter((r) => !r.ok);
    failed += bad.length;
    console.log(`${bad.length ? '✗' : '✓'} ${id.padEnd(20)} ${results.length - bad.length}/${results.length}`);
    for (const r of bad) console.log(`    ✗ ${r.rule.padEnd(7)} ${r.id}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(failed ? `\n${failed} 件の未対応。docs/RULES.md を参照。` : '\nすべて合格。');
  if (BROWSER) console.log(`スクリーンショット: ${path.relative(process.cwd(), path.join(HUB, '.audit'))}/`);
}
process.exit(failed ? 1 : 0);
