// デモのポータル（/demo/）を、本物の index.html から作り直す。
//   node tools/make-demo.mjs
// 見た目・動き・一覧（main.js・style.css・apps.js）は本物と同じで、approved の付いていないアプリも出す。
// index.html を直したら、これを流して demo/index.html を合わせる。
import fs from 'node:fs';
import path from 'node:path';

const HUB = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
let html = fs.readFileSync(path.join(HUB, 'index.html'), 'utf8');

html = html
  .replace(/  <script>\/\* sora3141[\s\S]*?<\/script>\n/, '')          // 引っ越しの受け取りは本物だけ
  .replace(/  <link rel="(canonical|manifest)"[^>]*>\n/g, '')          // ホーム画面のアプリは本物だけ
  .replace(/  <meta (property="og:|name="twitter:)[^>]*>\n/g, '')
  .replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n  <meta name="robots" content="noindex">')
  .replace(/<title>[^<]*<\/title>/, '<title>T.OF... DEMO</title>')
  .replace(/(href|src)="\.\//g, '$1="../')
  .replace('<a class="brand" href="../">', '<a class="brand" href="./">')
  .replace('<script src="../apps.js">', '<script>window.TOFO_DEMO = true;</script>\n  <script src="../apps.js">')
  .replace('<p class="hero__eyebrow">T.OF... ', '<p class="hero__eyebrow">T.OF... DEMO ')
  .replace(/<h1 id="hero-title" class="hero__title">[\s\S]*?<\/h1>/,
    '<h1 id="hero-title" class="hero__title">試作中のアプリ。</h1>');

fs.mkdirSync(path.join(HUB, 'demo'), { recursive: true });
fs.writeFileSync(path.join(HUB, 'demo/index.html'), html);
console.log('demo/index.html を作りました');
