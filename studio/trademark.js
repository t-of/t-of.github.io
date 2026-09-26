// 商標チェック — オーナーが手で引くための一覧。自動検索・自動取得はしない（J-PlatPat の規約）。
// リンクの作り方はここにまとめる。検索先が増えたり URL が変わったら、ここだけ直せばよい。
const OFFICES = [
  // jp: 語をコピーして J-PlatPat（称呼検索）を開く。URL に語を渡せないため
  { id: 'jplatpat', label: 'J-PlatPat', words: 'jp', first: true, url: () => 'https://www.j-platpat.inpit.go.jp/t0100', copyOnly: true },
  { id: 'uspto', label: 'USPTO', words: 'en', first: true, url: (w) => `https://tmsearch.uspto.gov/search/search-results?query=${encodeURIComponent(w)}` },
  { id: 'euipo', label: 'EUIPO', words: 'en', url: (w) => `https://euipo.europa.eu/eSearch/#basic/1+1+1+1/100+100+100+100/${encodeURIComponent(w)}` },
  { id: 'tmview', label: 'TMview', words: 'en', url: (w) => `https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=${encodeURIComponent(w)}` },
  { id: 'wipo', label: 'WIPO Brand DB', words: 'en', url: () => 'https://branddb.wipo.int/en/similarname', copyOnly: true },
];

const STATUS_LABEL = { '': '未', none: 'なし', similar: '似たものあり', same: '同じものあり' };

let data = { names: [], results: {} };

async function load() {
  data = await fetch('/api/trademark').then((r) => r.json());
  render();
}

async function saveResult(key, status, note) {
  data = await fetch('/api/trademark/result', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, status, note }),
  }).then((r) => r.json());
}

function rowsFor(name) {
  const out = [];
  for (const office of OFFICES) {
    const words = office.words === 'jp' ? name.jp : name.en;
    // まず引くのは first の検索先の 1 語目だけ。称呼（類似検索）が読みの揺れを拾うので、残りは似たものが出たときに引く
    (words || []).forEach((w, i) => out.push({ office, word: w, first: office.first && i === 0 }));
  }
  return out;
}

function render() {
  const cards = document.getElementById('cards');
  cards.innerHTML = '';
  // 引き終わった名前（checked に日付がある）は出さない。記録は trademark.json に残る
  const done = data.names.filter((n) => n.checked);
  document.getElementById('done-count').textContent = done.length ? `引き終わった名前 ${done.length} 件（${done.map((n) => n.name).join('・')}）は一覧から外しています。` : '';
  for (const name of data.names.filter((n) => !n.checked)) {
    const rows = rowsFor(name);
    const done = rows.filter((r) => data.results[`${name.id}|${r.office.id}|${r.word}`]?.status).length;
    const flags = rows.map((r) => data.results[`${name.id}|${r.office.id}|${r.word}`]?.status).filter(Boolean);
    const firsts = rows.filter((r) => r.first);
    const firstDone = firsts.filter((r) => data.results[`${name.id}|${r.office.id}|${r.word}`]?.status).length;
    const worst = flags.includes('same') ? 'same' : flags.includes('similar') ? 'similar' : '';

    const card = document.createElement('section');
    card.className = 'panel tm-card';
    const head = document.createElement('div');
    head.className = 'tm-card__head';
    head.innerHTML = `<h2>${name.name}</h2><span class="muted">まず ${firstDone}/${firsts.length}・全部 ${done}/${rows.length} 済み</span>` +
      (name.classes ? `<span class="muted">区分 ${name.classes}</span>` : '') +
      (worst ? `<span class="tm-flag tm-flag--${worst}">${STATUS_LABEL[worst]}</span>` : '');
    card.appendChild(head);

    for (const { office, word, first } of rows) {
      const key = `${name.id}|${office.id}|${word}`;
      const result = data.results[key] || {};
      const row = document.createElement('div');
      row.className = `tm-row${result.status === 'same' ? ' is-same' : result.status === 'similar' ? ' is-similar' : ''}`;

      const officeEl = document.createElement('span');
      officeEl.className = 'tm-row__office';
      officeEl.textContent = office.label;

      const wordEl = document.createElement('span');
      wordEl.className = 'tm-row__word';
      wordEl.textContent = first ? `★ ${word}` : word;

      const openBtn = document.createElement('button');
      openBtn.className = 'btn btn--ghost';
      openBtn.type = 'button';
      openBtn.textContent = '開く';
      openBtn.addEventListener('click', () => window.open(office.url(word), '_blank', 'noopener'));

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn--ghost';
      copyBtn.type = 'button';
      copyBtn.textContent = 'コピー';
      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(word);
        copyBtn.textContent = 'コピー済み';
        setTimeout(() => { copyBtn.textContent = 'コピー'; }, 1200);
      });

      const select = document.createElement('select');
      for (const [v, label] of Object.entries(STATUS_LABEL)) {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = label;
        if ((result.status || '') === v) opt.selected = true;
        select.appendChild(opt);
      }

      const note = document.createElement('input');
      note.type = 'text';
      note.placeholder = first ? '結果の一覧を貼る' : 'メモ';
      note.value = result.note || '';

      const dateEl = document.createElement('span');
      dateEl.className = 'tm-row__date';
      dateEl.textContent = result.date || '';

      const commit = async () => {
        await saveResult(key, select.value, note.value);
        dateEl.textContent = data.results[key]?.date || '';
        row.className = `tm-row${select.value === 'same' ? ' is-same' : select.value === 'similar' ? ' is-similar' : ''}`;
        render();
      };
      select.addEventListener('change', commit);
      note.addEventListener('change', commit);

      row.append(officeEl, wordEl, openBtn, copyBtn, select, note, dateEl);
      card.appendChild(row);
    }
    cards.appendChild(card);
  }
}

load();
