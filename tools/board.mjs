#!/usr/bin/env node
// docs/board.json を読まずにディレクターが更新するための道具。
// 毎回ファイルを読み直してから書き、一時ファイル→rename で壊れないようにする。
//
//   node tools/board.mjs add --project <id|null> --owner <owner> --status <status> "<題>" [--json '<obj>']
//   node tools/board.mjs set <tid> key=value [key=value ...]     status を done/skip にすると doneAt を今日にする
//   node tools/board.mjs stage <project> <stage>
//   node tools/board.mjs open                                     done/skip 以外を 1 行ずつ（先頭は番号）
//   node tools/board.mjs reply <tid> "<返事>"                      タスクのコメント欄にディレクターとして返す
//   node tools/board.mjs inbox                                    オーナーのコメントに返していないタスク
//   <tid> には t12 のほか、番号（3 や #3）も使える
//   node tools/board.mjs archive                                  done/skip を docs/board-archive.json へ移す
//   node --test tools/board.test.mjs                              このテスト

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const BOARD = path.join(HUB, 'docs', 'board.json');
export const ARCHIVE = path.join(HUB, 'docs', 'board-archive.json');

const today = () => new Date().toISOString().slice(0, 10);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// 読み直してから書く。一時ファイルに書いて rename するので、途中で壊れない
function writeJson(file, data) {
  data.updatedAt = new Date().toISOString();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function nextTaskId(board) {
  const nums = board.tasks.map((t) => Number(String(t.id).match(/^t(\d+)$/)?.[1] || 0));
  return `t${Math.max(0, ...nums) + 1}`;
}

const isClosed = (t) => t.status === 'done' || t.status === 'skip';

// 終わっていないタスクに、チャットで呼ぶための小さい番号 no を振る。
// 終わったら no を外し、空いた番号は次のタスクが使う（id の t 番号はずっと増えるので別に持つ）
export function numberTasks(tasks) {
  const used = new Set();
  const need = [];
  for (const t of tasks) {
    if (isClosed(t)) { delete t.no; continue; }
    if (Number.isInteger(t.no) && t.no > 0 && !used.has(t.no)) used.add(t.no);
    else need.push(t);
  }
  let n = 1;
  for (const t of need) {
    while (used.has(n)) n++;
    t.no = n;
    used.add(n);
  }
}

// board にした（file, mutator）で読み直し→更新→書き込みを 1 セットにする
function withBoard(file, fallback, mutate) {
  const board = readJson(file, fallback);
  const result = mutate(board);
  if (Array.isArray(board.tasks)) numberTasks(board.tasks);
  writeJson(file, board);
  return result;
}

// --key value / --key（フラグ）を拾う。残りは位置引数
function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}

export function add(board, { project, owner, status, title, json }) {
  const task = {
    id: nextTaskId(board),
    project: project === 'null' || project === undefined ? null : project,
    title,
    owner,
    status,
    created: today(),
    doneAt: (status === 'done' || status === 'skip') ? today() : null,
  };
  if (json) Object.assign(task, JSON.parse(json));
  board.tasks.push(task);
  return task.id;
}

export function set(board, tid, pairs) {
  const no = String(tid).match(/^#?(\d+)$/)?.[1];
  const t = no ? board.tasks.find((x) => x.no === Number(no) && !isClosed(x)) : board.tasks.find((x) => x.id === tid);
  if (!t) throw new Error(`タスクが見つからない: ${tid}`);
  let statusChanged = false;
  let doneAtGiven = false;
  for (const kv of pairs) {
    const eq = kv.indexOf('=');
    if (eq < 0) throw new Error(`key=value の形にする: ${kv}`);
    const key = kv.slice(0, eq);
    const raw = kv.slice(eq + 1);
    let value;
    try { value = JSON.parse(raw); } catch { value = raw; }
    t[key] = value;
    if (key === 'status') statusChanged = true;
    if (key === 'doneAt') doneAtGiven = true;
  }
  if (statusChanged && (t.status === 'done' || t.status === 'skip') && !doneAtGiven) t.doneAt = today();
  return t;
}

export function reply(board, tid, text) {
  const t = set(board, tid, []);
  t.thread = [...(t.thread || []), { by: 'director', text, at: new Date().toISOString() }];
  return t;
}

// 最後のコメントがオーナーのもの（まだ返していない）
export function inbox(board) {
  return board.tasks.filter((t) => t.thread?.at(-1)?.by === 'owner');
}

export function stage(board, projectId, stageName) {
  const p = board.projects.find((x) => x.id === projectId);
  if (!p) throw new Error(`プロジェクトが見つからない: ${projectId}`);
  p.stage = stageName;
  return p;
}

export function open(board) {
  return board.tasks.filter((t) => !isClosed(t));
}

// done/skip のタスクを board-archive.json に移す（今は archive コマンドから呼ばれたときだけ）
export function archive(board, archiveDoc) {
  const closed = board.tasks.filter((t) => t.status === 'done' || t.status === 'skip');
  board.tasks = board.tasks.filter((t) => t.status !== 'done' && t.status !== 'skip');
  archiveDoc.tasks = [...(archiveDoc.tasks || []), ...closed];
  return closed.length;
}

// ---------- CLI ----------

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === 'add') {
    const { flags, rest } = parseFlags(args);
    const title = rest.join(' ');
    if (!title || !flags.owner || !flags.status) {
      console.error('使い方: board.mjs add --project <id|null> --owner <owner> --status <status> "<題>" [--json \'<obj>\']');
      process.exitCode = 1; return;
    }
    const id = withBoard(BOARD, { projects: [], tasks: [], ideas: [] }, (board) =>
      add(board, { project: flags.project, owner: flags.owner, status: flags.status, title, json: flags.json }));
    console.log(id);
    return;
  }

  if (cmd === 'set') {
    const [tid, ...pairs] = args;
    if (!tid || pairs.length === 0) { console.error('使い方: board.mjs set <tid> key=value [key=value ...]'); process.exitCode = 1; return; }
    withBoard(BOARD, { projects: [], tasks: [], ideas: [] }, (board) => set(board, tid, pairs));
    console.log('ok');
    return;
  }

  if (cmd === 'reply') {
    const [tid, ...words] = args;
    if (!tid || words.length === 0) { console.error('使い方: board.mjs reply <tid> "<返事>"'); process.exitCode = 1; return; }
    withBoard(BOARD, { projects: [], tasks: [], ideas: [] }, (board) => reply(board, tid, words.join(' ')));
    console.log('ok');
    return;
  }

  if (cmd === 'inbox') {
    const board = readJson(BOARD, { projects: [], tasks: [], ideas: [] });
    numberTasks(board.tasks);
    for (const t of inbox(board)) console.log(`${t.no ? `#${t.no}` : '-'}\t${t.id}\t${t.title}\n  > ${t.thread.at(-1).text}`);
    return;
  }

  if (cmd === 'stage') {
    const [projectId, stageName] = args;
    if (!projectId || !stageName) { console.error('使い方: board.mjs stage <project> <stage>'); process.exitCode = 1; return; }
    withBoard(BOARD, { projects: [], tasks: [], ideas: [] }, (board) => stage(board, projectId, stageName));
    console.log('ok');
    return;
  }

  if (cmd === 'open') {
    const board = readJson(BOARD, { projects: [], tasks: [], ideas: [] });
    numberTasks(board.tasks);
    for (const t of open(board).sort((a, b) => a.no - b.no)) console.log(`#${t.no}\t${t.id}\t${t.project ?? '-'}\t${t.owner}\t${t.status}\t${t.title}`);
    return;
  }

  if (cmd === 'archive') {
    let moved = 0;
    const archiveDoc = readJson(ARCHIVE, { about: 'board.json から移した終わったタスク', tasks: [] });
    withBoard(BOARD, { projects: [], tasks: [], ideas: [] }, (board) => { moved = archive(board, archiveDoc); });
    writeJson(ARCHIVE, archiveDoc);
    console.log(`${moved} 件を移した`);
    return;
  }

  console.error('使い方: board.mjs add|set|reply|inbox|stage|open|archive ...');
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
