/*!
 * webapp-kit — Web アプリ共通の「アプリにする」「共有」まわり
 *
 * 使い方（詳細は README.md）:
 *   <link rel="stylesheet" href="webapp-kit/webapp-kit.css">
 *   <script src="webapp-kit/webapp-kit.js"></script>
 *   <button data-wak="install">アプリにする</button>   ← インストールできないときは自動で隠れる
 *   <button data-wak="share">共有</button>
 *   WebAppKit.share({ text: '…' })                       ← JS から呼ぶ場合
 *
 * 言語（詳細は README.md）:
 *   WebAppKit.init({ lang: 'en' })                       ← 明示指定。省略時は <html lang> → navigator.language の順に判定
 *   WebAppKit.init({ strings: { copied: '…' } })         ← 文言の上書き
 */
(function () {
  'use strict';

  const ua = navigator.userAgent;
  const isIOS = /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isInApp = /Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger/i.test(ua);
  const isMacSafari = !isIOS && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);

  let deferredPrompt = null;
  let installed = false;
  const listeners = new Set();

  // 画面に出す文言。ja / en の 2 言語ぶん。キーの一覧は README.md 参照
  const STRINGS = {
    ja: {
      copied: 'リンクをコピーしました',
      guideTitle: 'ホーム画面に追加',
      close: '閉じる',
      guideInAppNotice: 'このアプリ内のブラウザからは追加できません。',
      guideInAppMenu: 'メニューから「Safari で開く」（または「ブラウザで開く」）を選んでください。',
      guideMacSafari: 'メニューバーの「ファイル」→「Dock に追加…」を選んでください。',
      guideShare: '画面の<b>共有ボタン</b>をタップします（見当たらないときは「…」メニューの中にあります）。',
      guideAdd: '一覧から<b>「ホーム画面に追加」</b>を選びます。',
      guideFinish: '右上の<b>「追加」</b>をタップすると、ホーム画面からアプリとして開けます。',
    },
    en: {
      copied: 'Link copied',
      guideTitle: 'Add to Home Screen',
      close: 'Close',
      guideInAppNotice: "You can't add this from an in-app browser.",
      guideInAppMenu: 'Choose "Open in Safari" (or "Open in Browser") from the menu.',
      guideMacSafari: 'Choose File → "Add to Dock…" from the menu bar.',
      guideShare: 'Tap the <b>Share</b> button (if you don’t see it, look in the "…" menu).',
      guideAdd: 'Choose <b>"Add to Home Screen"</b> from the list.',
      guideFinish: 'Tap <b>"Add"</b> in the top right to open it as an app from your Home Screen.',
    },
  };

  function detectLang() {
    if (config.lang) return config.lang;
    const htmlLang = (document.documentElement.lang || '').toLowerCase();
    if (htmlLang.indexOf('en') === 0) return 'en';
    if (htmlLang.indexOf('ja') === 0) return 'ja';
    const navLang = (navigator.language || '').toLowerCase();
    return navLang.indexOf('ja') === 0 ? 'ja' : 'en';
  }

  // 文言を 1 つ取る（strings で上書きされていればそれ、なければ言語ごとの既定値）
  function t(key) {
    if (config.strings && key in config.strings) return config.strings[key];
    return STRINGS[detectLang()][key];
  }

  const config = {
    title: document.title,
    text: '',
    url: null,             // 省略時は現在のページ（クエリ除く）
    lang: null,             // 省略時は <html lang> → navigator.language の順に判定
    strings: null,          // 文言の上書き（{ copied: '…' } など。キーは README.md 参照）
  };

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches
      || navigator.standalone === true;
  }

  // インストール手段があるか（ブラウザのインストール機能、または手順の案内）
  function canInstall() {
    if (installed || isStandalone()) return false;
    return !!deferredPrompt || isIOS || isMacSafari;
  }

  function notify() {
    refresh();
    listeners.forEach(fn => fn({ canInstall: canInstall(), standalone: isStandalone() }));
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', notify);

  async function install() {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      prompt.prompt();
      const choice = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
      if (choice.outcome === 'accepted') installed = true;
      notify();
      return choice.outcome;
    }
    if (isIOS || isMacSafari) {
      showGuide();
      return 'guide';
    }
    return 'unavailable';
  }

  function shareUrl() {
    return config.url || location.origin + location.pathname;
  }

  async function share(options = {}) {
    const data = {
      title: options.title ?? config.title,
      text: options.text ?? config.text,
      url: options.url ?? shareUrl(),
    };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
    const body = [data.text, data.url].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = body;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* 何もできない環境 */ }
      ta.remove();
    }
    toast(t('copied'));
    return 'copied';
  }

  // ---------- 表示部品 ----------
  const ICON_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M8 7.5l4-4 4 4M7 11H5.5v9.5h13V11H17"/></svg>';
  const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>';
  const ICON_MORE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/></svg>';

  function guideSteps() {
    if (isInApp) {
      return [
        ['', t('guideInAppNotice')],
        [ICON_MORE, t('guideInAppMenu')],
      ];
    }
    if (isMacSafari) {
      return [
        ['', t('guideMacSafari')],
      ];
    }
    return [
      [ICON_SHARE, t('guideShare')],
      [ICON_PLUS, t('guideAdd')],
      ['', t('guideFinish')],
    ];
  }

  function showGuide() {
    document.querySelector('.wak-guide')?.remove();
    const wrap = document.createElement('div');
    wrap.className = 'wak-guide';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `
      <div class="wak-sheet">
        <h2 class="wak-title">${t('guideTitle')}</h2>
        <ol class="wak-steps">
          ${guideSteps().map(([icon, text]) => `<li>${icon ? `<span class="wak-icon">${icon}</span>` : '<span class="wak-icon wak-dot"></span>'}<span>${text}</span></li>`).join('')}
        </ol>
        <button type="button" class="wak-close">${t('close')}</button>
      </div>`;
    const close = () => {
      wrap.classList.remove('wak-open');
      setTimeout(() => wrap.remove(), 250);
    };
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('.wak-close')) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('wak-open'));
    wrap.querySelector('.wak-close').focus();
  }

  let toastTimer = 0;
  function toast(message) {
    let el = document.querySelector('.wak-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'wak-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('wak-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('wak-open'), 2200);
  }

  // ---------- data-wak 属性のボタン ----------
  function refresh() {
    const show = canInstall();
    document.querySelectorAll('[data-wak="install"]').forEach(el => { el.hidden = !show; });
    document.documentElement.classList.toggle('wak-standalone', isStandalone());
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-wak]');
    if (!el) return;
    if (el.dataset.wak === 'install') install();
    else if (el.dataset.wak === 'share') share({ text: el.dataset.wakText || undefined });
  });

  function init(options = {}) {
    Object.assign(config, options, { strings: { ...config.strings, ...(options.strings || {}) } });
    refresh();
    return api;
  }

  const api = {
    init,
    install,
    share,
    canInstall,
    isStandalone,
    lang: detectLang,
    toast,
    showGuide,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    platform: { isIOS, isAndroid, isInApp, isMacSafari },
  };

  window.WebAppKit = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
