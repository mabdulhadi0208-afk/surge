// Surge 3.0.2 lag audit, measured. Boots the real app (test/_boot.js) and writes /tmp/surge-perf302.log (SURGE_PERF_LABEL tags
// the lines, so a "before" and an "after" run sit side by side):
//   1. idle CPU of ALL Surge processes (app.getAppMetrics) with the default modules, then with every module on
//   2. the time to open each window (trigger -> on screen and painted) and the dropped frames while it opens
//   3. dropped frames while Settings switches pages, while a switch is flipped, and on the Charge Glow page
//   4. the cost of one keystroke and one click with key sounds, mouse sounds, typing stats and click ripples on:
//      main-process time inside the input handlers, and CPU of all processes per event during a 12 keys/s and 4 clicks/s burst
// Run: SURGE_PERF_LABEL=after xvfb-run -a npx electron test/perf302.js --no-sandbox
const fs = require('fs');
const LOGF = '/tmp/surge-perf302.log', TAG = process.env.SURGE_PERF_LABEL || 'run';
const LOG = m => { console.log(m); try { fs.appendFileSync(LOGF, `[${TAG}] ${m}\n`); } catch {} };
const T = require('./_boot.js'); const { app, BrowserWindow, wait, find, tray } = T;
const { ipcMain } = require('electron');
const REC = ms => `new Promise(res => { const d = []; let l = 0; const end = performance.now() + ${ms}; const f = t => { if (l) d.push(t - l); l = t; if (t < end) requestAnimationFrame(f); else res(d) }; requestAnimationFrame(f) })`;
const PAINTED = `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`;
const drops = d => d.filter(x => x > 25).reduce((n, x) => n + Math.round(x / 16.7) - 1, 0);
const fmtF = d => `${String(d.length).padStart(3)} frames  dropped ${String(drops(d)).padStart(3)}  worst ${(d.length ? Math.max(...d) : 0).toFixed(1).padStart(6)} ms`;
const R = {};   // summary
async function until(fn, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(5); } return null; }
// open a window and time it: trigger -> visible -> two animation frames painted; then record the frames of its entrance
async function opened(label, getW, trigger, recMs = 1200) {
  const t0 = performance.now(); await trigger();
  const w = await until(() => { const x = getW(); return x && !x.isDestroyed() && x.isVisible() ? x : null; });
  if (!w) { LOG(`open    ${label.padEnd(30)} never became visible`); return null; }
  const rec = w.webContents.executeJavaScript(REC(recMs)).catch(() => []);
  await w.webContents.executeJavaScript(PAINTED).catch(() => {}); const ms = performance.now() - t0;
  const d = await rec; LOG(`open    ${label.padEnd(30)} ${ms.toFixed(0).padStart(5)} ms to on screen and painted   ${fmtF(d)}`);
  R['open ' + label] = ms; R['drop ' + label] = drops(d); return w;
}
async function cpu(label, secs = 20) {
  app.getAppMetrics(); const c0 = process.cpuUsage(); await wait(secs * 1000);
  const m = app.getAppMetrics(); const tot = m.reduce((a, p) => a + p.cpu.percentCPUUsage, 0); const mainMs = (process.cpuUsage(c0).user + process.cpuUsage(c0).system) / 1000;
  for (const p of m) if (p.cpu.percentCPUUsage > .05) LOG(`cpu     ${label.padEnd(18)} ${p.type.padEnd(10)} ${(p.name || p.serviceName || '').slice(0, 22).padEnd(22)} ${p.cpu.percentCPUUsage.toFixed(2)}%`);
  LOG(`CPU     ${label.padEnd(18)} TOTAL ${tot.toFixed(2)}% over ${secs}s (main process ${(mainMs / secs / 10).toFixed(2)}%, ${m.length} processes, ${BrowserWindow.getAllWindows().filter(w => w.isVisible()).length} windows visible)`);
  R['cpu ' + label] = tot; return tot;
}
// CPU of all processes while `fn` runs, in CPU-ms
async function burst(fn) { app.getAppMetrics(); const t0 = Date.now(); await fn(); await wait(1200); const dt = Date.now() - t0; const m = app.getAppMetrics(); return { cpuMs: m.reduce((a, p) => a + p.cpu.percentCPUUsage, 0) / 100 * dt, dt, per: Object.fromEntries(m.map(p => [p.type + ':' + (p.name || p.serviceName || p.pid), p.cpu.percentCPUUsage / 100 * dt])) }; }
app.whenReady().then(async () => {
  try { fs.unlinkSync(LOGF + '.' + TAG); } catch {}
  await wait(7000);
  const G = global.__surge;
  await cpu('idle default');
  // ---------- the menu
  const click = tray('click');
  await opened('menu (first)', () => find(/popover\.html/), async () => click.fn());
  find(/popover\.html/)?.hide(); await wait(900);
  let mw = 0; for (let i = 0; i < 3; i++) { const t0 = performance.now(); await opened('menu (again ' + (i + 1) + ')', () => find(/popover\.html/), async () => click.fn()); mw += R['open menu (again ' + (i + 1) + ')']; find(/popover\.html/)?.hide(); await wait(700); }
  // ---------- Settings
  const s = await opened('settings (first)', () => find(/settings\.html/), async () => ipcMain.emit('open:settings', {}), 1500);
  await wait(1500);
  let tot = 0, totW = 0, n = 0;
  for (const p of ['all', 'glow', 'keys', 'about', 'welcome', 'updater', 'mouse', 'ripple', 'all', 'glow', 'keys', 'about']) {
    const rec = s.webContents.executeJavaScript(REC(1000)); await wait(30); const t0 = performance.now(); await s.webContents.executeJavaScript(`go(${JSON.stringify(p)}); 1`);
    const d = await rec; tot += drops(d); totW = Math.max(totW, Math.max(...d)); n++;
    LOG(`switch  settings -> ${p.padEnd(10)} ${fmtF(d)}`);
    if (p === 'glow' && R['drop switch glow'] == null) R['drop switch glow'] = drops(d);
  }
  LOG(`SWITCH  ${n} page switches: dropped ${tot} frames, worst ${totW.toFixed(1)} ms`); R['drop 12 switches'] = tot;
  // flipping a switch in Settings (repaints the page; the settings come back from the main process too)
  await s.webContents.executeJavaScript(`go('keys'); 1`); await wait(1200);
  { let t = 0, worst = 0; for (let i = 0; i < 4; i++) { const rec = s.webContents.executeJavaScript(REC(700)); await wait(30);
      await s.webContents.executeJavaScript(`(()=>{ const t0=performance.now(); document.querySelector('[data-f="keys.spaceThock"]').click(); return performance.now()-t0; })()`).then(ms => { worst = Math.max(worst, ms); });
      const d = await rec; t += drops(d); LOG(`toggle  keys.spaceThock #${i + 1}      ${fmtF(d)}`); await wait(400); }
    LOG(`TOGGLE  4 switch flips: dropped ${t} frames, click handler up to ${worst.toFixed(1)} ms`); R['drop 4 toggles'] = t; R['toggle handler ms'] = worst; }
  s.close(); await wait(800);
  await opened('settings (reopen)', () => find(/settings\.html/), async () => ipcMain.emit('open:settings', {}), 1500);
  find(/settings\.html/)?.close(); await wait(600);
  // ---------- the other windows
  await opened('notes (first)', () => find(/notes\.html/), async () => ipcMain.emit('notes:toggle', {}));
  find(/notes\.html/)?.hide(); await wait(500);
  await opened('notes (again)', () => find(/notes\.html/), async () => ipcMain.emit('notes:toggle', {}));
  find(/notes\.html/)?.hide(); await wait(500);
  const rc = tray('right-click');
  await opened('right-click menu (first)', () => find(/menu\.html/), async () => rc.fn(), 900); find(/menu\.html/)?.hide(); await wait(500);
  await opened('right-click menu (again)', () => find(/menu\.html/), async () => rc.fn(), 900); find(/menu\.html/)?.hide(); await wait(500);
  try { const U = T.mod('00-updater.js'); await opened('update card', () => find(/update\.html/), async () => U._test('available'), 1500); U._test('idle'); } catch (e) { LOG('update card ' + e.message); }
  // ---------- every module on
  const all = {}; for (const id in G.MODULES) all[id] = { enabled: true }; delete all.spotlight; G.applyPatch({ modules: all });
  await wait(1500);
  for (const w of BrowserWindow.getAllWindows()) if (w.isVisible() && /clip\.html|launchpad|notes|menu\.html|popover|update/.test(w.webContents.getURL())) w.hide();
  await wait(8000);
  await cpu('idle all modules');
  try { const C = T.mod('09-clipboard.js'); await opened('clipboard picker', () => find(/clip\.html/), async () => C._picker(G.ctx)); find(/clip\.html/)?.hide(); await wait(500); } catch (e) { LOG('clip ' + e.message); }
  // ---------- per keystroke / per click (sounds, typing stats, caps HUD, ripples)
  const t = (fn) => { const a = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - a) / 1e6; };
  await wait(1500); await burst(async () => wait(3000)); const idle = await burst(async () => wait(8000)); const idlePerMs = idle.cpuMs / idle.dt;
  let hk = []; const keys = await burst(async () => { for (let i = 0; i < 120; i++) { const kc = [30, 48, 46, 32, 18, 33, 57, 28][i % 8]; hk.push(t(() => G.input('keydown', { keycode: kc }))); await wait(40); hk.push(t(() => G.input('keyup', { keycode: kc }))); await wait(40); } });
  const perKey = (keys.cpuMs - idlePerMs * keys.dt) / 120;
  LOG(`KEY     main-process handler time per key event: avg ${(hk.reduce((a, b) => a + b, 0) / hk.length).toFixed(3)} ms, worst ${Math.max(...hk).toFixed(3)} ms`);
  LOG(`KEY     CPU of all processes per keystroke (down + up, sounds on): ${perKey.toFixed(2)} ms   (${keys.cpuMs.toFixed(0)} ms over ${keys.dt} ms, idle ${(idlePerMs * keys.dt).toFixed(0)} ms)`);
  for (const [k, v] of Object.entries(keys.per)) if (v > 20) LOG(`key-cpu ${k.slice(0, 40).padEnd(40)} ${v.toFixed(0)} ms`);
  R['key handler ms'] = hk.reduce((a, b) => a + b, 0) / hk.length; R['key cpu ms'] = perKey;
  await wait(2000);
  let hc = []; const clicks = await burst(async () => { for (let i = 0; i < 40; i++) { const x = 200 + (i * 137) % 800, y = 150 + (i * 91) % 500; hc.push(t(() => G.input('mousedown', { button: 1, x, y }))); await wait(90); hc.push(t(() => G.input('mouseup', { button: 1, x, y }))); await wait(160); } });
  const perClick = (clicks.cpuMs - idlePerMs * clicks.dt) / 40;
  const fxN = BrowserWindow.getAllWindows().filter(w => /fx=1/.test(w.webContents.getURL())).length;
  LOG(`CLICK   main-process handler time per click event: avg ${(hc.reduce((a, b) => a + b, 0) / hc.length).toFixed(3)} ms, worst ${Math.max(...hc).toFixed(3)} ms`);
  LOG(`CLICK   CPU of all processes per click (down + up, sound + ripple): ${perClick.toFixed(2)} ms   (${clicks.cpuMs.toFixed(0)} ms over ${clicks.dt} ms; ${fxN} ripple windows exist)`);
  for (const [k, v] of Object.entries(clicks.per)) if (v > 20) LOG(`clk-cpu ${k.slice(0, 40).padEnd(40)} ${v.toFixed(0)} ms`);
  R['click handler ms'] = hc.reduce((a, b) => a + b, 0) / hc.length; R['click cpu ms'] = perClick;
  // the glow itself: frames while the full-screen charge glow plays
  const ov = find(/glow\.html$/) || BrowserWindow.getAllWindows().find(w => /glow\.html$/.test(w.webContents.getURL()));
  if (ov) { const g0 = app.getAppMetrics(); const t1 = Date.now(); G.ctx.fireGlow('plug', { level: 70 }); await until(() => ov.isVisible(), 2000); const d = await ov.webContents.executeJavaScript(REC(3000)).catch(() => []); const m = app.getAppMetrics(); const ms = m.reduce((a, p) => a + p.cpu.percentCPUUsage, 0) / 100 * (Date.now() - t1);
    LOG(`GLOW    charge glow plays: ${fmtF(d)}   CPU of all processes ${ms.toFixed(0)} ms over ${Date.now() - t1} ms`); R['glow cpu ms'] = ms; R['drop glow'] = drops(d); }
  await wait(5000);
  LOG('SUMMARY ' + JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, +(+v).toFixed(2)]))));
  app.exit(0);
});
