"""ポータルのアイコンと OGP 画像を作る。  python3 tools/make-icons.py
Pillow が必要。マークの形は icons/icon.svg と同じ（512 マスの座標）。"""
import io, os, urllib.request
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG, FG, ACCENT = (11, 12, 16), (236, 238, 243), (255, 211, 92)
JP_BOLD = '/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc'
JP = '/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc'


def mark(size, rounded=False, bg=BG):
    s = 4  # 大きく描いて縮めると縁がなめらかになる
    n = size * s
    k = n / 512
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle((0, 0, n - 1, n - 1), radius=112 * k, fill=bg)
    else:
        d.rectangle((0, 0, n, n), fill=bg)
    d.rounded_rectangle((120 * k, 124 * k, 392 * k, 196 * k), radius=10 * k, fill=FG)   # T の横棒
    d.rounded_rectangle((200 * k, 124 * k, 272 * k, 392 * k), radius=10 * k, fill=FG)   # T の縦棒
    d.ellipse((310 * k, 320 * k, 382 * k, 392 * k), fill=ACCENT)                        # ドット
    return im.resize((size, size), Image.LANCZOS)


def save(im, name):
    im.save(os.path.join(ROOT, 'icons', name))


save(mark(512), 'icon-512.png')
save(mark(192), 'icon-192.png')
save(mark(180).convert('RGB'), 'apple-touch-icon.png')
save(mark(32, rounded=True), 'favicon-32.png')

# OGP 画像 1200×630: 左にマークと名前、右に各アプリのアイコン
og = Image.new('RGB', (1200, 630), BG)
d = ImageDraw.Draw(og)
m0 = mark(120, rounded=True, bg=(26, 29, 37))
og.paste(m0, (80, 90), m0)
d.text((80, 250), 'T.OFO', font=ImageFont.truetype(JP_BOLD, 96), fill=FG)
d.text((84, 380), 'ブラウザで遊べる、小さなゲームとアプリ。', font=ImageFont.truetype(JP_BOLD, 34), fill=FG)
d.text((84, 440), '無料・インストール不要・オフライン対応', font=ImageFont.truetype(JP, 28), fill=(154, 160, 171))
d.rectangle((84, 520, 164, 526), fill=ACCENT)

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
        raw = urllib.request.urlopen('https://sora3141.github.io' + path, timeout=10).read()
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
