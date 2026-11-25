// Surge 3.0 smoke test: boots the real app and checks every surface opens, sizes itself and goes away again, the menu-bar
// icons are valid template images, the update card walks through its states, and nothing is left on screen or
// unthrottled at idle. Prints PASS/FAIL lines and writes /tmp/surge-smoke.log. Run: xvfb-run -a npx electron test/smoke.js --no-sandbox
const fs = require('fs'), path = require('path');
const LOGF = '/tmp/surge-smoke.log'; try { fs.unlinkSync(LOGF); } catch {}
let fails = 0; const out = m => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
const ok = (c, m) => { if (!c) fails++; out((c ? 'PASS ' : 'FAIL ') + m); };
process.env.SURGE_TEST_MODULES = JSON.stringify({ keys: { enabled: true }, ripple: { enabled: true }, clip: { enabled: true }, focus: { enabled: true } });
const T = require('./_boot.js'); const { app, BrowserWindow, wait, find, tray, mod, DIR } = T;
const { ipcMain, nativeImage } = require('electron');
app.whenReady().then(async () => {
  await wait(5000);
  const TC = require('../traychip.js');
  const stats = png => { const im = nativeImage.createFromBuffer(png), bmp = im.toBitmap(); let colour = 0, opaque = 0; for (let i = 0; i < bmp.length; i += 4) if (bmp[i + 3] > 200) { opaque++; const mx = Math.max(bmp[i], bmp[i + 1], bmp[i + 2]), mn = Math.min(bmp[i], bmp[i + 1], bmp[i + 2]); if (mx - mn > 60) colour++; } return { im, colour, opaque }; };
  // colour icons (default): Surge colours, 16pt tall at 1x/2x/3x, a light and a dark menu-bar variant that differ
  for (const [kind, b] of [['mark', null], ['chip', { level: 78, charging: true }], ['chip', { level: 100 }], ['battery', { level: 55 }], ['battery', { level: 80, charging: true }], ['battery', { level: 12 }]]) {
    const L = TC.colorPNG(kind, b, 2, false), Dk = TC.colorPNG(kind, b, 2, true), s3 = TC.colorPNG(kind, b, 3, true), st = stats(Dk.png);
    ok(st.im.getSize().height === 32 && nativeImage.createFromBuffer(s3.png).getSize().height === 48 && st.colour > 20, `colour ${kind}${b ? ' ' + b.level + (b.charging ? ' charging' : '') : ''}: 16pt at 2x and 3x, ${st.colour} coloured pixels`);
    ok(!L.png.equals(Dk.png), `colour ${kind}: light and dark menu-bar variants differ`);
  }
  // battery fill follows the level: amber when low, cyan/mint while charging, pink/violet otherwise
  const hue = png => { const bmp = nativeImage.createFromBuffer(png).toBitmap(), w = nativeImage.createFromBuffer(png).getSize().width; let r = 0, g = 0, bl = 0, n = 0; for (let y = 12; y < 20; y++) for (let x = 8; x < 14; x++) { const i = (y * w + x) * 4; if (bmp[i + 3] > 200) { bl += bmp[i]; g += bmp[i + 1]; r += bmp[i + 2]; n++; } } return [r / n, g / n, bl / n]; };   // toBitmap is BGRA
  const lo = hue(TC.colorPNG('battery', { level: 12 }, 2, true).png), ch = hue(TC.colorPNG('battery', { level: 60, charging: true }, 2, true).png), nm = hue(TC.colorPNG('battery', { level: 60 }, 2, true).png);
  ok(lo[0] > 200 && lo[2] < 120, `battery low is amber (${lo.map(Math.round)})`); ok(ch[1] > 150 && ch[0] < 100, `battery charging is cyan/mint (${ch.map(Math.round)})`); ok(nm[2] > 150 && nm[1] < 120, `battery normal is pink/violet (${nm.map(Math.round)})`);
  // monochrome option: template images, black + alpha only
  for (const [n, png, w] of [['mark', TC.markPNG(2), 32], ['chip', TC.chipPNG({ level: 67, charging: true }, 2), 68], ['battery', TC.batteryPNG({ level: 40 }, 2), 52]]) {
    const im = nativeImage.createFromBuffer(png); const bmp = im.toBitmap(); let colour = false;
    for (let i = 0; i < bmp.length; i += 4) if (bmp[i + 3] && (bmp[i] || bmp[i + 1] || bmp[i + 2])) { colour = true; break; }
    ok(!im.isEmpty() && im.getSize().width === w && im.getSize().height === 32 && !colour, `monochrome ${n}: ${im.getSize().width}x${im.getSize().height} @2x, black + alpha only (template)`);
  }
  const G = global.__surge; ok(!G.markIcon().isEmpty() && G.markIcon().getScaleFactors().includes(2), 'tray uses the colour mark with 1x and 2x (3x on 3x displays)');
  G.applyPatch({ modules: { glow: { trayMono: true } } }); const mi = G.markIcon(); ok(!mi.isEmpty() && (process.platform !== 'darwin' || mi.isTemplateImage()), 'Monochrome icon setting switches to the template mark');
  G.applyPatch({ modules: { glow: { trayMono: false } } });
  ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'tray', 'surgeTemplate@2x.png')), 'fallback template icon on disk');
  // the menu
  tray('click').fn(); await wait(1800); const pop = find(/popover\.html/);
  ok(pop && pop.isVisible(), 'menu opens from the menu-bar icon');
  const ph = pop.getBounds().height; ok(ph > 500 && ph <= 860, `menu sized to its content (${ph}px)`);
  const errs = await pop.webContents.executeJavaScript(`[...document.querySelectorAll('.m')].length`); ok(errs >= 15, `menu lists the modules (${errs})`);
  pop.hide(); await wait(300);
  // right-click menu
  tray('right-click').fn(); await wait(1500); const mw = find(/menu\.html/);
  ok(mw && mw.isVisible(), 'right-click menu (Nova) opens');
  const items = mw ? await mw.webContents.executeJavaScript(`document.querySelectorAll('.mi').length`) : 0; ok(items >= 6, `right-click menu has its items (${items})`);
  const mh = mw.getBounds().height, inner = await mw.webContents.executeJavaScript(`document.getElementById('mn').offsetHeight`); ok(mh >= inner, `right-click menu fits its content (${inner} in ${mh})`);
  mw.hide();
  // update card through every state
  const U = mod('00-updater.js');
  for (const st of ['available', 'downloading', 'ready', 'error', 'updated']) { U._test(st, { progress: 40 }); await wait(700); const c = find(/update\.html/);
    const t = c ? await c.webContents.executeJavaScript(`document.getElementById('title').textContent`) : ''; ok(c && c.isVisible() && t.length > 3, `update card: ${st} ("${t}")`); }
  U._test('idle'); await wait(300); ok(!find(/update\.html/)?.isVisible(), 'update card hides when idle');
  // settings + every page
  ipcMain.emit('open:settings', {}); await wait(2500); const s = find(/settings\.html/); ok(s && s.isVisible(), 'settings opens');
  for (const p of ['welcome', 'all', 'glow', 'keys', 'updater', 'about']) { const on = await s.webContents.executeJavaScript(`go(${JSON.stringify(p)}); document.getElementById('pane-${p}').classList.contains('on')`); ok(on, `settings page: ${p}`); }
  // a Nova dialog answers like showMessageBox
  const Nova = require('../novaui.js'); const pr = Nova.dialog({ type: 'question', message: 'Test question', detail: 'Detail', buttons: ['Yes', 'No'], defaultId: 0, cancelId: 1 });
  await wait(1500); const dw = find(/dialog\.html/); ok(dw && dw.isVisible(), 'Nova dialog opens'); if (dw) dw.webContents.executeJavaScript(`document.querySelector('[data-i="1"]').click()`);
  const r = await Promise.race([pr, wait(3000).then(() => ({ response: -1 }))]); ok(r.response === 1, 'Nova dialog returns the clicked button');
  // click ripple: a small window, gone again
  global.__surge.ripple({ x: 400, y: 300, color: '#FF2E8A', size: 60, style: 'sparks' }); await wait(500);
  const fx = BrowserWindow.getAllWindows().find(w => /glow\.html\?fx=1/.test(w.webContents.getURL()));
  ok(fx && fx.isVisible() && fx.getBounds().width < 300, `click ripple draws in a small window (${fx ? fx.getBounds().width + 'x' + fx.getBounds().height : 'none'})`);
  await wait(1200); ok(fx && !fx.isVisible(), 'click ripple window hides right after the burst');
  // idle: nothing on screen, nothing unthrottled
  s.close(); for (const w of BrowserWindow.getAllWindows()) if (w.isVisible() && !/glow\.html/.test(w.webContents.getURL())) w.hide();
  await wait(1500);
  const vis = BrowserWindow.getAllWindows().filter(w => w.isVisible()).map(w => w.webContents.getURL().replace(/.*\//, ''));
  ok(vis.length === 0, `idle: no Surge window on screen (${vis.join(',') || 'none'})`);
  const unthrottled = BrowserWindow.getAllWindows().filter(w => w.webContents.getBackgroundThrottling && !w.webContents.getBackgroundThrottling()).map(w => w.webContents.getURL().replace(/.*\//, ''));
  ok(unthrottled.length === 0, `no window with background throttling off (${unthrottled.join(',') || 'none'})`);
  const big = BrowserWindow.getAllWindows().filter(w => w.isVisible() && w.getBounds().width > 1000);
  ok(big.length === 0, 'no full-screen transparent window up at idle');
  const log = fs.readFileSync(path.join(DIR, 'logs', 'surge.log'), 'utf8');
  ok(!/UNCAUGHT|UNHANDLED|module load/.test(log), 'no errors in surge.log');
  out(fails ? `${fails} FAILED` : 'ALL PASS'); app.exit(fails ? 1 : 0);
});
