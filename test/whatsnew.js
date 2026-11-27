// What's new film test (3.0.4): boots the real Surge as if it had just updated from 3.0.3 and checks the film plays once,
// shows "Surge <version>" and this version's WHATS_NEW items, skips with Esc and with a click, ends on its own, can be
// replayed from Settings, and does NOT play again on the same version or on a fresh install (which has its own welcome).
// Run: xvfb-run -a npx electron test/whatsnew.js --no-sandbox   Prints PASS/FAIL lines and writes /tmp/surge-whatsnew.log.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const VERSION = require('../package.json').version;
const CHILD = process.env.SURGE_WN_CHILD;
process.env.SURGE_TEST_WHATSNEW = '1'; process.env.SURGE_WHATSNEW_DELAY = '1200';
if (!CHILD) process.env.SURGE_TEST_SETTINGS = JSON.stringify({ whatsNewSeen: '3.0.3' });
const T = require('./_boot.js'); const { app, BrowserWindow, wait, find, DIR } = T;
const WN = require('../whatsnew.js');

/* ------------------------------------------------------------ child: a second launch; does the film play? */
if (CHILD) {
  app.whenReady().then(async () => { await wait(4500); const w = find(/whatsnew\.html/);
    process.stdout.write('WNRESULT ' + JSON.stringify({ film: !!w, seen: JSON.parse(fs.readFileSync(path.join(DIR, 'settings.json'), 'utf8')).whatsNewSeen }) + '\n'); app.exit(0); });
  return;
}

const LOGF = '/tmp/surge-whatsnew.log'; try { fs.unlinkSync(LOGF); } catch {}
let fails = 0; const out = m => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
const ok = (c, m) => { if (!c) fails++; out((c ? 'PASS ' : 'FAIL ') + m); };
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;
const child = (env) => new Promise(res => {
  const p = spawn(process.execPath, [__filename, '--no-sandbox'], { env: { ...process.env, SURGE_WN_CHILD: '1', SURGE_TEST_DIR: '', ...env }, stdio: ['ignore', 'pipe', 'ignore'] });
  let buf = ''; p.stdout.on('data', d => (buf += d)); const k = setTimeout(() => p.kill('SIGKILL'), 30000);
  p.on('exit', () => { clearTimeout(k); const m = /WNRESULT (.*)/.exec(buf); res(m ? JSON.parse(m[1]) : null); }); });
const filmGone = async (ms) => { for (let i = 0; i < ms / 100; i++) { if (!find(/whatsnew\.html/)) return true; await wait(100); } return false; };
const filmUp = async (ms) => { for (let i = 0; i < ms / 100; i++) { const w = find(/whatsnew\.html/); if (w && w.isVisible()) return w; await wait(100); } return null; };
const state = w => w.webContents.executeJavaScript('JSON.stringify(window.__film)').then(JSON.parse);

app.whenReady().then(async () => {
  // 1. when it plays
  ok(WN.WHATS_NEW.version === VERSION, `WHATS_NEW is for this version (${WN.WHATS_NEW.version}, package.json ${VERSION})`);
  ok(WN.wantsWhatsNew(VERSION, '3.0.3') && WN.wantsWhatsNew(VERSION, undefined), 'wantsWhatsNew: plays after an update from an older version');
  ok(!WN.wantsWhatsNew(VERSION, VERSION), 'wantsWhatsNew: not again on the same version');
  ok(!WN.wantsWhatsNew('9.9.9', VERSION) && !WN.wantsWhatsNew('', undefined), 'wantsWhatsNew: not for a version it does not describe');
  ok(WN.WHATS_NEW.items.length >= 1 && WN.WHATS_NEW.items.every(i => i.text && !EMOJI.test(i.text)), `WHATS_NEW has ${WN.WHATS_NEW.items.length} items, no emoji`);
  const html = fs.readFileSync(path.join(__dirname, '..', 'whatsnew.html'), 'utf8');
  ok(!EMOJI.test(html) && !EMOJI.test(fs.readFileSync(path.join(__dirname, '..', 'whatsnew.js'), 'utf8')), 'no emoji in the film page or its words');
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || ''; const kf = [...css.matchAll(/@keyframes\s+\w+\{([\s\S]*?\})\}/g)].map(m => m[1]).join('');
  const props = [...kf.matchAll(/([a-z-]+):/g)].map(m => m[1]).filter(p => !['transform', 'opacity'].includes(p));
  ok(props.length === 0, `the film animates transform and opacity only${props.length ? ' (found ' + [...new Set(props)].join(',') + ')' : ''}`);
  ok(/prefers-reduced-motion/.test(html), 'the film respects Reduce motion');

  // 2. after the update it plays once, by itself
  const w = await filmUp(6000); ok(!!w, 'the film plays on the first launch after updating from 3.0.3');
  if (!w) { out('no film window'); app.exit(1); return; }
  ok(w.isAlwaysOnTop(), 'the film is on top of everything');
  await wait(600); let st = await state(w);
  ok(st.state === 'playing', `the film is playing (${st.state})`);
  ok(st.version === VERSION, `film shows version ${st.version}`);
  const shown = await w.webContents.executeJavaScript(`({ name: document.getElementById('name').textContent, ver: document.getElementById('ver').textContent, eye: document.getElementById('eye').textContent, items: [...document.querySelectorAll('#items li')].map(l => l.textContent), all: document.body.innerText })`);
  ok(shown.name === 'Surge' && shown.ver === VERSION, `title reads "${shown.name} ${shown.ver}"`);
  ok(shown.eye.includes(VERSION), `eyebrow reads "${shown.eye}"`);
  ok(shown.items.length === WN.WHATS_NEW.items.length && WN.WHATS_NEW.items.every((it, i) => shown.items[i].endsWith(it.text)), `all ${shown.items.length} WHATS_NEW items render, in order`);
  ok(!EMOJI.test(shown.all), 'no emoji on screen');
  ok(st.length >= 5000 && st.length <= 9000, `the film runs about ${(st.length / 1000).toFixed(1)} s`);
  const seen = JSON.parse(fs.readFileSync(path.join(DIR, 'settings.json'), 'utf8')).whatsNewSeen;
  ok(seen === VERSION, `the version is stored as seen (${seen})`);
  ok(global.__surge.ctx.whatsNewPending() === true, 'the "you are on the new version" card stays away while the film is the welcome');
  const b = w.getBounds(), d = require('electron').screen.getPrimaryDisplay().workArea;
  ok(b.x >= d.x && b.y >= d.y && b.x + b.width <= d.x + d.width + 1 && b.y + b.height <= d.y + d.height + 1, `the film fits on screen (${b.width}x${b.height} at ${b.x},${b.y})`);
  const SHOTS = process.env.SURGE_WN_SHOTS; const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, n + '.png'), (await w.capturePage()).toPNG()); } };
  await shot('0-open'); await wait(700); await shot('1-gem'); await wait(1200); await shot('2-title');
  await wait(2200); await shot('3-changes');   // every change is in by about 4.8 s
  const fits = await w.webContents.executeJavaScript(`(() => { const s = document.getElementById('stage').getBoundingClientRect(), L = [...document.querySelectorAll('#items li')].map(e => e.getBoundingClientRect()), h = document.getElementById('hero').getBoundingClientRect(), k = document.querySelector('.skip').getBoundingClientRect(), p = document.querySelector('.prog').getBoundingClientRect();
    return L.every(r => r.left >= s.left && r.right <= s.right && r.bottom <= p.top - 6) && L.every(r => r.top >= h.bottom) && h.top >= s.top && k.right <= s.right && h.top >= k.bottom - 40; })()`);
  ok(fits, 'nothing spills out of the stage and the changes sit below the title');

  // 3. Esc skips it
  w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  ok(await filmGone(1500), 'Esc skips the film (window gone)'); ok(WN.lastHow === 'skip', `ended by: ${WN.lastHow}`);

  // 4. Settings > About > What's new plays it again; it ends on its own
  global.__surge.ctx.openSettings('about'); let sw = null; for (let i = 0; i < 60 && !(sw = find(/settings\.html/)); i++) await wait(100);
  await wait(2500); const hasBtn = await sw.webContents.executeJavaScript(`!!document.getElementById('whatsNew')`); ok(hasBtn, 'Settings has a What\'s new button');
  await sw.webContents.executeJavaScript(`document.getElementById('whatsNew').click()`);
  const w2 = await filmUp(4000); ok(!!w2, 'the What\'s new button replays the film');
  if (w2) { const len = (await state(w2)).length || 7000; ok(await filmGone(len + 2500), 'the film ends and closes on its own'); ok(WN.lastHow === 'end', `ended by: ${WN.lastHow}`); }

  // 5. a click skips it too
  require('electron').ipcMain.emit('whatsnew:play', {});
  const w3 = await filmUp(4000); ok(!!w3, 'replay from the menu');
  if (w3) { await wait(800); w3.webContents.sendInputEvent({ type: 'mouseDown', x: 400, y: 300, button: 'left', clickCount: 1 }); w3.webContents.sendInputEvent({ type: 'mouseUp', x: 400, y: 300, button: 'left', clickCount: 1 });
    ok(await filmGone(1500), 'a click skips the film'); ok(WN.lastHow === 'skip', `ended by: ${WN.lastHow}`); }
  try { sw?.destroy(); } catch {}

  // 6. the next launch of the same version: no film. A fresh install: no film (it has its own welcome)
  const again = await child({ SURGE_TEST_SETTINGS: JSON.stringify({ whatsNewSeen: VERSION }) });
  ok(again && !again.film, `same version again: the film does not play (${JSON.stringify(again)})`);
  const older = await child({ SURGE_TEST_SETTINGS: JSON.stringify({ whatsNewSeen: '3.0.2' }) });
  ok(older && older.film && older.seen === VERSION, `after an update from 3.0.2 it plays (${JSON.stringify(older)})`);
  const fresh = await child({ SURGE_TEST_FRESH: '1' });
  ok(fresh && !fresh.film && fresh.seen === VERSION, `fresh install: no film, the version is marked seen (${JSON.stringify(fresh)})`);

  out(fails ? `${fails} FAILED` : 'ALL PASS'); app.exit(fails ? 1 : 0);
});
