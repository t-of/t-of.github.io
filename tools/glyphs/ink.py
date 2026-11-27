#!/usr/bin/env python3
"""four-digits 文字コレクション「墨」: 和紙に筆の一筆書き。python3 tools/glyphs/ink.py"""
import math, random, os
OUT = os.path.expanduser('~/GitHub/tof/apps/four-digits/glyphs/ink.svg')
PAPER = '#f4efe3'; INK = '#26262b'; CORE = '#08080b'

def cr(pts, n=14):
    p = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i-1], p[i], p[i+1], p[i+2]
        for k in range(n):
            t = k / n; t2 = t*t; t3 = t2*t
            out.append(tuple(.5*((2*p1[j]) + (-p0[j]+p2[j])*t + (2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t2 + (-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t3) for j in (0, 1)))
    out.append(pts[-1]); return out

def interp(kf, t):
    for (a, va), (b, vb) in zip(kf, kf[1:]):
        if t <= b:
            u = (t-a)/(b-a) if b > a else 1; u = u*u*(3-2*u); return va + (vb-va)*u
    return kf[-1][1]

DEF = [(0, .3), (.1, .95), (.45, 1), (.8, .85), (1, .18)]

class Stroke:
    def __init__(s, pts, w=8, kf=None, n=9, seed=1, kasure=3, pool=True):
        s.c = cr(pts, max(4, int(n*.55))); L = len(s.c); r = random.Random(seed)
        kf = kf or DEF; s.w = []; w = w*1.25
        ph = r.random()*6
        for i in range(L):
            t = i/(L-1); s.w.append(w*interp(kf, t)*(1+.06*math.sin(t*9+ph)))
        s.nrm = []
        for i in range(L):
            a = s.c[max(i-1, 0)]; b = s.c[min(i+1, L-1)]
            dx, dy = b[0]-a[0], b[1]-a[1]; d = math.hypot(dx, dy) or 1
            s.nrm.append((-dy/d, dx/d))
        s.r = r; s.kas = kasure; s.pool = pool; s.W = w
    def poly(s, f=1.0, grow=0):
        L = len(s.c); l = []; rr = []
        for i, (p, n, w) in enumerate(zip(s.c, s.nrm, s.w)):
            h = w*f/2 + grow
            l.append((p[0]+n[0]*h, p[1]+n[1]*h)); rr.append((p[0]-n[0]*h, p[1]-n[1]*h))
        pts = l + rr[::-1]
        return 'M' + 'L'.join('%.1f %.1f' % q for q in pts) + 'Z'
    def svg(s):
        d0 = s.poly()
        o = ['<path d="%s" fill="%s" stroke="%s" stroke-opacity=".10" stroke-width="2.6" stroke-linejoin="round"/>' % (d0, INK, '#3a3328'),
             '<path d="%s" fill="none" stroke="%s" stroke-opacity=".22" stroke-width="1.2" stroke-linejoin="round"/>' % (d0, INK)]
        o.append('<path d="%s" fill="%s" opacity=".6"/>' % (s.poly(.5), CORE))
        L = len(s.c)
        if s.pool:  # 入りの墨だまり
            i = min(3, L-1); p = s.c[i]
            o.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" opacity=".3"/>' % (p[0], p[1], s.W*.3, CORE))
        # かすれ: 後半に細い筋の抜け
        for k in range(s.kas+1 if s.kas else 0):
            u = s.r.uniform(-.6, .6); t0 = s.r.uniform(.8, .88); t1 = min(.99, t0+s.r.uniform(.1, .16))
            i0, i1 = int(t0*(L-1)), int(t1*(L-1))
            pts = []
            for i in range(i0, i1+1):
                h = s.w[i]/2*u; pts.append((s.c[i][0]+s.nrm[i][0]*h, s.c[i][1]+s.nrm[i][1]*h))
            if len(pts) > 1:
                o.append('<path d="M%s" fill="none" stroke="%s" stroke-width="%.2f" opacity=".85"/>' % ('L'.join('%.1f %.1f' % q for q in pts), PAPER, s.r.uniform(.5, .9)))
        return ''.join(o)

def blob(cx, cy, r, seed=5):
    rn = random.Random(seed); pts = []
    for k in range(24):
        a = k/24*2*math.pi; q = r*(1+rn.uniform(-.04, .04))
        pts.append((cx+q*math.cos(a), cy+q*math.sin(a)*.95))
    d = 'M' + 'L'.join('%.1f %.1f' % p for p in pts) + 'Z'
    return ('<path d="%s" fill="%s" stroke="%s" stroke-opacity=".14" stroke-width="2" stroke-linejoin="round"/>' % (d, INK, INK)
            + '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" opacity=".6"/>' % (cx-r*.15, cy-r*.1, r*.5, CORE))

B = lambda kf: kf
HEAVY = [(0, .5), (.08, 1), (.7, 1), (.9, .7), (1, .25)]
FLAT = [(0, .35), (.08, 1), (.75, .95), (1, .3)]
def ell(cx, cy, rx, ry, a0, a1, n=12):
    return [(cx+rx*math.cos(math.radians(a0+(a1-a0)*i/n)), cy+ry*math.sin(math.radians(a0+(a1-a0)*i/n))) for i in range(n+1)]
LOOP = [(0, .3), (.1, .9), (.3, 1.05), (.5, 1), (.75, .8), (.92, .6), (1, .15)]
S = Stroke
def glyphs():
    g = {}
    g['0'] = [S(ell(50, 50, 16, 27, -75, -430, 14), 9, LOOP, 4, 1)]
    g['1'] = [S([(36, 38), (46, 28), (52, 22), (52, 50), (51, 78)], 9, [(0, .3), (.12, .9), (.3, 1), (.8, 1), (1, .2)], 10, 2),
              S([(34, 78), (50, 77), (68, 78)], 6, FLAT, 6, 3, 2)]
    g['2'] = [S([(33, 36), (40, 26), (52, 22), (63, 29), (62, 41), (50, 56), (34, 75)], 8.5, DEF, 9, 4),
              S([(33, 77), (50, 76), (68, 78)], 8.5, FLAT, 6, 5, 3)]
    g['3'] = [S([(34, 28), (46, 22), (59, 26), (62, 37), (48, 48)], 8.5, DEF, 10, 6),
              S([(48, 48), (63, 55), (65, 68), (52, 78), (33, 72)], 8.5, [(0, .6), (.1, .95), (.6, 1), (1, .2)], 10, 7)]
    g['4'] = [S([(58, 22), (45, 42), (32, 60), (70, 60)], 8, [(0, .4), (.1, 1), (.6, 1), (.75, .8), (1, .3)], 10, 8),
              S([(58, 21), (58, 50), (58, 79)], 8.5, [(0, .6), (.1, 1), (.8, 1), (1, .2)], 8, 9)]
    g['5'] = [S([(66, 23), (52, 23), (40, 24)], 8, FLAT, 6, 10, 2),
              S([(41, 24), (39, 47)], 8, HEAVY, 4, 11, 0),
              S([(38, 46), (54, 43), (66, 54), (63, 70), (50, 78), (33, 72)], 8.5, [(0, .5), (.1, 1), (.6, 1), (1, .2)], 10, 12)]
    g['6'] = [S([(62, 24), (47, 31), (37, 48), (35, 66), (46, 78), (60, 73), (64, 60), (54, 50), (40, 55), (36, 63)], 8.5, [(0, .3), (.1, .9), (.4, 1.05), (.8, .9), (1, .25)], 8, 13)]
    g['7'] = [S([(33, 25), (50, 22), (68, 24)], 8, FLAT, 6, 14, 2),
              S([(67, 25), (58, 46), (47, 79)], 9, [(0, .6), (.12, 1), (.7, .9), (1, .12)], 10, 15)]
    g['8'] = [S([(50, 50), (38, 41), (40, 28), (50, 22), (61, 28), (62, 40), (50, 50), (37, 60), (36, 72), (50, 78), (64, 72), (63, 60), (50, 50)], 8, [(0, .3), (.1, .9), (.5, 1.05), (.9, .9), (1, .25)], 8, 16)]
    g['9'] = [S([(62, 42), (58, 28), (48, 22), (38, 28), (37, 41), (47, 51), (59, 47), (63, 40), (62, 58), (52, 78), (45, 78)], 8.5, [(0, .3), (.1, .9), (.4, 1), (.6, .95), (.85, 1), (1, .15)], 8, 17)]
    g['add'] = [S([(27, 50), (50, 49), (73, 51)], 9, [(0, .4), (.1, 1), (.8, 1), (1, .3)], 8, 18, 3),
                S([(50, 26), (50, 50), (50, 74)], 9, [(0, .5), (.1, 1), (.8, 1), (1, .25)], 8, 19, 3)]
    g['sub'] = [S([(24, 52), (50, 49), (76, 51)], 11, [(0, .35), (.08, 1), (.5, 1.1), (.85, .85), (1, .15)], 10, 20, 4)]
    g['mul'] = [S([(31, 29), (50, 50), (69, 71)], 9, DEF, 8, 21, 3),
                S([(69, 29), (50, 50), (31, 71)], 9, DEF, 8, 22, 3)]
    g['div'] = [S([(26, 50), (50, 49), (74, 51)], 8.5, [(0, .4), (.1, 1), (.8, 1), (1, .25)], 8, 23, 3), blob(50, 29, 6.2, 1), blob(50, 71, 6.2, 2)]
    g['lp'] = [S([(62, 20), (47, 32), (40, 50), (45, 68), (62, 81)], 9, [(0, .3), (.12, .9), (.5, 1.1), (.85, .7), (1, .15)], 10, 24)]
    g['rp'] = [S([(38, 20), (53, 32), (60, 50), (55, 68), (38, 81)], 9, [(0, .3), (.12, .9), (.5, 1.1), (.85, .7), (1, .15)], 10, 25)]
    g['pow'] = [S([(27, 64), (39, 46), (50, 27)], 9, [(0, .3), (.15, .9), (1, 1)], 8, 26, 2),
                S([(50, 27), (60, 46), (74, 66)], 9, [(0, 1), (.7, .9), (1, .15)], 8, 27, 3, False)]
    g['sqrt'] = [S([(22, 56), (30, 51), (35, 52)], 6, [(0, .4), (.3, 1), (1, .8)], 5, 28, 0, False),
                 S([(34, 51), (45, 78)], 9, [(0, .7), (.2, 1), (1, .9)], 6, 29, 1, False),
                 S([(45, 79), (56, 49), (63, 24)], 5.5, [(0, .9), (.5, .8), (1, .8)], 8, 30, 0, False),
                 S([(62, 24), (74, 23), (84, 24)], 7, [(0, .9), (.7, .95), (1, .15)], 6, 31, 3, False)]
    g['fact'] = [S([(50, 19), (50, 45), (50, 62)], 11, [(0, .5), (.1, 1), (.5, .9), (1, .3)], 8, 32, 3), blob(50, 76, 6.6, 3)]
    g['dot'] = [blob(50, 62, 11, 4)]
    return g

def fibers():
    r = random.Random(11); o = []
    for i in range(36):
        x, y = r.uniform(3, 97), r.uniform(3, 97); a = r.uniform(0, 6.3); l = r.uniform(3, 9); b = r.uniform(-2, 2)
        x2, y2 = x+l*math.cos(a), y+l*math.sin(a)
        col = '#fffdf6' if i % 2 else '#b9a77e'
        o.append('<path d="M%.1f %.1fQ%.1f %.1f %.1f %.1f" stroke="%s" stroke-width=".35" fill="none" opacity="%s"/>' % (x, y, (x+x2)/2+b, (y+y2)/2+b, x2, y2, col, '.8' if i % 2 else '.35'))
    return ''.join(o)

def hanko():
    r = random.Random(3)
    o = ['<g transform="rotate(-4 86 86)"><rect x="80" y="80" width="11" height="11" rx="1.3" fill="#c42b25"/>',
         '<rect x="80" y="80" width="11" height="11" rx="1.3" fill="none" stroke="#8d1a17" stroke-width=".5" opacity=".6"/>',
         '<path d="M85.5 82.2V89.8M82.2 85.5H89.2M82.6 82.8L88.8 88.6" stroke="%s" stroke-width="1" opacity=".85" fill="none"/>' % PAPER]
    for _ in range(6):
        o.append('<circle cx="%.1f" cy="%.1f" r=".35" fill="%s" opacity=".8"/>' % (r.uniform(80.8, 90.2), r.uniform(80.8, 90.2), PAPER))
    o.append('</g>'); return ''.join(o)

def gold(seed):
    r = random.Random(seed); o = []
    # 縁の金の刷毛目
    o.append('<path d="M10 5.5L42 5L72 5.8L90 5.2L72 7.2L40 7.4L12 7.6Z" fill="url(#ink-gold)"/>')
    o.append('<path d="M5 14L5.4 40L5 66L6.6 38L7 16Z" fill="url(#ink-gold)"/>')
    o.append('<path d="M14 6.4L38 6.3M60 6.4L80 6.2" stroke="%s" stroke-width=".5" opacity=".9"/>' % PAPER)
    spots = [(15, 17, 6), (86, 15, 5.5), (13, 82, 5), (89, 50, 4.5), (72, 90, 3.5), (30, 90, 3), (80, 33, 3), (21, 40, 2.6)]
    for i, (cx, cy, s) in enumerate(spots):
        n = r.choice((5, 6)); pts = []
        for k in range(n):
            a = k/n*6.283+r.uniform(-.3, .3); q = s*r.uniform(.6, 1.1); pts.append((cx+q*math.cos(a), cy+q*math.sin(a)))
        d = 'M' + 'L'.join('%.1f %.1f' % p for p in pts) + 'Z'
        o.append('<g><path d="%s" fill="url(#ink-gold)" stroke="#8a6414" stroke-width=".4"/><path d="M%.1f %.1fL%.1f %.1f" stroke="#fff6c8" stroke-width=".8" opacity=".9"/>' % (d, pts[0][0], pts[0][1], pts[1][0], pts[1][1])
                 + ('<animate attributeName="opacity" values="1;.55;1" dur="%.1fs" repeatCount="indefinite"/>' % (2.4+i*.37)) + '</g>')
    for _ in range(14):
        o.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#d9aa2c"/>' % (r.uniform(8, 92), r.uniform(8, 92), r.uniform(.5, 1)))
    return ''.join(o)

RARE = {'pow', 'sqrt', 'fact', 'dot'}
def main():
    o = ['<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute">\n<defs>',
         '<radialGradient id="ink-pg" cx=".45" cy=".4" r=".85"><stop offset="0" stop-color="#f9f5ea"/><stop offset=".7" stop-color="%s"/><stop offset="1" stop-color="#e2d7bd"/></radialGradient>' % PAPER,
         '<linearGradient id="ink-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset=".45" stop-color="#e5b930"/><stop offset="1" stop-color="#b8861a"/></linearGradient>',
         '<filter id="ink-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .36  0 0 0 0 .2  0 0 0 -1.4 .75"/></filter>',
         '<g id="ink-paper"><rect width="100" height="100" rx="6" fill="url(#ink-pg)"/><rect width="100" height="100" rx="6" filter="url(#ink-grain)" opacity=".5"/>%s' % fibers(),
         '<rect x=".6" y=".6" width="98.8" height="98.8" rx="5.6" fill="none" stroke="#bfae88" stroke-width="1.2"/><rect x="2.2" y="2.2" width="95.6" height="95.6" rx="4.4" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".8"/>',
         '<path d="M3 96.5H97" stroke="#9c8b66" stroke-opacity=".5" stroke-width="1.4"/></g>',
         '<g id="ink-hanko">%s</g></defs>' % hanko()]
    for k, items in glyphs().items():
        body = ''.join(i.svg() if isinstance(i, Stroke) else i for i in items)
        o.append('<symbol id="ink-%s" viewBox="0 0 100 100"><use href="#ink-paper"/>%s<use href="#ink-hanko"/>%s</symbol>' % (k, ('<g>' + gold(hash(k) % 97 + 1 if False else 7 + len(k)) + '</g>') if k in RARE else '', '<g>' + body + '</g>'))
    o.append('</svg>\n')
    open(OUT, 'w').write('\n'.join(o))
    print(os.path.getsize(OUT))
main()
