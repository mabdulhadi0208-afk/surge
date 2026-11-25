// Settings page switches: every page, twice (first visit and again). For each switch: the time go() takes, the time until the new
// page's first frame is on screen (two animation frames), and whether the switch touched the main process at all (settings saves,
// settings patches, IPC calls). Also the longest main-process stall during the run. Writes /tmp/surge-switch302.log.
// Run: SURGE_PERF_LABEL=after xvfb-run -a npx electron test/switch302.js --no-sandbox
const fs = require('fs');
const LOGF = '/tmp/surge-switch302.log', TAG = process.env.SURGE_PERF_LABEL || 'run';
let fails = 0; const out = m => { console.log(m); fs.appendFileSync(LOGF, `[${TAG}] ${m}\n`); }; const ok = (c, m) => { if (!c) fails++; out((c ? 'PASS ' : 'FAIL ') + m); };
process.env.SURGE_TEST_MODULES = JSON.stringify({ keys: { enabled: true }, mouse: { enabled: true }, ripple: { enabled: true }, clip: { enabled: true }, dark: { enabled: true }, typing: { enabled: true }, tint: { enabled: true } });
const T = require('./_boot.js'); const { app, wait, find } = T;
const { ipcMain } = require('electron');
const LIMIT_FRAME = +(process.env.SWITCH_LIMIT || 50);
app.whenReady().then(async () => {
  await wait(6000);
  const G = global.__surge, S = G.stats || { saves: 0, patches: 0, ipc: new Map(), stalls: [] };   // (3.0.1 had no lag watch)
  ipcMain.emit('open:settings', {}); let s; for (let i = 0; i < 400; i++) { s = find(/settings\.html/); if (s && s.isVisible()) break; await wait(10); }
  await wait(3000);
  const pages = await s.webContents.executeJavaScript(`[...document.querySelectorAll('#nav button')].map(b => b.dataset.p)`);
  // the Settings page's own 5 s battery line (battery:get, hook:state) runs on a timer, not on a switch
  const ipcCount = () => [...S.ipc.entries()].filter(([k]) => !/^(battery:get|hook:state)$/.test(k)).reduce((a, [, e]) => a + e.n, 0);
  const res = [];
  for (const round of [1, 2]) for (const p of pages) {
    const saves = S.saves, patches = S.patches, ipc = ipcCount(), st0 = S.stalls.length;
    const r = await s.webContents.executeJavaScript(`(async () => { const a = performance.now(); go(${JSON.stringify(p)}); const b = performance.now();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return [b - a, performance.now() - a]; })()`);
    await wait(250);
    res.push({ p, round, go: r[0], frame: r[1], saves: S.saves - saves, patches: S.patches - patches, ipc: ipcCount() - ipc, stall: Math.max(0, ...S.stalls.slice(st0)) });
  }
  for (const x of res) out(`switch  round ${x.round}  ${x.p.padEnd(9)} go() ${x.go.toFixed(1).padStart(6)} ms   on screen ${x.frame.toFixed(1).padStart(6)} ms   saves ${x.saves}  patches ${x.patches}  ipc ${x.ipc}  main stall ${x.stall} ms`);
  const r2 = res.filter(x => x.round === 2), med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  out(`SUMMARY first visits: median on screen ${med(res.filter(x => x.round === 1).map(x => x.frame)).toFixed(1)} ms, worst ${Math.max(...res.filter(x => x.round === 1).map(x => x.frame)).toFixed(1)} ms; again: median ${med(r2.map(x => x.frame)).toFixed(1)} ms, worst ${Math.max(...r2.map(x => x.frame)).toFixed(1)} ms; worst go() ${Math.max(...res.map(x => x.go)).toFixed(1)} ms`);
  ok(res.every(x => x.saves === 0 && x.patches === 0), 'no page switch saves or changes settings');
  ok(res.every(x => x.ipc === 0), 'no page switch calls the main process');
  ok(Math.max(...res.map(x => x.stall)) <= +(process.env.STALL_LIMIT || 50), `no main-process stall over ${process.env.STALL_LIMIT || 50} ms while switching (the main process does no work on a switch; what remains is the machine's scheduling) (worst ${Math.max(...res.map(x => x.stall))} ms)`);
  ok(med(r2.map(x => x.frame)) < LIMIT_FRAME, `a page switch is on screen in under ${LIMIT_FRAME} ms (median ${med(r2.map(x => x.frame)).toFixed(1)} ms, software rendering)`);
  ok(Math.max(...res.map(x => x.go)) < LIMIT_FRAME, `go() itself never takes ${LIMIT_FRAME} ms (worst ${Math.max(...res.map(x => x.go)).toFixed(1)} ms)`);
  // the top IPC handlers by total main-process time over the whole run
  for (const [k, e] of [...S.ipc.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6)) out(`ipc     ${k.padEnd(18)} ${e.n} calls, ${e.total.toFixed(1)} ms total, max ${e.max.toFixed(1)} ms`);
  out(fails ? `${fails} FAILED` : 'ALL PASS'); app.exit(fails ? 1 : 0);
});
