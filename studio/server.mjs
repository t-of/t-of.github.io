#!/usr/bin/env node
// T.OF... スタジオ — 社内の様子を見るダッシュボードのサーバー。
//
//   npm run studio        → http://localhost:4141
//
// 会話はこれまでどおり Claude Code（ターミナル）で行う。ここはそれを「見る」ための画面。
// - エージェントの動き: Claude Code が ~/.claude/projects/ に残す作業記録を読むだけ（書き込まない）
// - タスクとプロジェクト: docs/board.json（画面から編集すると、このファイルを書き換える）
// - アプリの一覧: apps.js、チェック結果: tools/audit.mjs --json
//
// 外に公開しない。127.0.0.1 だけで待ち受ける。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HUB = path.dirname(HERE);
const WORKSPACE = path.dirname(HUB);
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const BOARD = path.join(HUB, 'docs', 'board.json');
const PORT = Number(process.env.PORT) || 4141;

const RECENT_MS = 12 * 60 * 60 * 1000;   // これより前に止まったセッションは見ない
const IDLE_MS = 3 * 60 * 1000;           // 記録がこれだけ途絶えたら「止まっているかも」

// ---------- 役割 ----------

// エージェントの種類 → 席。general-purpose などは頼んだ内容から推測する
const ROLE_OF_TYPE = { planner: 'planner', designer: 'designer', engineer: 'engineer', qa: 'qa', release: 'release' };
const ROLE_HINTS = [
  ['release', /公開|リリース|release|push|pages/i],
  ['qa', /品質|確認|チェック|audit|qa|verify|test/i],
  ['designer', /デザイン|アイコン|icon|og\.png|ロゴ|logo|design/i],
  ['planner', /企画|仕様|spec|plan|アイデア/i],
  ['engineer', /./],
];
function roleOf(agentType, description, prompt) {
  if (ROLE_OF_TYPE[agentType]) return ROLE_OF_TYPE[agentType];
  // 依頼文の頭に「T.OF... の engineer」のように役割が書いてあれば、それに従う
  const named = (prompt || '').slice(0, 300).match(/\b(planner|designer|engineer|qa|release)\b|(企画|デザイン|実装|品質|リリース)担当/i);
  if (named) {
    const w = (named[1] || named[2]).toLowerCase();
    return { 企画: 'planner', デザイン: 'designer', 実装: 'engineer', 品質: 'qa', リリース: 'release' }[w] || w;
  }
  for (const [role, re] of ROLE_HINTS) if (re.test(description || '')) return role;
  return 'engineer';
}

// ---------- アプリ ----------

function loadApps() {
  try {
    const window = {};
    new Function('window', fs.readFileSync(path.join(HUB, 'apps.js'), 'utf8'))(window);
    return window.TOFO_APPS;
  } catch { return []; }
}

// ~/GitHub の下のリポジトリ名（アプリの id として扱う）
function repoNames() {
  try {
    return fs.readdirSync(WORKSPACE, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(WORKSPACE, e.name, '.git')))
      .map((e) => e.name);
  } catch { return []; }
}

// 文字列の中から ~/GitHub/<id> を拾う
function appsIn(text, known) {
  const found = new Set();
  const re = /GitHub\/([A-Za-z0-9._-]+)/g;
  let m;
  while ((m = re.exec(text))) if (known.has(m[1])) found.add(m[1]);
  return found;
}

// ---------- 作業記録を読む ----------

// ファイルごとに読んだ位置を覚えて、増えた分だけ読む
const cursors = new Map();   // file -> { pos, rest }
function readNew(file) {
  let st;
  try { st = fs.statSync(file); } catch { return []; }
  const c = cursors.get(file) || { pos: 0, rest: '' };
  if (st.size < c.pos) { c.pos = 0; c.rest = ''; }
  if (st.size === c.pos) { cursors.set(file, c); return []; }
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(st.size - c.pos);
  fs.readSync(fd, buf, 0, buf.length, c.pos);
  fs.closeSync(fd);
  c.pos = st.size;
  const text = c.rest + buf.toString('utf8');
  const lines = text.split('\n');
  c.rest = lines.pop();
  cursors.set(file, c);
  const out = [];
  for (const l of lines) { if (l) try { out.push(JSON.parse(l)); } catch { /* 書きかけ */ } }
  return out;
}

// 道具の呼び出しを、人が読める一言にする
function describeTool(name, input = {}) {
  const short = (s, n = 60) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const file = (p) => (p ? p.replace(os.homedir(), '~').replace('~/GitHub/', '') : '');
  switch (name) {
    case 'Bash': return `コマンド: ${short(input.description || input.command)}`;
    case 'Read': return `読む: ${file(input.file_path)}`;
    case 'Edit': case 'MultiEdit': return `編集: ${file(input.file_path)}`;
    case 'Write': return `書く: ${file(input.file_path)}`;
    case 'Grep': return `探す: ${short(input.pattern, 40)}`;
    case 'Glob': return `ファイルを探す: ${short(input.pattern, 40)}`;
    case 'Agent': case 'Task': return `依頼: ${short(input.description)}`;
    case 'WebFetch': case 'WebSearch': return `調べる: ${short(input.url || input.query)}`;
    case 'SendMessage': return `連絡: ${short(input.summary || input.message)}`;
    case 'AskUserQuestion': return 'オーナーに質問中';
    case 'SubagentHandback': return '報告を提出';
    case 'ToolSearch': return '道具を用意';
    case 'TaskStop': return '作業を止める';
    case 'Skill': return `手順: ${short(input.skill)}`;
    case 'Artifact': return 'ページを公開';
    default: return `${name}`;
  }
}

const sessions = new Map();  // sessionId -> { id, project, title, cwd, lastAt, events, action, agents:Map }
const known = () => new Set([...repoNames(), ...loadApps().map((a) => a.id)]);
// 本部（t-of.github.io）は「本部」として扱う（画面側で名前を付ける）
let KNOWN = known();
setInterval(() => { KNOWN = known(); }, 60 * 1000);

function session(id, project) {
  if (!sessions.has(id)) sessions.set(id, { id, project, title: '', cwd: '', lastAt: 0, action: '', lastText: '', agents: new Map(), apps: new Set(), log: [] });
  return sessions.get(id);
}

function agent(s, agentId) {
  if (!s.agents.has(agentId)) {
    s.agents.set(agentId, { id: agentId, type: '', description: '', role: 'engineer', startedAt: 0, lastAt: 0,
      action: '', lastText: '', done: false, pending: 0, tools: 0, apps: new Set() });
  }
  return s.agents.get(agentId);
}

function pushLog(s, entry) {
  s.log.push(entry);
  if (s.log.length > 400) { s.log.sort((x, y) => x.at - y.at); s.log.splice(0, s.log.length - 300); }
  broadcast('log', { session: s.id, ...entry });
}

// 1 行ぶんの記録を、セッションかエージェントの状態に反映する
function apply(s, a, d) {
  const t = Date.parse(d.timestamp || '') || 0;
  const who = a || s;
  if (t) { who.lastAt = Math.max(who.lastAt || 0, t); s.lastAt = Math.max(s.lastAt, t); }
  if (!a && d.cwd) s.cwd = d.cwd;
  if (d.type === 'ai-title' && d.aiTitle) s.title = d.aiTitle;
  if (!a && d.type === 'ai-title' && d.title) s.title = d.title;
  const msg = d.message;
  if (!msg || !Array.isArray(msg.content)) {
    if (a && d.type === 'user' && typeof msg?.content === 'string' && !a.description) a.description = msg.content.slice(0, 80);
    return;
  }
  for (const b of msg.content) {
    if (b.type === 'tool_use') {
      who.pending++;
      who.tools = (who.tools || 0) + 1;
      who.action = describeTool(b.name, b.input);
      const text = JSON.stringify(b.input || {});
      for (const id of appsIn(text, KNOWN)) { who.apps.add(id); s.apps.add(id); }
      if (a) a.done = false;
      pushLog(s, { at: t, agent: a?.id || null, role: a?.role || 'director', text: who.action });
    } else if (b.type === 'tool_result') {
      who.pending = Math.max(0, who.pending - 1);
    } else if (b.type === 'text' && msg.role === 'assistant' && b.text?.trim()) {
      who.lastText = b.text.trim().slice(0, 200);
    }
  }
  if (a && msg.role === 'assistant' && msg.stop_reason === 'end_turn' && a.pending === 0) {
    a.done = true;
    a.action = '完了';
    pushLog(s, { at: t, agent: a.id, role: a.role, text: '完了' });
  }
}

function scan() {
  let dirs = [];
  try { dirs = fs.readdirSync(PROJECTS_DIR); } catch { return; }
  const now = Date.now();
  for (const project of dirs) {
    // ~/GitHub の下で開いたセッションだけ（T.OF... の仕事）
    if (!project.startsWith(`-Users-${os.userInfo().username}-GitHub`)) continue;
    const pdir = path.join(PROJECTS_DIR, project);
    let files = [];
    try { files = fs.readdirSync(pdir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const file = path.join(pdir, f);
      let st; try { st = fs.statSync(file); } catch { continue; }
      if (now - st.mtimeMs > RECENT_MS && !cursors.has(file)) continue;
      const id = f.replace(/\.jsonl$/, '');
      const s = session(id, project);
      for (const d of readNew(file)) apply(s, null, d);
      // サブエージェント
      const sub = path.join(pdir, id, 'subagents');
      let subs = [];
      try { subs = fs.readdirSync(sub).filter((x) => x.endsWith('.jsonl')); } catch { /* なし */ }
      for (const x of subs) {
        const sf = path.join(sub, x);
        let sst; try { sst = fs.statSync(sf); } catch { continue; }
        if (now - sst.mtimeMs > RECENT_MS && !cursors.has(sf)) continue;
        const agentId = x.replace(/^agent-/, '').replace(/\.jsonl$/, '');
        const a = agent(s, agentId);
        if (!a.type) {
          try {
            const meta = JSON.parse(fs.readFileSync(sf.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
            a.type = meta.agentType || '';
            a.description = meta.description || '';
          } catch { /* meta なし */ }
          a.startedAt = sst.birthtimeMs || sst.ctimeMs;
        }
        const events = readNew(sf);
        if (events.length && !a.role0) {
          const first = events.find((e) => e.type === 'user' && e.message);
          const firstText = typeof first?.message?.content === 'string' ? first.message.content : JSON.stringify(first?.message?.content || '');
          a.role = roleOf(a.type, a.description, firstText);
          a.role0 = true;
          if (first?.timestamp) a.startedAt = Date.parse(first.timestamp);
        }
        for (const d of events) apply(s, a, d);
      }
    }
  }
}

// ---------- 画面に渡す形 ----------

function snapshotAgents() {
  const now = Date.now();
  const out = [];
  for (const s of sessions.values()) {
    if (now - s.lastAt > RECENT_MS) continue;
    const agents = [...s.agents.values()].map((a) => ({
      id: a.id, type: a.type, role: a.role, description: a.description,
      startedAt: a.startedAt, lastAt: a.lastAt, tools: a.tools,
      state: a.done ? 'done' : now - a.lastAt > IDLE_MS ? 'stalled' : 'working',
      action: a.action, lastText: a.lastText, apps: [...a.apps],
    })).sort((x, y) => y.lastAt - x.lastAt);
    out.push({
      id: s.id, title: s.title || '（無題の会話）', cwd: s.cwd.replace(os.homedir(), '~'), lastAt: s.lastAt,
      state: now - s.lastAt > IDLE_MS ? 'idle' : 'working', action: s.action, lastText: s.lastText,
      apps: [...s.apps], agents, log: [...s.log].sort((x, y) => x.at - y.at).slice(-80),
    });
  }
  return out.sort((x, y) => y.lastAt - x.lastAt);
}

function readBoard() {
  try { return JSON.parse(fs.readFileSync(BOARD, 'utf8')); } catch { return { projects: [], tasks: [], ideas: [] }; }
}
function writeBoard(board) {
  board.updatedAt = new Date().toISOString();
  fs.writeFileSync(BOARD, JSON.stringify(board, null, 2) + '\n');
}

let auditCache = { at: 0, running: false, report: null };
function runAudit(browser = false) {
  if (auditCache.running) return;
  auditCache.running = true;
  broadcast('audit', { running: true });
  const args = [path.join(HUB, 'tools', 'audit.mjs'), '--json'];
  if (browser) args.push('--browser');
  execFile(process.execPath, args, { cwd: HUB, maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000 }, (err, stdout) => {
    try { auditCache.report = JSON.parse(stdout); } catch { /* 失敗したら前の結果のまま */ }
    auditCache.at = Date.now();
    auditCache.running = false;
    broadcast('audit', auditStatus());
  });
}
function auditStatus() {
  const summary = {};
  for (const [id, results] of Object.entries(auditCache.report || {})) {
    summary[id] = { total: results.length, failed: results.filter((r) => !r.ok).map((r) => `${r.rule} ${r.id}${r.detail ? ` — ${r.detail}` : ''}`) };
  }
  return { running: auditCache.running, at: auditCache.at, summary };
}

// ---------- 配信（Server-Sent Events） ----------

const clients = new Set();
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

let lastSig = '';
function tick() {
  scan();
  const agents = snapshotAgents();
  const sig = JSON.stringify(agents.map((s) => [s.id, s.lastAt, s.state, s.agents.map((a) => [a.id, a.lastAt, a.state])]));
  if (sig !== lastSig) { lastSig = sig; broadcast('agents', agents); }
}

// board.json が書き換えられたら知らせ、フォルダの色（Finder のタグ）を段階に合わせる
let boardMtime = 0;
setInterval(() => {
  try {
    const m = fs.statSync(BOARD).mtimeMs;
    if (m !== boardMtime) {
      boardMtime = m;
      broadcast('board', readBoard());
      execFile(process.execPath, [path.join(HUB, 'tools', 'folder-colors.mjs')], { cwd: HUB }, () => {});
    }
  } catch { /* まだない */ }
}, 1500);

// ---------- HTTP ----------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`event: agents\ndata: ${JSON.stringify(snapshotAgents())}\n\n`);
      res.write(`event: board\ndata: ${JSON.stringify(readBoard())}\n\n`);
      res.write(`event: audit\ndata: ${JSON.stringify(auditStatus())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/apps') return send(res, 200, loadApps());
    if (p === '/api/board' && req.method === 'GET') return send(res, 200, readBoard());
    if (p === '/api/board' && req.method === 'PUT') {
      const board = await readBody(req);
      if (!Array.isArray(board.projects) || !Array.isArray(board.tasks)) return send(res, 400, { error: 'projects と tasks が要る' });
      writeBoard(board);
      broadcast('board', readBoard());
      return send(res, 200, { ok: true });
    }
    if (p === '/api/audit' && req.method === 'POST') { runAudit(url.searchParams.get('browser') === '1'); return send(res, 202, { ok: true }); }
    if (p.startsWith('/shots/')) {
      const f = path.join(HUB, '.audit', path.basename(p));
      if (fs.existsSync(f)) return send(res, 200, fs.readFileSync(f), 'image/png');
      return send(res, 404, 'not found', 'text/plain');
    }
    if (p.startsWith('/hub/')) {   // ロゴやアイコンを本部から借りる
      const f = path.join(HUB, path.normalize(p.slice(5)));
      if (f.startsWith(HUB) && fs.existsSync(f) && fs.statSync(f).isFile()) return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream');
      return send(res, 404, 'not found', 'text/plain');
    }
    const f = path.join(HERE, p === '/' ? 'index.html' : path.normalize(p));
    if (f.startsWith(HERE) && fs.existsSync(f) && fs.statSync(f).isFile()) return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream');
    send(res, 404, 'not found', 'text/plain');
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

scan();
setInterval(tick, 1000);
runAudit(false);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`T.OF... スタジオ: http://localhost:${PORT}`);
});
