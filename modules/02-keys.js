// Keyboard Sounds — 115 synthesised presets in Thocky / Creamy / Clicky / Clacky / Special.
let off = [], last = 0, stats = { today: 0, day: '' };
const dayKey = () => new Date().toDateString();
module.exports = {
  id: 'keys', name: 'Keyboard Sounds', icon: 'keyboard', group: 'Sound', needsHook: true,
  desc: 'Over 100 key sounds in Thocky, Creamy, Clicky, Clacky and Special — all synthesised live, no samples.',
  defaults: { preset: 'thocky:deep-thock', volume: 0.6, pitchVariance: 0.22, spaceThock: true, releaseSound: true, favorites: [] },
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
    const down = new Set();
    off.push(ctx.onInput('keydown', e => {
      if (down.has(e.keycode)) return; down.add(e.keycode);
      const s = ctx.mod('keys'); const now = Date.now(); if (now - last < 10) return; last = now;
      if (stats.day !== dayKey()) { stats.day = dayKey(); stats.today = 0; } stats.today++;
      const kind = e.keycode === 57 && s.spaceThock ? 'space' : e.keycode === 28 ? 'enter' : 'key';
      ctx.play('key', { preset: s.preset, volume: s.volume, variance: s.pitchVariance, kind });
    }));
    off.push(ctx.onInput('keyup', e => { down.delete(e.keycode); const s = ctx.mod('keys'); if (s.releaseSound) ctx.play('key', { preset: s.preset, volume: s.volume * .5, kind: 'up' }); }));
  },
  stop() { off.forEach(f => f()); off = []; },
};
