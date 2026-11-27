// 3.0.5: Surge Dock behaves like the Dock. In a fullscreen app it tucks away and slides up when you touch the screen
// edge (it used to never show there); the native helper is told where the Dock is so zoomed and new windows stop above
// it; and the native parts are optional: without them nothing breaks.
// Run: xvfb-run -a npx electron test/dock305.js --no-sandbox
const { app, BrowserWindow, screen } = require('electron');
const { EventEmitter } = require('events'); const { PassThrough } = require('stream');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const guard = setTimeout(() => { console.log('TIMEOUT'); app.exit(1); }, 90000);
app.on('window-all-closed', () => {});
const Native = require('../dock-native.js');
const dock = require('../modules/19-dock.js');
dock._exec = (c, a, cb) => setImmediate(() => cb && cb(null, '')); dock._execSync = () => '';   // never touch a real Dock

// a fake helper process speaking the same JSON-lines protocol
let sent = [], fake = null;
const fakeSpawn = () => { fake = new EventEmitter(); fake.stdin = new PassThrough(); fake.stdout = new PassThrough(); fake.kill = () => {};
  fake.stdin.on('data', d => String(d).split('\n').filter(Boolean).forEach(l => sent.push(JSON.parse(l)))); return fake; };
const say = (o) => fake.stdout.write(JSON.stringify(o) + '\n');

const settings = { modules: { dock: { ...dock.defaults, hideMacDock: false, macDockConfirmed: true, macDockV2: true, fullscreen: false } } };
const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k]; } };
const ctx = { app, os: require('os'), battery: null, settings, mod: id => settings.modules[id] || {}, applyPatch: p => { merge(settings, p); dock.onSettings && dock._ctx && dock.onSettings(ctx); },
  dialog: async () => ({ response: 0 }), globalShortcut: { register() {}, unregister() {} }, runningApps: async () => [], log() {} };

app.whenReady().then(async () => {
  // defaults and settings
  ok(dock.defaults.fullscreen === true && dock.defaults.keepClear === true, 'slide up in fullscreen and keep windows clear are on by default');
  ok(dock.schema.some(f => f.k === 'keepClear') && /fullscreen/i.test(dock.schema.find(f => f.k === 'fullscreen').hint), 'both are in Settings');

  // zone maths: from the top of the dock to the screen edge
  const z = Native.zoneFor({ edge: 'bottom', winX: 510, winY: 780, winW: 900, winH: 300, pill: { l: 100, t: 200, w: 700, h: 90 }, screen: { x: 0, y: 0, width: 1920, height: 1080 } });
  ok(z.y === 980 && z.h === 100 && z.x === 610 && z.w === 700 && z.sh === 1080, 'the band covers the dock down to the screen edge: ' + JSON.stringify(z));
  const zt = Native.zoneFor({ edge: 'top', winX: 0, winY: 25, winW: 900, winH: 300, pill: { l: 0, t: 6, w: 600, h: 90 }, screen: { x: 0, y: 0, width: 1920, height: 1080 } });
  ok(zt.y === 0 && zt.h === 121, 'and for a top dock, from the screen top to the bottom of the dock');

  // the native parts are optional
  ok(Native.makeDock(null) === false, 'without the add-on, making it a Dock quietly does nothing');
  const h0 = Native.Helper({ bin: '/nonexistent/surge-dock' }); ok(h0.start() === false && !h0.running, 'without the helper, nothing starts and nothing throws');

  // start Surge Dock with the fake helper
  const realHelper = Native.Helper; Native.Helper = (o) => realHelper({ ...o, spawnFn: fakeSpawn, bin: 'fake' });
  let dw = null; app.once('browser-window-created', (_e, w) => (dw = w));
  dock.start(ctx); await wait(2500);
  ok(settings.modules.dock.fsV2 === true && settings.modules.dock.fullscreen === true, 'people who had it off in fullscreen get the new behavior once');
  say({ ev: 'ready', ax: true, protocol: 1 }); await wait(200);
  const zoneMsg = sent.filter(m => m.cmd === 'zone').pop(), kc = sent.filter(m => m.cmd === 'keepclear').pop();
  ok(!!zoneMsg && zoneMsg.edge === 'bottom' && zoneMsg.y + zoneMsg.h === zoneMsg.sy + zoneMsg.sh, 'the helper is told where the dock is: ' + JSON.stringify(zoneMsg));
  ok(kc && kc.on === true, 'and to keep windows clear of it');

  // fullscreen: it tucks away, comes up at the edge, and is back when you leave
  ok(dw.isVisible(), 'the dock is up on the desktop');
  say({ ev: 'fullscreen', on: true }); await wait(600);
  ok(!dw.isVisible(), 'in a fullscreen app it tucks away');
  const b = screen.getPrimaryDisplay().bounds; const realCursor = screen.getCursorScreenPoint;
  screen.getCursorScreenPoint = () => ({ x: b.x + b.width / 2, y: b.y + b.height - 1 }); await wait(700);
  ok(dw.isVisible(), 'touching the bottom edge slides it up, like Apple\'s Dock in fullscreen');
  screen.getCursorScreenPoint = () => ({ x: b.x + 20, y: b.y + 40 }); await wait(700);
  ok(!dw.isVisible(), 'moving away tucks it back');
  screen.getCursorScreenPoint = realCursor;
  say({ ev: 'fullscreen', on: false }); await wait(700);
  ok(dw.isVisible() && dw.getPosition()[1] === dock._geom(ctx).shown, 'leaving fullscreen brings it back where it lives');

  // turned off: it stays out of fullscreen apps
  ctx.applyPatch({ modules: { dock: { fullscreen: false } } }); await wait(200);
  say({ ev: 'fullscreen', on: true }); await wait(400);
  ok(!dw.isVisible(), 'with Slide up in fullscreen apps off, it stays out of them');
  screen.getCursorScreenPoint = () => ({ x: b.x + b.width / 2, y: b.y + b.height - 1 }); await wait(600);
  ok(!dw.isVisible(), 'even at the edge');
  screen.getCursorScreenPoint = realCursor;
  say({ ev: 'fullscreen', on: false }); await wait(700);
  ok(dw.isVisible(), 'and comes back on the desktop');

  // auto-hide on: no space is kept for it, like Apple's Dock with auto-hide
  sent = []; ctx.applyPatch({ modules: { dock: { autohide: true } } }); await wait(300);
  ok((sent.filter(m => m.cmd === 'keepclear').pop() || {}).on === false, 'with auto-hide, windows are not kept clear (Apple\'s Dock does the same)');
  ctx.applyPatch({ modules: { dock: { autohide: false } } });

  // a crashed helper is started again
  let spawns = 0; const before = fake; fake.emit('exit', 1); await wait(1300);
  ok(fake !== before, 'if the helper stops, Surge starts it again');
  ok(sent.some(m => m.cmd === 'zone'), 'and tells it again where the dock is');

  dock.stop(ctx); await wait(200);
  ok(BrowserWindow.getAllWindows().length === 0, 'stopping leaves no window behind');
  clearTimeout(guard); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); app.exit(fails ? 1 : 0);
});
