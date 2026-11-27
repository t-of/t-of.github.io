#!/usr/bin/env python3
"""SHORT MATH 文字コレクション neon（夜の看板の管）。
python3 tools/glyphs/neon.py -> apps/four-digits/glyphs/neon.svg"""
import re, math, os
OUT = os.path.expanduser('~/GitHub/tof/apps/four-digits/glyphs/neon.svg')
PINK, CYAN, GOLD = '#ff4fa3', '#4fe3ff', '#ffcf5a'

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
 'dot': ['M50 71 L50 72'],
}
RARE = {'pow', 'sqrt', 'fact', 'dot'}
OPS = {'add','sub','mul','div','lp','rp','pow','sqrt','fact','dot'}

def parse(d):
    t = re.findall(r'[MLC]|-?\d+\.?\d*', d); i = 0; segs = []; cur = None
    while i < len(t):
        c = t[i]; i += 1
        n = {'M':2,'L':2,'C':6}[c]
        v = [float(x) for x in t[i:i+n]]; i += n
        while True:
            if c == 'M': cur = (v[0], v[1])
            elif c == 'L': segs.append((cur, cur, (v[0],v[1]), (v[0],v[1]))); cur = (v[0], v[1])
            else: segs.append((cur,(v[0],v[1]),(v[2],v[3]),(v[4],v[5]))); cur = (v[4], v[5])
            if i < len(t) and re.match(r'-?\d', t[i]):
                v = [float(x) for x in t[i:i+n]]; i += n; c = 'L' if c == 'M' else c
            else: break
    return segs
def pt(s, u):
    a,b,c,d = s; m = 1-u
    f = lambda k: m**3*a[k]+3*m*m*u*b[k]+3*m*u*u*c[k]+u**3*d[k]
    return f(0), f(1)
def sample(d, n=60):
    out = []
    for s in parse(d):
        for k in range(n): out.append(pt(s, k/n))
    out.append(pt(parse(d)[-1], 1)); return out
def at(pts, frac):
    L = [0]
    for a, b in zip(pts, pts[1:]): L.append(L[-1]+math.dist(a, b))
    tgt = L[-1]*frac
    for i in range(1, len(L)):
        if L[i] >= tgt:
            a, b = pts[i-1], pts[i]; return b, math.atan2(b[1]-a[1], b[0]-a[0])
    return pts[-1], 0

defs = f'''<defs>
<linearGradient id="neon-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#171c4c"/><stop offset=".55" stop-color="#0b0e30"/><stop offset="1" stop-color="#05061a"/></linearGradient>
<radialGradient id="neon-wp" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="{PINK}" stop-opacity=".34"/><stop offset=".6" stop-color="{PINK}" stop-opacity=".08"/><stop offset="1" stop-color="{PINK}" stop-opacity="0"/></radialGradient>
<radialGradient id="neon-wc" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="{CYAN}" stop-opacity=".32"/><stop offset=".6" stop-color="{CYAN}" stop-opacity=".08"/><stop offset="1" stop-color="{CYAN}" stop-opacity="0"/></radialGradient>
<radialGradient id="neon-wg" cx=".5" cy=".5" r=".62"><stop offset="0" stop-color="{CYAN}" stop-opacity=".38"/><stop offset=".5" stop-color="{GOLD}" stop-opacity=".12"/><stop offset="1" stop-color="{GOLD}" stop-opacity="0"/></radialGradient>
<linearGradient id="neon-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity=".03"/><stop offset=".36" stop-color="#fff" stop-opacity="0"/></linearGradient>
<pattern id="neon-brick" width="25" height="12.5" patternUnits="userSpaceOnUse"><path d="M0 .4H25M0 6.65H25M0 0V6.3M12.5 6.65V12.5" stroke="#000" stroke-opacity=".35" stroke-width=".8" fill="none"/><path d="M0 1H25M0 7.2H25" stroke="#8a93d8" stroke-opacity=".07" stroke-width=".6"/></pattern>
</defs>'''

def star(x, y, r, col, delay=0, anim=True):
    p = f'M{x} {y-r} Q{x} {y} {x+r} {y} Q{x} {y} {x} {y+r} Q{x} {y} {x-r} {y} Q{x} {y} {x} {y-r}Z'
    a = f'<animate attributeName="opacity" values="1;.35;1" dur="2.6s" begin="{delay}s" repeatCount="indefinite"/>' if anim else ''
    return f'<path d="{p}" fill="{col}">{a}</path>'

def symbol(name):
    op = name in OPS; rare = name in RARE
    col = CYAN if op else PINK
    dark = '#5a1a42' if not op else '#124a66'
    paths = G[name]
    wall = 'neon-wg' if rare else ('neon-wc' if op else 'neon-wp')
    s = [f'<symbol id="neon-{name}" viewBox="0 0 100 100">']
    s.append('<rect width="100" height="100" rx="14" fill="url(#neon-wall)"/>')
    s.append('<rect width="100" height="100" rx="14" fill="url(#neon-brick)"/>')
    s.append(f'<rect width="100" height="100" rx="14" fill="url(#{wall})"/>')
    s.append('<path d="M0 14Q0 0 14 0H60L0 60Z" fill="url(#neon-sheen)"/>')
    edge = GOLD if rare else '#2c3480'
    s.append(f'<rect x="1.5" y="1.5" width="97" height="97" rx="12.5" fill="none" stroke="{edge}" stroke-width="{2 if rare else 1.4}" stroke-opacity="{.95 if rare else 1}"/>')
    s.append(f'<rect x="4" y="4" width="92" height="92" rx="10.5" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1"/>')
    for x, y in ((9,9),(91,9),(9,91),(91,91)):
        s.append(f'<circle cx="{x}" cy="{y}" r="2.2" fill="#3a4170"/><circle cx="{x-.5}" cy="{y-.5}" r="1" fill="#9aa2d8" opacity=".7"/><path d="M{x-1.2} {y+.8}L{x+1.2} {y-.8}" stroke="#05061a" stroke-width=".7"/>')
    dot = name in ('dot',)
    # 配線
    allpts = [sample(p) for p in paths]
    sample_all = allpts
    for i, p in enumerate(paths):
        s.append(f'<path id="neon-{name}-{i}" d="{p}" fill="none"/>')
    first = allpts[0][0]
    wx = 6 if first[0] < 50 else 94
    s.append(f'<path d="M{first[0]:.1f} {first[1]:.1f} Q{(first[0]+wx)/2:.1f} {first[1]+16:.1f} {wx} {first[1]+22:.1f}" stroke="#05061a" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/>')
    gl = []
    if rare:
        gl.append(f'<animate attributeName="opacity" values="1;.72;1" dur="2.8s" repeatCount="indefinite"/>')
    s.append(f'<g fill="none" stroke-linecap="round" stroke-linejoin="round"><g>{"".join(gl)}')
    glowc = col
    K = [(2.5 if name=="dot" else 1.75) if sum(math.dist(a,b) for a,b in zip(q,q[1:])) < 4 else 1 for q in sample_all]
    for i in range(len(paths)):
        h = f'href="#neon-{name}-{i}"'
        s.append(f'<use {h} stroke="{glowc}" stroke-width="{20*K[i]:.1f}" opacity=".12"/><use {h} stroke="{glowc}" stroke-width="{13*K[i]:.1f}" opacity=".22"/>')
    s.append('</g>')
    case = GOLD if rare else dark
    for i in range(len(paths)):
        h = f'href="#neon-{name}-{i}"'
        s.append(f'<use {h} stroke="{case}" stroke-width="{(10 if rare else 9)*K[i]:.1f}"/>')
        s.append(f'<use {h} stroke="{col}" stroke-width="{(7.8 if rare else 7)*K[i]:.1f}"/>')
        if rare:
            s.append(f'<use {h} stroke="{PINK}" stroke-width="{2.6*K[i]:.1f}" opacity=".85"/>')
            s.append(f'<use {h} stroke="#fff" stroke-width="{1.4*K[i]:.1f}" opacity=".9"/>')
        else:
            s.append(f'<use {h} stroke="#fff" stroke-width="{2.2*K[i]:.1f}" opacity=".6"/>')
    s.append('</g>')
    # 端の金具
    ends = []
    for pts, p in zip(allpts, paths):
        if name in ('dot',) or len(pts) < 70 and False: continue
        if math.dist(pts[0], pts[-1]) < 3 and len(pts) < 5: continue
        ends += [pts[0], pts[-1]]
    for p in paths:
        pass
    for pts in allpts:
        if math.dist(pts[0], pts[-1]) < 2.5 and len(pts) < 200 and sum(math.dist(a,b) for a,b in zip(pts,pts[1:])) < 4: continue
        for e in (pts[0], pts[-1]):
            s.append(f'<circle cx="{e[0]:.1f}" cy="{e[1]:.1f}" r="3.1" fill="#14152e" stroke="{GOLD if rare else "#7d86c0"}" stroke-width="1"/><circle cx="{e[0]:.1f}" cy="{e[1]:.1f}" r="1" fill="{GOLD if rare else "#aab2e6"}" opacity=".8"/>')
    # 留め金具
    for pts in allpts:
        ln = sum(math.dist(a,b) for a,b in zip(pts,pts[1:]))
        if ln < 30: continue
        for f in ((.5,) if ln < 55 else (.3,.7)):
            (x, y), a = at(pts, f)
            s.append(f'<g transform="translate({x:.1f} {y:.1f}) rotate({math.degrees(a)+90:.1f})"><rect x="-6" y="-1.5" width="12" height="3" rx="1.2" fill="#6d75a8"/><rect x="-6" y="-1.5" width="12" height="1.1" rx=".6" fill="#c3c9f0" opacity=".7"/></g>')
    if rare:
        s.append(star(84, 17, 7.5, '#fff', 0) + star(17, 82, 6, GOLD, .9) + star(80, 80, 4.5, '#fff', 1.7))
        s.append(f'<circle cx="19" cy="22" r="1.6" fill="{GOLD}"/><circle cx="88" cy="50" r="1.3" fill="#fff"/><circle cx="12" cy="52" r="1.2" fill="{CYAN}"/>')
    s.append('</symbol>')
    return ''.join(s)

names = [str(i) for i in range(10)] + ['add','sub','mul','div','lp','rp','pow','sqrt','fact','dot']
svg = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute">\n' + defs + '\n' + '\n'.join(symbol(n) for n in names) + '\n</svg>\n'
open(OUT, 'w').write(svg); print(len(svg.encode()))
