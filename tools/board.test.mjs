// tools/board.mjs のテスト。実物の docs/board.json は触らず、一時ファイルで試す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { add, set, stage, open, archive } from './board.mjs';

function sample() {
  return {
    projects: [{ id: 'dot-rush', name: 'DOT RUSH', stage: 'build', created: '2026-09-25' }],
    tasks: [
      { id: 't1', project: 'dot-rush', title: '既存', owner: 'engineer', status: 'doing', created: '2026-09-25', doneAt: null },
    ],
    ideas: [],
  };
}

test('add: 次の t 番号で足す', () => {
  const board = sample();
  const id = add(board, { project: 'dot-rush', owner: 'engineer', status: 'todo', title: '新しい仕事' });
  assert.equal(id, 't2');
  const t = board.tasks.at(-1);
  assert.equal(t.title, '新しい仕事');
  assert.equal(t.doneAt, null);
});

test('add: --json で choices などを足せる', () => {
  const board = sample();
  add(board, { project: null, owner: 'owner', status: 'waiting', title: '選んで', json: JSON.stringify({ choices: ['A', 'B'] }) });
  assert.deepEqual(board.tasks.at(-1).choices, ['A', 'B']);
  assert.equal(board.tasks.at(-1).project, null);
});

test('set: done にすると doneAt が今日になる', () => {
  const board = sample();
  set(board, 't1', ['status=done']);
  assert.equal(board.tasks[0].status, 'done');
  assert.equal(board.tasks[0].doneAt, new Date().toISOString().slice(0, 10));
});

test('set: 複数 key=value', () => {
  const board = sample();
  set(board, 't1', ['owner=qa', 'title=直した']);
  assert.equal(board.tasks[0].owner, 'qa');
  assert.equal(board.tasks[0].title, '直した');
});

test('set: ないタスクは例外', () => {
  assert.throws(() => set(sample(), 't999', ['status=done']));
});

test('stage: プロジェクトの段階を進める', () => {
  const board = sample();
  stage(board, 'dot-rush', 'qa');
  assert.equal(board.projects[0].stage, 'qa');
});

test('open: done/skip 以外だけ', () => {
  const board = sample();
  add(board, { project: 'dot-rush', owner: 'engineer', status: 'done', title: '終わった' });
  const o = open(board);
  assert.equal(o.length, 1);
  assert.equal(o[0].id, 't1');
});

test('archive: done/skip を移す', () => {
  const board = sample();
  set(board, 't1', ['status=done']);
  add(board, { project: 'dot-rush', owner: 'engineer', status: 'todo', title: '残る' });
  const archiveDoc = { tasks: [] };
  const moved = archive(board, archiveDoc);
  assert.equal(moved, 1);
  assert.equal(board.tasks.length, 1);
  assert.equal(board.tasks[0].title, '残る');
  assert.equal(archiveDoc.tasks[0].id, 't1');
});

test('CLI: 一時ファイルに読み書きできる（rename で壊れない）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-test-'));
  const file = path.join(dir, 'board.json');
  fs.writeFileSync(file, JSON.stringify(sample(), null, 2) + '\n');
  const board = JSON.parse(fs.readFileSync(file, 'utf8'));
  add(board, { project: 'dot-rush', owner: 'engineer', status: 'todo', title: 'ファイル経由' });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(board, null, 2) + '\n');
  fs.renameSync(tmp, file);
  const reread = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(reread.tasks.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
