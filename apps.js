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
    id: 'yurazumi',
    name: 'ゆらづみ',
    title: '木と石と氷を積むタワー',
    desc: '木・石・氷のブロックを落として、土台の上に高く積み上げる。材質で重さとすべりやすさが違い、物理でゆれて崩れる。',
    category: 'game',
    tags: ['アクション', '物理'],
    icon: '/yurazumi/icons/icon-192.png',
    color: '#d9a066',
  },
  {
    id: 'kadotsugi',
    name: 'カドツギ',
    title: '角だけでつなぐ陣取り',
    desc: 'ブロックを角と角だけでつないで広げていく、CPU とのふたり陣取り。相手より多くのマスを盤に置けたら勝ち。',
    category: 'game',
    tags: ['ボードゲーム', '陣取り'],
    icon: '/kadotsugi/icons/icon-192.png',
    color: '#2cc7b0',
  },
  {
    id: 'cube-othello',
    name: 'キューブ・オセロ',
    title: '立方体の6面で遊ぶオセロ',
    desc: '立方体の 6 つの面すべてが盤面のオセロ。縦横の列は辺を越えて隣の面へつながる。CPU 対戦・ふたり対戦。',
    category: 'game',
    tags: ['ボードゲーム', '3D'],
    icon: '/cube-othello/icons/icon-192.png',
    color: '#36a075',
  },
  {
    id: 'score-othello',
    name: '点数オセロ',
    title: '石に点数がついたオセロ',
    desc: '石の一つひとつに点数がついたオセロ。石の数ではなく点の合計で勝負する。CPU 対戦・ふたり対戦。',
    category: 'game',
    tags: ['ボードゲーム', 'オセロ'],
    icon: '/score-othello/icons/icon-192.png',
    color: '#f2c66d',
  },
  {
    id: 'insider',
    name: 'ワケシリ',
    title: '1台で遊ぶ会話と推理',
    desc: '1 台の端末を回して遊ぶ、4〜8 人の会話ゲーム。お題当てと、答えを知る者探しをアプリが進行する。',
    category: 'game',
    tags: ['パーティー', '推理'],
    icon: '/insider/icons/icon-192.png',
    color: '#ff4d5e',
  },
  {
    id: 'pentris',
    name: 'QUINTILE',
    title: 'ペントミノ落ち物パズル',
    desc: '5 マスのブロック「ペントミノ」で遊ぶ落ち物パズル。スコアを狙う AI 付き。',
    category: 'game',
    tags: ['パズル', '落ち物'],
    icon: '/pentris/icons/icon-192.png',
    color: '#6a9bff',
  },
  {
    id: 'coord-maze',
    name: 'COORD MAZE',
    title: '座標迷路',
    desc: '2〜12 次元の格子迷路を、座標だけで解くパズル。タップだけで遊べる。',
    category: 'game',
    tags: ['パズル', '迷路'],
    icon: '/coord-maze/icons/icon-192.png',
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
    name: 'ABILITILE',
    title: '絵柄が能力になるパズル',
    desc: 'ブロックを押すと絵柄の効果が発動し、能力はブロックと一緒に動く。盤面を目標の柄に揃えるとクリア。',
    category: 'game',
    tags: ['パズル'],
    icon: '/glyph-shift/icons/icon-192.png',
    color: '#b3a2ff',
  },
  {
    id: 'hue-hunter',
    name: 'DELTA HUE',
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
