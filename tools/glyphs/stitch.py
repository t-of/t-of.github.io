#!/usr/bin/env python3
"""SHORT MATH 文字コレクション stitch（刺しゅう枠の麻布に糸で縫った文字）。
python3 tools/glyphs/stitch.py -> apps/four-digits/glyphs/stitch.svg"""
import os
OUT = os.path.expanduser('~/GitHub/tof/apps/four-digits/glyphs/stitch.svg')
G = {
 '0': ['M57 24 C67 25 70 38 70 50 C70 62 66 76 50 76 C34 76 30 62 30 50 C30 38 34 24 43 24'],
 '1': ['M39 37 L52 24 L52 76'],
 '2': ['M32 36 C34 26 44 24 50 24 C62 24 68 32 66 40 C64 50 32 66 30 76 L70 76'],
 '3': ['M32 30 C40 22 66 22 66 36 C66 46 54 50 46 50 C58 50 70 54 70 64 C70 78 40 80 30 70'],
 '4': ['M58 76 L58 24 L30 60 L72 60'],
 '5': ['M68 24 L36 24 L33 48 C44 42 70 44 70 62 C70 78 42 80 30 70'],
 '6': ['M64 28 C52 18 32 28 32 58 C32 82 70 82 70 62 C70 44 44 42 33 56'],
 '7': ['M30 24 L70 24 L44 76'],
 '8': ['M57 24 C36 24 34 44 50 50 C66 56 66 76 50 76 C34 76 34 56 50 50 C66 44 64 24 43 24'],
 '9': ['M36 72 C48 82 68 72 68 42 C68 18 30 18 30 38 C30 56 56 58 67 44'],
 'add': ['M30 50 L70 50', 'M50 30 L50 70'],
 'sub': ['M28 50 L72 50'],
 'mul': ['M33 33 L67 67', 'M67 33 L33 67'],
 'div': ['M28 50 L72 50', 'M50 28 L50 29', 'M50 71 L50 72'],
 'lp': ['M60 20 C40 34 40 66 60 80'],
 'rp': ['M40 20 C60 34 60 66 40 80'],
 'pow': ['M28 62 L50 30 L72 62'],
 'sqrt': ['M24 54 L33 49 L43 76 L58 24 L78 24'],
 'fact': ['M50 22 L50 59', 'M50 73 L50 74'],
 'dot': ['M46.5 69 a3.5 3.5 0 1 0 7 0 a3.5 3.5 0 1 0 -7 0'],  # 小さい表示で読めるよう、点だけ太らせる
}
RARE = {'pow', 'sqrt', 'fact', 'dot'}
ORDER = ['0','1','2','3','4','5','6','7','8','9','add','sub','mul','div','lp','rp','pow','sqrt','fact','dot']

# 糸の色: (縁取り, 筋の色 5 本)
THREADS = {
 'r': ('#5c1018', ['#d2303c', '#ef6a6e', '#b81f2e', '#8f1424', '#e24850']),
 'b': ('#101f4f', ['#2e4aa6', '#5a78d0', '#223a8a', '#16286a', '#4562bf']),
 'g': ('#5a3a06', ['#e0b030', '#fff0a0', '#c48a14', '#8a5a0c', '#f6d460']),
}
def pat(k):
    cols = THREADS[k][1]
    rs = ''.join(f'<rect x="{i*1.9:.1f}" width="2" height="10" fill="{c}"/>' for i, c in enumerate(cols))
    return f'<pattern id="stitch-t{k}" width="9.5" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(52)">{rs}</pattern>'

defs = f'''<defs>
<linearGradient id="stitch-cloth" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eadbb8"/><stop offset="1" stop-color="#d4bf92"/></linearGradient>
<radialGradient id="stitch-vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#6b5226" stop-opacity="0"/><stop offset="1" stop-color="#6b5226" stop-opacity=".38"/></radialGradient>
<linearGradient id="stitch-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
<pattern id="stitch-weave" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><rect width="2.4" height="1.2" fill="#8a6c34" opacity=".16"/><rect width="1.2" height="2.4" fill="#fff" opacity=".18"/><rect x="1.2" y="1.2" width="1.2" height="1.2" fill="#7a5c28" opacity=".12"/></pattern>
<radialGradient id="stitch-bead" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ffe37a"/><stop offset="1" stop-color="#b87c10"/></radialGradient>
{pat('r')}{pat('b')}{pat('g')}
</defs>'''

def sym(name):
    k = 'g' if name in RARE else ('r' if name.isdigit() else 'b')
    edge = THREADS[k][0]
    ps = ''.join(f'<path d="{d}"/>' for d in G[name])
    ps = ps.replace('L50 71"', 'L50 71.1"')
    board = ('<rect width="100" height="100" rx="14" fill="url(#stitch-cloth)"/>'
      '<rect width="100" height="100" rx="14" fill="url(#stitch-weave)"/>'
      '<rect width="100" height="100" rx="14" fill="url(#stitch-vig)"/>'
      '<path d="M0 14Q0 0 14 0H62L0 62Z" fill="url(#stitch-sheen)"/>'
      '<rect x=".75" y=".75" width="98.5" height="98.5" rx="13.3" fill="none" stroke="#7a5c28" stroke-opacity=".55" stroke-width="1.5"/>')
    bc = '#c9961c' if k == 'g' else '#8a6a3a'
    board += (f'<rect x="6" y="6" width="88" height="88" rx="9" fill="none" stroke="#5a4020" stroke-opacity=".25" stroke-width="1.8" stroke-dasharray="5 4" transform="translate(.4 .7)"/>'
              f'<rect x="6" y="6" width="88" height="88" rx="9" fill="none" stroke="{bc}" stroke-width="1.7" stroke-dasharray="5 4" stroke-linecap="round"/>')
    mid = f'stitch-m-{name}'
    g = f'<g fill="none" stroke-linecap="round" stroke-linejoin="round">'
    shadow = f'{g}<g stroke="#3a2608" stroke-opacity=".32" stroke-width="13.5" transform="translate(.9 1.8)">{ps}</g>'
    outline = f'<g stroke="{edge}" stroke-width="15">{ps}</g>'
    mask = f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#fff" stroke-width="11.6">{ps}</g></mask>'
    fill = f'</g><rect width="100" height="100" fill="url(#stitch-t{k})" mask="url(#{mid})"/>'
    hi = f'{g}<g stroke="#fff" stroke-opacity="{.28 if k=="g" else .16}" stroke-width="1.5" transform="translate(-1.6 -1.8)">{ps}</g></g>'
    extra = ''
    if k == 'g':
        spots = [(15,17,3.1,0),(86,21,2.5,.9),(15,83,2.4,1.7),(86,81,3.2,.4)]
        for x,y,r,dl in spots:
            extra += (f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#stitch-bead)" stroke="#6a4408" stroke-width=".5"/>'
              f'<circle cx="{x-r*.3:.1f}" cy="{y-r*.35:.1f}" r="{r*.38:.1f}" fill="#fff"><animate attributeName="opacity" values="1;.25;1" dur="2.4s" begin="{dl}s" repeatCount="indefinite"/></circle>')
    return f'<symbol id="stitch-{name}" viewBox="0 0 100 100">{mask}{board}{shadow}{outline}</g>{fill[4:]}{hi}{extra}</symbol>'

out = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute">\n' + defs + '\n' + '\n'.join(sym(n) for n in ORDER) + '\n</svg>\n'
open(OUT, 'w').write(out)
print(OUT, len(out))
