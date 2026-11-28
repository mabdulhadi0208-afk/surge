// 3.1 screenshots of the pages that need sample data: Surge Dock (each style), Launchpad and the update card in every
// state, light and dark, rendered with test/_fakeapi.js. Run: xvfb-run -a npx electron test/shots31.js --no-sandbox
// Writes to $SHOTS (default /tmp/surge-shots31).
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('fs'), path = require('path');
const OUT = process.env.SHOTS || '/tmp/surge-shots31'; fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
setTimeout(() => { console.log('TIMEOUT'); app.exit(1); }, 180000);
app.on('window-all-closed', () => {});
async function page(file, theme, env, size, after) {
  Object.assign(process.env, env || {}); nativeTheme.themeSource = theme;
  const bg = theme === 'dark' ? '#23221f' : '#d9d3c7';
  const w = new BrowserWindow({ width: size[0], height: size[1], show: true, frame: false, backgroundColor: bg, webPreferences: { preload: path.join(__dirname, '_fakeapi.js'), contextIsolation: true } });
  await w.loadFile(path.join(__dirname, '..', file)); await wait(1300); if (after) await after(w); await wait(900);
  return w;
}
const save = async (w, name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await w.webContents.capturePage()).toPNG()); console.log('shot', name); };
app.whenReady().then(async () => {
  for (const theme of ['light', 'dark']) {
    for (const look of ['islands', 'pill']) {
      const w = await page('dock.html', theme, { FAKE_SETTINGS: JSON.stringify({ dock: { look, widgets: ['apps', 'launchpad', 'clock', 'date', 'battery', 'media', 'volume', 'focus', 'caffeine'] } }) }, [1320, 200], async w => {
        w.webContents.send('fake:emit', 'dock:data', { battery: { level: 78, charging: true, remaining: '0:42' }, volume: 55, media: { name: 'Night Drive', artist: 'The Lanterns', app: 'Music', playing: true }, focus: { phase: 'work', mm: '18', ss: '42' }, caffeine: { on: false } });
        await wait(500); const x = await w.webContents.executeJavaScript(`(()=>{const a=document.querySelectorAll('.ap')[3].getBoundingClientRect();return [a.left+a.width/2,a.top+a.height/2]})()`);
        w.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x[0]), y: Math.round(x[1]) }); await wait(700); });
      await save(w, `dock-${look}-${theme}`); w.destroy();
    }
    const lp = await page('launchpad.html', theme, {}, [760, 520]); await save(lp, `launchpad-${theme}`); lp.destroy();
    for (const [st, x] of [['available', {}], ['downloading', { progress: 62, size: 96e6, bytes: 59e6, speed: 8.4e6, eta: 4 }], ['ready', {}], ['installing', {}], ['updated', { current: '3.1.0' }]]) {
      const w = await page('update.html', theme, { FAKE_UPDATER: JSON.stringify({ status: st, current: '3.0.6', latest: '3.1.0', whatsNew: ['Surge Dock magnifies smoothly, with no lag', 'A calm new look: warm paper, deep ink, one emerald accent', 'Buttons and menus fill from where your pointer enters', 'A clearer update card with Download, Verify and Restart steps', 'Every shortcut on one sheet: press ? in Settings'], ...x }) }, [600, 430], st === 'installing' ? async () => wait(1300) : null);
      await save(w, `update-${st}-${theme}`); w.destroy();
    }
  }
  app.exit(0);
});
