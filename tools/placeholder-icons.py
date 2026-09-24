"""仮のアイコン一式を作る（頭文字 1 文字）。本番のアイコンができたら差し替える。
   python3 placeholder-icons.py <出力フォルダ> <名前> [背景色]"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

out, name = sys.argv[1], sys.argv[2]
bg = sys.argv[3] if len(sys.argv) > 3 else '#0b0c10'
os.makedirs(out, exist_ok=True)
letter = name.strip()[:1].upper() or '?'
FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc'


def icon(size, scale=0.56):
    im = Image.new('RGB', (size, size), bg)
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, int(size * scale))
    d.text((size / 2, size / 2), letter, font=f, fill='#eceef3', anchor='mm')
    return im


icon(512).save(os.path.join(out, 'icon-512.png'))
icon(192).save(os.path.join(out, 'icon-192.png'))
icon(512, 0.4).save(os.path.join(out, 'maskable-512.png'))   # 中央 80% に収める
icon(180).save(os.path.join(out, 'apple-touch-icon.png'))
icon(32, 0.7).save(os.path.join(out, 'favicon-32.png'))
with open(os.path.join(out, 'icon.svg'), 'w', encoding='utf-8') as f:
    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="{bg}"/>'
            f'<text x="256" y="256" dy=".35em" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="280" fill="#eceef3">{letter}</text></svg>\n')

og = Image.new('RGB', (1200, 630), bg)
d = ImageDraw.Draw(og)
d.text((600, 300), name, font=ImageFont.truetype(FONT, 110), fill='#eceef3', anchor='mm')
d.text((600, 420), 'T.OFO', font=ImageFont.truetype(FONT, 32), fill='#9aa0ab', anchor='mm')
og.save(os.path.join(out, 'og.png'))
