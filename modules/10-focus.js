// Focus Timer — Pomodoro with glow + chime at every phase change.
let timer = null, endsAt = 0, phase = 'idle', cycles = 0;
module.exports = {
  id: 'focus', name: 'Focus Timer', icon: 'timer', group: 'Productivity',
  desc: 'Pomodoro that lives in your menu bar. Ice glow when a break starts, green when it’s time to focus.',
  defaults: { work: 25, rest: 5, longRest: 15, glow: true, sound: true },
  schema: [
    { k: 'work', t: 'seg', label: 'Focus', opts: [[15,'15m'],[25,'25m'],[45,'45m'],[60,'60m']] },
    { k: 'rest', t: 'seg', label: 'Break', opts: [[3,'3m'],[5,'5m'],[10,'10m']] },
    { k: 'glow', t: 'toggle', label: 'Glow on phase change' },
    { k: 'sound', t: 'toggle', label: 'Chime' },
    { t: 'actions', label: 'Timer', opts: [['start','Start focus'],['stop','Stop']] },
  ],
  actions: { start: (ctx) => module.exports._start(ctx, 'work'), stop: (ctx) => module.exports._stop(ctx), state: () => { const left = endsAt ? Math.max(0, endsAt - Date.now()) : 0; return { phase, mm: Math.floor(left / 60000), ss: String(Math.floor(left % 60000 / 1000)).padStart(2, '0') }; } },
  _start(ctx, p) { const s = ctx.mod('focus'); phase = p; endsAt = Date.now() + (p === 'work' ? s.work : (cycles % 4 === 3 ? s.longRest : s.rest)) * 60000; module.exports._tray(ctx); },
  _stop(ctx) { phase = 'idle'; endsAt = 0; module.exports._tray(ctx); },
  _tray(ctx) {
    const left = endsAt ? Math.max(0, endsAt - Date.now()) : 0, mm = Math.floor(left / 60000), ss = Math.floor(left % 60000 / 1000);
    ctx.setTray('focus', { title: phase === 'idle' ? '' : `${phase === 'work' ? '●' : '○'} ${mm}:${String(ss).padStart(2, '0')}`, menu: [
      { label: phase === 'idle' ? 'Focus timer: idle' : `${phase === 'work' ? 'Focusing' : 'Break'} · ${mm}:${String(ss).padStart(2, '0')} left`, enabled: false },
      { label: phase === 'idle' ? 'Start focus' : 'Stop timer', click: () => phase === 'idle' ? module.exports._start(ctx, 'work') : module.exports._stop(ctx) },
    ] });
  },
  start(ctx) {
    module.exports._tray(ctx);
    timer = setInterval(() => { if (phase === 'idle') return; const s = ctx.mod('focus');
      if (Date.now() >= endsAt) { if (phase === 'work') { cycles++; if (s.glow) ctx.fireGlow('info', { hud: { text: 'Break time', color: '#7DF9FF' } }); if (s.sound) ctx.sysSound('Glass'); ctx.notify('Surge · Focus', 'Nice work — take a break.'); module.exports._start(ctx, 'rest'); }
        else { if (s.glow) ctx.fireGlow('plug', { hud: { text: 'Back to focus', color: '#00FF85' } }); if (s.sound) ctx.sysSound('Hero'); ctx.notify('Surge · Focus', 'Break over — let’s go.'); module.exports._start(ctx, 'work'); } }
      else module.exports._tray(ctx); }, 1000);
  },
  stop(ctx) { clearInterval(timer); module.exports._stop(ctx); },
};
