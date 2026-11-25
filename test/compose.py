#!/usr/bin/env python3
"""Put raw window captures (with alpha) on a desktop backdrop: /tmp/surge-shots-raw/*.png -> /tmp/lumen-shots/*.png"""
import os, sys, glob
from PIL import Image, ImageDraw, ImageFilter
RAW, OUT = '/tmp/surge-shots-raw', '/tmp/lumen-shots'
os.makedirs(OUT, exist_ok=True)
def backdrop(w, h):
    bg = Image.new('RGB', (w, h), (14, 16, 30)); d = ImageDraw.Draw(bg)
    for (cx, cy, r, c) in [(0.15, 0.2, 0.7, (120, 40, 200)), (0.9, 0.9, 0.8, (10, 120, 200)), (0.8, 0.1, 0.5, (200, 40, 120))]:
        layer = Image.new('RGB', (w, h), (0, 0, 0)); ImageDraw.Draw(layer).ellipse([w*cx - w*r/2, h*cy - h*r/2, w*cx + w*r/2, h*cy + h*r/2], fill=c)
        bg = Image.blend(bg, Image.composite(layer, bg, layer.convert('L').point(lambda v: 255 if v else 0)), 0.35)
    return bg.filter(ImageFilter.GaussianBlur(max(w, h) / 10))
pre = sys.argv[1] if len(sys.argv) > 1 else ''
for f in sorted(glob.glob(os.path.join(RAW, pre + '*.png'))):
    im = Image.open(f).convert('RGBA'); w, h = im.size; pad = 0 if w > 1200 else 40
    bg = backdrop(w + pad * 2, h + pad * 2).convert('RGBA'); bg.alpha_composite(im, (pad, pad))
    bg.convert('RGB').save(os.path.join(OUT, os.path.basename(f)))
    print('wrote', os.path.join(OUT, os.path.basename(f)))
