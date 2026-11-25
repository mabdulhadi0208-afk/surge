// The flowing battery, measured: CPU of every Surge process over 60 s while charging (flow looping at 7 fps) and over 60 s
// on battery (still), plus the time spent inside tray.setImage. Simulates an active user (the flow pauses when idle).
// Run: xvfb-run -a npx electron test/perf-flow.js --no-sandbox  → /tmp/surge-perf-flow.log
const fs = require('fs'); const LOGF = '/tmp/surge-perf-flow.log'; try { fs.unlinkSync(LOGF); } catch {}
const LOG = m => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
process.env.SURGE_TEST_MODULES = JSON.stringify({ glow: { enabled: true, trayStyle: process.env.FLOW_STYLE || 'icon' } });
const { Tray } = require('electron'); let setN = 0, setNs = 0n; const oSet = Tray.prototype.setImage;
Tray.prototype.setImage = function (im) { const t = process.hrtime.bigint(); const r = oSet.call(this, im); setNs += process.hrtime.bigint() - t; setN++; return r; };
const T = require('./_boot.js'); const { app, wait } = T;
async function cpu(label, secs) {
  app.getAppMetrics(); const n0 = setN, ns0 = setNs, u0 = process.cpuUsage(); await wait(secs * 1000);
  const m = app.getAppMetrics(); const tot = m.reduce((a, p) => a + p.cpu.percentCPUUsage, 0);
  LOG(`${label.padEnd(26)} all Surge processes ${tot.toFixed(2)}% CPU over ${secs}s | tray.setImage ${setN - n0} calls, ${(Number(setNs - ns0) / 1e6).toFixed(1)} ms total, ${(Number(setNs - ns0) / 1e6 / Math.max(1, setN - n0)).toFixed(3)} ms each | ${m.length} processes`);
  for (const p of m) if (p.cpu.percentCPUUsage > .01) LOG(`   ${p.type.padEnd(10)} ${(p.name || p.serviceName || '').padEnd(20)} ${p.cpu.percentCPUUsage.toFixed(2)}%`);
}
app.whenReady().then(async () => {
  try { const pm = require('electron').powerMonitor; pm.getSystemIdleTime = () => 0; } catch (e) { LOG('could not simulate an active user: ' + e.message); }
  await wait(5000); const G = global.__surge;
  G.ctx.battery = { level: 62, charging: true, charged: false, holding: false, remaining: '0:40' }; G.setTrayBattery(G.ctx.battery, process.env.FLOW_STYLE || 'icon');
  await wait(4000); LOG(`flow mode while charging: ${G.flow.mode}, frames ${G.flow.frames && G.flow.frames.length}, running ${!!G.flow.t}`);
  await cpu('charging, flow looping', 60);
  G.ctx.battery = { level: 61, charging: false, charged: false, holding: false, remaining: '4:10' }; G.setTrayBattery(G.ctx.battery, process.env.FLOW_STYLE || 'icon');
  await wait(4000); LOG(`flow mode on battery: ${G.flow.mode}, running ${!!G.flow.t}`);
  await cpu('on battery, still', 60);
  app.exit(0);
});
