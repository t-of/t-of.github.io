// バーチャルオフィス。studio/HANDOFF.md のデータの形だけを使う。読むだけ、書かない。
// app.js から import して使う（自分では SSE をつながない）。フロアは 1 枚の SVG（固定座標）。
// 画面の幅に合わせて丸ごと縮める／広げる。人は rAF 1 本で歩かせる。

// ---------- 係。スタジオ全体で使う唯一の名簿（app.js もここから import する） ----------
export const ROLES = {
  director: { person: '佐藤', name: 'ディレクター', color: '#ffd35c', icon: '◆' },
  researcher: { person: '山本', name: 'リサーチ', color: '#5b8cff', icon: '⌕' },
  planner: { person: '佐々木', name: '企画', color: '#9d7bff', icon: '✎' },
  designer: { person: '清水', name: 'デザイン', color: '#e24bc6', icon: '✦' },
  engineer: { person: '石川', name: '実装', color: '#2cc6e0', icon: '⌘' },
  qa: { person: '村上', name: '品質', color: '#36a075', icon: '✓' },
  release: { person: '藤井', name: 'リリース', color: '#e2582e', icon: '↑' },
  writer: { person: '岡本', name: 'note', color: '#41c9b4', icon: '✍' },
  owner: { name: 'オーナー', color: '#eceef3', icon: '★' },
};
export const PEOPLE = {
  director: ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺'],
  researcher: ['山本', '中村', '小林', '加藤', '吉田', '山田'],
  planner: ['佐々木', '山口', '松本', '井上', '木村', '林'],
  designer: ['清水', '山崎', '森', '池田', '橋本', '阿部'],
  engineer: ['石川', '前田', '藤田', '後藤', '岡田', '長谷川'],
  qa: ['村上', '近藤', '石井', '斎藤', '坂本', '遠藤'],
  release: ['藤井', '青木', '西村', '福田', '太田', '三浦'],
  writer: ['岡本', '松田', '中川', '中野', '原田', '小川'],
};
const ROOM_ORDER = ['director', 'researcher', 'planner', 'designer', 'engineer', 'qa', 'release', 'writer'];
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export const leader = (role) => ROLES[role]?.person || ROLES[role]?.name || role;
// id → 名前。同じ id には常に同じ名前を返す（フロアの札も #feed・成績・タスクの詳細も、この 1 つの名簿を見るので自然に揃う）
const named = new Map();
export function nameOf(role, id) {
  if (!id) return leader(role);
  if (named.has(id)) return named.get(id);
  const pool = PEOPLE[role] || [leader(role)];
  const name = pool[hash(id) % pool.length];
  named.set(id, name);
  return name;
}

const RECENT_DONE_MS = 30 * 60 * 1000;   // 休憩所にいる時間
const SPEED = 150;          // 歩く速さ（フロアの座標で 1 秒あたり）。時間は距離に比例する
const closed = (t) => t.status === 'done' || t.status === 'skip';
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = (t) => {
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分前`;
  return `${Math.floor(s / 3600)} 時間前`;
};
// 字の幅の目安（英数は 0.6 字、ほかは 1 字）
const em = (s) => [...String(s)].reduce((w, c) => w + (c.charCodeAt(0) < 0x2000 ? 0.6 : 1), 0);
function clip(s, maxEm) {
  let out = '', w = 0;
  for (const c of String(s)) { w += c.charCodeAt(0) < 0x2000 ? 0.6 : 1; if (w > maxEm) return out + '…'; out += c; }
  return out;
}
// 「読む: dot-rush/app.js」→「読む app.js」
function shortAction(a) {
  if (!a) return '作業中';
  const [verb, ...rest] = String(a).split(/[:：]\s*/);
  return clip(rest.length ? `${verb} ${rest.join(':').split('/').pop()}` : verb, 8.5);
}
function mix(a, b, t) {   // a と b を t（0〜1、b の割合）で混ぜた色
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

const state = { agents: [], board: { projects: [], tasks: [], ideas: [] } };
let loaded = false;                 // 最初の agents 受信が終わるまで演出を出さない

// ---------- だれがどこにいるか（データから） ----------

function computeSeats() {
  const rooms = Object.fromEntries(ROOM_ORDER.map((k) => [k, []]));
  const brk = [];
  const now = Date.now();
  for (const s of state.agents) {
    if (s.state === 'working' || now - s.lastAt < 60000) {
      rooms.director.push({ id: s.id, role: 'director', title: s.title, state: s.state === 'working' ? 'working' : 'stalled', action: s.action, apps: s.apps, lastAt: s.lastAt });
    }
    for (const a of s.agents || []) {
      if (a.state !== 'working' && a.state !== 'stalled' && now - a.lastAt > RECENT_DONE_MS) continue;
      const role = ROOM_ORDER.includes(a.role) ? a.role : 'engineer';
      const item = { id: a.id, role, title: a.description || a.type, state: a.state, action: a.action, apps: a.apps, lastAt: a.lastAt, session: s.id };
      if (a.state === 'done') brk.push(item); else rooms[role].push(item);
    }
  }
  return { rooms, brk };
}
const myTurnTasks = () => state.board.tasks.filter((t) => t.owner === 'owner' && !closed(t));

// 席の番号は一度決めたら変えない（だれかが抜けても、ほかの人が席を移らない）
const seatNo = Object.fromEntries([...ROOM_ORDER, 'break'].map((k) => [k, new Map()]));
function assignSeats(key, ids) {
  const m = seatNo[key];
  for (const id of [...m.keys()]) if (!ids.includes(id)) m.delete(id);
  const used = new Set(m.values());
  for (const id of ids) {
    if (m.has(id)) continue;
    let i = 0; while (used.has(i)) i++;
    m.set(id, i); used.add(i);
  }
  return m.size ? Math.max(...m.values()) + 1 : 0;
}

// ---------- 間取り ----------
// 横長: 上の段に 4 部屋＋オーナー室、真ん中に廊下（左端が入口）、下の段に 4 部屋＋休憩所。
// 縦長（狭い画面）: 真ん中に縦の廊下（上端が入口）、両側に部屋。どちらも部屋のドアは廊下に面する。

const M = 20, RW = 248, OW = 268, CW = 72, HEAD = 44;
const CELL_W = 100, CELL_H = 118, SOFA_W = 56, SOFA_H = 84;
let narrow = false;
let layout = null;
const places = new Map();

const roomRows = (cap) => Math.max(1, Math.ceil(cap / 2));
const sofaPerRow = (w) => Math.floor((w - 44) / SOFA_W);  // 左の通路 28 と右の余白 16 を除いた幅

function needHeight(key, w, caps) {
  if (key === 'owner') return HEAD + CELL_H + 14;
  if (key === 'break') return HEAD + Math.max(1, Math.ceil(caps.break / sofaPerRow(w))) * SOFA_H + 40;
  return HEAD + roomRows(caps[key]) * CELL_H + 14;
}

function buildLayout(caps) {
  const rooms = [];
  let W, H, corridor, entrance;
  if (!narrow) {
    const top = ['director', 'researcher', 'planner', 'designer', 'owner'];
    const bottom = ['engineer', 'qa', 'release', 'writer', 'break'];
    const wOf = (i) => (i < 4 ? RW : OW), xOf = (i) => M + i * RW;
    const h1 = Math.max(...top.map((k, i) => needHeight(k, wOf(i), caps)));
    const h2 = Math.max(...bottom.map((k, i) => needHeight(k, wOf(i), caps)));
    W = M * 2 + RW * 4 + OW; H = M * 2 + h1 + CW + h2;
    top.forEach((k, i) => rooms.push({ key: k, x: xOf(i), y: M, w: wOf(i), h: h1, door: 'bottom', aisle: 'left' }));
    bottom.forEach((k, i) => rooms.push({ key: k, x: xOf(i), y: M + h1 + CW, w: wOf(i), h: h2, door: 'top', aisle: 'left' }));
    corridor = { x: M, y: M + h1, w: W - M * 2, h: CW, horiz: true };
    const cy = corridor.y + CW / 2;
    entrance = { out: { x: 2, y: cy }, edge: { x: M + 6, y: cy }, end: { x: M + 30, y: cy } };
  } else {
    const rows = [['director', 'owner'], ['researcher', 'planner'], ['designer', 'engineer'], ['qa', 'release'], ['writer', 'break']];
    W = M * 2 + RW * 2 + CW;
    let y = M;
    for (const [l, r] of rows) {
      const h = Math.max(needHeight(l, RW, caps), needHeight(r, RW, caps));
      rooms.push({ key: l, x: M, y, w: RW, h, door: 'right', aisle: 'right' });
      rooms.push({ key: r, x: M + RW + CW, y, w: RW, h, door: 'left', aisle: 'left' });
      y += h;
    }
    H = y + M;
    corridor = { x: M + RW, y: M, w: CW, h: H - M * 2, horiz: false };
    const cx = corridor.x + CW / 2;
    entrance = { out: { x: cx, y: 2 }, edge: { x: cx, y: M + 6 }, end: { x: cx, y: M + 30 } };
  }
  const toCorr = (p) => (corridor.horiz ? { x: p.x, y: corridor.y + CW / 2 } : { x: corridor.x + CW / 2, y: p.y });
  for (const r of rooms) {
    r.sideX = r.aisle === 'left' ? r.x + 20 : r.x + r.w - 20;
    r.cellsX = r.aisle === 'left' ? r.x + 36 : r.x + 10;
    const d = { top: [r.sideX, r.y, 0, 1], bottom: [r.sideX, r.y + r.h, 0, -1], left: [r.x, r.y + 40, 1, 0], right: [r.x + r.w, r.y + 40, -1, 0] }[r.door];
    r.doorAt = { x: d[0], y: d[1] };
    r.doorIn = r.door === 'top' || r.door === 'bottom' ? { x: r.sideX, y: d[1] + d[3] * 14 } : { x: r.sideX, y: d[1] };
    r.doorOut = { x: d[0] - d[2] * 12, y: d[1] - d[3] * 12 };
    r.corr = toCorr(r.doorOut);
  }
  return { W, H, rooms, corridor, entrance, byKey: Object.fromEntries(rooms.map((r) => [r.key, r])) };
}

function seatCell(r, i) {
  const col = i % 2, row = Math.floor(i / 2);
  const x = r.cellsX + col * CELL_W, y = r.y + HEAD + row * CELL_H;
  return { x, y, col, origin: { x: x + 50, y: y + 66 }, lane: y + 110 };
}
function sofaCell(r, i) {
  const n = sofaPerRow(r.w), col = i % n, row = Math.floor(i / n);
  const x = r.x + 28 + col * SOFA_W, y = r.y + HEAD + row * SOFA_H;
  return { x, y, origin: { x: x + SOFA_W / 2, y: y + 30 }, lane: y + 72 };
}
// 場所 = そこへの道すじ。inner は「その場所 → 通り道 → 部屋の脇の通路 → ドアの内側」、outer は「ドアの外 → 廊下」
function place(r, spot, lane, pose, extra) {
  return { room: r.key, spot, pose, inner: [spot, { x: spot.x, y: lane }, { x: r.sideX, y: lane }, r.doorIn], outer: [r.doorOut, r.corr], ...extra };
}
function buildPlaces() {
  places.clear();
  const L = layout;
  for (const role of ROOM_ORDER) {
    const r = L.byKey[role];
    for (const [id, i] of seatNo[role]) {
      const c = seatCell(r, i);
      places.set(`seat:${id}`, place(r, c.origin, c.lane, 'desk', { cell: c, role }));
      const ax = c.origin.x + (c.col === 0 ? 30 : -30);
      places.set(`appr:${id}`, place(r, { x: ax, y: c.origin.y + 6 }, c.lane, 'stand', { cell: c, role }));
    }
    const c0 = seatCell(r, 0);
    places.set(`lobby:${role}`, place(r, { x: r.sideX, y: c0.lane }, c0.lane, 'stand', { cell: null, role }));
  }
  const b = L.byKey.break;
  for (const [id, i] of seatNo.break) { const c = sofaCell(b, i); places.set(`sofa:${id}`, place(b, c.origin, c.lane, 'sofa')); }
  const e = L.entrance;
  places.set('entrance', { room: 'entrance', spot: e.out, pose: 'out', inner: [e.out, e.out, e.edge, e.edge], outer: [e.end, e.end] });
}
function route(a, b) {
  if (a.room === b.room) return [...a.inner.slice(0, 3), ...b.inner.slice(0, 3).reverse()];
  return [...a.inner, ...a.outer, ...[...b.outer].reverse(), ...[...b.inner].reverse()];
}

// ---------- フロアの絵（SVG の文字列で作る） ----------

const WALL = '#3a4150', WOOD = '#5a4432', WOOD_TOP = '#6b5240';
function tilePattern(id, color) {
  const base = mix(color, '#101218', 0.9), line = mix(color, '#101218', 0.8);
  return `<pattern id="${id}" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="${base}"/><path d="M0 .5H20M.5 0V20" stroke="${line}" stroke-width="1"/></pattern>`;
}
function drawFloor(people) {
  const L = layout;
  let defs = tilePattern('t-break', '#c08a4a') + tilePattern('t-owner', '#ffd35c')
    + `<pattern id="t-corr" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#16181e"/><rect width="12" height="12" fill="#191b22"/><rect x="12" y="12" width="12" height="12" fill="#191b22"/></pattern>`;
  for (const role of ROOM_ORDER) defs += tilePattern(`t-${role}`, ROLES[role].color);
  $('defs').innerHTML = defs;

  const c = L.corridor;
  let s = `<rect x="${M}" y="${M}" width="${L.W - M * 2}" height="${L.H - M * 2}" fill="#0f1115"/>`;
  s += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="url(#t-corr)"/>`;
  s += c.horiz
    ? `<text class="corr-label" x="${c.x + c.w / 2}" y="${c.y + CW / 2 + 4}">廊 下</text>`
    : `<text class="corr-label" x="${c.x + CW / 2}" y="${c.y + c.h / 2}" writing-mode="tb">廊下</text>`;
  for (const r of L.rooms) s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#t-${r.key})"/>`;
  for (const r of L.rooms) s += roomFurniture(r, people);
  // 壁（部屋の枠と外壁）→ ドアの切れ目
  for (const r of L.rooms) s += `<rect class="wall" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`;
  s += `<rect class="wall wall--outer" x="${M}" y="${M}" width="${L.W - M * 2}" height="${L.H - M * 2}"/>`;
  for (const r of L.rooms) s += doorGap(r.doorAt, r.door === 'top' || r.door === 'bottom', r.key === 'owner' ? '#ffd35c' : r.key === 'break' ? '#c08a4a' : ROLES[r.key].color);
  const e = L.entrance;
  s += doorGap(e.edge.x === e.out.x ? { x: e.edge.x, y: M } : { x: M, y: e.edge.y }, e.edge.x === e.out.x, '#eceef3', 44);
  s += c.horiz
    ? `<text class="door-label" x="${M + 14}" y="${c.y + 14}">入口 →</text>` + plant(c.x + c.w - 22, c.y + 22) + plant(c.x + c.w - 22, c.y + CW - 10)
    : `<text class="door-label" x="${e.edge.x}" y="${M + 44}" text-anchor="middle">入口</text>` + plant(c.x + 14, c.y + c.h - 14) + plant(c.x + CW - 14, c.y + c.h - 14);
  for (const r of L.rooms) s += roomLabel(r, people);
  $('g-floor').innerHTML = s;
}
function doorGap(p, horiz, color, size = 36) {
  const h = size / 2;
  return horiz
    ? `<rect x="${p.x - h}" y="${p.y - 6}" width="${size}" height="12" fill="#22262f"/><rect x="${p.x - h - 3}" y="${p.y - 6}" width="4" height="12" fill="${color}"/><rect x="${p.x + h - 1}" y="${p.y - 6}" width="4" height="12" fill="${color}"/>`
    : `<rect x="${p.x - 6}" y="${p.y - h}" width="12" height="${size}" fill="#22262f"/><rect x="${p.x - 6}" y="${p.y - h - 3}" width="12" height="4" fill="${color}"/><rect x="${p.x - 6}" y="${p.y + h - 1}" width="12" height="4" fill="${color}"/>`;
}
function roomLabel(r, people) {
  const x = r.door === 'top' && r.aisle === 'left' ? r.x + 44 : r.x + 14;
  if (r.key === 'owner') return `<text class="room-name" x="${x}" y="${r.y + 24}" fill="#ffd35c">★ オーナー室</text><text class="room-sub" x="${x}" y="${r.y + 38}">あなたが決める机</text>`;
  if (r.key === 'break') return `<text class="room-name" x="${x}" y="${r.y + 24}" fill="#e8c9a0">☕ 休憩所</text><text class="room-sub" x="${x}" y="${r.y + 38}">仕事を終えた人がひと息</text>`;
  const role = ROLES[r.key];
  const list = people.rooms[r.key];
  const busy = list.filter((p) => p.state === 'working').length;
  const sub = `${role.person}の部屋 · ${busy ? `作業中 ${busy}` : list.length ? `${list.length} 人` : '空き'}`;
  return `<text class="room-name" x="${x}" y="${r.y + 24}" fill="${role.color}">${role.icon} ${esc(role.name)}</text><text class="room-sub${busy ? ' is-busy' : ''}" x="${x}" y="${r.y + 38}">${esc(sub)}</text>`;
}

function roomFurniture(r, people) {
  if (r.key === 'owner') return ownerRoom(r);
  if (r.key === 'break') return breakRoom(r);
  let s = whiteboard(r);
  const byIdx = new Map();
  for (const p of people.rooms[r.key]) byIdx.set(seatNo[r.key].get(p.id), p);
  const cap = roomRows(people.caps[r.key]) * 2;
  for (let i = 0; i < cap; i++) s += desk(r, i, byIdx.get(i));
  return s;
}
function whiteboard(r) {
  const tasks = state.board.tasks.filter((t) => t.owner === r.key && ['todo', 'doing', 'waiting'].includes(t.status));
  const bx = r.x + r.w - 98, by = r.y + 5;
  let s = `<g class="wb"><title>${esc(ROLES[r.key].name)}のやること ${tasks.length} 件</title><rect x="${bx}" y="${by}" width="90" height="31" rx="2" fill="#aeb6c3" stroke="#6c7482" stroke-width="2"/><rect x="${bx + 4}" y="${by + 31}" width="82" height="3" fill="#6c7482"/>`;
  if (!tasks.length) s += `<text class="wb-empty" x="${bx + 45}" y="${by + 19}">やること なし</text>`;
  const colors = { todo: '#ffe27a', doing: '#8fe3f0', waiting: '#f7a8d8' };
  const shown = tasks.length > 4 ? tasks.slice(0, 3) : tasks;
  shown.forEach((t, k) => {
    const nx = bx + 4 + k * 21;
    s += `<g><title>${esc(t.title)}</title><rect x="${nx}" y="${by + 5}" width="19" height="21" fill="${colors[t.status]}"/><text class="note-txt" x="${nx + 9.5}" y="${by + 14}">${esc([...t.title].slice(0, 2).join(''))}</text><text class="note-txt" x="${nx + 9.5}" y="${by + 23}">${esc([...t.title].slice(2, 4).join(''))}</text></g>`;
  });
  if (tasks.length > 4) s += `<text class="note-more" x="${bx + 76}" y="${by + 20}">＋${tasks.length - 3}</text>`;
  return s + '</g>';
}
function desk(r, i, p) {
  const c = seatCell(r, i), x = c.x, y = c.y;
  const dx = c.col === 0 ? x + 14 : x, color = ROLES[r.key].color;
  const screen = !p ? '#1a1d24' : p.state === 'working' ? mix(color, '#ffffff', 0.45) : '#48505f';
  let s = `<rect x="${dx}" y="${y + 24}" width="86" height="31" fill="${WOOD}"/><rect x="${dx}" y="${y + 24}" width="86" height="3" fill="${WOOD_TOP}"/>`;
  if (c.col === 1) s += `<rect x="${x}" y="${y + 24}" width="1" height="31" fill="#3e2f22"/>`;
  s += `<rect x="${x + 46}" y="${y + 25}" width="8" height="3" fill="#2b2f38"/><rect x="${x + 33}" y="${y + 27}" width="34" height="6" fill="#0c0e12" stroke="#343944" stroke-width="1"/>`;
  s += `<rect class="screen${p?.state === 'working' ? ' is-on' : ''}" x="${x + 35}" y="${y + 33}" width="30" height="3" fill="${screen}"/>`;
  if (p?.state === 'working') s += `<rect class="screen-glow" x="${x + 31}" y="${y + 36}" width="38" height="8" fill="${screen}" opacity=".12"/>`;
  s += `<rect x="${x + 37}" y="${y + 43}" width="26" height="6" fill="#1f232b"/><rect x="${x + 39}" y="${y + 45}" width="22" height="1" fill="#3a404c"/><rect x="${x + 67}" y="${y + 44}" width="4" height="5" rx="1" fill="#2a2f39"/>`;
  const deco = hash(`${r.key}${i}`) % 3;
  if (deco === 0) s += `<rect x="${c.col === 0 ? x + 20 : x + 76}" y="${y + 31}" width="6" height="6" fill="#d7d9df"/><rect x="${c.col === 0 ? x + 21 : x + 77}" y="${y + 32}" width="4" height="3" fill="#6b4a2b"/>`;
  else if (deco === 1) s += `<rect x="${c.col === 0 ? x + 18 : x + 72}" y="${y + 38}" width="10" height="12" fill="#e7e9ee" transform="rotate(-8 ${x + 23} ${y + 44})"/>`;
  // 椅子（上から見た座面と背もたれ）
  const chair = p ? '#2e333e' : '#272b34';
  s += `<rect x="${x + 37}" y="${y + 56}" width="26" height="19" rx="3" fill="${chair}"/><rect x="${x + 35}" y="${y + 74}" width="30" height="5" rx="2" fill="#3b414e"/>`;
  return s;
}
function ownerRoom(r) {
  const n = myTurnTasks().length, cx = r.x + r.w / 2 + 10, y = r.y + HEAD;
  let s = `<rect class="owner-glow${n ? ' is-on' : ''}" x="${r.x + 4}" y="${r.y + 4}" width="${r.w - 8}" height="${r.h - 8}"/>`;
  s += `<rect x="${cx - 66}" y="${y + 22}" width="132" height="36" fill="${WOOD}"/><rect x="${cx - 66}" y="${y + 22}" width="132" height="3" fill="${WOOD_TOP}"/>`;
  s += `<rect x="${cx - 4}" y="${y + 23}" width="8" height="3" fill="#2b2f38"/><rect x="${cx - 18}" y="${y + 25}" width="36" height="6" fill="#0c0e12"/><rect x="${cx - 16}" y="${y + 31}" width="32" height="3" fill="#6d7383"/>`;
  // 書類の山（あなたの番の数だけ。多いときは 12 枚まで積んで数を書く）
  const shown = Math.min(n, 12);
  for (let i = 0; i < shown; i++) s += `<rect x="${cx - 58 + (i % 2)}" y="${y + 44 - i * 2.4}" width="26" height="12" fill="${i === shown - 1 ? '#ffffff' : '#d8dbe2'}" stroke="#8a90a0" stroke-width=".8"/>`;
  if (n) s += `<rect x="${cx - 54}" y="${y + 46 - shown * 2.4}" width="18" height="1.5" fill="#9aa0ab"/>`;
  s += `<rect x="${cx + 28}" y="${y + 40}" width="30" height="10" fill="#1f232b"/>`;
  s += `<rect x="${cx - 14}" y="${y + 60}" width="28" height="21" rx="3" fill="#6a5720"/><rect x="${cx - 16}" y="${y + 80}" width="32" height="6" rx="2" fill="#8a7128"/><text class="owner-star" x="${cx}" y="${y + 76}">★</text>`;
  s += `<text class="owner-count" x="${cx}" y="${y + 104}">${n ? `あなたの番 ${n} 件` : 'あなたの番はありません'}</text>`;
  s += plant(r.x + r.w - 30, r.y + 14);
  return s;
}
function breakRoom(r) {
  const n = sofaPerRow(r.w), rows = Math.max(1, Math.ceil(seatNo.break.size ? (Math.max(...seatNo.break.values()) + 1) / n : 1));
  let s = '';
  for (let row = 0; row < rows; row++) {
    const x = r.x + 28, y = r.y + HEAD + row * SOFA_H, w = n * SOFA_W;
    s += `<rect x="${x}" y="${y + 6}" width="${w}" height="12" rx="3" fill="#6b3a4a"/><rect x="${x}" y="${y + 16}" width="${w}" height="26" rx="3" fill="#8a4a5e"/>`;
    for (let k = 1; k < n; k++) s += `<rect x="${x + k * SOFA_W}" y="${y + 18}" width="1" height="22" fill="#6b3a4a"/>`;
    s += `<rect x="${x - 6}" y="${y + 8}" width="8" height="34" rx="3" fill="#6b3a4a"/><rect x="${x + w - 2}" y="${y + 8}" width="8" height="34" rx="3" fill="#6b3a4a"/>`;
  }
  const by = r.y + HEAD + rows * SOFA_H;
  s += `<rect x="${r.x + 60}" y="${by - 4}" width="${r.w - 110}" height="30" rx="4" fill="#2a2320" opacity=".7"/><rect x="${r.x + 90}" y="${by + 3}" width="${r.w - 170}" height="14" fill="${WOOD}"/><rect x="${r.x + 100}" y="${by + 6}" width="6" height="6" fill="#e7e9ee"/>`;
  // コーヒーマシンと植物（壁ぎわ）
  const mx = r.x + r.w - 74;
  s += `<rect x="${mx}" y="${r.y + 8}" width="24" height="26" fill="#23262e" stroke="#4a505d"/><rect x="${mx + 4}" y="${r.y + 12}" width="16" height="6" fill="#0c0e12"/><rect x="${mx + 16}" y="${r.y + 13}" width="3" height="3" fill="#f0625a"/><rect x="${mx + 8}" y="${r.y + 24}" width="8" height="7" fill="#e7e9ee"/>`;
  s += plant(r.x + r.w - 30, r.y + 14) + plant(r.x + 22, r.y + r.h - 24);
  return s;
}
function plant(x, y) {
  return `<rect x="${x - 7}" y="${y + 4}" width="14" height="10" fill="#7a4e2e"/><rect x="${x - 9}" y="${y - 8}" width="8" height="8" fill="#2f8f4e"/><rect x="${x + 1}" y="${y - 10}" width="8" height="9" fill="#3aa35c"/><rect x="${x - 4}" y="${y - 14}" width="8" height="10" fill="#47b86a"/>`;
}

// ---------- 人（ドット絵）。1 人 1 つの <g>。位置は rAF で動かす ----------

const HAIR = ['#2b1d14', '#5a3a22', '#1b1b1f', '#a0522d', '#d9b36c', '#6b6f7a', '#3b2a4a'];
const SKIN = ['#f1cfa8', '#e0b48a', '#c68f63', '#8d5a3b'];
const ents = new Map();

function spriteSvg(role, id) {
  const c = ROLES[role]?.color || '#888', sh = mix(c, '#000000', 0.35);
  const hair = HAIR[hash(id) % HAIR.length], skin = SKIN[hash(id + 'k') % SKIN.length];
  return `<g transform="scale(1.2)"><g class="sprite">
<rect class="leg leg-l" x="-5" y="2" width="4" height="8" fill="#2b2f3a"/><rect class="leg leg-r" x="1" y="2" width="4" height="8" fill="#2b2f3a"/>
<g class="arm arm-l"><rect x="-10" y="-7" width="3" height="9" fill="${sh}"/><rect x="-10" y="2" width="3" height="2" fill="${skin}"/></g>
<g class="arm arm-r"><rect x="7" y="-7" width="3" height="9" fill="${sh}"/><rect x="7" y="2" width="3" height="2" fill="${skin}"/></g>
<rect x="-7" y="-8" width="14" height="11" fill="${c}"/><rect x="-7" y="1" width="14" height="2" fill="${sh}"/>
<rect x="-6" y="-20" width="12" height="12" fill="${skin}"/>
<g class="front"><rect x="-6" y="-21" width="12" height="4" fill="${hair}"/><rect x="-6" y="-17" width="2" height="4" fill="${hair}"/><rect x="4" y="-17" width="2" height="4" fill="${hair}"/><rect x="-3" y="-14" width="2" height="2" fill="#1a1a1a"/><rect x="1" y="-14" width="2" height="2" fill="#1a1a1a"/></g>
<rect class="back" x="-6" y="-21" width="12" height="11" fill="${hair}"/>
</g></g>`;
}
function tagSvg(role, name) {
  const t = `${ROLES[role]?.icon || ''} ${name}`, w = em(t) * 9.5 + 8;
  return `<rect x="${-w / 2}" y="17" width="${w}" height="13" rx="2" fill="#0b0c10" fill-opacity=".85" stroke="${ROLES[role]?.color}" stroke-opacity=".6" stroke-width="1"/><text class="tag-txt" y="27">${esc(t)}</text>`;
}
function bubbleSvg(text, stalled) {
  const w = Math.max(20, em(text) * 9.5 + 10);
  return `<rect x="${-w / 2}" y="-62" width="${w}" height="16" rx="3" fill="${stalled ? '#565d6b' : '#f2f3f6'}"/><path d="M-3 -46.5 L0 -42 L3 -46.5Z" fill="${stalled ? '#565d6b' : '#f2f3f6'}"/><text class="bubble-txt${stalled ? ' is-stall' : ''}" y="-50.5">${esc(text)}</text>`;
}
function docSvg(kind, role) {
  const band = kind === 'report' ? '#36a075' : kind === 'return' ? '#f0625a' : ROLES[role]?.color || '#ffd35c';
  const glyph = kind === 'report' ? '✓' : kind === 'return' ? '!' : '→';
  return `<rect x="6" y="-12" width="11" height="14" fill="#ffffff" stroke="${band}" stroke-width="1.5"/><rect x="6" y="-12" width="11" height="4" fill="${band}"/><text class="doc-glyph" x="11.5" y="0">${glyph}</text>`;
}

function makeEnt(p, at) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'person');
  g.setAttribute('tabindex', '0');
  g.setAttribute('role', 'button');
  g.innerHTML = `<rect class="hit" fill="transparent"/>${spriteSvg(p.role, p.id)}<g class="carry"></g><g class="bubble"></g><g class="tag"></g>`;
  const e = { id: p.id, role: p.role, name: nameOf(p.role, p.id), g, data: p, at, home: at, queue: [], cur: null, face: 'up', carry: null, pos: { ...(places.get(at)?.spot || { x: 0, y: 0 }) }, atPlace: places.get(at), bubbleKey: '' };
  g.querySelector('.tag').innerHTML = tagSvg(p.role, e.name);
  const open = (ev) => showPopover(ev, e);
  g.addEventListener('click', open);
  g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(ev); } });
  $('g-people').append(g);
  ents.set(p.id, e);
  sizeHit(e);
  return e;
}
let scale = 1;
function sizeHit(e) {   // 縮めたあとでも 44px 以上になるよう、当たりの四角を広げる
  const w = Math.min(96, Math.max(48, 46 / scale)), h = Math.max(64, 46 / scale);
  const hit = e.g.querySelector('.hit');
  hit.setAttribute('x', -w / 2); hit.setAttribute('y', 30 - h); hit.setAttribute('width', w); hit.setAttribute('height', h);
}
function drawEnt(e) {
  const walking = e.cur?.type === 'walk';
  const pose = walking ? 'walk' : places.get(e.at)?.pose || 'stand';
  const atHome = !walking && e.at === e.home;
  const face = pose === 'desk' ? 'up' : pose === 'sofa' ? 'down' : walking ? e.face : 'up';
  e.g.setAttribute('transform', `translate(${e.pos.x.toFixed(1)} ${e.pos.y.toFixed(1)})`);
  const cls = `person pose-${pose} face-${face}${pose === 'desk' && atHome && e.data.state === 'working' ? ' is-type' : ''}${walking ? ' is-walk' : ''}`;
  if (e.g.getAttribute('class') !== cls) e.g.setAttribute('class', cls);
  const bubble = pose === 'desk' && atHome && (e.data.state === 'working' || e.data.state === 'stalled') ? (e.data.state === 'stalled' ? '…' : shortAction(e.data.action)) : '';
  const key = `${bubble}|${e.data.state}`;
  if (key !== e.bubbleKey) { e.bubbleKey = key; e.g.querySelector('.bubble').innerHTML = bubble ? bubbleSvg(bubble, e.data.state === 'stalled') : ''; }
  const carryKey = e.carry ? e.carry.kind : '';
  if (carryKey !== e.carryKey) { e.carryKey = carryKey; e.g.querySelector('.carry').innerHTML = e.carry ? docSvg(e.carry.kind, e.carry.role) : ''; }
  e.g.setAttribute('aria-label', `${ROLES[e.role]?.name} ${e.name}: ${e.data.title || ''}`);
}

// ---------- 歩く（rAF 1 本） ----------

let raf = 0, last = 0;
const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
function startStep(e, st, now) {
  if (st.do) { st.do(e); return null; }
  if (st.wait) return { type: 'wait', until: now + st.wait };
  const key = st.walk === 'home' ? e.home : typeof st.walk === 'function' ? st.walk() : st.walk;
  const to = places.get(key), from = places.get(e.at) || e.atPlace;
  if (!to || !from) { if (to) { e.at = key; e.atPlace = to; e.pos = { ...to.spot }; } return null; }
  if ('carry' in st) e.carry = st.carry;
  const pts = [e.pos, ...route(from, to)];
  return { type: 'walk', pts, i: 1, key, to };
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  let active = false;
  for (const e of [...ents.values()]) {
    let guard = 0;
    while (!e.cur && guard++ < 8) {
      if (e.queue.length) e.cur = startStep(e, e.queue.shift(), now);
      else if (e.at !== e.home) e.cur = startStep(e, { walk: 'home' }, now) || (e.at === e.home ? null : { type: 'wait', until: now + 500 });
      else break;
    }
    if (!e.cur && e.gone && e.at === 'entrance') { e.g.remove(); ents.delete(e.id); continue; }
    if (e.cur) {
      active = true;
      if (e.cur.type === 'wait') { if (now >= e.cur.until) e.cur = null; }
      else {
        let left = SPEED * dt;
        const c = e.cur;
        while (left > 0 && c.i < c.pts.length) {
          const t = c.pts[c.i], dx = t.x - e.pos.x, dy = t.y - e.pos.y, d = Math.hypot(dx, dy);
          if (d > 0.01) e.face = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : 'down';
          if (d <= left) { e.pos = { x: t.x, y: t.y }; c.i++; left -= d; } else { e.pos = { x: e.pos.x + dx / d * left, y: e.pos.y + dy / d * left }; left = 0; }
        }
        if (c.i >= c.pts.length) { e.at = c.key; e.atPlace = c.to; e.cur = null; }
      }
    }
    drawEnt(e);
  }
  raf = active ? requestAnimationFrame(frame) : 0;
}

function flash(key) {
  const p = places.get(key);
  let x, y, w, h, color;
  if (p?.cell) { x = p.cell.x + 4; y = p.cell.y + 20; w = CELL_W - 8; h = 82; color = ROLES[p.role].color; }
  else {
    const r = layout.byKey[p?.room || key.split(':')[1]];
    if (!r) return;
    x = r.x + 4; y = r.y + 4; w = r.w - 8; h = r.h - 8; color = ROLES[r.key]?.color || '#ffd35c';
  }
  const f = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  Object.entries({ x, y, width: w, height: h, rx: 6, fill: color, stroke: color, class: 'flash' }).forEach(([k, v]) => f.setAttribute(k, v));
  $('g-fx').append(f);
  setTimeout(() => f.remove(), 900);
}

// 書類を届ける。依頼・差し戻し = ディレクターが係の席へ。報告 = 係の人がディレクターの席へ
function directorFor(session) {
  return ents.get(session)?.role === 'director' ? ents.get(session) : [...ents.values()].find((e) => e.role === 'director' && !e.gone);
}
function targetIn(role, agentId) {
  if (agentId && seatNo[role]?.has(agentId)) return agentId;
  const ids = [...(seatNo[role]?.entries() || [])].filter(([id]) => !ents.get(id)?.gone);
  return ids.length ? ids[ids.length - 1][0] : null;   // 一番新しく来た人
}
function deliver(item) {
  const toDirector = item.kind === 'report';
  const actor = toDirector ? ents.get(item.agent) || [...ents.values()].find((e) => e.role === item.role && !e.gone) : directorFor(item.session);
  const toRole = toDirector ? 'director' : item.to;
  if (!ROLES[toRole]) return;
  let targetKey = null;
  const resolve = () => {
    const id = toDirector ? directorFor(item.session)?.id : targetIn(toRole, item.agent);
    targetKey = id && id !== actor?.id ? `seat:${id}` : `lobby:${toRole}`;
    return id && id !== actor?.id ? `appr:${id}` : `lobby:${toRole}`;
  };
  if (!loaded || reduceMotion() || !actor || actor.queue.length > 8) { setTimeout(() => { resolve(); flash(targetKey); }, 60); return; }
  actor.queue.push(
    { walk: resolve, carry: { kind: item.kind, role: actor.role } },
    { do: (e) => { e.carry = null; flash(targetKey); } },
    { wait: 450 },
    { walk: 'home' },
  );
  kick();
}

// ---------- 毎回の描画 ----------

function render() {
  const people = computeSeats();
  const caps = {};
  for (const role of ROOM_ORDER) caps[role] = Math.max(narrow ? 2 : 4, assignSeats(role, people.rooms[role].map((p) => p.id)));
  caps.break = assignSeats('break', people.brk.map((p) => p.id));
  people.caps = caps;
  layout = buildLayout(caps);
  buildPlaces();
  drawFloor(people);

  const all = [...Object.values(people.rooms).flat().map((p) => [p, `seat:${p.id}`]), ...people.brk.map((p) => [p, `sofa:${p.id}`])];
  const seen = new Set();
  const instant = !loaded || reduceMotion();
  for (const [p, home] of all) {
    seen.add(p.id);
    let e = ents.get(p.id);
    if (!e) e = makeEnt(p, instant ? home : 'entrance');
    e.data = p; e.home = home; e.gone = false;
    if (e.role !== p.role) e.role = p.role;
  }
  for (const e of ents.values()) if (!seen.has(e.id)) { e.gone = true; e.home = 'entrance'; }
  for (const e of [...ents.values()]) {
    if (instant) {
      e.queue = []; e.cur = null; e.carry = null; e.at = e.home; e.atPlace = places.get(e.home);
      if (e.gone) { e.g.remove(); ents.delete(e.id); continue; }
    }
    // ponytail: 歩いている途中に間取りが変わると、その人だけ古い道すじのまま進む。着いたら新しい位置に合う
    if (!e.cur && places.get(e.at)) { e.pos = { ...places.get(e.at).spot }; e.atPlace = places.get(e.at); }
    drawEnt(e);
  }
  loaded = true;
  fit();
  kick();
}

// ---------- 画面の幅に合わせる ----------

function fit() {
  const width = $('stage').clientWidth;
  if (!width) return;   // 社内タブが隠れている間（幅 0）は、当たり判定が Infinity にならないよう何もしない
  const wantNarrow = width < 820;
  if (wantNarrow !== narrow) { narrow = wantNarrow; render(); return; }
  scale = Math.min(1.6, width / layout.W);
  const svg = $('floor');
  svg.setAttribute('viewBox', `0 0 ${layout.W} ${layout.H}`);
  svg.setAttribute('width', Math.floor(layout.W * scale));
  svg.setAttribute('height', Math.floor(layout.H * scale));
  for (const e of ents.values()) sizeHit(e);
}
addEventListener('resize', () => { if (layout) fit(); });

// ---------- カード（人を押すと出る） ----------

function showPopover(ev, e) {
  ev.stopPropagation();
  const pop = $('popover'), p = e.data;
  const label = p.state === 'working' ? p.action || '作業中' : p.state === 'stalled' ? '止まっているかも（3 分記録なし）' : p.state === 'done' ? '完了。休憩中' : '';
  pop.innerHTML = `<h4>${esc(ROLES[e.role]?.icon)} ${esc(e.name)}（${esc(ROLES[e.role]?.name)}）</h4><p>${esc(p.title || '—')}</p><p>${esc(label)}</p><p>${esc(ago(p.lastAt))}${p.apps?.length ? ' · ' + esc(p.apps.join(', ')) : ''}</p>`;
  pop.hidden = false;
  const r = e.g.getBoundingClientRect();
  pop.style.left = `${Math.max(6, Math.min(r.left, innerWidth - 250))}px`;
  pop.style.top = `${Math.max(6, Math.min(r.bottom + 6, innerHeight - 140))}px`;
}
document.addEventListener('click', (ev) => { if (!ev.target.closest('.popover')) $('popover').hidden = true; });

// ---------- app.js から呼ぶ入口（SSE はここでは張らない。app.js の /api/events に相乗りする） ----------

export function officeAgents(data) { state.agents = data; render(); }
export function officeBoard(data) { state.board = data; if (layout) render(); }
export function officeLog(item) { if (item.kind) deliver(item); }
