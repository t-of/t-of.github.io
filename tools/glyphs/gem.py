#!/usr/bin/env python3
"""SHORT MATH の文字コレクション「gem」(宝石)。python3 tools/glyphs/gem.py で glyphs/gem.svg を書き出す。"""
import math, os

OUT = os.path.expanduser('~/GitHub/tof/apps/four-digits/glyphs/gem.svg')
W = 13.0           # ストロークの太さ
LIGHT = (-0.6, -0.8)  # 光の向き(左上)

RAMPS = {
    'ruby': ['#3a0511', '#780e25', '#b81a3e', '#e63e66', '#ff86a2', '#ffd3de'],
    'emerald': ['#03231a', '#0a4a31', '#10805a', '#22b57f', '#6ee7b0', '#cffbe6'],
    'diamond': ['#51648a', '#8199bd', '#b8cee8', '#dcecf8', '#f2faff', '#ffffff'],
}

def f(v):
    s = ('%.1f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

def arc(cx, cy, rx, ry, a0, a1, n):
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

def ell(cx, cy, rx, ry, n=10, a0=-90):
    return arc(cx, cy, rx, ry, a0, a0 + 360, n)[:-1]

def norm(dx, dy):
    l = math.hypot(dx, dy) or 1
    return dx / l, dy / l

def offsets(pts, closed, hw):
    n = len(pts)
    segs = n if closed else n - 1
    nm = []
    for i in range(segs):
        a, b = pts[i], pts[(i + 1) % n]
        dx, dy = norm(b[0] - a[0], b[1] - a[1])
        nm.append((dy, -dx))  # 進行方向の左(画面で)
    offs = []
    for i in range(n):
        if not closed and i == 0:
            offs.append((nm[0][0] * hw, nm[0][1] * hw)); continue
        if not closed and i == n - 1:
            offs.append((nm[-1][0] * hw, nm[-1][1] * hw)); continue
        n1, n2 = nm[(i - 1) % segs], nm[i % segs]
        mx, my = norm(n1[0] + n2[0], n1[1] + n2[1])
        d = max(mx * n1[0] + my * n1[1], 0.01)
        ln = min(hw / d, hw * 1.7)
        offs.append((mx * ln, my * ln))
    return nm, offs

def poly(ps):
    return 'M' + 'L'.join(f(x) + ' ' + f(y) for x, y in ps) + 'z'

def lvl(nx, ny):
    l = nx * LIGHT[0] + ny * LIGHT[1]
    return max(0, min(5, round(2.4 + l * 2.6)))

class Layer:
    """1 つの文字ぶんの描画。stroke ごとに 縁取り→面 の順で出す。"""
    def __init__(self, ramp):
        self.r = RAMPS[ramp]; self.out = []; self.shadow = []; self.mid = []

    def stroke(self, pts, closed=False, w=W):
        hw = w / 2
        nm, offs = offsets(pts, closed, hw)
        n = len(pts); segs = len(nm)
        L = [(p[0] + o[0], p[1] + o[1]) for p, o in zip(pts, offs)]
        R = [(p[0] - o[0], p[1] - o[1]) for p, o in zip(pts, offs)]
        if closed:
            od = poly(L) + poly(R[::-1])
        else:
            od = poly(L + R[::-1])
        self.shadow.append(od)
        buckets = {}
        fr = [-1, -0.3, 0.3, 1]
        for i in range(segs):
            j = (i + 1) % n
            def P(k, fi):
                return (pts[k][0] + offs[k][0] * fi, pts[k][1] + offs[k][1] * fi)
            nx, ny = nm[i]
            cols = [lvl(nx, ny), 3, lvl(-nx, -ny)]
            if cols[0] == 5 and False: pass
            for b in range(3):
                q = [P(i, fr[b]), P(j, fr[b]), P(j, fr[b + 1]), P(i, fr[b + 1])]
                c = cols[b]
                if b == 1:
                    c = 3 if abs(nx * LIGHT[0] + ny * LIGHT[1]) < 0.8 else 4 - (1 if (nx * LIGHT[0] + ny * LIGHT[1]) < 0 else 0)
                    self.mid.append(poly(q))
                buckets.setdefault(c, []).append(poly(q))
        s = '<path fill="%s" stroke="%s" stroke-width="1.6" stroke-linejoin="round" d="%s"/>' % (self.r[0], self.r[0], od)
        for c in sorted(buckets):
            s += '<path fill="%s" stroke="%s" stroke-width=".35" stroke-linejoin="round" d="%s"/>' % (self.r[c], self.r[c], ''.join(buckets[c]))
        self.out.append(s)


    def bar(self, p0, p1, w=W):
        """長いバゲットカット。両端を斜めに落とし、帯3本×区間3つに面を分ける。"""
        hw = w / 2; c = hw * 0.9
        dx, dy = norm(p1[0] - p0[0], p1[1] - p0[1]); nx, ny = dy, -dx
        ln = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        def pt(s, f):
            hh = hw * (0.42 if s in (0, ln) else 1) * f
            return (p0[0] + dx * s + nx * hh, p0[1] + dy * s + ny * hh)
        ss = [0, c, ln - c, ln]
        fr = [1, 0.3, -0.3, -1]
        outl = [pt(s, 1) for s in ss] + [pt(s, -1) for s in ss[::-1]]
        od = poly(outl); self.shadow.append(od)
        buckets = {}; hi = []
        for b in range(3):
            for k in range(3):
                q = [pt(ss[k], fr[b]), pt(ss[k + 1], fr[b]), pt(ss[k + 1], fr[b + 1]), pt(ss[k], fr[b + 1])]
                side = (1, 0, -1)[b]
                if k == 1:
                    vx, vy = nx * side, ny * side
                    c_ = lvl(vx, vy) if b != 1 else 3
                    if b == 1:
                        c_ = 4 if -(nx*LIGHT[0]+ny*LIGHT[1]) < 0.3 else 3
                else:
                    e = -1 if k == 0 else 1
                    vx, vy = dx * e * .8 + nx * side * .6, dy * e * .8 + ny * side * .6
                    c_ = lvl(*norm(vx, vy)) if b != 1 else lvl(dx * e, dy * e)
                buckets.setdefault(c_, []).append(poly(q))
                if b == 1 and k == 1: self.mid.append(poly(q))
        s_ = '<path fill="%s" stroke="%s" stroke-width="1.6" stroke-linejoin="round" d="%s"/>' % (self.r[0], self.r[0], od)
        for c_ in sorted(buckets):
            s_ += '<path fill="%s" stroke="%s" stroke-width=".35" stroke-linejoin="round" d="%s"/>' % (self.r[c_], self.r[c_], ''.join(buckets[c_]))
        # 明るい側の縁に白い照り
        sd = 1 if (nx * LIGHT[0] + ny * LIGHT[1]) > 0 else -1
        a, b2 = ss[1] + c * .3, ss[2] - c * .3
        hl = [pt(a, .92 * sd), pt(b2, .92 * sd), pt(b2, .62 * sd), pt(a, .62 * sd)]
        s_ += '<path fill="#fff" opacity=".8" d="%s"/>' % poly(hl)
        self.out.append(s_)

    def gem(self, cx, cy, r):
        n = 8; r2 = r * 0.52
        buckets = {}; outer = []
        for i in range(n):
            a0 = math.radians(i * 360 / n - 90 - 22.5 + 22.5); a1 = math.radians((i + 1) * 360 / n - 90)
            am = (a0 + a1) / 2
            p0 = (cx + r * math.cos(a0), cy + r * math.sin(a0)); p1 = (cx + r * math.cos(a1), cy + r * math.sin(a1))
            q0 = (cx + r2 * math.cos(a0), cy + r2 * math.sin(a0)); q1 = (cx + r2 * math.cos(a1), cy + r2 * math.sin(a1))
            c = lvl(math.cos(am), math.sin(am))
            buckets.setdefault(c, []).append(poly([p0, p1, q1, q0]))
            outer.append(p0)
        inner = [(cx + r2 * math.cos(math.radians(i * 45 - 90)), cy + r2 * math.sin(math.radians(i * 45 - 90))) for i in range(8)]
        od = poly(outer)
        self.shadow.append(od)
        s = '<path fill="%s" stroke="%s" stroke-width="1.6" stroke-linejoin="round" d="%s"/>' % (self.r[0], self.r[0], od)
        for c in sorted(buckets):
            s += '<path fill="%s" stroke="%s" stroke-width=".35" stroke-linejoin="round" d="%s"/>' % (self.r[c], self.r[c], ''.join(buckets[c]))
        t = poly(inner)
        s += '<path fill="%s" stroke="%s" stroke-width=".35" d="%s"/>' % (self.r[3], self.r[3], t)
        # 面の上の白い照り
        s += '<path fill="#fff" opacity=".85" d="%s"/>' % poly([(cx - r2 * .7, cy - r2 * .2), (cx - r2 * .2, cy - r2 * .7), (cx + r2 * .1, cy - r2 * .5), (cx - r2 * .4, cy)])
        self.out.append(s)
        self.mid.append(t)

L_, R_, T_, B_ = 36, 64, 30, 70
G = {}
G['0'] = [('c', ell(50, 50, 14, 20, 10))]
G['1'] = [('o', [(41, 39), (53, 30), (53, 70)]), ('o', [(41, 70), (65, 70)])]
G['2'] = [('o', arc(50, 41, 14, 11, 180, 395, 7) + [(36, 70), (64, 70)])]
G['3'] = [('o', arc(50, 40.5, 13, 10.5, 200, 450, 6)), ('o', arc(50, 60.5, 13, 9.5, 270, 520, 6)), ('o', [(43, 50.5), (53, 50.5)])]
G['4'] = [('o', [(55, 30), (36, 57), (66, 57)]), ('o', [(55, 30), (55, 70)])]
G['5'] = [('o', [(63, 30), (41, 30), (41, 49)] + arc(49, 58.5, 14, 11.5, 235, 485, 6))]
G['6'] = [('o', [(61, 31), (47, 34), (38, 48), (36, 58)]), ('c', ell(49, 58.5, 13, 11.5, 10, 90))]
G['7'] = [('o', [(36, 30), (64, 30), (46, 70)])]
G['8'] = [('c', ell(50, 39.5, 12.5, 11.5, 10), 11.5), ('c', ell(50, 60.5, 14.5, 11.5, 10), 11.5)]
def rot(strokes):
    return [(k, [(100 - x, 100 - y) for x, y in p]) for k, p in strokes]
G['9'] = rot(G['6'])
G['add'] = [('b', [(30, 50), (70, 50)]), ('b', [(50, 30), (50, 70)])]
G['sub'] = [('b', [(32, 50), (68, 50)])]
G['mul'] = [('b', [(35, 35), (65, 65)]), ('b', [(65, 35), (35, 65)])]
G['div'] = [('b', [(32, 50), (68, 50)]), ('g', (50, 34, 7)), ('g', (50, 66, 7))]
G['lp'] = [('o', arc(63, 50, 22, 26, 230, 130 + 0, 6)[::1] if False else arc(66, 50, 24, 33, 235, 125, 8))]
G['rp'] = [('o', [(100 - x, y) for x, y in arc(66, 50, 24, 33, 235, 125, 8)])]
G['pow'] = [('o', [(35, 64), (50, 34), (65, 64)])]
G['sqrt'] = [('o', [(32, 54), (39, 50), (46, 70), (58, 30), (69, 30)])]
G['fact'] = [('o', [(50, 31), (50, 54)]), ('g', (50, 67, 8))]
G['dot'] = [('g', (50, 62, 10))]
ORDER = ['0','1','2','3','4','5','6','7','8','9','add','sub','mul','div','lp','rp','pow','sqrt','fact','dot']
RARE = {'pow', 'sqrt', 'fact', 'dot'}
SPARK = {'pow': [(24, 26, 7), (77, 72, 5), (76, 24, 4)],
         'sqrt': [(25, 74, 6), (78, 62, 5), (26, 28, 4)],
         'fact': [(28, 30, 6), (73, 40, 5), (30, 72, 4)],
         'dot': [(28, 30, 7), (74, 34, 5), (72, 76, 5)]}

def star(x, y, s, delay):
    d = 'M0 %sQ0 0 %s 0Q0 0 0 %sQ0 0 %s 0Q0 0 0 %sz' % (f(-s), f(s), f(s), f(-s), f(-s))
    return ('<g transform="translate(%s %s)"><path fill="#fff" d="%s"><animateTransform attributeName="transform" type="scale" values="1;.55;1" dur="2.6s" begin="%ss" repeatCount="indefinite"/>'
            '<animate attributeName="opacity" values="1;.5;1" dur="2.6s" begin="%ss" repeatCount="indefinite"/></path>'
            '<path fill="#fff" opacity=".55" d="%s" transform="rotate(45) scale(.6)"/></g>') % (f(x), f(y), d, delay, delay, d)

DEFS = '''<defs>
<linearGradient id="gem-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".35" stop-color="#e5b550"/><stop offset=".72" stop-color="#a9741d"/><stop offset="1" stop-color="#5e3a0c"/></linearGradient>
<linearGradient id="gem-gold2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset=".3" stop-color="#f5cf62"/><stop offset=".7" stop-color="#b98320"/><stop offset="1" stop-color="#6a4210"/></linearGradient>
<radialGradient id="gem-vel" cx=".5" cy=".46" r=".75"><stop offset="0" stop-color="#84306a"/><stop offset=".55" stop-color="#511545"/><stop offset="1" stop-color="#220719"/></radialGradient>
<pattern id="gem-fur" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="none"/><rect x="0" y="0" width="1" height="1" fill="#fff" opacity=".07"/><rect x="2" y="1.5" width="1" height="1" fill="#000" opacity=".16"/><rect x="1" y="2" width="1" height=".6" fill="#ffc8f0" opacity=".06"/></pattern>
<linearGradient id="gem-rb" gradientUnits="userSpaceOnUse" x1="25" y1="25" x2="75" y2="75"><stop offset="0" stop-color="#ff8ad8"/><stop offset=".3" stop-color="#ffe27a"/><stop offset=".6" stop-color="#6df0ff"/><stop offset="1" stop-color="#a98bff"/></linearGradient>
<filter id="gem-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>
</defs>'''

def board(rare):
    if not rare:
        return ('<rect width="100" height="100" rx="14" fill="url(#gem-gold)"/>'
                '<rect x="3.5" y="3.5" width="93" height="93" rx="10.5" fill="url(#gem-vel)" stroke="#2e1604" stroke-width=".8"/>'
                '<rect x="3.5" y="3.5" width="93" height="93" rx="10.5" fill="url(#gem-fur)"/>'
                '<rect x="5" y="5" width="90" height="90" rx="9.5" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="3"/>')
    return ('<rect width="100" height="100" rx="14" fill="url(#gem-gold2)"/>'
            '<rect x="1.4" y="1.4" width="97.2" height="97.2" rx="12.6" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".8"/>'
            '<rect x="6.5" y="6.5" width="87" height="87" rx="8" fill="url(#gem-vel)" stroke="#2e1604" stroke-width="1"/>'
            '<rect x="6.5" y="6.5" width="87" height="87" rx="8" fill="url(#gem-fur)"/>'
            '<rect x="8" y="8" width="84" height="84" rx="7" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="3"/>'
            '<g fill="#fff3b0" stroke="#7a4d10" stroke-width=".5"><circle cx="3.6" cy="3.6" r="1.2"/><circle cx="96.4" cy="3.6" r="1.2"/><circle cx="3.6" cy="96.4" r="1.2"/><circle cx="96.4" cy="96.4" r="1.2"/></g>')

def symbol(name):
    rare = name in RARE
    ramp = 'diamond' if rare else ('ruby' if name.isdigit() else 'emerald')
    ly = Layer(ramp)
    for item in G[name]:
        k, v = item[0], item[1]
        if k == 'g': ly.gem(*v)
        elif k == 'b': ly.bar(v[0], v[1])
        else: ly.stroke(v, closed=(k == 'c'), w=item[2] if len(item) > 2 else W)
    s = '<symbol id="gem-%s" viewBox="0 0 100 100">' % name + board(rare)
    s += '<path fill="#000" opacity=".5" transform="translate(1.2 2.6)" filter="url(#gem-blur)" d="%s"/>' % ''.join(ly.shadow)
    s += ''.join(ly.out)
    if rare:
        s += '<path fill="url(#gem-rb)" opacity=".5" d="%s"/>' % ''.join(ly.mid)
        for i, (x, y, z) in enumerate(SPARK[name]):
            s += star(x, y, z, f(i * 0.8))
    return s + '</symbol>'

svg = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute">\n' + DEFS + '\n' + '\n'.join(symbol(n) for n in ORDER) + '\n</svg>\n'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w').write(svg)
print(OUT, len(svg.encode()), 'bytes')
