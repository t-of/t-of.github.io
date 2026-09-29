#!/usr/bin/env node
// 本番のポータル一覧用に、各アプリのスマホ画面を 3 枚ずつ撮る。
//
//   node tools/shots.mjs            apps.js の全アプリ
//   node tools/shots.mjs id1 id2    指定したアプリだけ
//
// 出力: shots/<id>-1.jpg .. -3.jpg（390px 幅、JPEG）、.audit/shots-sheet-<n>.png（確認用の一覧）
// 汎用のやり方で崩れるアプリは、下の CUSTOM に id → 手順の関数を足す。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(HUB, 'shots');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
fs.mkdirSync(OUT, { recursive: true });

function loadApps() {
  const src = fs.readFileSync(path.join(HUB, 'apps.js'), 'utf8');
  const window = {};
  new Function('window', src)(window);
  return window.TOFO_APPS;
}

const urlOf = (app) => (app.host === 'cloudflare' ? app.url : `https://t-of.github.io/${app.id}/`);

// 主ボタンらしき文字（はじめる・スタート・遊ぶ など）
const PRIMARY = /はじめる|あそぶ|遊ぶ|スタート|開始|始める|つづける|続ける|続きから|次へ|わかった|play|start|begin|タップ|press/i;

// 普通のクリックが無関係な透明パネルに邪魔されたら、要素自身の click() を直接呼ぶ（当たり判定を無視する）
async function forceClick(el, timeout = 2000) {
  await el.click({ timeout }).catch(() =>
    el.click({ timeout, force: true }).catch(() => el.evaluate((e) => e.click()).catch(() => {})));
}

async function clickByText(page, re, timeout = 2500) {
  const el = page.locator('button:visible, a:visible, [role="button"]:visible, .btn:visible, summary:visible')
    .filter({ hasText: re }).first();
  if (await el.count().catch(() => 0) === 0) return false;
  await forceClick(el, timeout);
  return true;
}

// 汎用の「進める」操作。毎回まず主ボタン（はじめる等）を探し、無ければ押せる部品、それも無ければ盤面らしき中央を叩く。
// 主ボタンをくり返し探すのは、タイトル → 遊び方の説明 → 本編、のように画面が何段か続くアプリのため。
async function genericAdvance(page, steps = 3) {
  const spots = [[0.5, 0.45], [0.3, 0.6], [0.7, 0.35], [0.5, 0.7]];
  for (let i = 0; i < steps; i++) {
    if (await clickByText(page, PRIMARY)) { await page.waitForTimeout(450); continue; }
    const candidates = page.locator('button:visible, [role="button"]:visible, .cell:visible, .tile:visible, canvas:visible');
    const n = await candidates.count().catch(() => 0);
    if (n > 0) {
      await forceClick(candidates.nth(Math.min(i, n - 1)));
    } else {
      const box = page.viewportSize();
      const [fx, fy] = spots[i % spots.length];
      await page.mouse.click(box.width * fx, box.height * fy).catch(() => {});
    }
    await page.waitForTimeout(400);
  }
}

// メニュー・戻るなど、盤面でないボタンを避けてマスだけを叩く（genericAdvance だと ☰ やメニューを踏んでタイトルへ戻ることがある）
const NAV_BLOCK = /^(×|✕|☰|\?|❓)$|メニュー|戻る|もどる|タイトルへ|閉じる|とじる|設定|共有|問い合わせ|T\.OF|遊び方|ヒント|手戻す|はじめから|リセット|新しい盤面|^音|先手|後手/;
async function tapBoardCells(page, n = 2) {
  const candidates = page.locator('button:visible, [role="button"]:visible, .cell:visible, .tile:visible, canvas:visible')
    .filter({ hasNotText: NAV_BLOCK });
  const total = await candidates.count().catch(() => 0);
  for (let i = 0; i < n && total > 0; i++) {
    await forceClick(candidates.nth(Math.min(i, total - 1)));
    await page.waitForTimeout(350);
  }
}

// clickRe を何度か押して、untilRe のボタンが現れるのを待つ（アニメ中の当たり判定ミスに強くする）
async function clickUntil(page, clickRe, untilRe, tries = 4) {
  const seen = () => page.locator('button:visible, [role="button"]:visible').filter({ hasText: untilRe }).count().catch(() => 0);
  for (let i = 0; i < tries; i++) {
    if (await seen()) return true;
    await clickByText(page, clickRe);
    await page.waitForTimeout(500);
  }
  return (await seen()) > 0;
}

async function setSlider(page, v) {
  await page.evaluate((v) => {
    const s = document.querySelector('input[type="range"]');
    s.value = v; s.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  await page.waitForTimeout(1200);
}

// アプリごとの手順（id → { play(page), further(page) }）。汎用で崩れるものだけここに足す。
const CUSTOM = {
  'disassembly': {
    // スライダーを動かして、分解図とノーリングを撮る
    async play(page) { await setSlider(page, 45); },
    async further(page) { await setSlider(page, 100); },
  },
  'capgift': {
    async play(page) {
      await page.locator('input').first().fill('500').catch(() => {});
      await page.locator('input').first().dispatchEvent('input').catch(() => {});
      await page.waitForTimeout(500);
    },
    async further(page) {
      await page.locator('button, [role="button"]').filter({ hasText: /扶養している/ }).first().click().catch(() => {});
      await page.waitForTimeout(500);
    },
  },
  'lapbell': {
    async play(page) { await clickByText(page, /開始|スタート|はじめる|start/i); await page.waitForTimeout(1500); },
    async further(page) { await page.waitForTimeout(2500); },
  },
  'super-marubatsu': {
    async play(page) { await clickUntil(page, /ふたりで/, /閉じる/); await clickByText(page, /閉じる/); await page.waitForTimeout(500); await tapBoardCells(page, 1); },
    async further(page) { await tapBoardCells(page, 2); },
  },
  'doorwise': {
    async play(page) { await clickByText(page, /ステージ.*から/); await page.waitForTimeout(600); await tapBoardCells(page, 1); },
    async further(page) { await tapBoardCells(page, 2); },
  },
  'cross-take': {
    async play(page) { await clickUntil(page, /ふたりで対戦/, /閉じる/); await clickByText(page, /閉じる/); await page.waitForTimeout(500); await tapBoardCells(page, 1); },
    async further(page) { await tapBoardCells(page, 2); },
  },
  'last-three': {
    async play(page) { await clickUntil(page, /ふたりで対戦/, /閉じる/); await clickByText(page, /閉じる/); await page.waitForTimeout(500); await tapBoardCells(page, 1); },
    async further(page) { await tapBoardCells(page, 2); },
  },
  'skewline': {
    async play(page) {
      await clickUntil(page, /ふたりで対戦/, /はじめる/);
      await clickByText(page, /はじめる/);
      await page.waitForTimeout(500);
      await tapBoardCells(page, 1);
    },
    async further(page) { await tapBoardCells(page, 2); },
  },
  'corner-reach': {
    async play(page) { await clickByText(page, /^遊ぶ$/); await clickByText(page, /閉じる/); await genericAdvance(page, 1); },
    async further(page) { await genericAdvance(page, 3); },
  },
  'stay-asleep': {
    async play(page) {
      await clickByText(page, /今日の扉/);
      await page.waitForTimeout(600);
      const box = page.viewportSize();
      await page.mouse.click(box.width * 0.32, box.height * 0.5).catch(() => {});
      await page.waitForTimeout(600);
    },
    async further(page) {
      const box = page.viewportSize();
      await page.mouse.click(box.width * 0.68, box.height * 0.5).catch(() => {});
      await page.waitForTimeout(1600);
    },
  },
  'tap-quartet': {
    async play(page) { await clickByText(page, /目かくし10秒/); await page.waitForTimeout(700); },
    async further(page) { await clickByText(page, /^スタート$/); await page.waitForTimeout(1000); },
  },
  'number-bench': {
    async play(page) { await clickByText(page, /当たる確率/); await page.waitForTimeout(600); },
    async further(page) {
      const input = page.locator('input:visible').first();
      if (await input.count().catch(() => 0)) { await input.fill('70').catch(() => {}); await input.dispatchEvent('input').catch(() => {}); }
      else await genericAdvance(page, 2);
      await page.waitForTimeout(500);
    },
  },
  'glyph-shift': {
    async play(page) { await clickByText(page, /はじめる/); await page.waitForTimeout(700); },
    async further(page) {
      const cells = page.locator('canvas:visible, button:visible, [role="button"]:visible');
      const n = await cells.count().catch(() => 0);
      if (n) await forceClick(cells.nth(Math.min(3, n - 1)));
      await page.waitForTimeout(500);
    },
  },
  'gear-align': {
    async play(page) { await clickByText(page, /はじめる/); await page.waitForTimeout(700); },
    async further(page) {
      const cells = page.locator('canvas:visible');
      if (await cells.count().catch(() => 0)) await forceClick(cells.first());
      await page.waitForTimeout(400);
      await clickByText(page, /左回り|右回り/);
      await page.waitForTimeout(500);
    },
  },
  'bloomcast': {
    async play(page) { await genericAdvance(page, 3); },
    async further(page) { await genericAdvance(page, 3); },
  },
  'arnolds-cat': {
    async play(page) { await clickByText(page, /はじめる/); await page.waitForTimeout(500); await clickByText(page, /^▶$/); await page.waitForTimeout(600); },
    async further(page) { await page.waitForTimeout(1200); },
  },
  'buyout': {
    async play(page) { await genericAdvance(page, 2); },
    async further(page) { await genericAdvance(page, 2); },
  },
  'meguribi': {
    async play(page) { await clickByText(page, /まわす|スタート|start/i); await page.waitForTimeout(2500); },
    async further(page) { await page.waitForTimeout(1500); },
  },
  'ringgrain': {
    async play(page) { const c = page.locator('button, [role="button"]').filter({ hasText: /./ }); if (await c.count()) await c.first().click().catch(() => {}); await page.waitForTimeout(600); },
    async further(page) { await genericAdvance(page, 1); },
  },
};

async function shootApp(browser, app) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  const shots = [];
  try {
    await page.goto(urlOf(app), { waitUntil: 'load', timeout: 25000 });
    await page.waitForTimeout(1500);
    shots.push(await page.screenshot());

    const custom = CUSTOM[app.id];
    if (custom) await custom.play(page).catch(() => {});
    else await genericAdvance(page, 3).catch(() => {});
    await page.waitForTimeout(600);
    shots.push(await page.screenshot());

    if (custom) await custom.further(page).catch(() => {});
    else await genericAdvance(page, 3).catch(() => {});
    await page.waitForTimeout(600);
    let shot3 = await page.screenshot();
    // 2 枚目と同じ絵になっていたら、代わりに 1 画面ぶんスクロールする
    if (Buffer.compare(shot3, shots[1]) === 0) {
      await page.mouse.wheel(0, 700).catch(() => {});
      await page.waitForTimeout(400);
      shot3 = await page.screenshot();
    }
    shots.push(shot3);
  } catch (e) {
    console.error(`  ✗ ${app.id}: ${String(e).split('\n')[0]}`);
  }
  await ctx.close();
  return shots;
}

function toJpeg(pngBuf, outFile) {
  fs.writeFileSync(outFile + '.tmp.png', pngBuf);
  execFileSync(FFMPEG, ['-y', '-i', outFile + '.tmp.png', '-vf', 'scale=390:-1', '-q:v', '5', outFile], { stdio: 'pipe' });
  fs.unlinkSync(outFile + '.tmp.png');
}

async function makeSheet(rows, outFile, browser) {
  // rows: [{ label, files: [jpegPath,...] }]（10 本前後ずつ呼ぶ）
  const page = await browser.newPage({ viewport: { width: 1300, height: rows.length * 220 + 40 } });
  const rowsHtml = rows.map((r) => `
    <div style="display:flex;align-items:center;gap:10px;height:210px">
      <div style="width:110px;font:12px sans-serif;color:#333">${r.label}</div>
      ${r.files.map((f) => `<img src="data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}" height="200">`).join('')}
    </div>`).join('');
  await page.setContent(`<body style="margin:0;background:#fff;padding:12px">${rowsHtml}</body>`);
  await page.screenshot({ path: outFile });
  await page.close();
}

async function main() {
  const args = process.argv.slice(2);
  const listed = loadApps();
  const apps = args.length ? args.map((id) => listed.find((a) => a.id === id) ?? { id }) : listed;

  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch {
    console.error('playwright-core がない');
    process.exit(2);
  }
  const browser = await chromium.launch().catch(() => { console.error('ブラウザを起動できない'); process.exit(2); });

  const sheetRows = [];
  for (const app of apps) {
    process.stdout.write(`${app.id} ... `);
    const shots = await shootApp(browser, app);
    const files = [];
    for (let i = 0; i < shots.length; i++) {
      const f = path.join(OUT, `${app.id}-${i + 1}.jpg`);
      toJpeg(shots[i], f);
      files.push(f);
    }
    console.log(`${files.length}/3`);
    if (files.length === 3) sheetRows.push({ label: app.id, files });
  }

  // 一覧を 10 本ずつに分けて確認用シートを作る
  const CHUNK = 10;
  fs.mkdirSync(path.join(HUB, '.audit'), { recursive: true });
  for (let i = 0; i < sheetRows.length; i += CHUNK) {
    const n = Math.floor(i / CHUNK) + 1;
    await makeSheet(sheetRows.slice(i, i + CHUNK), path.join(HUB, '.audit', `shots-sheet-${n}.png`), browser);
  }
  await browser.close();
}

main();
