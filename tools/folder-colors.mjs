#!/usr/bin/env node
// ~/GitHub/<id>/ のフォルダに、段階に合わせた Finder のタグ（色）を付ける。
//
//   node tools/folder-colors.mjs
//
// 段階は apps.js（公開済み）と docs/board.json の projects から決める（スタジオの画面と同じ）。
// スタジオは board.json が変わるたびにこれを動かす。「トフ 」で始まるタグ以外は触らない。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WORKSPACE = path.dirname(HUB);
const ATTR = 'com.apple.metadata:_kMDItemUserTags';

// 名前\n Finder の色番号（1 グレー / 2 緑 / 4 青 / 5 黄）
const TAG = {
  idea: 'トフ 作成前\n1', planning: 'トフ 作成前\n1',
  design: 'トフ 作成中\n5', build: 'トフ 作成中\n5',
  qa: 'トフ リリース前\n4', release: 'トフ リリース前\n4',
  live: 'トフ リリース完了\n2',
};

function stages() {
  const window = {};
  new Function('window', fs.readFileSync(path.join(HUB, 'apps.js'), 'utf8'))(window);
  const map = new Map(window.TOFO_APPS.map((a) => [a.id, 'live']));
  const board = JSON.parse(fs.readFileSync(path.join(HUB, 'docs', 'board.json'), 'utf8'));
  for (const p of board.projects) map.set(p.id, p.stage || 'idea');
  return map;
}

function readTags(dir) {
  try {
    const hex = execFileSync('xattr', ['-px', ATTR, dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const bin = Buffer.from(hex.replace(/\s/g, ''), 'hex');
    return JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: bin, encoding: 'utf8' }));
  } catch { return []; }
}

function writeTags(dir, tags) {
  if (!tags.length) { try { execFileSync('xattr', ['-d', ATTR, dir], { stdio: 'ignore' }); } catch { /* もともとない */ } return; }
  const bin = execFileSync('plutil', ['-convert', 'binary1', '-o', '-', '-'], { input: JSON.stringify(tags) });
  execFileSync('xattr', ['-wx', ATTR, bin.toString('hex'), dir]);
}

const map = stages();
for (const e of fs.readdirSync(WORKSPACE, { withFileTypes: true })) {
  if (!e.isDirectory() || e.name.startsWith('.')) continue;
  const dir = path.join(WORKSPACE, e.name);
  const old = readTags(dir);
  const keep = old.filter((t) => !t.startsWith('トフ '));
  const want = TAG[map.get(e.name)];
  const tags = want ? [...keep, want] : keep;
  if (JSON.stringify(tags) !== JSON.stringify(old)) {
    writeTags(dir, tags);
    console.log(`${e.name}: ${want ? want.split('\n')[0] : '（タグなし）'}`);
  }
}
