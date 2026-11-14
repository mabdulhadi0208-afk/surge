// Keyboard Sounds — 145 synthesised presets: 30 real-switch sound-alikes + Thocky / Creamy / Clicky / Clacky / Special.
let off = [], last = 0, stats = { today: 0, day: '' };
const dayKey = () => new Date().toDateString();
const MODS = new Set([42, 54, 29, 3613, 56, 3640, 3675, 3676, 58, 3613]);
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
    { t: 'actions', label: 'Sound pack', opts: [['share', 'Copy share code'], ['import', 'Paste a code']] },
    { t: 'actions', label: 'Stats', opts: [['stats','Keys today']] },
  ],
  actions: {
    stats: () => stats.today,
    // a sound pack = your keyboard + mouse sound setup as one short code anyone can paste into their Surge
    share: (ctx) => { const k = ctx.mod('keys'), m = ctx.mod('mouse');
      const pack = { v: 1, k: { preset: k.preset, volume: k.volume, pitchVariance: k.pitchVariance, spaceThock: k.spaceThock, releaseSound: k.releaseSound }, m: { preset: m.preset, scrollPreset: m.scrollPreset, volume: m.volume } };
      ctx.clipboard.writeText('SURGE-PACK:' + Buffer.from(JSON.stringify(pack)).toString('base64url')); return 'Share code copied — send it to a friend'; },
    import: (ctx) => { const raw = (ctx.clipboard.readText() || '').trim(); const m = /SURGE-PACK:([A-Za-z0-9_-]+)/.exec(raw); if (!m) return 'No Surge sound pack on the clipboard — copy a code first';
      let p; try { p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { return 'That code is damaged'; }
      if (!p || p.v !== 1 || typeof p.k !== 'object') return 'That code is from a newer Surge';
      const S = require('../sounds.js'), num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d), cur = ctx.mod('keys'), cm = ctx.mod('mouse');
      const k = { enabled: true, preset: S.all.some(x => x.id === p.k.preset) ? p.k.preset : cur.preset, volume: num(p.k.volume, 0, 1, cur.volume), pitchVariance: num(p.k.pitchVariance, 0, .6, cur.pitchVariance), spaceThock: !!p.k.spaceThock, releaseSound: !!p.k.releaseSound };
      const patch = { modules: { keys: k } };
      if (p.m && typeof p.m === 'object') patch.modules.mouse = { preset: S.mouse.some(x => x.id === p.m.preset) ? p.m.preset : cm.preset, scrollPreset: S.scrolls.some(x => x.id === p.m.scrollPreset) ? p.m.scrollPreset : cm.scrollPreset, volume: num(p.m.volume, 0, 1, cm.volume) };
      ctx.applyPatch(patch); ctx.play('key', { preset: k.preset, volume: k.volume, kind: 'key', force: true });
      return 'Sound pack applied: ' + (S.all.find(x => x.id === k.preset)?.name || 'custom'); },
  },
  start(ctx) {
    const down = new Map();
    off.push(ctx.onInput('keydown', e => {
      const n0 = Date.now(); if (n0 - (down.get(e.keycode) || 0) < 60) return; down.set(e.keycode, n0);
      const s = ctx.mod('keys'); const now = Date.now(); if (now - last < 10) return; last = now;
      if (stats.day !== dayKey()) { stats.day = dayKey(); stats.today = 0; } stats.today++;
      const kind = e.keycode === 57 && s.spaceThock ? 'space' : e.keycode === 28 ? 'enter' : 'key';
      const modifier = MODS.has(e.keycode);                       // shift / ctrl / alt / cmd / caps / fn → quieter, like a real board
      ctx.play('key', { preset: s.preset, volume: s.volume * (modifier ? .55 : 1), variance: s.pitchVariance, kind });
    }));
    off.push(ctx.onInput('keyup', e => { down.set(e.keycode, 0); const s = ctx.mod('keys'); if (s.releaseSound) ctx.play('key', { preset: s.preset, volume: s.volume * .5, kind: 'up' }); }));
  },
  stop() { off.forEach(f => f()); off = []; },
};
