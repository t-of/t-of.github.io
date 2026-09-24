#!/usr/bin/env node
// スタジオでオーナーがボタンを押す（タスクを選ぶ・完了にする）まで待つ。
//
//   node tools/wait-choice.mjs <タスクの id>       例: node tools/wait-choice.mjs t12
//
// ディレクターは、オーナーに選んでもらうタスクを board.json に出したら、これをバックグラウンドで動かす。
// 押されると選んだ内容を出して終わるので、ディレクターに自動で知らせが届く（オーナーがチャットで伝えなくてよい）。
// 6 時間たっても押されなければ、終了コード 2 で終わる。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOARD = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'docs', 'board.json');
const id = process.argv[2];
const LIMIT = 6 * 60 * 60 * 1000;
if (!id) { console.error('使い方: node tools/wait-choice.mjs <タスクの id>'); process.exit(1); }

const started = Date.now();
function check() {
  let task;
  try { task = JSON.parse(fs.readFileSync(BOARD, 'utf8')).tasks.find((t) => t.id === id); } catch { return; }  // 書きかけなら次に
  if (!task) { console.error(`タスク ${id} が board.json にない`); process.exit(1); }
  if (task.choice || task.status === 'done' || task.status === 'skip') {
    console.log(JSON.stringify({ id: task.id, title: task.title, choice: task.choice ?? null, comment: task.comment ?? '', status: task.status }, null, 2));
    process.exit(0);
  }
  if (Date.now() - started > LIMIT) { console.error(`${id} はまだ押されていない（6 時間）`); process.exit(2); }
}
check();
setInterval(check, 2000);
