// Hourly Chime — a soft bell on the hour.
let timer = null, lastHour = -1;
module.exports = {
  id: 'chime', name: 'Hourly Chime', icon: 'bell', group: 'Sound',
  desc: 'A soft synthesised bell on the hour, with an optional tiny glow. Quiet hours respected.',
  defaults: { glow: true, quietFrom: 23, quietTo: 8, volume: .4 },
  schema: [{ k: 'volume', t: 'range', label: 'Volume', min: 0, max: 1, step: .01, fmt: 'pct' }, { k: 'glow', t: 'toggle', label: 'Tiny glow' }, { k: 'quietFrom', t: 'seg', label: 'Quiet from', opts: [[21,'21:00'],[22,'22:00'],[23,'23:00'],[0,'00:00']] }, { k: 'quietTo', t: 'seg', label: 'Quiet until', opts: [[6,'06:00'],[7,'07:00'],[8,'08:00'],[9,'09:00']] }, { t: 'actions', label: 'Test', opts: [['test','Ring']] }],
  actions: { test: (ctx) => ctx.play('bell', { volume: ctx.mod('chime').volume }) },
  start(ctx) { lastHour = new Date().getHours(); timer = setInterval(() => { const d = new Date(), h = d.getHours(); if (h === lastHour || d.getMinutes() !== 0) return; lastHour = h; const s = ctx.mod('chime'); const quiet = s.quietFrom > s.quietTo ? (h >= s.quietFrom || h < s.quietTo) : (h >= s.quietFrom && h < s.quietTo); if (quiet) return; ctx.play('bell', { volume: s.volume }); if (s.glow) ctx.fireGlow('info', { level: 100, hud: { text: `${h % 12 || 12} o'clock`, color: '#7DF9FF' } }); }, 5000); },
  stop() { clearInterval(timer); },
};
