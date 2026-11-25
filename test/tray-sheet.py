#!/usr/bin/env python3
"""Comparison sheet for the menu-bar icons (old vs new, light and dark menu bars, 2x) plus each new icon in a mock macOS menu bar
next to a clock. Reads /tmp/surge-tray (test/tray-render.js), writes /tmp/lumen-shots/42-surge-tray-new.png"""
import glob, os
from PIL import Image, ImageDraw, ImageFont
D = '/tmp/surge-tray'
F = lambda s, w='SemiBold': ImageFont.truetype(f'/usr/share/fonts/opentype/inter/Inter-{w}.otf', s)
LIGHT, DARK = (236, 236, 241), (28, 27, 36)
def load(n):
    p = os.path.join(D, n); return Image.open(p).convert('RGBA') if os.path.exists(p) else None
def tint(im, rgb):
    c = Image.new('RGBA', im.size, rgb + (255,)); c.putalpha(im.getchannel('A')); return c
W = 1800; rows = []
def label_row(text, h=54):
    r = Image.new('RGB', (W, h), (14, 12, 26)); ImageDraw.Draw(r).text((30, 14), text, font=F(26, 'Bold'), fill=(255, 255, 255)); rows.append(r)
def icon_row(names, bg, mono_rgb=None, h=110, cap=None):
    r = Image.new('RGB', (W, h), bg); d = ImageDraw.Draw(r); x = 30
    if cap: d.text((30, 8), cap, font=F(15), fill=(120, 120, 130) if bg == LIGHT else (150, 150, 165))
    for n in names:
        im = load(n)
        if im is None: continue
        if mono_rgb: im = tint(im, mono_rgb)
        big = im.resize((im.width * 2, im.height * 2), Image.NEAREST)     # 2x pixels shown at 2x zoom so the hinting is visible
        r.paste(big, (x, (h - big.height) // 2 + 8), big); x += big.width + 46
    rows.append(r)
KEYS = ['mark', 'chip78c', 'chip100', 'chip46', 'chip12', 'bat55', 'bat80c', 'bat14', 'bat100']
label_row('Before: Surge 2.20 colour chip, then 3.0 first pass (monochrome template)')
icon_row([f'old-{k}@2x.png' for k in ['chip78c', 'chip100', 'chip12']], DARK, cap='2.20 chip (dark menu bar)')
icon_row([f'mono-{k}@2x.png' for k in KEYS], LIGHT, (0, 0, 0), cap='3.0 first pass, light menu bar')
icon_row([f'mono-{k}@2x.png' for k in KEYS], DARK, (255, 255, 255), cap='3.0 first pass, dark menu bar')
label_row('After: Surge 3.0 colour icons (2x pixels, zoomed 2x). Mark, charge chip 78 charging, 100, 46, 12, battery 55, charging, low, full')
icon_row([f'new-light-{k}@2x.png' for k in KEYS], LIGHT, cap='light menu bar variant')
icon_row([f'new-dark-{k}@2x.png' for k in KEYS], DARK, cap='dark menu bar variant')
label_row('In a macOS menu bar, actual size (2x Retina pixels)')
def menubar(bg, fg, dark, item):
    h = 48; r = Image.new('RGB', (W, h), bg); d = ImageDraw.Draw(r)
    d.text((26, 11), 'Finder    File    Edit    View    Go    Window    Help', font=F(26, 'Medium'), fill=fg)
    x = W - 30; clock = 'Tue 25 Nov  10:41'; tw = d.textlength(clock, font=F(26, 'Medium')); x -= tw; d.text((x, 10), clock, font=F(26, 'Medium'), fill=fg)
    for n in reversed(item):
        im = load(f'new-{"dark" if dark else "light"}-{n}@2x.png')
        x -= im.width + 26; r.paste(im, (int(x), (h - im.height) // 2), im)
    # the system's own icons for scale: wifi + control centre as simple shapes
    return r
for dark in (False, True):
    for item in (['mark'], ['chip78c'], ['bat55'], ['bat80c']):
        rows.append(menubar(DARK if dark else (246, 246, 248), (240, 240, 245) if dark else (20, 20, 24), dark, item))
        rows.append(Image.new('RGB', (W, 6), (14, 12, 26)))
H = sum(r.height for r in rows); out = Image.new('RGB', (W, H)); y = 0
for r in rows: out.paste(r, (0, y)); y += r.height
os.makedirs('/tmp/lumen-shots', exist_ok=True); out.save('/tmp/lumen-shots/42-surge-tray-new.png'); print('wrote /tmp/lumen-shots/42-surge-tray-new.png', out.size)
