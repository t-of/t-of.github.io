#!/usr/bin/env python3
"""SHORT MATH のアイコン icon.svg を作る。使い方: python3 tools/make-short-math-icon.py 26
Jost(太さ800)の数字をパスにして書く。年の下2桁だけ引数で替える。"""
import sys, io
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
yy = sys.argv[1] if len(sys.argv) > 1 else "26"
F = "/Users/kases/GitHub/tof/apps/four-digits/fonts/jost.woff2"
OUT = "/Users/kases/GitHub/tof/apps/four-digits/icons/icon.svg"
f = TTFont(F)
if "fvar" in f: f = instantiateVariableFont(f, {"wght": 800})
gs = f.getGlyphSet(); cmap = f.getBestCmap()
SIZE = 124; GAP = 18; PLUS_W = 66; TRACK = 4
sc = SIZE / f["head"].unitsPerEm
chars = "20" + yy
info = []
for c in chars:
    g = cmap[ord(c)]; bp = BoundsPen(gs); gs[g].draw(bp); info.append((g, bp.bounds))
def w(i): b = info[i][1]; return (b[2]-b[0])*sc
left = sum(w(i) for i in (0,1)) + TRACK
right = sum(w(i) for i in (2,3)) + TRACK
total = left + GAP + PLUS_W + GAP + right
x0 = 256 - total/2
capH = max(b[3] for _, b in info) * sc
base = 256 + capH/2
def path(i, x):
    g, b = info[i]; pen = SVGPathPen(gs, lambda v: f"{v:.1f}")
    t = TransformPen(pen, (sc, 0, 0, -sc, x - b[0]*sc, base)); gs[g].draw(t); return pen.getCommands()
ds = []; x = x0
for i in (0,1): ds.append(path(i, x)); x += w(i) + TRACK
cx = x - TRACK + GAP + PLUS_W/2
x = cx + PLUS_W/2 + GAP
for i in (2,3): ds.append(path(i, x)); x += w(i) + TRACK
h = (PLUS_W-21)/2  # 線端の丸み分を引く
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0d1017"/><path fill="#eceef3" d="{' '.join(ds)}"/><path d="M{cx:.1f} {256-h:.1f}v{2*h:.1f}M{cx-h:.1f} 256h{2*h:.1f}" stroke="#f4c25b" stroke-width="21" stroke-linecap="round" fill="none"/></svg>
'''
open(OUT, "w").write(svg)
print("幅", round(total), "/ 512 (80%=410)  高さ", round(capH))
