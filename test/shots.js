// Screenshots of every Surge surface. Run: SURGE_SHOT_PREFIX=42-surge-after xvfb-run -a npx electron test/shots.js --no-sandbox
// Writes raw captures to /tmp/surge-shots-raw/<prefix>-<name>.png (transparent windows keep their alpha; test/compose.py
// puts them on a desktop backdrop into /tmp/lumen-shots/).
const fs = require('fs'), path = require('path');
const OUT = '/tmp/surge-shots-raw', PRE = process.env.SURGE_SHOT_PREFIX || '42-surge-after';
fs.mkdirSync(OUT, { recursive: true });
process.env.SURGE_TEST_MODULES = JSON.stringify({ keys: { enabled: true }, clip: { enabled: true }, caffeine: { enabled: true }, focus: { enabled: true }, stats: { enabled: true }, ripple: { enabled: true } });
const T = require('./_boot.js'); const { app, BrowserWindow, wait, find, tray, mod } = T;
const { ipcMain, clipboard, screen } = require('electron');
const LOG = m => { console.log(m); try { fs.appendFileSync('/tmp/surge-shots.log', `[${PRE}] ${m}\n`); } catch {} };
async function shot(name, w, settle = 1400) {
  if (!w || w.isDestroyed()) return LOG('no window for ' + name);
  if (!w.isVisible()) w.showInactive();
  await wait(settle);
  try { const img = await Promise.race([w.webContents.capturePage(), new Promise((_, rej) => setTimeout(() => rej(new Error('capture timed out')), 5000))]); fs.writeFileSync(path.join(OUT, `${PRE}-${name}.png`), img.toPNG()); LOG('shot ' + name + ' ' + img.getSize().width + 'x' + img.getSize().height); } catch (e) { LOG('shot failed ' + name + ' ' + e.message); }
}
const js = (w, code) => w.webContents.executeJavaScript(code).catch(e => LOG('js ' + e.message));
app.whenReady().then(async () => {
  if (process.env.SURGE_SHOT_THEME) require('electron').nativeTheme.themeSource = process.env.SURGE_SHOT_THEME;   // light | dark
  await wait(5000);
  // pretend a laptop: battery state the panels can show
  try { const ctxBatt = { level: 78, charging: true, charged: false, holding: false, remaining: '0:42' }; ipcMain.removeHandler('battery:get'); ipcMain.handle('battery:get', () => ctxBatt); } catch {}
  clipboard.writeText('https://github.com/mabdulhadi0208-afk/surge'); await wait(2000);
  // the menu
  tray('click').fn(); await wait(300); const pop = find(/popover\.html/);
  await shot('menu', pop, 2200); pop.removeAllListeners('blur');
  const U = mod('00-updater.js');
  if (U._test) {
    U._test('downloading', { progress: 62 }); await shot('menu-update', pop, 1200);
    U._test('ready'); await shot('menu-ready', pop, 1000);
    U._test('idle');
  }
  pop?.hide(); await wait(400);
  // the update card
  if (U._test) {
    for (const st of ['available', 'downloading', 'ready', 'installing', 'error']) { U._test(st, { progress: 62 }); await wait(300); await shot('update-' + st, find(/update\.html/), 1300); }
    U._test('idle'); find(/update\.html/)?.hide();
  } else {
    const w = new BrowserWindow({ width: 560, height: 186, frame: false, transparent: true, show: false, webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true } });
    await w.loadFile(path.join(__dirname, '..', 'update.html'));
    const base = { current: '2.20.0', latest: 'v3.0.0', size: 96e6, bytes: 59e6, speed: 8.4e6, eta: 4, lastCheck: Date.now() };
    for (const [st, x] of [['available', {}], ['downloading', { progress: 62 }], ['ready', { progress: 100 }], ['error', { error: 'GitHub did not answer' }]]) { w.webContents.send('updater:state', { ...base, status: st, ...x }); await shot('update-' + st, w, 1300); }
    w.destroy();
  }
  // settings: every kind of page
  ipcMain.emit('open:settings', {}); await wait(2500); const s = find(/settings\.html/);
  if (s) { s.setBounds({ width: 1040, height: 700 });
    await shot('settings', s, 2000);
    for (const p of ['glow', 'keys', 'updater', 'welcome', 'about', 'clip']) { await js(s, `go(${JSON.stringify(p)}); 1`); await shot('settings-' + p, s, 1500); } }
  // quick notes
  ipcMain.emit('notes:toggle', {}); await wait(300); await shot('notes', find(/notes\.html/), 1800); find(/notes\.html/)?.hide();
  // clipboard picker
  try { const C = mod('09-clipboard.js'), cx = { ...require('./_ctx.js')(), mod: () => ({ max: 25, autoPaste: false }) };
    for (const t of ['#FF2E8A', 'https://github.com/mabdulhadi0208-afk/surge/releases/latest', 'npm run build && npm test', 'Meeting notes: ship Surge 3.0 on Friday']) C.actions.paste(cx, t);
    await C._picker(require('./_ctx.js')()); await wait(800); } catch (e) { LOG('clip ' + e.message); }
  await shot('clip', find(/clip\.html/), 1500); find(/clip\.html/)?.hide();
  // the on-screen capsule (HUD) and the charge glow
  const ov = find(/glow\.html/);
  if (ov) { ov.webContents.send('glow:fire', { kind: 'hud', level: 78, settings: {}, hud: { text: 'Caffeine on: your Mac stays awake', color: '#FFB300' } }); ov.showInactive(); await shot('capsule', ov, 700);
    ov.webContents.send('glow:fire', { kind: 'plug', level: 78, settings: {} }); await shot('glow-plug', ov, 1500); }
  // a click ripple (its own small window)
  if (global.__surge) { global.__surge.ripple({ x: 700, y: 450, color: '#FF2E8A', size: 70, style: 'sparks' }); await wait(120); const fx = BrowserWindow.getAllWindows().find(w => /fx=1/.test(w.webContents.getURL())); if (fx) await shot('ripple', fx, 150); }
  // the tray right-click menu (Surge 3.0 draws its own)
  const rc = tray('right-click'); if (rc) { rc.fn(); await wait(900); const m = find(/menu\.html/); if (m) await shot('traymenu', m, 900); }
  // launchpad + dock (opt-in modules)
  try { ipcMain.emit('module:test-launchpad'); } catch {}
  LOG('done'); app.exit(0);
});
