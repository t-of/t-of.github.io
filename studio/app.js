// T.OF... スタジオの画面。サーバー（server.mjs）から届く状態を描くだけ。

const ROLES = {
  director: { name: 'ディレクター', desc: '会話・割り振り', color: '#ffd35c', icon: '◆' },
  planner: { name: '企画', desc: '仕様・名前', color: '#9d7bff', icon: '✎' },
  designer: { name: 'デザイン', desc: 'アイコン・画像', color: '#e24bc6', icon: '✦' },
  engineer: { name: '実装', desc: 'コード', color: '#2cc6e0', icon: '⌘' },
  qa: { name: '品質', desc: 'チェック・確認', color: '#36a075', icon: '✓' },
  release: { name: 'リリース', desc: '公開・掲載', color: '#e2582e', icon: '↑' },
  owner: { name: 'オーナー', desc: 'あなた', color: '#eceef3', icon: '★' },
};
const STAGES = [
  ['idea', 'アイデア'], ['planning', '企画'], ['design', 'デザイン'], ['build', '実装'],
  ['qa', '品質'], ['release', 'リリース'], ['live', '公開済み'],
];
const STATUS = { todo: '未着手', doing: '進行中', waiting: '待ち', done: '完了', skip: "しなくていい" };
const closed = (t) => t.status === "done" || t.status === "skip";   // 終わったもの（完了・しなくていい）
const RECENT_DONE_MS = 30 * 60 * 1000;   // 終わったエージェントを席に残しておく時間

const state = { agents: [], board: { projects: [], tasks: [], ideas: [] }, apps: [], audit: { summary: {} }, filter: 'open', view: 'office' };

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const ago = (t) => {
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分前`;
  return `${Math.floor(s / 3600)} 時間前`;
};
const appName = (id) => id === 't-of.github.io' ? '本部' : state.apps.find((a) => a.id === id)?.name || state.board.projects.find((p) => p.id === id)?.name || id;

// ---------- 接続 ----------

function connect() {
  const es = new EventSource('/api/events');
  const live = $('live');
  es.onopen = () => { live.className = 'live on'; live.lastChild.textContent = 'ライブ'; };
  es.onerror = () => { live.className = 'live off'; live.lastChild.textContent = '再接続中…'; };
  es.addEventListener('agents', (e) => { state.agents = JSON.parse(e.data); render(); });
  es.addEventListener('board', (e) => { state.board = JSON.parse(e.data); render(); });
  es.addEventListener('audit', (e) => { const a = JSON.parse(e.data); state.audit = a.summary ? a : { ...state.audit, running: a.running }; render(); });
  es.addEventListener('apps', (e) => { state.apps = JSON.parse(e.data); render(); });
  es.addEventListener('log', (e) => { pushFeed(JSON.parse(e.data)); });
}

async function saveBoard() {
  await fetch('/api/board', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.board) });
}

// ---------- 社内 ----------

// 席ごとの人。ディレクター席には会話（セッション）、ほかの席にはエージェント
function people() {
  const seats = Object.fromEntries(Object.keys(ROLES).map((k) => [k, []]));
  const now = Date.now();
  for (const s of state.agents) {
    if (s.state === 'working' || now - s.lastAt < RECENT_DONE_MS) {
      seats.director.push({ kind: 'session', id: s.id, title: s.title, state: s.state, action: s.action, apps: s.apps, lastAt: s.lastAt, cwd: s.cwd });
    }
    for (const a of s.agents) {
      if (a.state === 'done' && now - a.lastAt > RECENT_DONE_MS) continue;
      (seats[a.role] || seats.engineer).push({ kind: 'agent', ...a, session: s.id });
    }
  }
  return seats;
}

function renderOffice() {
  const floor = $('floor');
  floor.replaceChildren();
  const seats = people();
  for (const role of ['director', 'planner', 'designer', 'engineer', 'qa', 'release']) {
    const r = ROLES[role];
    const room = el('section', 'room');
    room.style.setProperty('--c', r.color);
    const head = el('header', 'room__head');
    head.append(el('span', 'room__icon', r.icon), el('h3', 'room__name', r.name), el('span', 'room__desc', r.desc));
    const busy = seats[role].filter((p) => p.state === 'working').length;
    head.append(el('span', `room__count${busy ? ' is-busy' : ''}`, busy ? `${busy} 人 作業中` : '空き'));
    room.append(head);
    const desks = el('div', 'desks');
    if (!seats[role].length) desks.append(el('p', 'desk-empty', '— 今は誰もいません —'));
    for (const p of seats[role]) desks.append(desk(p, role));
    room.append(desks);
    floor.append(room);
  }
}

function desk(p, role) {
  const d = el('article', `desk is-${p.state}`);
  const avatar = el('div', 'avatar', ROLES[role].icon);
  const body = el('div', 'desk__body');
  const title = p.kind === 'session' ? p.title : (p.description || p.type || 'エージェント');
  body.append(el('p', 'desk__title', title));
  const label = { working: '作業中', stalled: '止まっているかも', done: '完了', idle: '待機中' }[p.state] || p.state;
  body.append(el('p', 'desk__action', p.state === 'done' ? `完了 · ${ago(p.lastAt)}` : `${p.action || '考え中'} · ${ago(p.lastAt)}`));
  if (p.apps?.length) {
    const tags = el('p', 'desk__apps');
    for (const id of p.apps.slice(0, 4)) tags.append(el('span', 'app-tag', appName(id)));
    body.append(tags);
  }
  d.title = `${label}\n${p.lastText || ''}`;
  d.append(avatar, body);
  return d;
}

const feedItems = [];
function pushFeed(item) {
  feedItems.push(item);
  if (feedItems.length > 120) feedItems.shift();
  if (state.view === 'office') renderFeed();
}
function renderFeed() {
  const list = $('feed');
  // 最初は各セッションの記録から組み立てる
  if (!feedItems.length) for (const s of state.agents) for (const l of s.log) feedItems.push(l);
  feedItems.sort((a, b) => a.at - b.at);
  list.replaceChildren();
  for (const item of feedItems.slice(-60).reverse()) {
    const li = el('li', 'feed__item');
    li.style.setProperty('--c', ROLES[item.role]?.color || '#888');
    const who = ROLES[item.role]?.name || item.role;
    li.append(el('span', 'feed__who', who), el('span', 'feed__text', item.text), el('time', 'feed__time', ago(item.at)));
    list.append(li);
  }
}

// ---------- プロジェクト ----------

function projectList() {
  // 公開済みのアプリ（apps.js）と、作っている途中のもの（board.projects）を合わせる
  const map = new Map();
  for (const a of state.apps) map.set(a.id, { id: a.id, name: a.name, stage: 'live', color: a.color, icon: a.icon, desc: a.title });
  for (const p of state.board.projects) map.set(p.id, { ...(map.get(p.id) || {}), ...p });
  return [...map.values()];
}

function activeOn(id) {
  const out = [];
  for (const s of state.agents) for (const a of s.agents) if (a.state === 'working' && a.apps.includes(id)) out.push(a);
  return out;
}

function renderProjects() {
  const kanban = $('kanban');
  kanban.replaceChildren();
  const projects = projectList();
  // 作っている途中（アイデア〜リリース）は段階ごとの列、公開済みは下にまとめる
  const cols = el('div', 'cols');
  for (const [key, label] of STAGES.filter(([k]) => k !== 'live')) {
    const col = el('section', 'col');
    const items = projects.filter((p) => (p.stage || 'idea') === key);
    col.append(el('h3', 'col__title', label), el('span', 'col__count', items.length));
    const list = el('div', 'col__list');
    for (const p of items) list.append(projectCard(p));
    if (!items.length) list.append(el('p', 'col__empty', '—'));
    col.append(list);
    cols.append(col);
  }
  kanban.append(cols);
  const live = projects.filter((p) => p.stage === 'live');
  const liveHead = el('h3', 'live-title', `公開中のアプリ（${live.length}）`);
  const grid = el('div', 'live-grid');
  for (const p of live) grid.append(projectCard(p));
  kanban.append(liveHead, grid);
  $('btn-audit').textContent = state.audit.running ? 'チェック中…' : 'チェックを実行';
  $('btn-audit').disabled = !!state.audit.running;
}

function projectCard(p) {
  const card = el('button', 'pcard');
  card.type = 'button';
  card.style.setProperty('--c', p.color || '#8a8f9c');
  const top = el('div', 'pcard__top');
  if (p.icon) { const img = new Image(40, 40); img.src = p.icon.startsWith('/') ? `https://t-of.github.io${p.icon}` : p.icon; img.alt = ''; img.className = 'pcard__icon'; top.append(img); }
  else top.append(el('div', 'pcard__icon pcard__icon--text', (p.name || p.id).slice(0, 1)));
  const t = el('div');
  t.append(el('p', 'pcard__name', p.name || p.id), el('p', 'pcard__id', p.id));
  top.append(t);
  card.append(top);
  const open = state.board.tasks.filter((x) => x.project === p.id && !closed(x));
  const workers = activeOn(p.id);
  const audit = state.audit.summary?.[p.id];
  const meta = el('div', 'pcard__meta');
  if (workers.length) {
    const w = el('span', 'chip chip--live');
    w.textContent = `作業中 ${workers.map((a) => ROLES[a.role]?.icon).join('')}`;
    meta.append(w);
  }
  if (open.length) meta.append(el('span', 'chip', `タスク ${open.length}`));
  if (open.some((x) => x.owner === 'owner')) meta.append(el('span', 'chip chip--owner', 'あなたの番'));
  if (audit) meta.append(el('span', `chip ${audit.failed.length ? 'chip--ng' : 'chip--ok'}`, audit.failed.length ? `チェック ✗${audit.failed.length}` : 'チェック ✓'));
  card.append(meta);
  if (p.note) card.append(el('p', 'pcard__note', p.note));
  card.addEventListener('click', () => openProject(p.id));
  return card;
}

function openProject(id) {
  const p = projectList().find((x) => x.id === id) || { id, stage: 'idea' };
  const body = $('project-body');
  body.replaceChildren();
  body.append(el('h2', 'sheet__title', p.name || p.id), el('p', 'muted', p.id));

  const inBoard = state.board.projects.find((x) => x.id === id);
  const stageRow = el('label', 'field');
  stageRow.append(el('span', null, '段階'));
  const sel = el('select');
  for (const [k, label] of STAGES) { const o = el('option', null, label); o.value = k; o.selected = (p.stage || 'idea') === k; sel.append(o); }
  sel.addEventListener('change', async () => {
    if (inBoard) inBoard.stage = sel.value;
    else state.board.projects.push({ id, name: p.name || id, stage: sel.value, created: today() });
    await saveBoard();
  });
  stageRow.append(sel);
  body.append(stageRow);

  const noteRow = el('label', 'field');
  noteRow.append(el('span', null, 'メモ'));
  const note = el('textarea');
  note.rows = 2;
  note.value = inBoard?.note || '';
  note.addEventListener('change', async () => {
    const target = inBoard || (state.board.projects.push({ id, name: p.name || id, stage: p.stage || 'idea', created: today() }), state.board.projects.at(-1));
    target.note = note.value.trim();
    await saveBoard();
  });
  noteRow.append(note);
  body.append(noteRow);

  const workers = activeOn(id);
  body.append(el('h3', 'sheet__h', `作業中のメンバー（${workers.length}）`));
  if (!workers.length) body.append(el('p', 'muted', 'いまは誰も触っていません。'));
  for (const a of workers) body.append(desk(a, a.role));

  const tasks = state.board.tasks.filter((x) => x.project === id);
  body.append(el('h3', 'sheet__h', `タスク（未完了 ${tasks.filter((x) => !closed(x)).length}）`));
  const list = el('div', 'task-list');
  for (const t of tasks) list.append(taskRow(t));
  if (!tasks.length) list.append(el('p', 'muted', 'タスクはありません。'));
  body.append(list);

  const audit = state.audit.summary?.[id];
  if (audit) {
    body.append(el('h3', 'sheet__h', `自動チェック（${audit.total - audit.failed.length}/${audit.total}）`));
    if (!audit.failed.length) body.append(el('p', 'ok', 'すべて合格'));
    const ul = el('ul', 'fails');
    for (const f of audit.failed) ul.append(el('li', null, f));
    body.append(ul);
    const shot = new Image();
    shot.src = `/shots/${encodeURIComponent(id)}.png`;
    shot.className = 'shot';
    shot.onerror = () => shot.remove();
    body.append(shot);
  }
  const close = el('button', 'btn', '閉じる');
  close.value = 'close';
  body.append(close);
  $('project-sheet').showModal();
}

// ---------- タスク ----------

const today = () => new Date().toISOString().slice(0, 10);

function taskRow(t) {
  const row = el('div', `task is-${t.status}`);
  const owner = ROLES[t.owner] || ROLES.engineer;
  row.style.setProperty('--c', owner.color);
  const check = el('input');
  check.type = 'checkbox';
  check.checked = t.status === 'done';
  check.addEventListener('change', async () => {
    t.status = check.checked ? 'done' : 'todo';
    t.doneAt = check.checked ? today() : null;
    await saveBoard();
  });
  const text = el('div', 'task__text');
  text.append(el('p', 'task__title', t.title));
  const meta = el('p', 'task__meta');
  meta.append(el('span', 'task__owner', owner.name));
  if (t.project) meta.append(el('span', 'app-tag', appName(t.project)));
  if (t.created) meta.append(el('span', null, t.created));
  text.append(meta);
  // 見てほしい画像（案の比較など）
  if (t.images?.length) {
    const thumbs = el('div', 'thumbs');
    for (const src of t.images) {
      const img = new Image();
      img.src = `/hub/${src}`;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('click', () => openImage(img.src));
      thumbs.append(img);
    }
    text.append(thumbs);
  }
  // オーナーに選んでもらうもの
  if (t.choices?.length) {
    const box = el('div', t.choiceImages ? 'choices choices--cards' : 'choices');
    for (const c of t.choices) {
      const b = el('button', 'choice', c);
      if (t.choiceImages?.[c]) {
        const img = new Image();
        img.src = `/hub/${t.choiceImages[c]}`;
        img.alt = c;
        b.replaceChildren(img, el('span', 'choice__label', t.choiceLabels?.[c] ? `${c}  ${t.choiceLabels[c]}` : c));
      }
      b.type = 'button';
      b.setAttribute('aria-pressed', String(t.choice === c));
      b.addEventListener('click', async () => {
        const note = prompt(`「${c}」にします。直してほしい点があれば書いてください（なくてもよい）`, t.comment || '');
        if (note === null) return;
        t.choice = c;
        t.comment = note.trim();
        t.status = 'done';
        t.doneAt = today();
        await saveBoard();
      });
      box.append(b);
    }
    text.append(box);
    if (t.choice) text.append(el('p', 'choice-note', `選んだもの: ${t.choice}${t.comment ? ` — ${t.comment}` : ''}`));
  }
  const status = el('select', 'task__status');
  for (const [k, label] of Object.entries(STATUS)) { const o = el('option', null, label); o.value = k; o.selected = t.status === k; status.append(o); }
  status.addEventListener('change', async () => { t.status = status.value; t.doneAt = closed(t) ? today() : null; await saveBoard(); });
  const del = el('button', 'task__del', '×');
  del.type = 'button';
  del.title = '削除';
  del.addEventListener('click', async () => {
    if (!confirm(`「${t.title}」を消しますか？`)) return;
    state.board.tasks = state.board.tasks.filter((x) => x !== t);
    await saveBoard();
  });
  row.append(check, text, status, del);
  return row;
}

function renderTasks() {
  const sel = $('task-project');
  const current = sel.value;
  sel.replaceChildren();
  const none = el('option', null, '全体');
  none.value = '';
  sel.append(none);
  for (const p of projectList()) { const o = el('option', null, p.name || p.id); o.value = p.id; sel.append(o); }
  sel.value = current;

  const f = state.filter;
  const tasks = state.board.tasks.filter((t) =>
    f === 'all' ? true : f === "done" ? closed(t) : f === "owner" ? t.owner === "owner" && !closed(t) : !closed(t));
  const groups = new Map();
  for (const t of tasks) {
    const k = t.project || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const wrap = $('task-groups');
  wrap.replaceChildren();
  if (!tasks.length) wrap.append(el('p', 'empty', f === 'owner' ? 'あなたの番のタスクはありません。' : 'タスクはありません。'));
  for (const [k, list] of groups) {
    const g = el('section', 'tgroup');
    g.append(el('h3', 'tgroup__title', k ? appName(k) : '全体'));
    const order = { doing: 0, waiting: 1, todo: 2, done: 3, skip: 4 };
    for (const t of list.sort((a, b) => order[a.status] - order[b.status])) g.append(taskRow(t));
    wrap.append(g);
  }
  document.querySelectorAll('#filters [data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === f)));
}

function openImage(src) {
  const d = $('lightbox');
  d.querySelector('img').src = src;
  d.showModal();
}

// ---------- 数字 ----------

function renderStats() {
  const working = state.agents.reduce((n, s) => n + s.agents.filter((a) => a.state === 'working').length, 0);
  const sessionsLive = state.agents.filter((s) => s.state === 'working').length;
  const open = state.board.tasks.filter((t) => !closed(t));
  const mine = open.filter((t) => t.owner === 'owner').length;
  const building = projectList().filter((p) => p.stage && p.stage !== 'live').length;
  const failed = Object.values(state.audit.summary || {}).filter((a) => a.failed.length).length;
  const stats = $('stats');
  stats.replaceChildren();
  const add = (label, value, cls = '') => { const s = el('div', `stat ${cls}`); s.append(el('span', 'stat__value', value), el('span', 'stat__label', label)); stats.append(s); };
  add('作業中のメンバー', working, working ? 'is-live' : '');
  add('動いている会話', sessionsLive);
  add('作っているアプリ', building);
  add('未完了のタスク', open.length);
  add('あなたの番', mine, mine ? 'is-owner is-link' : '');
  add('チェック不合格のアプリ', failed, failed ? 'is-ng' : '');
  $('task-badge').textContent = open.length || '';
}

// ---------- 全体 ----------

function render() {
  renderStats();
  if (state.view === 'office') { renderOffice(); renderFeed(); }
  if (state.view === 'projects') renderProjects();
  if (state.view === 'tasks') renderTasks();
}

document.querySelectorAll('.tabs [data-view]').forEach((b) => b.addEventListener('click', () => {
  state.view = b.dataset.view;
  document.querySelectorAll('.tabs [data-view]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== state.view; });
  try { localStorage.setItem('tof-studio.view', state.view); } catch { /* なくても動く */ }
  render();
}));

document.querySelectorAll('#filters [data-filter]').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; renderTasks(); }));

$('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const title = String(f.get('title')).trim();
  if (!title) return;
  const n = Math.max(0, ...state.board.tasks.map((t) => Number(String(t.id).replace(/\D/g, '')) || 0)) + 1;
  state.board.tasks.push({ id: `t${n}`, project: f.get('project') || null, title, owner: f.get('owner'), status: 'todo', created: today(), doneAt: null });
  e.target.title.value = '';
  await saveBoard();
});

$('btn-audit').addEventListener('click', () => fetch('/api/audit?browser=1', { method: 'POST' }));

$('btn-new-project').addEventListener('click', async () => {
  const id = prompt('リポジトリ名（英小文字・数字・-）\n例: dot-rush');
  if (!id || !/^[a-z0-9-]+$/.test(id)) return;
  const name = prompt('アプリの名前（仮でよい）', id) || id;
  if (projectList().some((p) => p.id === id)) return openProject(id);
  state.board.projects.push({ id, name, stage: 'idea', created: today(), note: '' });
  await saveBoard();
  openProject(id);
});

$('stats').addEventListener('click', (e) => {
  if (!e.target.closest('.is-link')) return;
  state.filter = 'owner';
  document.querySelector('.tabs [data-view="tasks"]').click();
});
$('lightbox').addEventListener('click', (e) => e.currentTarget.close());

$('project-sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

setInterval(() => { if (state.view === 'office') { renderOffice(); renderFeed(); } }, 15000);  // 「◯分前」を進める

(async () => {
  try { state.apps = await (await fetch('/api/apps')).json(); } catch { /* 空のまま */ }
  let v = 'office';
  try { v = localStorage.getItem('tof-studio.view') || 'office'; } catch { /* 既定 */ }
  document.querySelector(`.tabs [data-view="${v}"]`)?.click();
  connect();
})();
