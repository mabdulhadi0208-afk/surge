// Mouse Sounds — 14 click presets + 8 scroll styles with momentum, speed-aware pitch and trackpad haptics.
const haptics = require('../haptics.js');
const MAC = process.platform === 'darwin';
let off = [], inertia = null;
const SPACING = { dense: 18, normal: 28, chunky: 55 };
const STRENGTH = { light: 0, medium: 1, firm: 2 };
module.exports = {
  id: 'mouse', name: 'Mouse Sounds', icon: 'mouse', group: 'Sound', needsHook: true,
  desc: MAC ? '14 click sounds plus scroll ticks you can hear and feel: 8 styles, real momentum, pitch that follows your speed, and trackpad haptics.'
            : '14 click sounds plus scroll-wheel ticks: 8 styles, real momentum and pitch that follows your speed.',
  defaults: { preset: 'click', scrollPreset: 'fine', volume: 0.5, scroll: true, rightDifferent: true, momentum: true,
              haptic: true, hapticStrength: 'medium', hapticOnly: false, scrollVolume: 0.25, spacing: 'normal', speedPitch: true, dirPitch: true },
  schema: [
    { k: 'preset', t: 'soundpicker', label: 'Click sound', lib: 'mouse' },
    { k: 'volume', t: 'range', label: 'Click volume', min: 0, max: 1, step: .01, fmt: 'pct' },
    { k: 'rightDifferent', t: 'toggle', label: 'Lower pitch for right-click' },
    { k: 'scroll', t: 'toggle', label: 'Scroll ticks' },
    { k: 'scrollPreset', t: 'seg', label: 'Scroll style', opts: [['fine','Fine'],['ratchet','Ratchet'],['soft','Soft'],['notch','Notch'],['wood','Wood'],['glass','Glass'],['bubble','Bubble'],['clock','Clock']] },
    { k: 'scrollVolume', t: 'range', label: 'Tick volume', min: 0, max: 1, step: .01, fmt: 'pct' },
    { k: 'spacing', t: 'seg', label: 'Tick spacing', opts: [['dense','Dense'],['normal','Normal'],['chunky','Chunky']] },
    { k: 'momentum', t: 'toggle', label: 'Momentum ticks', hint: 'Keep ticking as the scroll coasts after you lift off' },
    { k: 'speedPitch', t: 'toggle', label: 'Pitch follows speed', hint: 'Faster scrolling sounds higher, like a wheel spinning up' },
    { k: 'dirPitch', t: 'toggle', label: 'Different tone per direction', hint: 'Up, down and sideways each sound slightly different' },
    ...(MAC ? [
      { k: 'haptic', t: 'toggle', label: 'Haptic ticks', hint: 'Feel each tick in the trackpad while your fingers are on it. Needs a Force Touch trackpad.' },
      { k: 'hapticStrength', t: 'seg', label: 'Haptic strength', opts: [['light','Light'],['medium','Medium'],['firm','Firm']] },
      { k: 'hapticOnly', t: 'toggle', label: 'Haptics only', hint: 'Silent scrolling: feel the ticks without hearing them' },
    ] : []),
  ],
  start(ctx) {
    const sync = () => { const s = ctx.mod('mouse'); if (MAC && s.scroll && s.haptic) haptics.start(() => ctx.log?.('haptics ready')); else haptics.stop(); };
    sync(); this._sync = sync;
    let lastTick = 0, lastEv = 0, gap = 1000, coastT = null, dir = 1, horiz = false;
    const tick = (vol, coasting) => {
      const s = ctx.mod('mouse');
      let pitch = 1;
      if (s.speedPitch) pitch *= 1.28 - Math.min(1, gap / 160) * .38;               // fast → up to 1.28×, slow → 0.9×
      if (s.dirPitch) pitch *= horiz ? 1.22 : dir > 0 ? .95 : 1.05;
      if (!(MAC && s.haptic && s.hapticOnly)) ctx.play('scroll', { preset: s.scrollPreset, volume: (s.scrollVolume ?? .25) * vol, pitch });
      if (MAC && s.haptic && !coasting) haptics.tap(STRENGTH[s.hapticStrength] ?? 1, Math.max(40, SPACING[s.spacing] || 28));   // fingers are off the pad while it coasts → nothing to feel
    };
    const stopCoast = () => { clearTimeout(inertia); inertia = null; clearTimeout(coastT); coastT = null; };
    off.push(ctx.onInput('mousedown', e => { stopCoast(); const s = ctx.mod('mouse'); ctx.play('click', { preset: s.preset, volume: s.volume, pitch: e.button === 2 && s.rightDifferent ? .86 : 1 }); }));
    off.push(ctx.onInput('mouseup', () => { const s = ctx.mod('mouse'); ctx.play('click', { preset: s.preset, volume: s.volume, up: true }); }));
    off.push(ctx.onInput('wheel', e => {
      const s = ctx.mod('mouse'); if (!s.scroll) return;
      const n = Date.now(); gap = Math.min(400, n - lastEv); lastEv = n; stopCoast();
      if (e && typeof e.rotation === 'number' && e.rotation) dir = e.rotation > 0 ? 1 : -1;
      horiz = !!e && e.direction === 4;
      if (n - lastTick >= (SPACING[s.spacing] || 28)) { lastTick = n; tick(1, false); }
      if (!s.momentum) return;
      // if events stop while we were scrolling fast, coast: ticks with a growing gap (exponential decay of speed)
      coastT = setTimeout(() => { if (gap > 90) return; let g = Math.max(32, gap * 1.6), vol = .9; const step = () => { if (g > 220 || vol < .12) return stopCoast(); gap = g; tick(vol, true); g *= 1.18; vol *= .9; inertia = setTimeout(step, g); }; inertia = setTimeout(step, g); }, 70);
    }));
  },
  onSettings() { this._sync?.(); },
  stop() { off.forEach(f => f()); off = []; clearTimeout(inertia); inertia = null; haptics.stop(); },
};
