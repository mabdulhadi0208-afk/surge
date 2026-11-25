// Break Reminder — 20-20-20 style nudges.
let timer = null, next = 0;
module.exports = {
  id: 'breaks', name: 'Break Reminder', icon: 'eye', group: 'Productivity',
  desc: 'Every 20 minutes, a gentle ice glow reminds you to look away for 20 seconds. Eyes say thanks.',
  defaults: { every: 20, sound: true },
  schema: [{ k: 'every', t: 'seg', label: 'Every', opts: [[20,'20m'],[30,'30m'],[45,'45m'],[60,'60m']] }, { k: 'sound', t: 'toggle', label: 'Chime' }],
  // one timer, set for the moment it is due (no polling)
  _arm(ctx) { clearTimeout(timer); timer = setTimeout(() => { ctx.fireGlow('info', { hud: { text: 'Look away for 20 seconds', color: '#00C2FF' } }); if (ctx.mod('breaks').sound) ctx.sysSound('Blow'); next = Date.now() + ctx.mod('breaks').every * 60000; module.exports._arm(ctx); }, Math.max(1000, next - Date.now())); },
  start(ctx) { next = Date.now() + ctx.mod('breaks').every * 60000; module.exports._arm(ctx); },
  onSettings(ctx) { next = Math.min(next, Date.now() + ctx.mod('breaks').every * 60000); module.exports._arm(ctx); },
  stop() { clearTimeout(timer); timer = null; },
};
