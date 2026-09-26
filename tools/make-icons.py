"""ポータルの OGP 画像（icons/og.png）を作る。  python3 tools/make-icons.py
先に tools/make-logo.py を実行して、ロゴとアイコンを作っておくこと（この中からも呼ぶ）。
Pillow が必要。右側には apps.js のアプリのアイコンを本番サイトから取ってきて並べる。"""
import io, os, runpy, urllib.request
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG, FG, ACCENT = (11, 12, 16), (236, 238, 243), (255, 211, 92)
JP_BOLD = '/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc'
JP = '/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc'

runpy.run_path(os.path.join(ROOT, 'tools', 'make-logo.py'), run_name='__main__')


def save(im, name):
    im.save(os.path.join(ROOT, 'icons', name))


# OGP 画像 1200×630: 左に文字ロゴと説明、右に各アプリのアイコン
og = Image.new('RGB', (1200, 630), BG)
d = ImageDraw.Draw(og)
word = Image.open(os.path.join(ROOT, 'logo', 'tof-wordmark.png'))
word = word.resize((round(word.width * 190 / word.height), 190), Image.LANCZOS)   # 高さでそろえる
og.paste(word, (58, 120), word)
d.text((84, 345), 'ブラウザで遊べる、小さなゲームとアプリ。', font=ImageFont.truetype(JP_BOLD, 34), fill=FG)
d.text((84, 405), '無料・インストール不要', font=ImageFont.truetype(JP, 28), fill=(154, 160, 171))
d.rectangle((84, 486, 164, 492), fill=ACCENT)

icons = []
with open(os.path.join(ROOT, 'apps.js'), encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line.startswith("icon: '"):
            icons.append(line.split("'")[1])
S, cell = 112, 128                      # 3×3 に並べる
x0, y0 = 1200 - 64 - 3 * cell + (cell - S), (630 - 3 * cell + (cell - S)) // 2
for i, path in enumerate(icons[:9]):
    try:
        raw = urllib.request.urlopen(path if path.startswith('http') else 'https://t-of.github.io' + path, timeout=10).read()
    except Exception as e:
        print('skip', path, e)
        continue
    ic = Image.open(io.BytesIO(raw)).convert('RGBA').resize((S, S), Image.LANCZOS)
    m = Image.new('L', (S * 4, S * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, S * 4 - 1, S * 4 - 1), radius=27 * 4, fill=255)
    m = m.resize((S, S), Image.LANCZOS)
    alpha = Image.composite(ic.getchannel('A'), Image.new('L', (S, S), 0), m)
    ic.putalpha(alpha)
    col, row = i % 3, i // 3
    og.paste(ic, (x0 + col * cell, y0 + row * cell), ic)
save(og, 'og.png')
print('ok')
