'use strict';

// localStorage はほかのアプリと共有される（同じ sora3141.github.io のため）。
// キーは必ず '__ID__.' で始める。
const STORE = '__ID__.';

function load(key, fallback) {
  try {
    const v = localStorage.getItem(STORE + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ }
}

WebAppKit.init({ title: '__NAME__', text: '__DESC__' });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js');
}

// ---- ここからアプリ本体 ----
