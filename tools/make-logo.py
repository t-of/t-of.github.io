"""T.OF... のロゴとアイコンを作る。  python3 tools/make-logo.py
Pillow が必要。

文字はフォントを使わず、四角・円・円環だけで組んでいる。どの環境でも同じ形になり、
SVG と PNG を同じ図形データから作れる。

作るもの
  logo/tof-wordmark.svg / .png            暗い背景用の文字ロゴ（背景なし）
  logo/tof-wordmark-light-bg.svg / .png   明るい背景用
  logo/tof-mark.svg / .png                アイコン（角丸の背景つき）
  logo/tof-mark-transparent.svg           アイコンの図柄だけ
  icons/icon.svg, icon-192/512.png, apple-touch-icon.png, favicon-32.png   サイトのアイコン
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = '#0b0c10'
DARK = {'fg': '#eceef3', 'accent': '#ffd35c'}     # 暗い背景の上
LIGHT = {'fg': '#111317', 'accent': '#e0a800'}    # 明るい背景の上

# ---------- 文字ロゴ（字の高さ = 100） ----------
# 図形は ('rect', x, y, w, h, 色) / ('circle', cx, cy, r, 色) / ('ring', cx, cy, r, 太さ, 色)
# 色は 'fg' か 'accent'
S = 22          # 線の太さ
WORD_W = 312    # 幅
WORD = [
    # T
    ('rect', 0, 0, 84, 22, 'fg'), ('rect', 31, 0, S, 100, 'fg'),
    # . （T の横棒の下にもぐらせる）
    ('circle', 75, 88, 12, 'accent'),
    # O
    ('ring', 147, 50, 51, S, 'fg'),
    # F
    ('rect', 212, 0, S, 100, 'fg'), ('rect', 212, 0, 68, 22, 'fg'), ('rect', 212, 41, 56, 20, 'fg'),
    # ... T の「.」と同じく F の腕の下にもぐらせ、右へ行くほど小さくして余韻を出す。下端はベースラインにそろえる
    ('circle', 252, 88, 12, 'accent'), ('circle', 281, 90.5, 9.5, 'accent'), ('circle', 305, 93, 7, 'accent'),
]

# ---------- アイコン（512 マス） ----------
# 絵柄は中央 80%（半径 204）に収まっているので、そのまま maskable にも使える
MARK = [
    ('rect', 92, 136, 252, 68, 'fg'), ('rect', 170, 136, 68, 256, 'fg'),
    ('circle', 282, 362, 30, 'accent'), ('circle', 348, 368, 24, 'accent'), ('circle', 402, 374, 18, 'accent'),
]


def svg_shapes(shapes, pal):
    out = []
    for s in shapes:
        kind, color = s[0], pal[s[-1]]
        if kind == 'rect':
            _, x, y, w, h, _ = s
            out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{color}"/>')
        elif kind == 'circle':
            _, cx, cy, r, _ = s
            out.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}"/>')
        else:
            _, cx, cy, r, t, _ = s
            out.append(f'<circle cx="{cx}" cy="{cy}" r="{r - t / 2}" fill="none" stroke="{color}" stroke-width="{t}"/>')
    return ''.join(out)


def png_shapes(shapes, pal, scale, size, offset=(0, 0), bg=None, radius=0):
    ss = 4  # 大きく描いて縮めると縁がなめらかになる
    k = scale * ss
    ox, oy = offset[0] * ss, offset[1] * ss
    W, H = size[0] * ss, size[1] * ss
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        d.rounded_rectangle((0, 0, W - 1, H - 1), radius=radius * ss, fill=bg)
    for s in shapes:
        kind = s[0]
        if kind == 'rect':
            _, x, y, w, h, c = s
            d.rectangle((ox + x * k, oy + y * k, ox + (x + w) * k, oy + (y + h) * k), fill=pal[c])
        elif kind == 'circle':
            _, cx, cy, r, c = s
            d.ellipse((ox + (cx - r) * k, oy + (cy - r) * k, ox + (cx + r) * k, oy + (cy + r) * k), fill=pal[c])
        else:
            _, cx, cy, r, t, c = s
            layer = Image.new('L', (W, H), 0)
            ld = ImageDraw.Draw(layer)
            ld.ellipse((ox + (cx - r) * k, oy + (cy - r) * k, ox + (cx + r) * k, oy + (cy + r) * k), fill=255)
            ri = r - t
            ld.ellipse((ox + (cx - ri) * k, oy + (cy - ri) * k, ox + (cx + ri) * k, oy + (cy + ri) * k), fill=0)
            im.paste(Image.new('RGBA', (W, H), pal[c]), (0, 0), layer)
    return im.resize(size, Image.LANCZOS)


def path(*p):
    return os.path.join(ROOT, *p)


def write(name, text):
    with open(path(name), 'w', encoding='utf-8') as f:
        f.write(text + '\n')


def wordmark_png(pal, width):
    pad = 0.06 * WORD_W
    scale = width / (WORD_W + 2 * pad)
    size = (width, round((100 + 2 * pad) * scale))
    return png_shapes(WORD, pal, scale, size, offset=(pad * scale, pad * scale))


def mark_png(size, rounded):
    return png_shapes(MARK, DARK, size / 512, (size, size), bg=BG, radius=112 * size / 512 if rounded else 0)


if __name__ == '__main__':
    os.makedirs(path('logo'), exist_ok=True)
    pad = 24
    vb = f'{-pad} {-pad} {WORD_W + 2 * pad} {100 + 2 * pad}'
    write('logo/tof-wordmark.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{svg_shapes(WORD, DARK)}</svg>')
    write('logo/tof-wordmark-light-bg.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{svg_shapes(WORD, LIGHT)}</svg>')
    mark = svg_shapes(MARK, DARK)
    write('logo/tof-mark-transparent.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{mark}</svg>')
    for name in ('logo/tof-mark.svg', 'icons/icon.svg'):
        write(name, f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="{BG}"/>{mark}</svg>')

    wordmark_png(DARK, 1200).save(path('logo/tof-wordmark.png'))
    wordmark_png(LIGHT, 1200).save(path('logo/tof-wordmark-light-bg.png'))
    mark_png(1024, rounded=True).save(path('logo/tof-mark.png'))
    mark_png(512, rounded=False).save(path('icons/icon-512.png'))
    mark_png(192, rounded=False).save(path('icons/icon-192.png'))
    mark_png(180, rounded=False).convert('RGB').save(path('icons/apple-touch-icon.png'))
    mark_png(32, rounded=True).save(path('icons/favicon-32.png'))
    print('ok')
