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
const WORKSPACE = path.join(path.dirname(HUB), 'apps');   // ~/GitHub/tof/apps
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const BOARD = path.join(HUB, 'docs', 'board.json');
const ARCHIVE = path.join(HUB, 'docs', 'board-archive.json');
const LEDGER = path.join(HUB, 'docs', 'private', 'ledger.jsonl');
const TRADEMARK = path.join(HUB, 'docs', 'private', 'trademark.json');
const USAGE = path.join(os.homedir(), '.claude', 'tof-usage.json');   // 残り枠。ステータスラインと下の pollUsage が書く
const PORT = Number(process.env.PORT) || 4141;
const BACKFILL = process.argv.includes('--backfill');   // node server.mjs --backfill: 過去分を台帳に足して終了する

const RECENT_MS = 12 * 60 * 60 * 1000;   // これより前に止まったセッションは見ない（--backfill のときは効かせない）
const IDLE_MS = 3 * 60 * 1000;           // 記録がこれだけ途絶えたら「止まっているかも」
const PAUSE_MS = 10 * 60 * 1000;         // 台帳の時間: 記録の間がこれ以上あいたら止めていたとみなし、数えない

// ---------- 役割 ----------

// エージェントの種類 → 席。general-purpose などは頼んだ内容から推測する
const ROLE_OF_TYPE = { researcher: 'researcher', planner: 'planner', designer: 'designer', engineer: 'engineer', qa: 'qa', release: 'release', writer: 'writer' };
const ROLE_HINTS = [
  ['release', /公開|リリース|release|push|pages/i],
  ['qa', /品質|確認|チェック|audit|qa|verify|test/i],
  ['designer', /デザイン|アイコン|icon|og\.png|ロゴ|logo|design/i],
  ['researcher', /リサーチ|調査|research|アイデアを探/i],
  ['planner', /企画|仕様|spec|plan|アイデア/i],
  ['engineer', /./],
];
function roleOf(agentType, description, prompt) {
  if (ROLE_OF_TYPE[agentType]) return ROLE_OF_TYPE[agentType];
  // 依頼文の頭に「T.OF... の engineer」のように役割が書いてあれば、それに従う
  const named = (prompt || '').slice(0, 300).match(/\b(researcher|planner|designer|engineer|qa|release|writer)\b|(リサーチ|企画|デザイン|実装|品質|リリース)担当/i);
  if (named) {
    const w = (named[1] || named[2]).toLowerCase();
    return { リサーチ: 'researcher', 企画: 'planner', デザイン: 'designer', 実装: 'engineer', 品質: 'qa', リリース: 'release' }[w] || w;
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

// ~/GitHub/tof/apps の下のリポジトリ名（アプリの id として扱う）
function repoNames() {
  try {
    return fs.readdirSync(WORKSPACE, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(WORKSPACE, e.name, '.git')))
      .map((e) => e.name);
  } catch { return []; }
}

// 名前を変えたアプリの古い id → 新しい id。ポータルの 404.html の MOVED を正本にする
const MOVED = (() => {
  try {
    const body = fs.readFileSync(path.join(HUB, '404.html'), 'utf8').match(/const MOVED = (\{[\s\S]*?\});/)[1];
    return Object.fromEntries([...body.matchAll(/([\w-]+):\s*'([^']+)'/g)].map((x) => [x[1], x[2]]));
  } catch { return {}; }
})();

// 文字列の中から apps/<id> を拾う（2026-09-24 に ~/GitHub/tof/apps/ へ移す前は ~/GitHub/<id> だった）
function appsIn(text, known) {
  const found = new Set();
  const re = /(?:apps|GitHub)\/([A-Za-z0-9._-]+)/g;
  let m;
  while ((m = re.exec(text))) { const id = MOVED[m[1]] || m[1]; if (known.has(id)) found.add(id); }
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
  const file = (p) => (p ? p.replace(os.homedir(), '~').replace('~/GitHub/tof/apps/', '').replace('~/GitHub/tof/', '') : '');
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
      action: '', lastText: '', done: false, pending: 0, tools: 0, apps: new Set(), promptApps: new Set(), activeMs: 0,
      // 台帳（docs/private/ledger.jsonl）向け: assistant メッセージから拾うモデルとトークン。message.id ごとに 1 回だけ数える
      models: {}, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, seenMsgIds: new Set() });
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
  // 動いていた時間だけ足す（オーナーが止めていた間や、利用の上限で待った間は入れない）
  if (a && t && a.lastAt && t > a.lastAt && t - a.lastAt < PAUSE_MS) a.activeMs += t - a.lastAt;
  if (t) { who.lastAt = Math.max(who.lastAt || 0, t); s.lastAt = Math.max(s.lastAt, t); }
  if (!a && d.cwd) s.cwd = d.cwd;
  if (d.type === 'ai-title' && d.aiTitle) s.title = d.aiTitle;
  if (!a && d.type === 'ai-title' && d.title) s.title = d.title;
  const msg = d.message;
  // 返事が一度もない会話（/clear しただけのもの）は席に出さない
  if (!a && msg?.role === 'assistant') s.talked = true;
  if (!msg || !Array.isArray(msg.content)) {
    if (a && d.type === 'user' && typeof msg?.content === 'string' && !a.description) a.description = msg.content.slice(0, 80);
    return;
  }
  // 台帳向け: このエージェントの assistant メッセージのモデルとトークンを拾う。
  // 同じ message.id が内容ブロックごとに複数行に分かれて出てくるので、message.id ごとに 1 回だけ数える
  if (a && msg.role === 'assistant' && msg.id && !a.seenMsgIds.has(msg.id)) {
    a.seenMsgIds.add(msg.id);
    if (msg.model) a.models[msg.model] = (a.models[msg.model] || 0) + 1;
    const u = msg.usage;
    if (u) {
      a.tokens.input += u.input_tokens || 0;
      a.tokens.output += u.output_tokens || 0;
      a.tokens.cacheRead += u.cache_read_input_tokens || 0;
      a.tokens.cacheWrite += u.cache_creation_input_tokens || 0;
    }
  }
  for (const b of msg.content) {
    if (b.type === 'tool_use') {
      who.pending++;
      who.tools = (who.tools || 0) + 1;
      who.action = describeTool(b.name, b.input);
      // 作業中のアプリは、書き込んだ先（編集・作成）と、依頼の文面に出てくるものだけ。
      // 読んだだけのもの（お手本にしたほかのアプリ）は数えない
      const target = /^(Edit|MultiEdit|Write|NotebookEdit)$/.test(b.name) ? (b.input?.file_path || b.input?.notebook_path || '')
        : !a && (b.name === 'Agent' || b.name === 'Task') ? (b.input?.prompt || '') : '';
      for (const id of appsIn(target, KNOWN)) { who.apps.add(id); s.apps.add(id); }
      if (a) a.done = false;
      const entry = { at: t, agent: a?.id || null, role: a?.role || 'director', text: who.action };
      // ディレクターからの依頼は「部屋から部屋へ」飛ばす（社内画面）。差し戻し（直す・修正など）は別の色にする
      if (!a && (b.name === 'Agent' || b.name === 'Task')) {
        entry.to = roleOf(b.input?.subagent_type, b.input?.description, b.input?.prompt);
        entry.kind = /直す|直し|修正|差し戻|やり直/.test(b.input?.description || '') ? 'return' : 'handoff';
      }
      pushLog(s, entry);
    } else if (b.type === 'tool_result') {
      who.pending = Math.max(0, who.pending - 1);
    } else if (b.type === 'text' && msg.role === 'assistant' && b.text?.trim()) {
      who.lastText = b.text.trim().slice(0, 200);
    }
  }
  // end_turn はそのターンで道具を呼んでいないということなので、pending の数え違いがあっても完了にする
  if (a && msg.role === 'assistant' && msg.stop_reason === 'end_turn') {
    a.pending = 0;
    a.done = true;
    a.action = '完了';
    // エージェントの「完了」はディレクターへの報告として飛ばす（SubagentHandback 自体は文字だけのまま二重に飛ばさない）
    pushLog(s, { at: t, agent: a.id, role: a.role, text: '完了', kind: 'report', to: 'director' });
    appendLedger(ledgerRow(s, a, t));
  }
}

// ---------- 台帳（docs/private/ledger.jsonl） ----------

// 1 行 = 1 件の仕事。あとで「どの係にどのモデルを使うか」を数字で見るための記録
function ledgerRow(s, a, t) {
  const model = Object.entries(a.models).sort((x, y) => y[1] - x[1])[0]?.[0] || '';
  const kind = /直す|直し|修正|差し戻|やり直/.test(a.description || '') ? 'return' : 'job';
  return {
    id: a.id, session: s.id, role: a.role, type: a.type, model, description: a.description,
    apps: [...(a.apps.size ? a.apps : a.promptApps)],
    startedAt: a.startedAt, endedAt: t, ms: a.activeMs,
    tools: a.tools || 0, tokens: { ...a.tokens }, kind,
  };
}

const ledgerIds = new Set();
function loadLedgerIds() {
  let text = '';
  try { text = fs.readFileSync(LEDGER, 'utf8'); } catch { return; }
  for (const line of text.split('\n')) {
    if (!line) continue;
    try { ledgerIds.add(JSON.parse(line).id); } catch { /* 書きかけの行 */ }
  }
}
// 起動時に読み込んだ id と、この実行中に書いた id を同じ Set で見る。
// 同じエージェントが 2 回 end_turn しても（続きを頼まれたとき）、最初の完了だけ書く
function appendLedger(row) {
  if (ledgerIds.has(row.id)) return;
  ledgerIds.add(row.id);
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  broadcast('ledger', row);
}
function readLedger() {
  let text = '';
  try { text = fs.readFileSync(LEDGER, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) { if (line) try { out.push(JSON.parse(line)); } catch { /* 書きかけ */ } }
  return out;
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
      if (!BACKFILL && now - st.mtimeMs > RECENT_MS && !cursors.has(file)) continue;
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
        if (!BACKFILL && now - sst.mtimeMs > RECENT_MS && !cursors.has(sf)) continue;
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
          a.promptApps = appsIn(firstText, KNOWN);
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
    if (now - s.lastAt > RECENT_MS || !s.talked) continue;
    const agents = [...s.agents.values()].map((a) => ({
      id: a.id, type: a.type, role: a.role, description: a.description,
      startedAt: a.startedAt, lastAt: a.lastAt, tools: a.tools,
      state: a.done ? 'done' : now - a.lastAt > IDLE_MS ? 'stalled' : 'working',
      // まだ何も書いていない間と、書き込まない係（品質・リリース）は、依頼の文面のアプリ
      action: a.action, lastText: a.lastText, apps: [...(a.apps.size ? a.apps : a.promptApps)],
    })).sort((x, y) => y.lastAt - x.lastAt);
    out.push({
      id: s.id, title: s.title || '（無題の会話）', cwd: s.cwd.replace(os.homedir(), '~'), lastAt: s.lastAt,
      state: now - s.lastAt > IDLE_MS ? 'idle' : 'working', action: s.action, lastText: s.lastText,
      apps: [...s.apps], agents, log: [...s.log].sort((x, y) => x.at - y.at).slice(-80),
    });
  }
  return out.sort((x, y) => y.lastAt - x.lastAt);
}

// tools/board.mjs archive で移した過去分（docs/board-archive.json）も、表示用には合わせて読む。
// 画面から保存するときはそちらへは書き戻さない（アーカイブ済みの id は除いて board.json に保存する）
function readArchive() {
  try { return JSON.parse(fs.readFileSync(ARCHIVE, 'utf8')).tasks || []; } catch { return []; }
}
function readBoard() {
  let board;
  try { board = JSON.parse(fs.readFileSync(BOARD, 'utf8')); } catch { board = { projects: [], tasks: [], ideas: [] }; }
  const archived = readArchive();
  if (archived.length) board.tasks = [...archived, ...board.tasks];
  return board;
}
function writeBoard(board) {
  board.updatedAt = new Date().toISOString();
  const archivedIds = new Set(readArchive().map((t) => t.id));
  const toSave = { ...board, tasks: board.tasks.filter((t) => !archivedIds.has(t.id)) };
  fs.writeFileSync(BOARD, JSON.stringify(toSave, null, 2) + '\n');
}

// ---------- 残り枠（~/.claude/tof-usage.json） ----------

function readUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE, 'utf8')); } catch { return null; }
}

// ---------- 商標チェック（docs/private/trademark.json） ----------

function readTrademark() {
  try { return JSON.parse(fs.readFileSync(TRADEMARK, 'utf8')); } catch { return { names: [], results: {} }; }
}
// 1 件だけ書く。読み直してから一時ファイル経由（board と同じやり方）
function writeTrademarkResult(key, status, note) {
  const data = readTrademark();
  if (status) data.results[key] = { status, note: note || '', date: new Date().toISOString().slice(0, 10) };
  else delete data.results[key];
  const tmp = TRADEMARK + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, TRADEMARK);
  return data;
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

let boardMtime = 0;

// ---------- 通知（オーナーの番） ----------

// オーナーがやることになっている、閉じていないタスクの id
function ownerTaskIds(board) {
  return new Set(board.tasks.filter((t) => t.owner === 'owner' && t.status !== 'done' && t.status !== 'skip').map((t) => t.id));
}
function notifyOwnerTask(title) {
  if (process.platform !== 'darwin') return;
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `display notification "${esc(title)}" with title "T.OF... スタジオ" subtitle "あなたの番です" sound name "Glass"`;
  execFile('osascript', ['-e', script], () => {});
}
// 起動時にすでにあるものは知らせない（新しく増えた id だけ知らせる）
let knownOwnerTasks = ownerTaskIds(readBoard());

// board.json が書き換えられたら知らせ、フォルダの色（Finder のタグ）を段階に合わせる。オーナーの番が増えたら mac に通知する

setInterval(() => {
  try {
    const m = fs.statSync(BOARD).mtimeMs;
    if (m !== boardMtime) {
      boardMtime = m;
      const board = readBoard();
      broadcast('board', board);
      execFile(process.execPath, [path.join(HUB, 'tools', 'folder-colors.mjs')], { cwd: HUB }, () => {});
      const current = ownerTaskIds(board);
      for (const t of board.tasks) if (current.has(t.id) && !knownOwnerTasks.has(t.id)) notifyOwnerTask(t.title);
      knownOwnerTasks = current;
    }
  } catch { /* まだない */ }
}, 1500);

// apps.js が書き換えられたら（公開したら）知らせ、チェックをやり直す（起動したときも 1 回走る）。
// 開いたままの画面でも「公開中のアプリ」が増え、新しいアプリにもチェックの結果が付く
let appsMtime = 0;
setInterval(() => {
  try {
    const m = fs.statSync(path.join(HUB, 'apps.js')).mtimeMs;
    if (m !== appsMtime) { appsMtime = m; broadcast('apps', loadApps()); runAudit(false); }
  } catch { /* 読めなければ前のまま */ }
}, 1500);

// tof-usage.json が書き換わったら知らせる（ファイル自体が rename で置き換わることがあるので、他と同じく mtime を見る）
let usageMtime = 0;
setInterval(() => {
  try {
    const m = fs.statSync(USAGE).mtimeMs;
    if (m !== usageMtime) { usageMtime = m; broadcast('usage', readUsage() || {}); }
  } catch { /* まだない */ }
}, 1500);

// ターミナルを開いていなくても残り枠が出るように、使用量 API に直接聞いて tof-usage.json を書く（形はステータスラインと同じ）。
// ログイン情報は Claude Code がキーチェーンに置いたものを読むだけで、Anthropic 以外には送らない。
// ponytail: 非公開の API。形が変わったり、トークンの期限が切れたり（Claude Code を使うと更新される）したら、何もせずステータスラインの値のまま
const USAGE_POLL_MS = 5 * 60 * 1000;
function pollUsage() {
  execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], async (err, out) => {
    try {
      if (err) return;
      const token = JSON.parse(out).claudeAiOauth?.accessToken;
      if (!token) return;
      const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
        headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) return;
      const d = await r.json();
      const box = (w) => (w && typeof w.utilization === 'number'
        ? { used_percentage: w.utilization, resets_at: w.resets_at ? Math.floor(Date.parse(w.resets_at) / 1000) : null } : null);
      const five_hour = box(d.five_hour), seven_day = box(d.seven_day);
      if (!five_hour && !seven_day) return;
      const tmp = `${USAGE}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ at: Date.now(), five_hour, seven_day }));
      fs.renameSync(tmp, USAGE);
    } catch { /* 取れなければ前のまま */ }
  });
}
if (!BACKFILL) { pollUsage(); setInterval(pollUsage, USAGE_POLL_MS); }

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
      res.write(`event: usage\ndata: ${JSON.stringify(readUsage() || {})}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/apps') return send(res, 200, loadApps());
    if (p === '/api/ledger') return send(res, 200, readLedger());
    if (p === '/api/board' && req.method === 'GET') return send(res, 200, readBoard());
    if (p === '/api/board' && req.method === 'PUT') {
      const board = await readBody(req);
      if (!Array.isArray(board.projects) || !Array.isArray(board.tasks)) return send(res, 400, { error: 'projects と tasks が要る' });
      writeBoard(board);
      broadcast('board', readBoard());
      return send(res, 200, { ok: true });
    }
    if (p === '/api/usage') return send(res, 200, readUsage() || {});
    if (p === '/api/trademark' && req.method === 'GET') return send(res, 200, readTrademark());
    if (p === '/api/trademark/result' && req.method === 'PUT') {
      const { key, status, note } = await readBody(req);
      if (!key) return send(res, 400, { error: 'key が要る' });
      return send(res, 200, writeTrademarkResult(key, status, note));
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

loadLedgerIds();
const ledgerBefore = ledgerIds.size;
scan();
if (BACKFILL) {
  console.log(`台帳: ${ledgerIds.size} 件（今回 ${ledgerIds.size - ledgerBefore} 件を追加）`);
  process.exit(0);
}
setInterval(tick, 1000);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`T.OF... スタジオ: http://localhost:${PORT}`);
});
