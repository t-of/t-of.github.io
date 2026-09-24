// ポータルに並べるアプリの一覧。新しいアプリを公開したら、ここに 1 件足すだけでよい。
//
//   id       : リポジトリ名（URL の /<id>/ と同じ）
//   name     : 短いアプリ名（manifest の short_name）
//   title    : 名前の後ろに付けるひとこと
//   desc     : 1〜2 文の説明
//   category : 'game'（ゲーム） / 'tool'（学び・ツール）
//   tags     : 小さく表示するラベル
//   icon     : 192px のアイコン（このサイトと同じオリジンなので /<id>/... で参照できる）
//   color    : アプリの theme_color（カードのアクセントに使う）
//
// 並び順がそのまま表示順。新しいものを上に足す。

window.TOFO_APPS = [
  {
    id: 'pentris',
    name: 'PENT!',
    title: 'ペントミノ落ち物パズル',
    desc: '5 マスのブロック「ペントミノ」で遊ぶ落ち物パズル。スコアを狙う AI 付き。',
    category: 'game',
    tags: ['パズル', '落ち物'],
    icon: '/pentris/icons/icon-192.png',
    color: '#2cc6e0',
  },
  {
    id: 'coord-maze',
    name: 'COORD MAZE',
    title: '座標迷路',
    desc: '2〜12 次元の格子迷路を、座標だけで解くパズル。タップだけで遊べる。',
    category: 'game',
    tags: ['パズル', '迷路'],
    icon: '/coord-maze/icon-192.png',
    color: '#9d7bff',
  },
  {
    id: 'gear-align',
    name: 'GEAR ALIGN',
    title: '歯車の向きを揃える',
    desc: '歯車を持ち上げて回し、合いマークの向きを全部揃えるパズル。全 80 コース。',
    category: 'game',
    tags: ['パズル'],
    icon: '/gear-align/icons/icon-192.png',
    color: '#d6a64c',
  },
  {
    id: 'Half-Cut',
    name: 'Half/Cut',
    title: 'ぴったり半分に切る',
    desc: '図形をスワイプ一本でぴったり半分に切るパズル。毎日 5 問のデイリーとエンドレス。',
    category: 'game',
    tags: ['パズル', 'デイリー'],
    icon: '/Half-Cut/icons/icon-192.png',
    color: '#e2582e',
  },
  {
    id: 'glyph-shift',
    name: 'Glyph Shift',
    title: '絵柄が能力になるパズル',
    desc: 'ブロックを押すと絵柄の効果が発動し、能力はブロックと一緒に動く。盤面を目標の柄に揃えるとクリア。',
    category: 'game',
    tags: ['パズル'],
    icon: '/glyph-shift/icons/icon-192.png',
    color: '#b3a2ff',
  },
  {
    id: 'hue-hunter',
    name: 'Hue Hunter',
    title: '色相識別テスト',
    desc: '1 つだけ色相の違うマスを探して、見分けられる最小の色差を測る。',
    category: 'tool',
    tags: ['テスト', '色覚'],
    icon: '/hue-hunter/icons/icon-192.png',
    color: '#e24bc6',
  },
  {
    id: 'core-image-english',
    name: 'コアイメージ英語',
    title: '丸暗記しない英語',
    desc: '英単語・中学英文法・句動詞を、コアイメージの掛け算で理解する学習アプリ。',
    category: 'tool',
    tags: ['学習', '英語'],
    icon: '/core-image-english/icons/icon-192.png',
    color: '#d0662a',
  },
];
