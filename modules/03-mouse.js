// Mouse Sounds — 14 click presets + 3 scroll styles, with momentum (ticks keep going after you lift off the trackpad).
let off = [], inertia = null;
module.exports = {
  id: 'mouse', name: 'Mouse Sounds', icon: 'mouse', group: 'Sound', needsHook: true,
  desc: '14 click sounds (Click, Pop, Glass, Shutter, Metal…) plus scroll-wheel ticks with real momentum.',
  defaults: { preset: 'click', scrollPreset: 'fine', volume: 0.5, scroll: true, rightDifferent: true, momentum: true },
  schema: [
    { k: 'preset', t: 'soundpicker', label: 'Click sound', lib: 'mouse' },
    { k: 'volume', t: 'range', label: 'Volume', min: 0, max: 1, step: .01, fmt: 'pct' },
    { k: 'scroll', t: 'toggle', label: 'Scroll ticks' },
    { k: 'scrollPreset', t: 'seg', label: 'Scroll style', opts: [['fine','Fine'],['ratchet','Ratchet'],['soft','Soft']] },
    { k: 'momentum', t: 'toggle', label: 'Momentum ticks', hint: 'Keep ticking as the scroll coasts after you lift off' },
    { k: 'rightDifferent', t: 'toggle', label: 'Lower pitch for right-click' },
  ],
  start(ctx) {
    const tick = (vol) => { const s = ctx.mod('mouse'); ctx.play('scroll', { preset: s.scrollPreset, volume: s.volume * .5 * vol }); };
    let lastTick = 0, lastEv = 0, gap = 1000, coastT = null;
    const stopCoast = () => { clearTimeout(inertia); inertia = null; clearTimeout(coastT); coastT = null; };
    off.push(ctx.onInput('mousedown', e => { stopCoast(); const s = ctx.mod('mouse'); ctx.play('click', { preset: s.preset, volume: s.volume, master: e.button === 2 && s.rightDifferent ? .85 : 1 }); }));
    off.push(ctx.onInput('mouseup', () => { const s = ctx.mod('mouse'); ctx.play('click', { preset: s.preset, volume: s.volume, up: true }); }));
    off.push(ctx.onInput('wheel', () => {
      const s = ctx.mod('mouse'); if (!s.scroll) return;
      const n = Date.now(); gap = Math.min(400, n - lastEv); lastEv = n; stopCoast();
      if (n - lastTick >= 28) { lastTick = n; tick(1); }
      if (!s.momentum) return;
      // if events stop while we were scrolling fast, coast: ticks with a growing gap (exponential decay of speed)
      coastT = setTimeout(() => { if (gap > 90) return; let g = Math.max(32, gap * 1.6), vol = .9; const step = () => { if (g > 220 || vol < .12) return stopCoast(); tick(vol); g *= 1.18; vol *= .9; inertia = setTimeout(step, g); }; inertia = setTimeout(step, g); }, 70);
    }));
  },
  stop() { off.forEach(f => f()); off = []; clearTimeout(inertia); inertia = null; },
};
