#!/usr/bin/env node
// apps/<id>/icons/icon.svg から、決まったサイズの PNG を書き出す。designer.md の表に合わせる。
//
//   node tools/export-icons.mjs <id> [--bg '#5fbfe3'] [--out <dir>]
//
// --out を付けると、そのフォルダに書く（アプリのリポジトリを汚さずに試すときは .audit/<id>-icons/ などへ）。
// 付けなければ apps/<id>/icons/ に直接書く。
// --bg は maskable・apple-touch-icon の背景色。省略すると icon.svg の一番外側の背景の fill を拾う。
// 全サイズを並べた 1 枚（.audit/<id>-icons.png）も作る。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WORKSPACE = path.join(path.dirname(HUB), 'apps');

// icon-192/512 と favicon-32 は SVG をそのまま撮る（透明を残す）。
// maskable は 80% に縮めて背景色の正方形の中央に、apple-touch-icon は背景色いっぱいに（どちらも透過なし）
const PLAIN = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'favicon-32.png', size: 32 },
];

function guessBg(svg) {
  // 最初に出てくる、512x512 いっぱいの背景らしい rect の fill
  const m = svg.match(/<rect[^>]*width=["']512["'][^>]*fill=["'](#[0-9a-fA-F]{3,8})["']/)
    || svg.match(/<rect[^>]*fill=["'](#[0-9a-fA-F]{3,8})["'][^>]*width=["']512["']/);
  return m?.[1] || '#ffffff';
}

function html(bodyStyle, inner) {
  return `<!doctype html><html><body style="margin:0;${bodyStyle}">${inner}</body></html>`;
}

async function shoot(page, size, bodyStyle, inner) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(bodyStyle, inner));
  return page.screenshot({ omitBackground: bodyStyle.includes('transparent') });
}

async function main() {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--'));
  const bgArg = args.includes('--bg') ? args[args.indexOf('--bg') + 1] : null;
  const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
  if (!id) { console.error('使い方: export-icons.mjs <id> [--bg \'#rrggbb\'] [--out <dir>]'); process.exitCode = 1; return; }

  const srcSvg = path.join(WORKSPACE, id, 'icons', 'icon.svg');
  if (!fs.existsSync(srcSvg)) { console.error(`icon.svg がない: ${srcSvg}`); process.exitCode = 1; return; }
  const svg = fs.readFileSync(srcSvg, 'utf8');
  const bg = bgArg || guessBg(svg);
  const outDir = outArg || path.join(WORKSPACE, id, 'icons');
  fs.mkdirSync(outDir, { recursive: true });

  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  const shots = [];
  for (const { name, size } of PLAIN) {
    const buf = await shoot(page, size, 'background:transparent', `<div style="width:${size}px;height:${size}px">${svg}</div>`);
    fs.writeFileSync(path.join(outDir, name), buf);
    shots.push({ name, size, buf });
  }

  // maskable-512: 背景いっぱい（bg）＋ 絵柄を中央 80%
  {
    const inset = Math.round(512 * 0.8);
    const buf = await shoot(page, 512, `background:${bg}`,
      `<div style="width:512px;height:512px;display:flex;align-items:center;justify-content:center">
         <div style="width:${inset}px;height:${inset}px">${svg}</div>
       </div>`);
    fs.writeFileSync(path.join(outDir, 'maskable-512.png'), buf);
    shots.push({ name: 'maskable-512.png', size: 512, buf });
  }

  // apple-touch-icon: 180x180、透過なし（背景いっぱい）
  {
    const buf = await shoot(page, 180, `background:${bg}`, `<div style="width:180px;height:180px">${svg}</div>`);
    fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), buf);
    shots.push({ name: 'apple-touch-icon.png', size: 180, buf });
  }

  // 全サイズを並べた 1 枚
  const gap = 16;
  const rowH = Math.max(...shots.map((s) => s.size));
  const width = shots.reduce((s, x) => s + x.size, 0) + gap * (shots.length + 1);
  await page.setViewportSize({ width, height: rowH + gap * 2 + 24 });
  const cells = shots.map((s) =>
    `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
       <img src="data:image/png;base64,${s.buf.toString('base64')}" width="${s.size}" height="${s.size}" style="background:repeating-conic-gradient(#eee 0% 25%,#fff 0% 50%) 0/16px 16px">
       <span style="font:11px sans-serif;color:#333">${s.name}</span>
     </div>`).join('');
  await page.setContent(html('background:#fff', `<div style="display:flex;gap:${gap}px;padding:${gap}px;align-items:flex-end">${cells}</div>`));
  const sheetDir = path.join(HUB, '.audit');
  fs.mkdirSync(sheetDir, { recursive: true });
  await page.screenshot({ path: path.join(sheetDir, `${id}-icons.png`) });

  await browser.close();
  console.log(`書き出し先: ${outDir}（背景色 ${bg}）`);
  console.log(`並べた 1 枚: ${path.relative(HUB, path.join(sheetDir, `${id}-icons.png`))}`);
}

main();
