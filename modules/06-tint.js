// Night Tint — warm the whole screen after sunset (or always).
let timer = null, active = false;
module.exports = {
  id: 'tint', name: 'Night Tint', icon: 'moon', group: 'Screen',
  desc: 'A warm amber wash over the screen to cut blue light. Schedule it or keep it on.',
  defaults: { strength: 0.25, schedule: true, from: 20, to: 7, hue: 'amber' },
  schema: [
    { k: 'strength', t: 'range', label: 'Warmth', min: .05, max: .6, step: .01, fmt: 'pct' },
    { k: 'hue', t: 'chips', label: 'Tone', opts: [['amber','Amber','#FFB300'],['candle','Candle','#FF7A00'],['rose','Rose','#FF6E9A'],['sepia','Sepia','#C9A86A']] },
    { k: 'schedule', t: 'toggle', label: 'Only at night', hint: 'Uses the hours below' },
    { k: 'from', t: 'seg', label: 'From', opts: [[18,'18:00'],[19,'19:00'],[20,'20:00'],[21,'21:00'],[22,'22:00']] },
    { k: 'to', t: 'seg', label: 'Until', opts: [[5,'05:00'],[6,'06:00'],[7,'07:00'],[8,'08:00'],[9,'09:00']] },
  ],
  _apply(ctx) {
    const s = ctx.mod('tint'); const h = new Date().getHours();
    const night = s.from > s.to ? (h >= s.from || h < s.to) : (h >= s.from && h < s.to);
    const want = !s.schedule || night;
    if (want !== active) { active = want; ctx.setOverlayPersistent('tint', active); }
    ctx.overlaySend('tint', active ? { on: true, strength: s.strength, hue: s.hue } : { on: false });
  },
  start(ctx) { module.exports._apply(ctx); timer = setInterval(() => module.exports._apply(ctx), 30000); },
  onSettings(ctx) { module.exports._apply(ctx); },
  stop(ctx) { clearInterval(timer); active = false; ctx.setOverlayPersistent('tint', false); ctx.overlaySend('tint', { on: false }); },
};
