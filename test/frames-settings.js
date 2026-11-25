// rAF frame deltas while Settings switches pages (each page twice: first build and warm). Writes /tmp/surge-frames.log
const fs = require('fs'); const LOG = m => { console.log(m); fs.appendFileSync('/tmp/surge-frames.log', `[${process.env.SURGE_PERF_LABEL || 'run'}] ${m}\n`); };
const T = require('./_boot.js'); const { app, wait, find } = T;
const REC = ms => `new Promise(res => { const d = []; let l = 0; const end = performance.now() + ${ms}; const f = t => { if (l) d.push(t - l); l = t; if (t < end) requestAnimationFrame(f); else res(d) }; requestAnimationFrame(f) })`;
app.whenReady().then(async () => {
  await wait(4000); require('electron').ipcMain.emit('open:settings', {}); await wait(3000); const s = find(/settings\.html/); s.show(); await wait(1500); if (process.env.PROBE_CSS) await s.webContents.insertCSS(process.env.PROBE_CSS);
  for (const p of ['all', 'glow', 'keys', 'about', 'welcome', 'updater', 'all', 'glow', 'keys', 'about', 'welcome', 'updater']) {
    const rec = s.webContents.executeJavaScript(REC(1000)); await wait(30); await s.webContents.executeJavaScript(`go(${JSON.stringify(p)}); 1`);
    const d = await rec; const worst = Math.max(...d), dropped = d.filter(x => x > 25).reduce((n, x) => n + Math.round(x / 16.7) - 1, 0);
    LOG(`settings -> ${p.padEnd(8)} ${d.length} frames dropped ${dropped} worst ${worst.toFixed(1)} ms`);
  }
  app.exit(0);
});
