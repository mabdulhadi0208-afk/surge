#!/usr/bin/env python3
"""Animated preview of the flowing menu-bar icons (2x pixels, zoomed 3x), dark and light menu bars, at the real 7 fps:
/tmp/lumen-shots/42-surge-tray-flow.gif, plus a still strip of all 10 frames: 42-surge-tray-flow.png"""
from PIL import Image, ImageDraw, ImageFont
D, N, Z = '/tmp/surge-flow', 10, 3
names = [('bat-charging', 'Battery, charging (loops)'), ('chip-charging', 'Charge chip, charging (loops)'), ('mark-charging', 'Surge mark, charging (sheen)'), ('bat-onbattery', 'On battery (one pass)'), ('bat-low', 'Low (one pass)')]
F = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', 20)
def frame(f):
    W, H = 1500, 380; im = Image.new('RGB', (W, H), (14, 12, 26)); d = ImageDraw.Draw(im)
    for row, (dark, bg) in enumerate([(True, (28, 27, 36)), (False, (236, 236, 241))]):
        y0 = 40 + row * 170; d.rectangle([0, y0, W, y0 + 150], fill=bg); x = 30
        for n, label in names:
            ic = Image.open(f'{D}/{n}-{"dark" if dark else "light"}-{f}.png').convert('RGBA'); big = ic.resize((ic.width * Z, ic.height * Z), Image.NEAREST)
            im.paste(big, (x, y0 + 30), big); d.text((x, y0 + 120), label, font=F, fill=(160, 160, 175) if dark else (90, 90, 100)); x += max(big.width, 250) + 40
    d.text((30, 8), f'Surge 3.0 flowing menu-bar icons, 7 fps, frame {f + 1}/{N}', font=F, fill=(255, 255, 255))
    return im
frames = [frame(f) for f in range(N)]
frames[0].save('/tmp/lumen-shots/42-surge-tray-flow.gif', save_all=True, append_images=frames[1:], duration=143, loop=0)
strip = Image.new('RGB', (N * 140 + 20, 2 * 70 + 20), (14, 12, 26))
for f in range(N):
    for r, n in enumerate(['bat-charging', 'chip-charging']):
        ic = Image.open(f'{D}/{n}-dark-{f}.png').convert('RGBA'); big = ic.resize((ic.width * 2, ic.height * 2), Image.NEAREST); strip.paste(big, (10 + f * 140, 10 + r * 70), big)
strip.save('/tmp/lumen-shots/42-surge-tray-flow.png'); print('wrote gif + strip')
