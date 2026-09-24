// apps.js の一覧からカードを組み立てる。
(function () {
  'use strict';

  const apps = window.TOFO_APPS || [];
  const grid = document.getElementById('grid');
  const count = document.getElementById('count');
  const tabs = document.querySelectorAll('.filter [data-filter]');
  const CATEGORY = { game: 'ゲーム', tool: '学び・ツール' };
  const FILTER_KEY = 'tofo.portal.filter';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function card(app) {
    const li = el('li', 'card');
    li.dataset.category = app.category;
    li.style.setProperty('--c', app.color || '#8a8f9c');

    const a = el('a', 'card__main');
    a.href = `/${app.id}/`;

    const icon = el('div', 'card__icon');
    const img = new Image(96, 96);
    img.src = app.icon;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => { icon.textContent = app.name.slice(0, 1); icon.classList.add('card__icon--text'); };
    icon.append(img);

    const text = el('div', 'card__text');
    const name = el('h3', 'card__name', app.name);
    const title = el('p', 'card__title', app.title);
    const desc = el('p', 'card__desc', app.desc);
    const tags = el('p', 'card__tags');
    [CATEGORY[app.category], ...(app.tags || [])].filter(Boolean).forEach(t => tags.append(el('span', 'tag', t)));
    text.append(name, title, desc, tags);

    a.append(icon, text);

    const actions = el('div', 'card__actions');
    const play = el('a', 'btn btn--play', app.category === 'game' ? '遊ぶ' : '開く');
    play.href = `/${app.id}/`;
    const src = el('a', 'btn btn--ghost', 'ソース');
    src.href = `https://github.com/Sora3141/${app.id}`;
    src.rel = 'noopener';
    actions.append(play, src);

    li.append(a, actions);
    return li;
  }

  function apply(filter) {
    let n = 0;
    grid.querySelectorAll('.card').forEach(c => {
      const show = filter === 'all' || c.dataset.category === filter;
      c.hidden = !show;
      if (show) n++;
    });
    count.textContent = n;
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.filter === filter)));
    try { localStorage.setItem(FILTER_KEY, filter); } catch { /* 保存できなくても表示はできる */ }
  }

  apps.forEach(app => grid.append(card(app)));
  tabs.forEach(t => t.addEventListener('click', () => apply(t.dataset.filter)));

  let saved = 'all';
  try { saved = localStorage.getItem(FILTER_KEY) || 'all'; } catch { /* 既定のまま */ }
  apply([...tabs].some(t => t.dataset.filter === saved) ? saved : 'all');

  document.getElementById('year').textContent = new Date().getFullYear();

  if (window.WebAppKit) WebAppKit.init({ title: 'T.OFO', text: 'T.OFO のゲームとアプリ' });
})();
