# Compares the captures of two test/pixdiff302.js runs: python3 test/pixdiff302.py before after
# For each picture: the number of pixels that differ at all, and the largest difference in any channel (0-255).
import sys, os, glob
from PIL import Image, ImageChops
OUT = '/tmp/surge-pix'
a, b = sys.argv[1], sys.argv[2]
worst = 0
for fa in sorted(glob.glob(f'{OUT}/{a}-*.png')):
    name = os.path.basename(fa)[len(a) + 1:-4]; fb = f'{OUT}/{b}-{name}.png'
    if not os.path.exists(fb): print(f'{name:28} missing in {b}'); worst = 999; continue
    A, B = Image.open(fa).convert('RGBA'), Image.open(fb).convert('RGBA')
    if A.size != B.size: print(f'{name:28} size {A.size} vs {B.size}'); worst = 999; continue
    d = ImageChops.difference(A, B); px = sum(1 for p in (d.get_flattened_data() if hasattr(d, 'get_flattened_data') else d.getdata()) if max(p) > 0); mx = max(max(c) for c in d.getextrema())
    worst = max(worst, mx); print(f'{name:28} {A.size[0]}x{A.size[1]}  differing pixels {px:7d}  max channel diff {mx:3d}  {"IDENTICAL" if px == 0 else ""}')
print('ALL IDENTICAL' if worst == 0 else f'largest channel difference {worst}')
