// Proof that a speed-up changed nothing you can see: deterministic captures of the menu, Settings (several pages), the
// charge glow (scrubbed to fixed moments), the HUD capsule, the Settings glow preview and a click ripple (frozen clock and
// randomness). Run it on the old and on the new code, then compare with test/pixdiff302.py.
// Run: SURGE_PIX=before xvfb-run -a -s "-screen 0 1440x900x24" npx electron test/pixdiff302.js --no-sandbox
const fs = require('fs'), path = require('path');
const OUT = '/tmp/surge-pix', PRE = process.env.SURGE_PIX || 'run';
fs.mkdirSync(OUT, { recursive: true });
process.env.SURGE_TEST_MODULES = JSON.stringify({ keys: { enabled: true }, clip: { enabled: true }, caffeine: { enabled: true }, focus: { enabled: true }, ripple: { enabled: true }, mouse: { enabled: true } });
const T = require('./_boot.js'); const { app, BrowserWindow, wait, find, tray } = T;
const { ipcMain, clipboard } = require('electron');
const LOG = m => console.log(`[pix ${PRE}] ${m}`);
// the drifting dots are the one endless loop; they are frozen the same way in both runs so the pictures are comparable
const FREEZE = `.hero-dots>i{animation:none!important}`;
async function shot(name, w) {
  if (!w || w.isDestroyed()) return LOG('no window for ' + name);
  const img = await Promise.race([w.webContents.capturePage(), new Promise((_, rej) => setTimeout(() => rej(new Error('capture timed out')), 5000))]).catch(e => null); if (!img) return LOG('capture timed out ' + name); fs.writeFileSync(path.join(OUT, `${PRE}-${name}.png`), img.toPNG()); LOG('shot ' + name + ' ' + img.getSize().width + 'x' + img.getSize().height);
}
const js = (w, code) => w.webContents.executeJavaScript(code);
app.whenReady().then(async () => {
  await wait(6000);
  clipboard.writeText('Surge pixel test');
  // the menu
  tray('click').fn(); await wait(400); const pop = find(/popover\.html/); pop.removeAllListeners('blur'); await js(pop, `document.querySelector('#chkT').textContent='x'; 1`); await wait(2600); await js(pop, `document.querySelector('#chkT').textContent='Keys heard 0'; 1`); await wait(300);
  await shot('menu', pop); pop.hide(); await wait(400);
  // Settings pages
  ipcMain.emit('open:settings', {}); const s = await (async () => { for (let i = 0; i < 100; i++) { const w = find(/settings\.html/); if (w && w.isVisible()) return w; await wait(50); } })();
  s.setBounds({ x: 40, y: 40, width: 1040, height: 700 }); await s.webContents.insertCSS(FREEZE); await wait(5000);
  await shot('settings-all', s);
  for (const p of ['glow', 'keys', 'mouse', 'about', 'welcome', 'updater', 'ripple', 'dock', 'clip']) { await js(s, `go(${JSON.stringify(p)}); 1`).catch(() => {}); await wait(4600); await shot('settings-' + p, s); }
  // a flipped switch, then the page after the settings came back from the main process
  await js(s, `go('keys'); document.querySelector('[data-f="keys.spaceThock"]').click(); 1`); await wait(4600); await shot('settings-keys-toggled', s);
  // the glow preview inside Settings, scrubbed
  await js(s, `go('glow'); 1`); await wait(4600);
  for (const f of [.15, .5]) { await js(s, `mini.fire('plug', 67); mini.scrubTo(${f}); 1`); await wait(300); await shot('settings-preview-' + f, s); }
  s.close(); await wait(500);
  // the full-screen charge glow, scrubbed to fixed moments
  const ov = BrowserWindow.getAllWindows().find(w => /glow\.html$/.test(w.webContents.getURL()));
  ov.showInactive(); await wait(500);
  for (const [kind, f] of [['plug', .05], ['plug', .2], ['plug', .5], ['unplug', .4], ['low', .5], ['full', .3]]) { await js(ov, `engine.fire(${JSON.stringify(kind)}, 70, {}); engine.scrubTo(${f}); 1`); await wait(250); await shot(`glow-${kind}-${f}`, ov); }
  await js(ov, `engine.fire('hud', 70, { hud: { text: 'Caffeine on: your Mac stays awake', color: '#FFB300' } }); engine.scrubTo(.5); 1`); await wait(250); await shot('capsule', ov);
  await js(ov, `engine.stop(); 1`); ov.hide(); await wait(300);
  // a click ripple, frozen 300 ms into its burst
  for (const st of ['sparks', 'ring', 'shock', 'drop']) {
    global.__surge.ripple({ x: 700, y: 450, color: '#FF2E8A', size: 70, style: st }); await wait(250);
    const fx = BrowserWindow.getAllWindows().find(w => /fx=1/.test(w.webContents.getURL()) && w.isVisible());
    if (!fx) { LOG('no ripple window'); continue; } clearTimeout(fx._hideT);
    await js(fx, `ripples.length = 0; Math.random = () => .37; const F = performance.now(); performance.now = () => F; 1`);
    fx.webContents.send('ripple', { x: 700, y: 450, color: '#FF2E8A', size: 70, style: st }); await wait(60);
    await js(fx, `performance.now = () => ${'F'} + 300; 1`); await wait(150); await shot('ripple-' + st, fx);
    await js(fx, `delete performance.now; ripples.length = 0; 1`).catch(() => {}); fx.hide(); await wait(1200);
  }
  LOG('done'); app.exit(0);
});
