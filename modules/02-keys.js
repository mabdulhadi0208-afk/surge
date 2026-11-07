// Keyboard Sounds — 145 synthesised presets: 30 real-switch sound-alikes + Thocky / Creamy / Clicky / Clacky / Special.
let off = [], last = 0, stats = { today: 0, day: '' };
const dayKey = () => new Date().toDateString();
module.exports = {
  id: 'keys', name: 'Keyboard Sounds', icon: 'keyboard', group: 'Sound', needsHook: true,
  desc: '145 key sounds: 30 real-switch sound-alikes (MX Blue, Holy Panda, Box Jade, Topre…) plus Thocky, Creamy, Clicky, Clacky, Special — all synthesised live.',
  defaults: { preset: 'switches:holy-panda', volume: 0.6, pitchVariance: 0.22, spaceThock: true, releaseSound: true, favorites: [] },
  schema: [
    { k: 'preset', t: 'soundpicker', label: 'Sound', lib: 'keyboard' },
    { k: 'volume', t: 'range', label: 'Volume', min: 0, max: 1, step: .01, fmt: 'pct' },
    { k: 'pitchVariance', t: 'range', label: 'Pitch variety', min: 0, max: .6, step: .01, fmt: 'pct' },
    { k: 'spaceThock', t: 'toggle', label: 'Deeper spacebar' },
    { k: 'releaseSound', t: 'toggle', label: 'Key release sound' },
    { t: 'actions', label: 'Stats', opts: [['stats','Keys today']] },
  ],
  actions: { stats: () => stats.today },
  start(ctx) {
    const down = new Map();
    off.push(ctx.onInput('keydown', e => {
      const n0 = Date.now(); if (n0 - (down.get(e.keycode) || 0) < 60) return; down.set(e.keycode, n0);
      const s = ctx.mod('keys'); const now = Date.now(); if (now - last < 10) return; last = now;
      if (stats.day !== dayKey()) { stats.day = dayKey(); stats.today = 0; } stats.today++;
      const kind = e.keycode === 57 && s.spaceThock ? 'space' : e.keycode === 28 ? 'enter' : 'key';
      ctx.play('key', { preset: s.preset, volume: s.volume, variance: s.pitchVariance, kind });
    }));
    off.push(ctx.onInput('keyup', e => { down.set(e.keycode, 0); const s = ctx.mod('keys'); if (s.releaseSound) ctx.play('key', { preset: s.preset, volume: s.volume * .5, kind: 'up' }); }));
  },
  stop() { off.forEach(f => f()); off = []; },
};
