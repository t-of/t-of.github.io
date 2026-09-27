// studio/server.mjs の PUT /api/board が古い updatedAt を弾くことのテスト。
// 実物の docs/board.json には触らず、一時ファイル（TOF_TEST_BOARD）に向けて本物のサーバーを子プロセスで動かす。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));
  const boardFile = path.join(dir, 'board.json');
  fs.writeFileSync(boardFile, JSON.stringify({ projects: [], tasks: [], ideas: [], updatedAt: '2026-01-01T00:00:00.000Z' }));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(HERE, 'server.mjs')], {
    env: { ...process.env, PORT: String(port), TOF_TEST_BOARD: boardFile },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    // listen するまで軽く待つ（起動時に scan() を挟むので数百 ms かかることがある）
    for (let i = 0; i < 100; i++) {
      try { await fetch(`http://127.0.0.1:${port}/api/board`); break; } catch { await new Promise((r) => setTimeout(r, 50)); }
    }
    await fn(port, boardFile);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('PUT /api/board: 読んだときと違う updatedAt なら 409 で今のボードを返す', async () => {
  await withServer(async (port, boardFile) => {
    const before = await (await fetch(`http://127.0.0.1:${port}/api/board`)).json();
    // 裏でだれか（board.mjs 相当）が書き換えた体にする
    const changed = { ...before, tasks: [...before.tasks, { id: 't1', project: null, title: '横から足された', owner: 'engineer', status: 'todo', created: '2026-09-27', doneAt: null }] };
    fs.writeFileSync(boardFile, JSON.stringify({ ...changed, updatedAt: '2026-09-27T12:00:00.000Z' }));

    const res = await fetch(`http://127.0.0.1:${port}/api/board`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...before, tasks: [...before.tasks, { id: 't2', project: null, title: '古い方の変更', owner: 'engineer', status: 'todo', created: '2026-09-27', doneAt: null }] }),
    });
    assert.equal(res.status, 409);
    const conflict = await res.json();
    assert.equal(conflict.tasks.some((t) => t.id === 't1'), true);   // 横から足された分は残っている
    assert.equal(conflict.tasks.some((t) => t.id === 't2'), false);  // 古い方の変更は書かれていない
  });
});

test('PUT /api/board: updatedAt が合っていれば保存できる', async () => {
  await withServer(async (port) => {
    const before = await (await fetch(`http://127.0.0.1:${port}/api/board`)).json();
    const res = await fetch(`http://127.0.0.1:${port}/api/board`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...before, tasks: [...before.tasks, { id: 't1', project: null, title: '新しい仕事', owner: 'engineer', status: 'todo', created: '2026-09-27', doneAt: null }] }),
    });
    assert.equal(res.status, 200);
    const after = await (await fetch(`http://127.0.0.1:${port}/api/board`)).json();
    assert.equal(after.tasks.some((t) => t.id === 't1'), true);
  });
});
