// Network Glow — ice sweep when you reconnect, amber when you drop offline.
let timer = null, online = null;
const { execFile } = require('child_process');
module.exports = {
  id: 'net', name: 'Network Glow', icon: 'wifi', group: 'Glow',
  desc: 'Ice glow the moment Wi-Fi comes back, amber sweep when you drop offline.',
  defaults: { onlineGlow: true, offlineGlow: true },
  schema: [{ k: 'onlineGlow', t: 'toggle', label: 'Glow when back online' }, { k: 'offlineGlow', t: 'toggle', label: 'Glow when offline' }],
  start(ctx) { const check = () => execFile(process.platform === 'win32' ? 'ping' : '/sbin/ping', process.platform === 'win32' ? ['-n', '1', '-w', '2000', '1.1.1.1'] : ['-c', '1', '-t', '2', '1.1.1.1'], { timeout: 4000, windowsHide: true }, (err) => { const now = !err; if (online !== null && now !== online) { const s = ctx.mod('net'); if (now && s.onlineGlow) ctx.fireGlow('info', { hud: { text: 'Back online', color: '#7DF9FF' } }); if (!now && s.offlineGlow) ctx.fireGlow('warn', { hud: { text: 'Offline', color: '#FFB300' } }); } online = now; }); check(); timer = setInterval(check, 5000); },
  stop() { clearInterval(timer); online = null; },
};
