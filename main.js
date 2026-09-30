// ポータル。apps.js の一覧だけから画面を組み立てる。
// アプリを足すときは apps.js に 1 件足すだけでよい（種類・タグ・件数・新着・アイコンの帯はここで自動で出る）。
(function () {
  'use strict';

  // 本物のポータルはオーナーが「公開していい」と言ったもの（approved: true）だけ。デモ（/demo/）は全部
  const APPS = (window.TOFO_APPS || []).filter((a) => a && a.id && a.name && (window.TOFO_DEMO || a.approved));

  // 種類の表示名。新しい種類を apps.js で使うときは、ここに名前を足す（足さなくても id のまま出る）
  const CATEGORY = { game: 'ゲーム', tool: '学び・ツール' };
  const NEW_COUNT = 3;          // 「新着」に大きく出す数（apps.js の先頭から）
  const RECENT_MAX = 8;         // 「最近開いた」に残す数
  const KEY = { filter: 'tofo.portal.filter', sort: 'tofo.portal.sort', recent: 'tofo.portal.recent' };

  const $ = (id) => document.getElementById(id);
  const catLabel = (c) => CATEGORY[c] || c;
  const hrefOf = (a) => a.url || `/${a.id}/`;   // Cloudflare に置くアプリ（host: 'cloudflare'）は url を持つ
  // 共有画像は icons/og.png に置く決まり（RULES.md §2）。apps.js に og を書けばそちらを使う
  const ogOf = (a) => a.og || (/icon-192\.png$/.test(a.icon || '') ? a.icon.replace(/icon-192\.png$/, 'og.png') : null);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できなくても表示はできる */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* 同上 */ } },
  };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- 色 ----------
  // カードの文字にアプリの色を使うと、暗い色（#0b1224 など）は背景に沈んで読めない。
  // 読める明るさになるまで白を混ぜた色を --ct に入れる。
  function rgbOf(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    const n = parseInt(h, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function luminance([r, g, b]) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function readable(hex) {
    const rgb = rgbOf(hex) || [138, 143, 156];
    for (let t = 0; t <= 1; t += 0.05) {
      const mix = rgb.map((v) => Math.round(v + (255 - v) * t));
      if (luminance(mix) >= 0.24) return `rgb(${mix.join(' ')})`;   // 面 #13151b に対して 5:1 以上
    }
    return '#fff';
  }
  function paint(node, app) {
    node.style.setProperty('--c', rgbOf(app.color) ? app.color : '#8a8f9c');
    node.style.setProperty('--ct', readable(app.color));
  }

  function iconImg(app, size) {
    const box = el('span', 'icon');
    const img = new Image(size, size);
    img.src = app.icon;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => { img.remove(); box.textContent = app.name.slice(0, 1); box.classList.add('icon--text'); };
    box.append(img);
    return box;
  }

  function appLink(app, cls) {
    const a = el('a', cls);
    a.href = hrefOf(app);
    a.dataset.app = app.id;
    return a;
  }

  // ---------- 検索 ----------
  // 全角・半角、大文字・小文字、ひらがな・カタカナの違いを無視する（「ぱずる」で「パズル」が出る）
  const norm = (s) => String(s).normalize('NFKC').toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/\s+/g, '');
  const haystack = new Map(APPS.map((a) => [a.id,
    norm([a.name, a.id, a.title, a.desc, catLabel(a.category), ...(a.tags || [])].join(' '))]));

  // ---------- カード（App Store の一覧のように、名前の下に縦長の画面を 3 枚） ----------
  // 画面は shots/<id>-1〜3.jpg（tools/shots.mjs で撮る）。動画（apps.js の video）があれば 1 枚目を動画にする。
  const SHOTS = 3;
  function shotImg(src) {
    const img = new Image(390, 844);
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => { const box = img.closest('.shots'); img.parentElement.remove(); if (box && !box.children.length) box.remove(); };
    return img;
  }
  function shots(app) {
    const box = el('div', 'shots');
    if (app.video) {
      const b = el('button', 'shot shot--video');
      b.type = 'button';
      b.setAttribute('aria-label', `${app.name} の紹介動画を見る`);
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'none';
      v.poster = app.video.replace(/\.mp4$/, '.jpg');
      v.dataset.src = app.video;   // 見えるまで読まない（autoplay を見て入れる）
      b.append(v, el('span', 'shot__play'));
      b.addEventListener('click', () => openVideo(app));
      box.append(b);
    }
    for (let n = 1; box.children.length < SHOTS; n++) {
      const s = el('span', 'shot');
      s.append(shotImg(`/shots/${app.id}-${n}.jpg`));
      box.append(s);
    }
    return box;
  }

  function card(app) {
    const li = el('li', 'card');
    paint(li, app);

    const head = el('div', 'card__head');
    head.append(iconImg(app, 64));
    const body = el('div', 'card__body');
    const name = el('h3', 'card__name');
    const link = appLink(app, 'card__link');
    link.textContent = app.name;
    name.append(link);
    body.append(name, el('p', 'card__title', app.title));

    const tags = el('p', 'card__tags');
    const catBtn = el('button', 'tag tag--cat', catLabel(app.category));
    catBtn.type = 'button';
    catBtn.dataset.cat = app.category;
    tags.append(catBtn);
    (app.tags || []).forEach((t) => {
      const b = el('button', 'tag', t);
      b.type = 'button';
      b.dataset.tag = t;
      tags.append(b);
    });
    body.append(tags);
    const get = el('span', 'card__get', '遊ぶ');
    get.setAttribute('aria-hidden', 'true');   // カード全体がリンクなので、見た目だけのボタン
    head.append(body, get);
    li.append(head, el('p', 'card__desc', app.desc), shots(app));
    return li;
  }
  const cards = new Map(APPS.map((a) => [a.id, card(a)]));

  // ---------- 紹介動画（カードの 1 枚目。見えているあいだ音なしで流し、押すと大きく開く） ----------
  const player = $('player');
  const pv = $('player-video');
  function openVideo(app) {
    if (!player) { location.href = app.video; return; }   // 覚えていた古い index.html のとき
    pv.src = app.video;
    pv.poster = app.video.replace(/\.mp4$/, '.jpg');
    const play = $('player-play');
    play.href = hrefOf(app);
    play.dataset.app = app.id;
    play.textContent = `${app.name} で遊ぶ`;
    player.showModal();
    pv.play().catch(() => { /* 自動で始まらなくても、再生ボタンで見られる */ });
  }
  if (player) {
    player.addEventListener('close', () => { pv.pause(); pv.removeAttribute('src'); pv.load(); });
    $('player-close').addEventListener('click', () => player.close());
    player.addEventListener('click', (e) => { if (e.target === player) player.close(); });   // 外側を押したら閉じる
  }
  const autoplay = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
    entries.forEach(({ target: v, isIntersecting }) => {
      if (isIntersecting && !reduceMotion.matches) {
        if (!v.src) v.src = v.dataset.src;
        v.play().catch(() => { /* 省電力などで止められたら表紙のまま */ });
      } else v.pause();
    });
  }, { threshold: 0.6 });
  if (autoplay) cards.forEach((c) => c.querySelectorAll('video').forEach((v) => autoplay.observe(v)));

  // ---------- 絞り込みの状態（URL の ?q=&c=&tag=&sort= と同じ） ----------
  const cats = [...new Set([...Object.keys(CATEGORY), ...APPS.map((a) => a.category)])]
    .filter((c) => APPS.some((a) => a.category === c));
  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get('q') || '',
    cat: params.get('c') || store.get(KEY.filter) || 'all',
    tag: params.get('tag') || '',
    sort: params.get('sort') || store.get(KEY.sort) || 'new',
  };
  if (state.cat !== 'all' && !cats.includes(state.cat)) state.cat = 'all';
  if (!['new', 'name'].includes(state.sort)) state.sort = 'new';

  const grid = $('grid');
  const filter = $('filter');
  const qInput = $('q');
  const sortSel = $('sort');

  const filterBtns = ['all', ...cats].map((c) => {
    const b = el('button');
    b.type = 'button';
    b.dataset.filter = c;
    const n = c === 'all' ? APPS.length : APPS.filter((a) => a.category === c).length;
    b.append(document.createTextNode(c === 'all' ? 'すべて' : catLabel(c)), el('span', 'filter__n', String(n)));
    b.addEventListener('click', () => { state.cat = c; update(); });
    filter.append(b);
    return b;
  });

  function matches(app) {
    if (state.cat !== 'all' && app.category !== state.cat) return false;
    if (state.tag && !(app.tags || []).includes(state.tag)) return false;
    const words = state.q.split(/\s+/).map(norm).filter(Boolean);
    const h = haystack.get(app.id);
    return words.every((w) => h.includes(w));
  }

  const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
  function update({ push = true } = {}) {
    let list = APPS.filter(matches);
    if (state.sort === 'name') list = [...list].sort((a, b) => collator.compare(a.name, b.name));
    grid.replaceChildren(...list.map((a) => cards.get(a.id)));

    filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === state.cat)));
    if (qInput.value !== state.q) qInput.value = state.q;
    sortSel.value = state.sort;

    const status = $('status');
    status.replaceChildren(el('span', 'status__n', `${list.length} 本`));
    if (state.tag) {
      const chip = el('button', 'tag tag--active', `${state.tag} ✕`);
      chip.type = 'button';
      chip.setAttribute('aria-label', `タグ「${state.tag}」の絞り込みを外す`);
      chip.addEventListener('click', () => { state.tag = ''; update(); });
      status.append(chip);
    }
    const filtered = state.q || state.tag || state.cat !== 'all';
    if (filtered) {
      const clear = el('button', 'linklike', '条件をクリア');
      clear.type = 'button';
      clear.dataset.clear = '';
      status.append(clear);
    }
    $('empty').hidden = list.length > 0;

    store.set(KEY.filter, state.cat);
    store.set(KEY.sort, state.sort);
    if (push) {
      const p = new URLSearchParams();
      if (state.q) p.set('q', state.q);
      if (state.cat !== 'all') p.set('c', state.cat);
      if (state.tag) p.set('tag', state.tag);
      if (state.sort !== 'new') p.set('sort', state.sort);
      const qs = p.toString();
      history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
    }
  }

  function clearAll() {
    Object.assign(state, { q: '', cat: 'all', tag: '' });
    update();
  }

  let typing;
  qInput.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => { state.q = qInput.value.trim(); update(); }, 120);
  });
  qInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && qInput.value) { e.preventDefault(); qInput.value = ''; state.q = ''; update(); }
    if (e.key === 'Enter') qInput.blur();   // スマホのキーボードを閉じて結果を見せる
  });
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; update(); });

  // タグ・種類のボタンは、そのまま絞り込みになる
  function toApps() {
    const top = $('toolbar').getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.6) $('apps').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }
  grid.addEventListener('click', (e) => {
    const t = e.target.closest('button[data-tag], button[data-cat]');
    if (!t) return;
    if (t.dataset.tag) state.tag = state.tag === t.dataset.tag ? '' : t.dataset.tag;
    else state.cat = t.dataset.cat;
    update();
    toApps();
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) { clearAll(); qInput.focus(); } });

  // 「/」で検索へ（入力中は除く）
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    toApps();
    qInput.focus({ preventScroll: true });
  });

  // ---------- 最近開いた（このポータルから開いたアプリ。端末の中だけ） ----------
  function readRecent() {
    try {
      const ids = JSON.parse(store.get(KEY.recent) || '[]');
      return Array.isArray(ids) ? ids.filter((id) => cards.has(id)) : [];
    } catch { return []; }
  }
  function renderRecent() {
    const ids = readRecent();
    $('recent').hidden = ids.length === 0;
    $('recent-list').replaceChildren(...ids.map((id) => {
      const app = APPS.find((a) => a.id === id);
      const li = el('li');
      const a = appLink(app, 'recent__item');
      paint(a, app);
      a.append(iconImg(app, 48), el('span', 'recent__name', app.name));
      li.append(a);
      return li;
    }));
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-app]');
    if (!a) return;
    const ids = [a.dataset.app, ...readRecent().filter((id) => id !== a.dataset.app)].slice(0, RECENT_MAX);
    store.set(KEY.recent, JSON.stringify(ids));
  });
  $('recent-clear').addEventListener('click', () => { store.del(KEY.recent); renderRecent(); });
  // 戻るボタンでキャッシュから戻ったとき（bfcache）も最新にする
  addEventListener('pageshow', (e) => { if (e.persisted) renderRecent(); });

  // ---------- 新着（apps.js の先頭から） ----------
  function feature(app, i) {
    const li = el('li', 'feature');
    paint(li, app);
    const a = appLink(app, 'feature__link');
    const art = el('span', 'feature__art');
    const og = ogOf(app);
    if (og) {
      const img = new Image(1200, 630);
      img.src = og;
      img.alt = '';
      img.loading = i === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.onerror = () => { img.remove(); art.classList.add('feature__art--icon'); art.append(iconImg(app, 96)); };
      art.append(img);
    } else {
      art.classList.add('feature__art--icon');
      art.append(iconImg(app, 96));
    }
    const text = el('span', 'feature__text');
    text.append(el('span', 'feature__name', app.name), el('span', 'feature__title', app.title));
    const meta = el('span', 'feature__meta');
    meta.append(el('span', 'tag', catLabel(app.category)));
    if (i === 0) meta.prepend(el('span', 'badge', 'NEW'));
    text.append(meta);
    a.append(art, text);
    li.append(a);
    return li;
  }
  $('features').replaceChildren(...APPS.slice(0, NEW_COUNT).map(feature));
  $('new').hidden = APPS.length === 0;

  // ---------- アイコンの帯（全アプリ。アプリが増えれば帯も伸びる） ----------
  function marquee() {
    const box = $('marquee');
    if (APPS.length < 4) { box.hidden = true; return; }
    const rows = [APPS.filter((_, i) => i % 2 === 0), APPS.filter((_, i) => i % 2 === 1)];
    rows.forEach((row, r) => {
      // 画面より短いと途切れるので、少ないうちは繰り返して長さを足す
      const set = [];
      while (set.length < 16) set.push(...row);
      const track = el('div', `marquee__track${r ? ' marquee__track--rev' : ''}`);
      track.style.setProperty('--dur', `${set.length * 3}s`);
      [...set, ...set].forEach((app) => {
        const a = appLink(app, 'marquee__item');
        a.tabIndex = -1;
        a.title = app.name;
        paint(a, app);
        a.append(iconImg(app, 64));
        track.append(a);
      });
      box.append(track);
    });
  }

  // ---------- 数字・おまかせ ----------
  function stats() {
    $('hero-count').textContent = `· ${APPS.length} APPS`;
    const items = [[APPS.length, '本のアプリ'], ...cats.map((c) => [APPS.filter((a) => a.category === c).length, catLabel(c)])];
    $('stats').replaceChildren(...items.map(([n, label]) => {
      const li = el('li');
      li.append(el('b', null, String(n)), el('span', null, label));
      return li;
    }));
  }
  $('lucky').hidden = APPS.length === 0;
  $('lucky').addEventListener('click', () => {
    const pool = APPS.filter(matches).length ? APPS.filter(matches) : APPS;
    const app = pool[Math.floor(Math.random() * pool.length)];
    const ids = [app.id, ...readRecent().filter((id) => id !== app.id)].slice(0, RECENT_MAX);
    store.set(KEY.recent, JSON.stringify(ids));
    location.href = hrefOf(app);
  });

  // ---------- 検索エンジン向けの一覧（構造化データ） ----------
  function jsonLd() {
    const s = el('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'T.OF... のゲームとアプリ',
      itemListElement: APPS.map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': a.category === 'game' ? 'VideoGame' : 'WebApplication',
          name: a.name,
          description: a.desc,
          url: new URL(hrefOf(a), 'https://t-of.github.io/').href,
          image: new URL(a.icon, 'https://t-of.github.io/').href,
          applicationCategory: a.category === 'game' ? 'GameApplication' : 'UtilitiesApplication',
          operatingSystem: 'Web',
        },
      })),
    });
    document.head.append(s);
  }

  stats();
  marquee();
  renderRecent();
  update({ push: false });
  jsonLd();
  // 絞り込み付きの URL で来たら、一覧から見せる
  if (location.search && !location.hash) $('apps').scrollIntoView();

  $('year').textContent = new Date().getFullYear();
  if (window.WebAppKit) WebAppKit.init({ title: 'T.OF...', text: 'T.OF... のゲームとアプリ' });
})();
