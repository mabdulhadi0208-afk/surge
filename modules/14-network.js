// Network Glow — ice sweep when you reconnect, amber when you drop offline.
let timer = null, online = null;
module.exports = {
  id: 'net', name: 'Network Glow', icon: 'wifi', group: 'Glow',
  desc: 'Ice glow the moment Wi-Fi comes back, amber sweep when you drop offline.',
  defaults: { onlineGlow: true, offlineGlow: true },
  schema: [{ k: 'onlineGlow', t: 'toggle', label: 'Glow when back online' }, { k: 'offlineGlow', t: 'toggle', label: 'Glow when offline' }],
  // Asks the system whether it is online (Electron's net.isOnline, no helper process, no ping). Every 8 s.
  start(ctx) { const { net } = require('electron'); const check = () => { let now = true; try { now = net.isOnline(); } catch {} { if (online !== null && now !== online) { const s = ctx.mod('net'); if (now && s.onlineGlow) ctx.fireGlow('info', { hud: { text: 'Back online', color: '#00C2FF' } }); if (!now && s.offlineGlow) ctx.fireGlow('warn', { hud: { text: 'Offline', color: '#FFA514' } }); } online = now; } }; check(); timer = setInterval(check, 8000); },
  stop() { clearInterval(timer); online = null; },
};
