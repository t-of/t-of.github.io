// T.OF... スタジオの画面。サーバー（server.mjs）から届く状態を描くだけ。

// 社内タブのフロア（ドット絵のオフィス）は office.js が描く。ここからは状態を渡すだけ。
// 係の名簿（ROLES・PEOPLE・名前の決め方）も office.js の 1 か所にまとめてあるので、ここでは import するだけ
import { ROLES, leader, nameOf, officeAgents, officeBoard, officeLog } from './office.js';

const team = (role) => `${ROLES[role]?.name || role}チーム`;
const STAGES = [
  ['idea', 'アイデア'], ['planning', '企画'], ['design', 'デザイン'], ['build', '実装'],
  ['qa', '品質'], ['release', 'リリース'], ['live', '公開済み'],
];
const STATUS = { todo: '未着手', doing: '進行中', waiting: '待ち', done: '完了', skip: "しなくていい" };
const closed = (t) => t.status === "done" || t.status === "skip";   // 終わったもの（完了・しなくていい）
const STATS_ROLES = ['researcher', 'planner', 'designer', 'engineer', 'qa', 'release', 'writer'];   // 成績タブで見る係（ディレクター・オーナーは除く）

const state = { agents: [], board: { projects: [], tasks: [], ideas: [] }, apps: [], audit: { summary: {} },
  ledger: [], statsPeriod: 'month', filter: 'open', view: 'office', usage: null };

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
  es.addEventListener('usage', (e) => { state.usage = JSON.parse(e.data); if (state.view === 'office') renderUsage(); });
  es.addEventListener('ledger', (e) => {
    const row = JSON.parse(e.data);
    state.ledger.push(row);
    if (state.view === 'stats') renderStatsTab();
  });
  es.addEventListener('log', (e) => {
    const item = JSON.parse(e.data);
    pushFeed(item);
    // ディレクター ⇔ 各部屋の依頼・報告・差し戻しは、社内タブが開いているときだけ書類を飛ばす（最初の読み込みでは飛ばさない）
    if (state.view === 'office' && item.kind) officeLog(item);
  });
}

async function saveBoard() {
  await fetch('/api/board', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.board) });
}

// ---------- 社内（フロアそのものは office.js が描く。ここに残るのはほかのタブでも使う desk() と、日報・フィード） ----------

function desk(p, role) {
  const d = el('article', `desk is-${p.state}`);
  const avatar = el('div', 'avatar', ROLES[role].icon);
  const body = el('div', 'desk__body');
  const title = p.kind === 'session' ? p.title : (p.description || p.type || 'エージェント');
  body.append(el('p', 'desk__who', p.person || nameOf(role, p.id)), el('p', 'desk__title', title));
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
  if (state.view !== 'office') return;
  renderFeed();
  if (item.kind) renderDaily();   // 依頼・報告・差し戻しの数はすぐ反映する
}
function renderFeed() {
  const list = $('feed');
  // 最初は各セッションの記録から組み立てる
  if (!feedItems.length) for (const s of state.agents) for (const l of s.log) feedItems.push({ ...l, session: s.id });
  feedItems.sort((a, b) => a.at - b.at);
  list.replaceChildren();
  for (const item of feedItems.slice(-60).reverse()) {
    const li = el('li', 'feed__item');
    const color = item.kind === 'report' ? 'var(--ok)' : item.kind === 'return' ? 'var(--ng)' : ROLES[item.role]?.color || '#888';
    li.style.setProperty('--c', color);
    li.append(el('span', 'feed__who', nameOf(item.role, item.agent || item.session)), el('span', 'feed__text', feedText(item)), el('time', 'feed__time', ago(item.at)));
    list.append(li);
  }
}

// 依頼・報告・差し戻しは「ディレクター → デザイン」のように誰から誰への動きかを表す
function feedText(item) {
  if (item.kind === 'handoff') return `→ ${team(item.to)}に依頼`;
  if (item.kind === 'return') return `→ ${team(item.to)}に差し戻し`;
  if (item.kind === 'report') return `→ ディレクターに報告`;
  return item.text;
}

// ---------- 残り枠（Claude のプラン。~/.claude/tof-usage.json） ----------

const STALE_MS = 60 * 60 * 1000;   // 最後の計測がこれより前なら「古いかも」と分かるように薄くする
const WARN_PCT = 20;               // 残りがこれ以下なら警告色

// 見出しは「今日の体力」（5 時間で回復）「今週の勤務可能量」（週で回復）
function usageGauge(label, box, now) {
  if (!box) return null;
  const resetAt = (box.resets_at || 0) * 1000;
  const recovered = resetAt && resetAt <= now;
  const remain = recovered ? 100 : Math.max(0, Math.min(100, 100 - (box.used_percentage ?? 0)));
  const reset = !resetAt ? '' : recovered ? '回復ずみ' : `${label === '週' ? `${'日月火水木金土'[new Date(resetAt).getDay()]} ` : ''}${new Date(resetAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} に回復`;
  return { remain, reset };
}

function renderUsage() {
  const box = $('usage');
  const u = state.usage;
  box.replaceChildren();
  box.append(el('h2', 'panel-title', '社員の残り労働可能量'));
  if (!u || (!u.five_hour && !u.seven_day)) { box.append(el('p', 'muted', 'まだ計測なし')); return; }
  const now = Date.now();
  const rows = [['今日の体力', u.five_hour, '日'], ['今週の勤務可能量', u.seven_day, '週']];
  for (const [label, data, kind] of rows) {
    const g = usageGauge(kind, data, now);
    if (!g) continue;
    const row = el('div', `usage__row${g.remain <= WARN_PCT ? ' is-warn' : ''}`);
    const head = el('div', 'usage__head');
    head.append(el('span', 'usage__label', label), el('span', 'usage__pct', `残り ${Math.round(g.remain)}%`));
    const bar = el('div', 'usage__bar');
    bar.append(el('span', 'usage__fill'));
    bar.firstChild.style.width = `${g.remain}%`;
    row.append(head, bar);
    if (g.reset) row.append(el('p', 'usage__reset', g.reset));
    box.append(row);
  }
  if (u.at && now - u.at > STALE_MS) box.classList.add('is-stale'); else box.classList.remove('is-stale');
}

// ---------- 今日の日報 ----------

function dailyReport() {
  const t = today();
  const doneToday = state.board.tasks.filter((x) => x.doneAt === t).length;
  // ponytail: サーバーが持つ作業記録は直近 12 時間分だけ。それより前に動いたメンバーは延べ人数に入らない
  const workers = [];
  for (const s of state.agents) for (const a of s.agents) if (sameDay(a.lastAt || a.startedAt, t)) workers.push(a);
  const byRole = {};
  for (const a of workers) byRole[a.role] = (byRole[a.role] || 0) + 1;
  let handoff = 0, report = 0, ret = 0;
  for (const item of feedItems) {
    if (!sameDay(item.at, t)) continue;
    if (item.kind === 'handoff') handoff++;
    else if (item.kind === 'report') report++;
    else if (item.kind === 'return') ret++;
  }
  return { doneToday, workers: workers.length, byRole, handoff, report, ret };
}

function dailyStat(label, value) {
  const s = el('div', 'daily__stat');
  s.append(el('span', 'daily__value', String(value)), el('span', 'daily__label', label));
  return s;
}

function renderDaily() {
  const box = $('daily');
  box.replaceChildren();
  box.append(el('h2', 'panel-title', '今日の日報'));
  const r = dailyReport();
  const stats = el('div', 'daily__stats');
  stats.append(dailyStat('完了タスク', r.doneToday), dailyStat('延べ人数', r.workers));
  stats.append(dailyStat('依頼', r.handoff), dailyStat('報告', r.report), dailyStat('差し戻し', r.ret));
  box.append(stats);
  if (r.workers) {
    const bar = el('div', 'daily__bar');
    const legend = el('div', 'daily__legend');
    for (const [role, n] of Object.entries(r.byRole)) {
      const seg = el('span', 'daily__seg');
      seg.style.width = `${(n / r.workers) * 100}%`;
      seg.style.background = ROLES[role]?.color || '#888';
      seg.title = `${ROLES[role]?.name || role} ${n}`;
      bar.append(seg);
      const item = el('span', 'daily__legend-item');
      item.style.setProperty('--c', ROLES[role]?.color || '#888');
      item.append(el('i'), document.createTextNode(`${ROLES[role]?.name || role} ${n}`));
      legend.append(item);
    }
    box.append(bar, legend);
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
    const items = projects.filter((p) => (p.stage || 'idea') === key);
    // 空の列は細く、カードが多い列ほど広げる
    const col = el('section', items.length ? 'col' : 'col is-empty');
    if (items.length) col.style.flexGrow = items.length;
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
  // メンバーが作業中か、進行中のタスクがあれば縁を光らせる
  if (workers.length || open.some((x) => x.status === 'doing')) card.classList.add('is-working');
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

// 端末のローカル日付（toISOString は UTC になり、日本時間の朝 9 時前は前日になってしまう）
const today = () => {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const sameDay = (ms, dateStr) => {
  if (!ms) return false;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === dateStr;
};

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
    // prompt() は VS Code の中のブラウザでは出ないので、コメントは画面の入力欄で受ける
    const note = el('input', 'choice-comment');
    note.placeholder = '直してほしい点・コメント（なくてもよい）。書いてから選ぶ';
    note.value = t.comment || '';
    for (const c of t.choices) {
      const label = t.choiceLabels?.[c] ? `${c}  ${t.choiceLabels[c]}` : c;
      const b = el('button', 'choice', label);
      if (t.choiceImages?.[c]) {
        const img = new Image();
        img.src = `/hub/${t.choiceImages[c]}`;
        img.alt = c;
        b.replaceChildren(img, el('span', 'choice__label', label));
      }
      b.type = 'button';
      b.setAttribute('aria-pressed', String(t.choice === c));
      b.addEventListener('click', async () => {
        t.choice = c;
        t.comment = note.value.trim();
        t.status = 'done';
        t.doneAt = today();
        await saveBoard();
      });
      box.append(b);
    }
    text.append(note, box);
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
  const building = projectList().filter((p) => p.stage && p.stage !== 'live' && p.stage !== 'other').length;
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
  updateMyTurn(mine);
}

// ヘッダーの「あなたの番」ボタンとタブのタイトル
let prevMyTurn = 0;
const BASE_TITLE = document.title;
function updateMyTurn(mine) {
  const btn = $('btn-my-turn');
  $('my-turn-count').textContent = mine;
  btn.classList.toggle('is-active', mine > 0);
  if (mine > prevMyTurn) {
    btn.classList.remove('is-wiggle');
    void btn.offsetWidth;   // アニメーションを最初からやり直す
    btn.classList.add('is-wiggle');
    setTimeout(() => btn.classList.remove('is-wiggle'), 2400);
  }
  prevMyTurn = mine;
  document.title = mine ? `(${mine}) ${BASE_TITLE}` : BASE_TITLE;
}

// ---------- 成績 ----------

// 係ごとの累計件数からレベルを出す（台帳の全件、期間は関係ない）。Lv = floor(sqrt(件数)) + 1
const roleCount = (role) => state.ledger.filter((l) => l.role === role).length;
const levelOf = (n) => Math.floor(Math.sqrt(n)) + 1;
function levelProgress(n) {
  const lv = levelOf(n);
  const lo = (lv - 1) ** 2, hi = lv ** 2;
  return { lv, pct: hi > lo ? (n - lo) / (hi - lo) : 1 };
}

// 選んだ期間の始まり（端末のローカル時刻）。今週は月曜始まり
function periodStart(period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'all') return 0;
  if (period === 'month') { d.setDate(1); return d.getTime(); }
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
const ledgerInPeriod = (period) => state.ledger.filter((l) => (l.startedAt || 0) >= periodStart(period));

// その係・そのアプリへの差し戻し（kind: 'return'）が、job が終わってから 24 時間以内に来たか
function hasReturnWithin24h(role, apps, sinceMs) {
  const until = sinceMs + 24 * 60 * 60 * 1000;
  return state.ledger.some((r) => r.kind === 'return' && r.role === role && r.startedAt >= sinceMs && r.startedAt <= until
    && r.apps.some((a) => apps.includes(a)));
}
// 一発合格率: kind 'job' かつアプリが分かっているものだけを数える
function firstPassRate(rows) {
  const jobs = rows.filter((l) => l.kind === 'job' && l.apps.length);
  if (!jobs.length) return null;
  const pass = jobs.filter((j) => !hasReturnWithin24h(j.role, j.apps, j.endedAt || j.startedAt)).length;
  return pass / jobs.length;
}

const fmtMs = (ms) => {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分${s % 60}秒`;
  return `${Math.floor(m / 60)}時間${m % 60}分`;
};
const fmtTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

// バッジ。台帳から毎回計算するだけで、どこにも保存しない
function jobsWithApps(role) { return state.ledger.filter((l) => l.role === role && l.kind === 'job' && l.apps.length).sort((a, b) => b.endedAt - a.endedAt); }
function streak10(role) {
  const jobs = jobsWithApps(role);
  return jobs.length >= 10 && jobs.slice(0, 10).every((j) => !hasReturnWithin24h(j.role, j.apps, j.endedAt || j.startedAt));
}
function ecoRole() {   // 今月、平均出力トークンが一番少ない係
  const from = periodStart('month');
  let best = null, bestAvg = Infinity;
  for (const role of STATS_ROLES) {
    const rows = state.ledger.filter((l) => l.role === role && l.startedAt >= from);
    if (!rows.length) continue;
    const avg = rows.reduce((n, l) => n + (l.tokens?.output || 0), 0) / rows.length;
    if (avg < bestAvg) { bestAvg = avg; best = role; }
  }
  return best;
}
function nightCount(role) {
  return state.ledger.filter((l) => l.role === role && l.endedAt && (new Date(l.endedAt).getHours() >= 22 || new Date(l.endedAt).getHours() < 5)).length;
}
const BADGES = [
  { title: '初仕事', need: '1 件終える', ok: (role) => roleCount(role) >= 1 },
  { title: 'ベテラン', need: '50 件終える', ok: (role) => roleCount(role) >= 50 },
  { title: '100 件', need: '100 件終える', ok: (role) => roleCount(role) >= 100 },
  { title: '一発合格 10 連続', need: '直近 10 件のアプリ仕事が続けて差し戻しなし', ok: (role) => streak10(role) },
  { title: '省エネ', need: '今月、平均の出力トークンが全係で一番少ない', ok: (role) => ecoRole() === role },
  { title: '夜ふかし', need: '22 時〜5 時に終えた仕事が 10 件', ok: (role) => nightCount(role) >= 10 },
];

function renderStatsMVP() {
  const from = periodStart('month');
  const byRole = {};
  for (const l of state.ledger) {
    if (l.kind !== 'job' || l.startedAt < from || !l.apps.length) continue;
    if (hasReturnWithin24h(l.role, l.apps, l.endedAt || l.startedAt)) continue;
    byRole[l.role] = (byRole[l.role] || 0) + 1;
  }
  const box = $('stats-mvp');
  box.replaceChildren();
  const top = Object.entries(byRole).sort((a, b) => b[1] - a[1])[0];
  if (!top) { box.append(el('p', 'muted', '今月はまだ、差し戻しなしで終わった仕事がありません。')); return; }
  const [role, n] = top;
  box.style.setProperty('--c', ROLES[role]?.color || '#888');
  box.append(el('span', 'mvp__icon', ROLES[role]?.icon || '★'), el('span', 'mvp__text', `今月の MVP: ${team(role)}（リーダー ${leader(role)}）`), el('span', 'mvp__n', `${n} 件`));
}

function renderStatsCards() {
  const wrap = $('stats-cards');
  wrap.replaceChildren();
  for (const role of STATS_ROLES) {
    const { lv, pct } = levelProgress(roleCount(role));
    const card = el('article', 'employee');
    card.style.setProperty('--c', ROLES[role].color);
    const head = el('div', 'employee__head');
    const info = el('div');
    info.append(el('p', 'employee__name', team(role)), el('p', 'employee__lv', `リーダー ${leader(role)} · Lv.${lv}`));
    head.append(el('span', 'employee__icon', ROLES[role].icon), info);
    const bar = el('div', 'employee__bar');
    const fill = el('span');
    fill.style.width = `${Math.round(pct * 100)}%`;
    bar.append(fill);
    const badges = el('div', 'badges');
    for (const b of BADGES) {
      const got = b.ok(role);
      const chip = el('span', `badge-chip${got ? ' is-on' : ''}`, b.title);
      chip.title = got ? b.title : `未取得: ${b.need}`;
      badges.append(chip);
    }
    card.append(head, bar, el('p', 'employee__count', `累計 ${roleCount(role)} 件`), badges);
    wrap.append(card);
  }
}

function renderStatsTable(period) {
  const rows = ledgerInPeriod(period);
  const wrap = $('stats-table');
  wrap.replaceChildren();
  const table = el('table', 'stats-table__table');
  const thead = el('thead');
  const htr = el('tr');
  for (const h of ['係', 'モデル', '件数', '平均時間', '平均トークン(出力)', '平均トークン(入力+キャッシュ)', '一発合格率']) htr.append(el('th', null, h));
  thead.append(htr);
  table.append(thead);
  const tbody = el('tbody');
  for (const role of STATS_ROLES) {
    const byModel = new Map();
    for (const l of rows.filter((l) => l.role === role)) {
      const k = l.model || '（不明）';
      if (!byModel.has(k)) byModel.set(k, []);
      byModel.get(k).push(l);
    }
    const models = [...byModel.entries()].sort((a, b) => b[1].length - a[1].length);
    if (!models.length) {
      const tr = el('tr', 'stats-row stats-row--empty');
      tr.style.setProperty('--c', ROLES[role].color);
      tr.append(el('td', 'stats-role', ROLES[role].name), ...Array.from({ length: 6 }, () => el('td', null, '—')));
      tbody.append(tr);
      continue;
    }
    for (const [model, list] of models) {
      const thin = list.length < 5;
      const tr = el('tr', `stats-row${thin ? ' is-thin' : ''}`);
      tr.style.setProperty('--c', ROLES[role].color);
      if (thin) tr.title = '数が少ない';
      const avgMs = list.reduce((n, l) => n + (l.ms || 0), 0) / list.length;
      const avgOut = list.reduce((n, l) => n + (l.tokens?.output || 0), 0) / list.length;
      const avgIn = list.reduce((n, l) => n + (l.tokens?.input || 0) + (l.tokens?.cacheRead || 0) + (l.tokens?.cacheWrite || 0), 0) / list.length;
      const fp = firstPassRate(list);
      tr.append(
        el('td', 'stats-role', ROLES[role].name), el('td', null, model), el('td', null, String(list.length)),
        el('td', null, fmtMs(avgMs)), el('td', null, fmtTok(avgOut)), el('td', null, fmtTok(avgIn)),
        el('td', null, fp == null ? '—' : `${Math.round(fp * 100)}%`),
      );
      tbody.append(tr);
    }
  }
  table.append(tbody);
  wrap.append(table);
}

function renderStatsReturns(period) {
  const rows = ledgerInPeriod(period).filter((l) => l.kind === 'return').sort((a, b) => b.endedAt - a.endedAt).slice(0, 10);
  const list = $('stats-returns');
  list.replaceChildren();
  if (!rows.length) { list.append(el('li', 'muted', '差し戻しはありません。')); return; }
  for (const r of rows) {
    const li = el('li', 'feed__item');
    li.style.setProperty('--c', ROLES[r.role]?.color || '#888');
    const text = `${r.apps.length ? `${r.apps.map(appName).join('・')} — ` : ''}${r.description || ''}`;
    li.append(el('span', 'feed__who', nameOf(r.role, r.id)), el('span', 'feed__text', text), el('time', 'feed__time', ago(r.endedAt)));
    list.append(li);
  }
}

function renderStatsAdoption(period) {
  const from = periodStart(period);
  const tasks = state.board.tasks.filter((t) => t.choices?.length && t.choice && (period === 'all' || (t.doneAt && new Date(t.doneAt).getTime() >= from)));
  const box = $('stats-adoption');
  box.className = 'daily__stats adopt';
  box.replaceChildren();
  box.append(dailyStat('そのまま採用', tasks.filter((t) => !t.comment).length));
  box.append(dailyStat('直しの注文つき', tasks.filter((t) => t.comment).length));
}

function renderStatsTab() {
  document.querySelectorAll('#stats-period [data-period]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.period === state.statsPeriod)));
  renderStatsMVP();
  renderStatsCards();
  renderStatsTable(state.statsPeriod);
  renderStatsReturns(state.statsPeriod);
  renderStatsAdoption(state.statsPeriod);
}

// ---------- 全体 ----------

function render() {
  renderStats();
  if (state.view === 'office') { officeAgents(state.agents); officeBoard(state.board); renderFeed(); renderDaily(); renderUsage(); }
  if (state.view === 'projects') renderProjects();
  if (state.view === 'tasks') renderTasks();
  if (state.view === 'stats') renderStatsTab();
}

document.querySelectorAll('.tabs [data-view]').forEach((b) => b.addEventListener('click', () => {
  state.view = b.dataset.view;
  document.querySelectorAll('.tabs [data-view]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== state.view; });
  try { localStorage.setItem('tof-studio.view', state.view); } catch { /* なくても動く */ }
  render();
}));

document.querySelectorAll('#filters [data-filter]').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; renderTasks(); }));
document.querySelectorAll('#stats-period [data-period]').forEach((b) => b.addEventListener('click', () => { state.statsPeriod = b.dataset.period; renderStatsTab(); }));

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
$('btn-my-turn').addEventListener('click', () => {
  state.filter = 'owner';
  document.querySelector('.tabs [data-view="tasks"]').click();
});
$('lightbox').addEventListener('click', (e) => e.currentTarget.close());

$('project-sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

setInterval(() => { if (state.view === 'office') { officeAgents(state.agents); officeBoard(state.board); renderFeed(); renderDaily(); renderUsage(); } }, 15000);  // 「◯分前」を進める・計測の古さを更新

(async () => {
  try { state.apps = await (await fetch('/api/apps')).json(); } catch { /* 空のまま */ }
  try { state.ledger = await (await fetch('/api/ledger')).json(); } catch { /* 空のまま */ }
  let v = 'office';
  try { v = localStorage.getItem('tof-studio.view') || 'office'; } catch { /* 既定 */ }
  document.querySelector(`.tabs [data-view="${v}"]`)?.click();
  connect();
})();
