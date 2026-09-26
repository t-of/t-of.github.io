#!/usr/bin/env node
// スタジオでオーナーがタスクにコメントを書くまで待つ。
//
//   node tools/wait-comment.mjs
//
// ディレクターは会話のはじめと、返事をしたあとに、これをバックグラウンドで動かす。
// 動かしたあとに書かれたコメントがあると、それを出して終わるので、ディレクターに知らせが届く。
// 返すときは node tools/board.mjs reply <tid> "<返事>"。6 時間たっても来なければ、終了コード 2 で終わる。

import fs from 'node:fs';
import { BOARD } from './board.mjs';

const LIMIT = 6 * 60 * 60 * 1000;
const started = new Date().toISOString();
function check() {
  let tasks;
  try { tasks = JSON.parse(fs.readFileSync(BOARD, 'utf8')).tasks; } catch { return; }  // 書きかけなら次に
  const hits = tasks.filter((t) => t.thread?.some((m) => m.by === 'owner' && m.at > started));
  if (hits.length) {
    for (const t of hits) console.log(JSON.stringify({ id: t.id, no: t.no ?? null, title: t.title, thread: t.thread }, null, 2));
    process.exit(0);
  }
  if (Date.now() - Date.parse(started) > LIMIT) { console.error('6 時間コメントなし'); process.exit(2); }
}
setInterval(check, 2000);
