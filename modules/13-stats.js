// System Stats — CPU / memory in the menu bar.
let timer = null, prev = null;
function cpu(os) { const c = os.cpus(); let idle = 0, total = 0; for (const k of c) { for (const t in k.times) total += k.times[t]; idle += k.times.idle; } const r = prev ? 1 - (idle - prev.idle) / (total - prev.total) : 0; prev = { idle, total }; return Math.max(0, Math.min(1, r)); }
module.exports = {
  id: 'stats', name: 'System Stats', icon: 'chip', group: 'System',
  desc: 'Live CPU and memory in the menu bar. Glows amber if CPU pins above 90% for a while.',
  defaults: { showCpu: true, showMem: false, hotGlow: true },
  schema: [{ k: 'showCpu', t: 'toggle', label: 'CPU in menu bar' }, { k: 'showMem', t: 'toggle', label: 'Memory in menu bar' }, { k: 'hotGlow', t: 'toggle', label: 'Warn glow when CPU is pegged' }],
  start(ctx) { let hot = 0; cpu(ctx.os); timer = setInterval(() => { const s = ctx.mod('stats'); const c = cpu(ctx.os), m = 1 - ctx.os.freemem() / ctx.os.totalmem(); hot = c > .9 ? hot + 1 : 0; if (s.hotGlow && hot === 15) ctx.fireGlow('warn', { hud: { text: 'CPU is pegged', color: '#FFB300' } });
    ctx.setTray('stats', { title: [s.showCpu ? `${Math.round(c * 100)}%` : '', s.showMem ? `${Math.round(m * 100)}%m` : ''].filter(Boolean).join(' '), menu: [{ label: `CPU ${Math.round(c * 100)}% · Memory ${Math.round(m * 100)}% · Load ${ctx.os.loadavg()[0].toFixed(2)}`, enabled: false }] }); }, 2000); },
  stop() { clearInterval(timer); },
};
