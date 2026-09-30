#!/usr/bin/env node
// 動画で見る棚の紹介動画を作る。
//
//   node tools/promo.mjs <id>...
//
// 出力: videos/<id>.mp4（720x1280, 30fps, 15秒, 音なし）、videos/<id>.jpg（表紙）
//       .audit/promo/<id>-sheet.png（確認用にコマを並べた画像）
// 作業用ファイルは .audit/promo/ に置く（リポジトリに入れない）。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WORK = path.join(HUB, '.audit', 'promo');
const OUT = path.join(HUB, 'videos');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const W = 720, H = 1280; // 出力サイズ 9:16
const REC_W = 405, REC_H = 720; // 録画サイズ（同じ比率、720 にそのまま拡大できる）

function loadApps() {
  const src = fs.readFileSync(path.join(HUB, 'apps.js'), 'utf8');
  const window = {};
  new Function('window', src)(window);
  return window.TOFO_APPS;
}
const urlOf = (app) => (app.host === 'cloudflare' ? app.url : `https://t-of.github.io/${app.id}/`);

// ── コピー（各アプリの見出し） ─────────────────────────────
const COPY = {
  'pentris': {
    genre: 'PUZZLE GAME',
    catch: ['5 マスのブロックで、', '**積んで、消す。**'],
    headline1: '選んで、**落とす。**',
    headline2: '**AI** の対局も、観戦できる。',
    tagline: 'ペントミノ落ち物パズル',
  },
  'coord-maze': {
    genre: 'PUZZLE MAZE',
    catch: ['座標だけで、', '**迷路を解く。**'],
    headline1: '**タップだけ**で進む。',
    headline2: '次元が増えるほど、**迷う。**',
    tagline: '2〜12 次元の座標迷路',
  },
  'gear-align': {
    genre: 'PUZZLE GAME',
    catch: ['歯車を持ち上げて、', '**向きを揃える。**'],
    headline1: '持ち上げて、**回す。**',
    headline2: '全部の合いマークを、**揃えろ。**',
    tagline: '歯車の向きを揃えるパズル',
  },
  'Half-Cut': {
    genre: 'PUZZLE GAME',
    catch: ['スワイプ一本で、', '**ぴったり半分に。**'],
    headline1: 'なぞって、**切る。**',
    headline2: '毎日 **5 問**のデイリー。',
    tagline: 'ぴったり半分に切るパズル',
  },
  'hue-hunter': {
    genre: 'COLOR TEST',
    catch: ['1 つだけ違う色を、', '**見分けられるか。**'],
    headline1: '色の**違うマス**を探す。',
    headline2: '見分けられる**限界**を測る。',
    tagline: '色相識別テスト',
  },
  'core-image-english': {
    genre: 'LEARNING APP',
    catch: ['丸暗記しない、', '**英語の学び方。**'],
    headline1: '**コアイメージ**で、選ぶ。',
    headline2: '単語も文法も、**掛け算**で理解。',
    tagline: '丸暗記しない英語学習',
  },
};

// プレイ画面のうち「盤面だけ」を切り出してカードにするための CSS セレクタ
// （無ければ画面全体をそのままカードにする）
const BOARD_SEL = {
  'pentris': '#stage',
  'coord-maze': '#board',
  'gear-align': '#board',
  'Half-Cut': '#board-canvas',
  'hue-hunter': '#board',
  'core-image-english': 'main',
};

// ── アプリごとのプレイ手順（録画中に呼ぶ。実際に盤面が動く操作を書く） ──
async function forceClick(el, timeout = 2500) {
  await el.click({ timeout }).catch(() =>
    el.click({ timeout, force: true }).catch(() => el.evaluate((e) => e.click()).catch(() => {})));
}
async function clickByText(page, re, timeout = 3000) {
  const el = page.locator('button:visible, a:visible, [role="button"]:visible, .btn:visible, summary:visible')
    .filter({ hasText: re }).first();
  if (await el.count().catch(() => 0) === 0) return false;
  await forceClick(el, timeout);
  return true;
}
async function dragAcross(page, box, fromFrac, toFrac) {
  await page.mouse.move(box.x + box.width * fromFrac[0], box.y + box.height * fromFrac[1]);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(
      box.x + box.width * (fromFrac[0] + (toFrac[0] - fromFrac[0]) * t),
      box.y + box.height * (fromFrac[1] + (toFrac[1] - fromFrac[1]) * t));
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

const PLAY = {
  async 'pentris'(page) {
    // タイトルはモード選択のタブが先にあるので、実際の開始は PLAY ボタン
    await clickByText(page, /^PLAY/);
    await page.waitForTimeout(900);
    for (let i = 0; i < 14; i++) {
      const dir = i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight';
      const steps = 1 + (i % 3);
      for (let s = 0; s < steps; s++) { await page.keyboard.press(dir).catch(() => {}); await page.waitForTimeout(90); }
      await page.keyboard.press(i % 4 === 3 ? 'ArrowUp' : 'Space').catch(() => {}); // たまに回転、基本はハードドロップ
      await page.waitForTimeout(420);
    }
  },
  async 'coord-maze'(page) {
    await clickByText(page, /はじめる/);
    await page.waitForTimeout(900);
    // 最短手を辿って実際にゴールまで進める（window.coordMaze は本編が公開している）
    for (let i = 0; i < 40; i++) {
      const step = await page.evaluate(() => {
        const g = window.coordMaze;
        if (!g || g.won) return null;
        return g.maze.nextStep(g.cell, g.goal);
      });
      if (!step) break;
      await page.evaluate((s) => window.coordMaze.select(s[0]), step);
      await page.waitForTimeout(140);
      await page.evaluate((s) => window.coordMaze.move(s[0], s[1]), step);
      await page.waitForTimeout(420);
    }
    await page.waitForTimeout(1200); // クリアの場面を少し見せる
  },
  async 'gear-align'(page) {
    await clickByText(page, /はじめる/);
    await page.waitForTimeout(900);
    // 自分で少し回してから、「自動で解く」で最後まで揃える様子を見せる
    const gears = page.locator('#board [class*="gear"], #board g, #board circle').first();
    if (await gears.count().catch(() => 0)) await forceClick(gears);
    await page.waitForTimeout(300);
    await clickByText(page, /右回り/).catch(() => {});
    await page.waitForTimeout(600);
    await forceClick(page.locator('#solve'));
    await page.waitForTimeout(500);
    await forceClick(page.locator('#confirm-go'));
    await page.waitForTimeout(8000); // 自動再生が進むのを見せる
  },
  async 'Half-Cut'(page) {
    // 初回は「遊び方」ダイアログが起動処理（フォント読み込み待ち、最大 1.5 秒）の後に自動で開く。
    // 録画の負荷でタイミングが伸びて閉じ損なうので、既読フラグを立ててから読み直す
    await page.evaluate(() => localStorage.setItem('half-cut:seen-howto', 'true')).catch(() => {});
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    // モードカードは PRACTICE / 練習 / 説明文をまとめて 1 つの button に持つので、テキスト完全一致ではなくクラスで狙う
    await forceClick(page.locator('.mode-card--practice'));
    await page.waitForTimeout(500);
    // 練習モードは同じ図形をスワイプで切り直せるので、2 分探索で 50:50 に寄せられる
    const canvas = page.locator('#board-canvas');
    const box = await canvas.boundingBox().catch(() => null);
    if (!box) return;
    const pctOf = async (fx) => {
      await dragAcross(page, box, [fx, 0.06], [fx, 0.94]); // 縦になぞる。fx は横位置 (0〜1)
      await page.waitForTimeout(500);
      const t = await page.locator('.pct--a').first().textContent().catch(() => null);
      return t ? parseFloat(t) : null;
    };
    const v0 = await pctOf(0.46);
    const v1 = await pctOf(0.58);
    // fx を増やすと比率がどちらへ動くかは図形の形しだいなので、実測して向きを決める
    const rising = v1 != null && v0 != null && v1 > v0;
    let lo = 0.15, hi = 0.85, fx = 0.58, v = v1;
    for (let i = 0; i < 9 && v != null && Math.abs(v - 50) > 1; i++) {
      if (rising ? v > 50 : v < 50) hi = fx; else lo = fx;
      fx = (lo + hi) / 2;
      v = await pctOf(fx);
    }
    await page.waitForTimeout(1500); // 50:50 に近い結果を見せる
  },
  async 'hue-hunter'(page) {
    await clickByText(page, /ログインせずに計測する/).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('#name-input').fill('T.OF').catch(() => {});
    await clickByText(page, /^\s*計測を開始/).catch(() => {});
    // 開始後は「3・2・1・GO」のカウントダウン（約 2.1 秒）を挟んでからマスが出る
    await page.locator('.tile.answer').first().waitFor({ timeout: 4000 }).catch(() => {});
    // 毎回、正解のマス (.tile.answer) を選び続ける。当たるたびにマス数が増えて細かくなる
    for (let i = 0; i < 8; i++) {
      const answer = page.locator('.tile.answer');
      if (await answer.count().catch(() => 0) === 0) break;
      await forceClick(answer.first());
      await page.waitForTimeout(650);
    }
  },
  async 'core-image-english'(page) {
    await clickByText(page, /単語/);
    await page.waitForTimeout(700);
    const start = page.locator('[data-vstart], [data-vstartall]').first();
    if (await start.count().catch(() => 0)) await forceClick(start);
    await page.waitForTimeout(700);
    // 既定は「英→日」4択で、問題文にすでに答えの単語が出ている。
    // その単語と data-vpick が一致する選択肢を選べば必ず正解になる
    for (let i = 0; i < 3; i++) {
      const word = await page.locator('.v-word').first().textContent().catch(() => null);
      const target = word ? word.trim().split(/\s/)[0] : null;
      const correct = target ? page.locator(`[data-vpick="${target}"]`) : null;
      if (correct && await correct.count().catch(() => 0)) await forceClick(correct.first());
      else await forceClick(page.locator('[data-vpick]:visible').first());
      await page.waitForTimeout(900); // 「◎ 正解」の表示を見せる
      const next = page.locator('[data-vnext]:visible');
      if (await next.count().catch(() => 0)) await forceClick(next.first());
      await page.waitForTimeout(700);
    }
  },
};

// ── カード（静止画）を HTML で描いて撮る ─────────────────────
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function b64(file) { return fs.readFileSync(file).toString('base64'); }
// `**語**` を <b>（アクセント色）にして残りは escape する
function mdBold(s, accent) {
  return esc(s).split(/\*\*(.+?)\*\*/).map((part, i) =>
    i % 2 === 1 ? `<b style="color:${accent}">${part}</b>` : part).join('');
}

async function shootCard(page, html) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(80);
  return page.screenshot({ type: 'png' });
}

function catchCardHtml(app, copy, accent, iconB64, bgFrameB64) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${W}px;height:${H}px;background:#0b0c10;overflow:hidden;
      font-family:-apple-system,'Hiragino Sans',sans-serif;position:relative}
    .bg{position:absolute;inset:-30px;opacity:.85;filter:blur(9px) saturate(1.35) brightness(.95);
      background-image:url(data:image/png;base64,${bgFrameB64});background-size:cover;background-position:center;}
    .shade{position:absolute;inset:0;background:radial-gradient(circle at 50% 38%,rgba(11,12,16,.35) 20%,#0b0c10 88%);}
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:18px;padding:60px;box-sizing:border-box;text-align:center}
    .line{color:#eceef3;font-size:56px;font-weight:800;line-height:1.35;letter-spacing:.02em;
      text-shadow:0 4px 24px rgba(0,0,0,.6)}
  </style></head><body>
    <div class="bg"></div>
    <div class="shade"></div>
    <div class="wrap">
      <div class="line">${copy.catch.map((s) => mdBold(s, accent)).join('<br>')}</div>
    </div>
  </body></html>`;
}

function nameCardHtml(app, copy, accent, iconB64) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${W}px;height:${H}px;background:#0b0c10;overflow:hidden;
      font-family:-apple-system,'Hiragino Sans',sans-serif;position:relative}
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px}
    .glow{position:absolute;width:340px;height:340px;border-radius:50%;background:${accent};
      opacity:.35;filter:blur(60px)}
    .icon{position:relative;width:220px;height:220px;border-radius:52px;
      box-shadow:0 20px 60px rgba(0,0,0,.4),0 0 70px ${accent}88}
    .name{color:#eceef3;font-size:60px;font-weight:800;letter-spacing:.01em}
    .genre{color:${accent};font-size:26px;font-weight:700;letter-spacing:.18em}
  </style></head><body>
    <div class="wrap">
      <div class="glow"></div>
      <img class="icon" src="data:image/png;base64,${iconB64}">
      <div class="name">${esc(app.name)}</div>
      <div class="genre">${esc(copy.genre)}</div>
    </div>
  </body></html>`;
}

function endCardHtml(app, copy, accent, iconB64, tofWordmarkB64) {
  const url = `t-of.github.io/${app.id}/`;
  // 長い id でも 1 行に収まるように文字サイズを詰める
  const urlSize = Math.max(18, Math.min(28, Math.floor(560 / (url.length * 0.56))));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${W}px;height:${H}px;background:#0b0c10;overflow:hidden;
      font-family:-apple-system,'Hiragino Sans',sans-serif;position:relative}
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:60px;box-sizing:border-box}
    .icon{width:160px;height:160px;border-radius:38px;
      box-shadow:0 16px 48px rgba(0,0,0,.4),0 0 56px ${accent}80}
    .name{color:#eceef3;font-size:48px;font-weight:800;text-align:center}
    .tagline{color:#9aa0ab;font-size:26px;text-align:center}
    .btn{margin-top:10px;padding:18px 30px;border-radius:999px;background:${accent};color:#0b0c10;
      font-size:${urlSize}px;font-weight:800;letter-spacing:.01em;white-space:nowrap}
    .free{color:#9aa0ab;font-size:22px;margin-top:6px}
    .tof{position:absolute;left:50%;bottom:60px;width:200px;opacity:.95;transform:translateX(-50%)}
  </style></head><body>
    <div class="wrap">
      <img class="icon" src="data:image/png;base64,${iconB64}">
      <div class="name">${esc(app.name)}</div>
      <div class="tagline">${esc(copy.tagline)}</div>
      <div class="btn">${esc(url)}</div>
      <div class="free">ブラウザで無料・インストール不要</div>
    </div>
    <img class="tof" src="data:image/png;base64,${tofWordmarkB64}">
  </body></html>`;
}

// ffmpeg にドライテキストが無いビルドなので、見出しは HTML で PNG（透明背景）に描いて overlay で重ねる
// 見出しはプレイ画面カードの上、画面の上のほうに置く（カードや下のボタンに重ねない）
function headlineHtml(text, accent) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden;
      font-family:-apple-system,'Hiragino Sans',sans-serif;position:relative}
    .bar{position:absolute;left:0;right:0;top:130px;display:flex;justify-content:center;padding:0 40px}
    .text{color:#fff;font-size:46px;font-weight:800;text-align:center;line-height:1.3;
      text-shadow:0 4px 20px rgba(0,0,0,.7)}
  </style></head><body><div class="bar"><div class="text">${breakAtComma(text, accent)}</div></div></body></html>`;
}

// 「、」の直後で改行する（1〜2 文字だけ次の行に落ちるのを防ぐ）
function breakAtComma(text, accent) {
  return text.split('、').map((line, i, arr) => mdBold(i < arr.length - 1 ? `${line}、` : line, accent)).join('<br>');
}

// 角丸カードの型紙: 白 = 見せる（alphamerge の輝度をアルファに使う）
async function shootMask(browser, w, h, radius) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#000">
    <div style="width:${w}px;height:${h}px;background:#fff;border-radius:${radius}px"></div>
  </body></html>`);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return png;
}

// カードの下にうっすら敷く、アクセント色のぼかした影（透明背景 PNG）
async function shootCardShadow(browser, w, h, radius, accent, pad) {
  const page = await browser.newPage({ viewport: { width: w + pad * 2, height: h + pad * 2 } });
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <div style="position:absolute;left:${pad}px;top:${pad}px;width:${w}px;height:${h}px;
      border-radius:${radius}px;background:${accent};opacity:.55;filter:blur(${Math.round(pad * 0.6)}px)"></div>
  </body></html>`);
  const png = await page.screenshot({ type: 'png', omitBackground: true });
  await page.close();
  return png;
}

// ── 1 本作る ─────────────────────────────────────────
async function buildOne(browser, app) {
  const copy = COPY[app.id];
  if (!copy) throw new Error(`${app.id} のコピーが未定義`);
  const accent = app.color || '#ffd35c';
  const appDir = path.join(HUB, '..', 'apps', app.id);
  const iconPath = fs.existsSync(path.join(appDir, 'icons/icon-512.png'))
    ? path.join(appDir, 'icons/icon-512.png') : path.join(appDir, 'icons/icon-192.png');
  const iconB64 = b64(iconPath);
  const tofWordmarkB64 = b64(path.join(HUB, 'logo/tof-wordmark.png'));

  const work = path.join(WORK, app.id);
  fs.mkdirSync(work, { recursive: true });

  // 1) 実プレイを録画する
  const videoDir = path.join(work, 'rec');
  fs.rmSync(videoDir, { recursive: true, force: true });
  fs.mkdirSync(videoDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: REC_W, height: REC_H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    recordVideo: { dir: videoDir, size: { width: REC_W, height: REC_H } },
  });
  const page = await ctx.newPage();
  await page.goto(urlOf(app), { waitUntil: 'load', timeout: 25000 });
  await page.waitForTimeout(1200);
  await PLAY[app.id](page).catch((e) => console.error(`  ! ${app.id} play: ${String(e).split('\n')[0]}`));
  await page.waitForTimeout(400);
  // 盤面だけの矩形（録画と同じ CSS ピクセル座標系）を、閉じる前に取っておく
  let board = null;
  const sel = BOARD_SEL[app.id];
  if (sel) board = await page.locator(sel).first().boundingBox().catch(() => null);
  const video = page.video();
  await ctx.close();
  const rawWebm = await video.path();
  const gameplay = path.join(work, 'gameplay.mp4');
  execFileSync(FFMPEG, ['-y', '-i', rawWebm, '-vf', `scale=${W}:${H}`, '-r', '30', '-an', gameplay], { stdio: 'pipe' });
  const dur = parseFloat(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', gameplay]).toString().trim());
  // 盤面の矩形（偶数に丸める。ffmpeg の crop/scale は偶数幅高さが安全）
  // floor（round だと利用可能な幅を 1px 超えて crop がエラーになることがある）
  const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
  const bx = board ? {
    x: even(Math.max(0, Math.min(REC_W - 2, board.x))),
    y: even(Math.max(0, Math.min(REC_H - 2, board.y))),
    w: even(Math.max(2, Math.min(REC_W - board.x, board.width))),
    h: even(Math.max(2, Math.min(REC_H - board.y, board.height))),
  } : { x: 0, y: 0, w: REC_W, h: REC_H };

  // 2) カード 3 枚を静止画で撮る（catch カードの背景は録画の 1 コマをぼかして使う）
  const bgFrame = path.join(work, 'bg-frame.png');
  execFileSync(FFMPEG, ['-y', '-i', gameplay, '-ss', String(dur * 0.45), '-frames:v', '1', bgFrame], { stdio: 'pipe' });
  const cardPage = await browser.newPage({ viewport: { width: W, height: H } });
  fs.writeFileSync(path.join(work, 'card-catch.png'), await shootCard(cardPage, catchCardHtml(app, copy, accent, iconB64, b64(bgFrame))));
  fs.writeFileSync(path.join(work, 'card-name.png'), await shootCard(cardPage, nameCardHtml(app, copy, accent, iconB64)));
  fs.writeFileSync(path.join(work, 'card-end.png'), await shootCard(cardPage, endCardHtml(app, copy, accent, iconB64, tofWordmarkB64)));
  await cardPage.close();

  // 3) 組み立て（15 秒。カード → 名前 → プレイ×2 見出し → エンドカード）
  const T_CATCH = 3.0, T_NAME = 2.0, T_END = 3.0;
  const T_PLAY = 15 - T_CATCH - T_NAME - T_END; // 7.0s
  const playStart = Math.max(0, dur - T_PLAY); // 録画の終盤（見せ場に近い）を使う
  const half = T_PLAY / 2;

  const out = path.join(OUT, `${app.id}.mp4`);
  const listFile = path.join(work, 'concat.txt');
  const catchMp4 = path.join(work, 'catch.mp4');
  const nameMp4 = path.join(work, 'name.mp4');
  const playMp4 = path.join(work, 'play.mp4');
  const endMp4 = path.join(work, 'end.mp4');

  const stillToMp4 = (png, outFile, seconds) => execFileSync(FFMPEG, ['-y', '-loop', '1', '-i', png, '-t', String(seconds),
    '-r', '30', '-pix_fmt', 'yuv420p', '-vf', `scale=${W}:${H}`, outFile], { stdio: 'pipe' });
  stillToMp4(path.join(work, 'card-catch.png'), catchMp4, T_CATCH);
  stillToMp4(path.join(work, 'card-name.png'), nameMp4, T_NAME);
  stillToMp4(path.join(work, 'card-end.png'), endMp4, T_END);

  const headlinePage = await browser.newPage({ viewport: { width: W, height: H } });
  await headlinePage.setContent(headlineHtml(copy.headline1, accent));
  await headlinePage.waitForTimeout(60);
  const h1png = path.join(work, 'headline1.png');
  fs.writeFileSync(h1png, await headlinePage.screenshot({ type: 'png', omitBackground: true }));
  await headlinePage.setContent(headlineHtml(copy.headline2, accent));
  await headlinePage.waitForTimeout(60);
  const h2png = path.join(work, 'headline2.png');
  fs.writeFileSync(h2png, await headlinePage.screenshot({ type: 'png', omitBackground: true }));
  await headlinePage.close();

  // 3a) 盤面だけを切り出し、見出しの下に角丸カードとして置く
  const cardY = 340; // 見出し 2 行ぶんの下
  const cardMaxH = H - cardY - 40; // 下にも少し余白を残す
  let CARD_W = even(Math.round(W * 0.82));
  let CARD_H = even(Math.round(CARD_W * (bx.h / bx.w)));
  if (CARD_H > cardMaxH) { CARD_H = even(cardMaxH); CARD_W = even(Math.round(CARD_H * (bx.w / bx.h))); }
  const RADIUS = Math.round(CARD_W * 0.05);
  const cardX = Math.round((W - CARD_W) / 2);

  const boardRaw = path.join(work, 'board-raw.mp4');
  execFileSync(FFMPEG, ['-y', '-ss', String(playStart), '-i', rawWebm, '-t', String(T_PLAY),
    '-vf', `crop=${bx.w}:${bx.h}:${bx.x}:${bx.y},scale=${CARD_W}:${CARD_H}`,
    '-r', '30', '-pix_fmt', 'yuv420p', boardRaw], { stdio: 'pipe' });
  const maskPng = path.join(work, 'mask.png');
  fs.writeFileSync(maskPng, await shootMask(browser, CARD_W, CARD_H, RADIUS));
  const boardAlpha = path.join(work, 'board-alpha.mov');
  execFileSync(FFMPEG, ['-y', '-i', boardRaw, '-i', maskPng,
    '-filter_complex', '[1:v]format=gray[m];[0:v][m]alphamerge,format=yuva420p',
    '-c:v', 'qtrle', boardAlpha], { stdio: 'pipe' });
  const shadowPng = path.join(work, 'shadow.png');
  fs.writeFileSync(shadowPng, await shootCardShadow(browser, CARD_W, CARD_H, RADIUS, accent, 60));

  const bgBright = path.join(work, 'bg-bright.png');
  execFileSync(FFMPEG, ['-y', '-i', bgFrame, '-vf', 'gblur=sigma=14,eq=brightness=0.10:saturation=1.25', bgBright], { stdio: 'pipe' });

  const filterComplex = [
    `[0:v]scale=${W}:${H}[bg]`,
    `[bg][1:v]overlay=x=${cardX - 60}:y=${cardY - 60}[a]`,
    `[a][2:v]overlay=x=${cardX}:y=${cardY}[b]`,
    `[b][3:v]overlay=enable='between(t,0,${half})'[c]`,
    `[c][4:v]overlay=enable='between(t,${half},${T_PLAY})'[v]`,
  ].join(';');
  execFileSync(FFMPEG, ['-y',
    '-loop', '1', '-t', String(T_PLAY), '-i', bgBright,
    '-loop', '1', '-t', String(T_PLAY), '-i', shadowPng,
    '-i', boardAlpha,
    '-loop', '1', '-t', String(T_PLAY), '-i', h1png,
    '-loop', '1', '-t', String(T_PLAY), '-i', h2png,
    '-filter_complex', filterComplex, '-map', '[v]', '-t', String(T_PLAY),
    '-r', '30', '-pix_fmt', 'yuv420p', playMp4], { stdio: 'pipe' });

  fs.writeFileSync(listFile, [catchMp4, nameMp4, playMp4, endMp4].map((f) => `file '${f}'`).join('\n'));
  execFileSync(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c:v', 'libx264', '-b:v', '1400k', '-minrate', '1100k', '-maxrate', '1800k', '-bufsize', '2400k',
    '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', out], { stdio: 'pipe' });

  // 表紙 jpg（見出しの入ったコマ = 名前カードの少し後）
  execFileSync(FFMPEG, ['-y', '-i', out, '-ss', '4.5', '-frames:v', '1', '-q:v', '3', path.join(OUT, `${app.id}.jpg`)], { stdio: 'pipe' });

  return { out, dur };
}

async function makeSheet(browser, id) {
  const outMp4 = path.join(OUT, `${id}.mp4`);
  const framesPng = path.join(WORK, `${id}-frames.png`);
  execFileSync(FFMPEG, ['-y', '-i', outMp4, '-vf', 'fps=1,scale=180:-1,tile=8x2', framesPng], { stdio: 'pipe' });
  const page = await browser.newPage();
  await page.setContent(`<body style="margin:0;background:#111"><img src="data:image/png;base64,${b64(framesPng)}"></body>`);
  const img = await page.locator('img').boundingBox();
  await page.setViewportSize({ width: Math.ceil(img.width), height: Math.ceil(img.height) });
  await page.screenshot({ path: path.join(HUB, '.audit', `promo-${id}-sheet.png`) });
  await page.close();
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) { console.error('使い方: node tools/promo.mjs <id>...'); process.exit(1); }
  const apps = loadApps();
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch { console.error('playwright-core がない'); process.exit(2); }
  const browser = await chromium.launch();

  for (const id of ids) {
    const app = apps.find((a) => a.id === id);
    if (!app) { console.error(`apps.js に ${id} が無い`); continue; }
    process.stdout.write(`${id} ... `);
    try {
      const { out, dur } = await buildOne(browser, app);
      const size = fs.statSync(out).size;
      console.log(`ok (gameplay ${dur.toFixed(1)}s, ${(size / 1024 / 1024).toFixed(2)}MB)`);
      await makeSheet(browser, id);
    } catch (e) {
      console.log(`NG: ${String(e).split('\n')[0]}`);
    }
  }
  await browser.close();
}

main();
