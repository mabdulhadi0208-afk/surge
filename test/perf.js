// Zero lag, measured. 1) rAF frame deltas while each Surge panel opens (recorder starts only once the window is visible),
// 2) CPU of ALL Surge processes (main + GPU + utility + every renderer) at idle over 30 s via app.getAppMetrics.
// Run: xvfb-run -a npx electron test/perf.js --no-sandbox   → /tmp/surge-perf.log  (SURGE_PERF_LABEL tags the lines)
const fs = require('fs');
const LOGF = '/tmp/surge-perf.log', TAG = process.env.SURGE_PERF_LABEL || 'run';
const LOG = m => { console.log(m); try { fs.appendFileSync(LOGF, `[${TAG}] ${m}\n`); } catch {} };
const T = require('./_boot.js'); const { app, BrowserWindow, wait, find, tray } = T;
let U0 = null;
const REC = ms => `new Promise(res => { const d = []; let l = 0; const end = performance.now() + ${ms}; const f = t => { if (l) d.push(t - l); l = t; if (t < end) requestAnimationFrame(f); else res(d) }; requestAnimationFrame(f) })`;
async function visible(w, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (w && !w.isDestroyed() && w.isVisible()) return true; await wait(10); } return false; }
async function frames(label, getW, trigger, ms = 1200) {
  await trigger(); let w = typeof getW === 'function' ? getW() : getW;
  for (let i = 0; !w && i < 80 && typeof getW === 'function'; i++) { await wait(50); w = getW(); }
  if (!(await visible(w, 4000))) { if (w && !w.isDestroyed()) w.show(); if (!(await visible(w, 1000))) return LOG(`frames  ${label.padEnd(30)} window not visible`); }
  const d = await w.webContents.executeJavaScript(REC(ms)).catch(() => []);
  const worst = d.length ? Math.max(...d) : 0, dropped = d.filter(x => x > 16.7 * 1.5).reduce((n, x) => n + Math.round(x / 16.7) - 1, 0);
  LOG(`frames  ${label.padEnd(30)} ${String(d.length).padStart(3)} frames  dropped ${dropped}  worst ${worst.toFixed(1)} ms`);
}
async function cpu(label, secs = 30) {
  app.getAppMetrics(); await wait(secs * 1000);
  const m = app.getAppMetrics(); let tot = 0;
  for (const p of m) { tot += p.cpu.percentCPUUsage; LOG(`cpu     ${label.padEnd(14)} ${p.type.padEnd(10)} ${(p.name || p.serviceName || '').slice(0, 22).padEnd(22)} ${p.cpu.percentCPUUsage.toFixed(2)}%`); }
  LOG(`CPU     ${label.padEnd(14)} TOTAL ${tot.toFixed(2)}% over ${secs}s  (${m.length} processes, ${BrowserWindow.getAllWindows().length} windows, ${BrowserWindow.getAllWindows().filter(w => w.isVisible()).length} visible)`);
  for (const w of BrowserWindow.getAllWindows()) LOG(`win     ${label.padEnd(14)} ${(w.isVisible() ? 'shown ' : 'hidden')} ${String(w.getBounds().width + 'x' + w.getBounds().height).padEnd(10)} ${w.webContents.getURL().replace(/.*\//, '')}`);
}
T.app.whenReady().then(async () => {
  await wait(6000);
  await cpu('idle-boot');
  const click = tray('click');
  await frames('menu: open (first)', () => find(/popover\.html/), async () => click.fn());
  find(/popover\.html/)?.hide(); await wait(800);
  await frames('menu: open', () => find(/popover\.html/), async () => click.fn());
  find(/popover\.html/)?.hide(); await wait(500);
  require('electron').ipcMain.emit('open:settings', {});
  await frames('settings: open', () => find(/settings\.html/), async () => {}, 1500);
  const s = find(/settings\.html/);
  if (s) await frames('settings: switch page', s, async () => s.webContents.executeJavaScript(`(window.go||window.nav||(()=>0))('glow'); 1`).catch(() => {}));
  require('electron').ipcMain.emit('notes:toggle', {}); await wait(1500); find(/notes\.html/)?.hide(); await wait(400);
  await frames('notes: open', () => find(/notes\.html/), async () => require('electron').ipcMain.emit('notes:toggle', {}));
  try { const U = T.mod('00-updater.js'); if (U._test) { U._test('available'); await frames('update card: open', () => find(/update\.html/), async () => {}, 1500); } } catch (e) { LOG('update card ' + e.message); }
  try { U0 = T.mod('00-updater.js'); U0._test && U0._test('idle'); } catch {}
  const rc = tray('right-click'); if (rc && T.find) { rc.fn(); await wait(1500); const m = find(/menu\.html/); if (m) { m.hide(); await wait(400); await frames('right-click menu: open', () => find(/menu\.html/), async () => rc.fn(), 900); m.hide(); } }
  for (const w of BrowserWindow.getAllWindows()) if (!/glow\.html|dock\.html|audio\.html/.test(w.webContents.getURL())) { if (/settings\.html/.test(w.webContents.getURL())) w.close(); else w.hide(); }
  await wait(4000);
  await cpu('idle-closed');
  app.exit(0);
});
