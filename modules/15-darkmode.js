// Auto Dark Mode — flip macOS appearance on a schedule.
let timer = null, lastWant = null;
const { execFile } = require('child_process');
module.exports = {
  id: 'dark', name: 'Auto Dark Mode', icon: 'contrast', group: 'System',
  desc: 'Switch macOS to dark mode in the evening and back to light in the morning (asks for Automation permission once).',
  defaults: { from: 19, to: 7 },
  schema: [{ k: 'from', t: 'seg', label: 'Dark from', opts: [[17,'17:00'],[18,'18:00'],[19,'19:00'],[20,'20:00'],[21,'21:00']] }, { k: 'to', t: 'seg', label: 'Light at', opts: [[5,'05:00'],[6,'06:00'],[7,'07:00'],[8,'08:00']] }, { t: 'actions', label: 'Now', opts: [['toggle','Toggle dark mode']] }],
  actions: { toggle: () => execFile('osascript', ['-e', 'tell application "System Events" to tell appearance preferences to set dark mode to not dark mode'], () => {}) },
  _apply(ctx) { const s = ctx.mod('dark'), h = new Date().getHours(); const want = s.from > s.to ? (h >= s.from || h < s.to) : (h >= s.from && h < s.to); if (want === lastWant) return; lastWant = want; execFile('osascript', ['-e', `tell application "System Events" to tell appearance preferences to set dark mode to ${want}`], (e) => { if (e && !module.exports._warned) { module.exports._warned = true; ctx.fireGlow('hud', { hud: { text: 'Auto Dark Mode needs Automation → System Events', color: '#FFB300' } }); } }); },
  start(ctx) { module.exports._apply(ctx); timer = setInterval(() => module.exports._apply(ctx), 60000); },
  onSettings(ctx) { lastWant = null; module.exports._apply(ctx); },
  stop() { clearInterval(timer); lastWant = null; },
};
