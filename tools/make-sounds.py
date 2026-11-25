#!/usr/bin/env python3
"""Surge 3.0's sounds: subtle, glassy, made from nothing (no recordings, no licences).
Writes assets/sounds/*.wav (44.1 kHz, 16-bit mono). Re-run after changing a recipe:  python3 tools/make-sounds.py
Each sound is a few struck-glass partials (inharmonic ratios like a wine glass), a soft attack, an exponential ring-out,
a slow shimmer between two detuned copies, and a short airy tail made of quiet delayed echoes."""
import math, os, random, struct, wave
SR = 44100
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'sounds')
GLASS = [(1.0, 1.0, 1.0), (2.756, .42, 1.6), (5.404, .18, 2.6), (8.933, .07, 3.8)]   # ratio, gain, decay speed-up
def strike(f, t0, dur, gain, decay=4.0, bright=1.0):
    n = int(dur * SR); out = [0.0] * n
    for ratio, g, dk in GLASS:
        fr = f * ratio; amp = gain * g * (bright if ratio > 2 else 1)
        if fr > SR / 2.2: continue
        for k in range(2):                                   # two copies 0.15% apart: a slow glassy shimmer
            ff = fr * (1 + (k - .5) * .0015)
            for i in range(n):
                t = i / SR; env = (1 - math.exp(-t / .004)) * math.exp(-t * decay * dk)
                out[i] += amp * .5 * env * math.sin(2 * math.pi * ff * t)
    return t0, out
def render(parts, length, level=.32, echo=True):
    buf = [0.0] * int(length * SR)
    for t0, sig in parts:
        o = int(t0 * SR)
        for i, v in enumerate(sig):
            if o + i < len(buf): buf[o + i] += v
    if echo:                                                   # a short airy room: three quiet taps
        for d, g in ((.043, .22), (.087, .13), (.151, .07)):
            dd = int(d * SR)
            for i in range(len(buf) - 1, dd - 1, -1): buf[i] += buf[i - dd] * g
    peak = max(1e-9, max(abs(v) for v in buf)); k = level / peak
    fade = int(.03 * SR)
    for i in range(fade): buf[-1 - i] *= i / fade
    return [v * k for v in buf]
def save(name, samples):
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v)) * 32767)) for v in samples))
    print('wrote', name, round(len(samples) / SR, 2), 's')
C6, E6, G6, B6, D7 = 1046.5, 1318.5, 1568.0, 1975.5, 2349.3
RECIPES = {
    'plug':   (lambda: render([strike(G6, 0, 1.0, .8), strike(D7, .07, .9, .55)], 1.1)),           # rising fifth: power in
    'unplug': (lambda: render([strike(D7, 0, .8, .6), strike(G6, .08, .9, .7, decay=5)], 1.0)),       # falling: power out
    'full':   (lambda: render([strike(C6, 0, 1.2, .6), strike(E6, .06, 1.1, .5), strike(G6, .12, 1.1, .5), strike(C6 * 2, .18, 1.0, .45)], 1.4)),
    'low':    (lambda: render([strike(E6 / 2, 0, .9, .8, decay=4.5, bright=.6), strike(E6 / 2 * .944, .16, .9, .7, decay=4.5, bright=.6)], 1.1)),
    'breath': (lambda: render([strike(B6, 0, 1.0, .5, decay=3), strike(E6, .1, 1.0, .5, decay=3)], 1.2, level=.24)),
    'update': (lambda: render([strike(E6, 0, .9, .55), strike(B6, .06, .9, .5), strike(E6 * 2, .12, .8, .4)], 1.1, level=.26)),
    'tap':    (lambda: render([strike(D7, 0, .25, .6, decay=14)], .3, level=.16, echo=False)),
    'open':   (lambda: render([strike(G6, 0, .3, .5, decay=12), strike(D7, .035, .3, .4, decay=12)], .38, level=.16, echo=False)),
}
if __name__ == '__main__':
    random.seed(3)
    for name, make in RECIPES.items(): save(name, make())
