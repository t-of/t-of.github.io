#!/usr/bin/env python3
"""SHORT MATH 文字コレクション: pixel（ドット）。16x16 グリッド、緑 4 階調、レアは金。
python3 tools/glyphs/pixel.py → apps/four-digits/glyphs/pixel.svg"""
import os
G = {
'0': ".#####.|##...##|##...##|##...##|##...##|##...##|##...##|##...##|.#####.",
'1': "..##...|.###...|..##...|..##...|..##...|..##...|..##...|..##...|.######",
'2': ".#####.|##...##|.....##|....##.|...##..|..##...|.##....|##.....|#######",
'3': ".#####.|##...##|.....##|..####.|.....##|.....##|##...##|##...##|.#####.",
'4': "....##.|...###.|..#.##.|.#..##.|##..##.|#######|....##.|....##.|....##.",
'5': "#######|##.....|##.....|######.|.....##|.....##|.....##|##...##|.#####.",
'6': "..####.|.##....|##.....|######.|##...##|##...##|##...##|##...##|.#####.",
'7': "#######|##...##|.....##|....##.|...##..|...##..|..##...|..##...|..##...",
'8': ".#####.|##...##|##...##|.#####.|##...##|##...##|##...##|##...##|.#####.",
'9': ".#####.|##...##|##...##|##...##|.######|.....##|.....##|...###.|.####..",
'add': ".......|.......|..###..|..###..|#######|#######|#######|..###..|..###..",
'sub': ".......|.......|.......|.......|#######|#######|.......|.......|.......",
'mul': ".......|##...##|###.###|.#####.|..###..|.#####.|###.###|##...##|.......",
'div': "...##..|...##..|.......|.......|#######|#######|.......|...##..|...##..",
'lp': ".......|...##..|..##...|.##....|.##....|.##....|.##....|..##...|...##..",
'rp': ".......|..##...|...##..|....##.|....##.|....##.|....##.|...##..|..##...",
'pow': ".......|...#...|..###..|.##.##.|##...##|.......|.......|.......|.......",
'sqrt': "....###|....##.|....##.|...##..|#..##..|##.##..|.####..|..##...|..##...",
'fact': "..###..|..###..|..###..|..###..|..###..|.......|..###..|..###..|..###..",
'dot': ".......|.......|.......|.......|.......|.......|..###..|..###..|..###..",
}
RARE = {'pow','sqrt','fact','dot'}
# 緑の 4 階調（ゲーム機の画面）
N = dict(dk='#071a0c', d='#10341a', m='#1d5128', mh='#3f8f3c', dith='#174421', hi='#e6ffb4', body='#a9de4e', sh='#04100a')
R = dict(hi='#fff6c2', body='#ffc934', sh='#2e1604', ring='#f7c948', ring2='#9a6414')

def runs(cells):
    """同じ行で連続するセルを横にまとめた path"""
    rows = {}
    for x, y in cells: rows.setdefault(y, []).append(x)
    out = []
    for y in sorted(rows):
        xs = sorted(rows[y]); s = p = xs[0]
        for x in xs[1:] + [None]:
            if x is not None and x == p + 1: p = x; continue
            out.append(f"M{s} {y}h{p-s+1}v1h-{p-s+1}z"); 
            if x is not None: s = p = x
    return ''.join(out)

def path(color, cells):
    return f'<path fill="{color}" d="{runs(cells)}"/>' if cells else ''

def board(rare):
    corner = {(0,0),(15,0),(0,15),(15,15)}
    step = {(1,1),(14,1),(1,14),(14,14)}
    ring = {(x,y) for x in range(16) for y in range(16)
            if (x in (0,15) or y in (0,15)) and (x,y) not in corner} | step
    inner = {(x,y) for x in range(1,15) for y in range(1,15)} - step
    hi = {(x,1) for x in range(2,14)} | {(1,y) for y in range(2,14)}
    lo = {(x,14) for x in range(2,14)} | {(14,y) for y in range(2,14)}
    base = inner - hi - lo
    dith = {(x,y) for (x,y) in base if y>=10 and (x+y)%2==0 and y<=13} 
    dith2 = {(x,y) for (x,y) in base if y>=12 and (x+y)%2==1}
    s = path(N['dk'], ring)
    s += path(N['m'], base - dith - dith2)
    s += path(N['d'], dith | dith2 | lo)
    s += path(N['mh'], hi)
    if rare:
        # 金の縁（外周を金、1 つ内側を飴色）
        gold = {(x,y) for (x,y) in ring}
        s += path(R['ring2'], ring - {(x,y) for (x,y) in ring if y==0 or x==0})  # 右下側を飴色
        s += path(R['ring'], {(x,y) for (x,y) in ring if y==0 or x==0 or (x,y) in {(1,1)}})
        s += path(R['ring'], {(x,y) for (x,y) in ring if (x,y) in {(14,1),(1,14)}})
    return s

def glyph(name, rare):
    rows = G[name].split('|'); assert len(rows)==9 and all(len(r)==7 for r in rows), name
    px = {(x+4, y+3) for y,r in enumerate(rows) for x,c in enumerate(r) if c=='#'}
    shadow = {(x+1,y+1) for x,y in px} - px
    top = {(x,y) for x,y in px if (x,y-1) not in px}
    pal = R if rare else N
    return path(pal['sh'], shadow) + path(pal['body'], px-top) + path(pal['hi'], top)

def sparkles():
    s = ''
    for i,(cx,cy) in enumerate([(2,2),(13,2),(2,13),(13,13)]):
        cells = {(cx,cy),(cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)}
        s += (f'<g>{path("#fffbe0", {(cx,cy)})}{path("#ffe27a", cells-{(cx,cy)})}'
              f'<animate attributeName="opacity" values="1;0.15;1" dur="2.4s" begin="{i*0.6}s" repeatCount="indefinite"/></g>')
    return s

out = ['<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" shape-rendering="crispEdges">']
out.append(f'<defs><g id="pixel-bd">{board(False)}</g><g id="pixel-bdr">{board(True)}</g></defs>')
for name in G:
    rare = name in RARE
    body = f'<use href="#pixel-bd{"r" if rare else ""}"/>' + glyph(name, rare) + (sparkles() if rare else '')
    out.append(f'<symbol id="pixel-{name}" viewBox="0 0 100 100"><g transform="scale(6.25)" shape-rendering="crispEdges">{body}</g></symbol>')
out.append('</svg>')
dst = os.path.expanduser('~/GitHub/tof/apps/four-digits/glyphs/pixel.svg')
open(dst,'w').write('\n'.join(out)+'\n')
print(os.path.getsize(dst))
