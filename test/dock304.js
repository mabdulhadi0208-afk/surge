// 3.0.4: Surge Dock replaces Apple's Dock for real. Apple's Dock is removed with plain "defaults" writes (no System Events
// permission, which used to switch the option back off), the owner's own Dock settings are saved and put back exactly,
// the hidden state is re-applied if macOS brings the Dock back, and Surge Dock itself is a Dock panel, not a window.
// Run: xvfb-run -a npx electron test/dock304.js --no-sandbox
const { app, BrowserWindow } = require('electron');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const guard = setTimeout(() => { console.log('TIMEOUT'); app.exit(1); }, 60000);
app.on('window-all-closed', () => {});
const dock = require('../modules/19-dock.js');

// a fake macOS "defaults" store for com.apple.dock, starting from the owner's own Dock
const ORIGINAL = { autohide: '0', tilesize: '48', orientation: 'bottom', 'show-recents': '1' };
let store = { ...ORIGINAL }; const calls = [];
const sorted = o => JSON.stringify(Object.keys(o || {}).sort().reduce((r, k) => (r[k] = o[k], r), {}));
const run = (cmd, args) => { calls.push([cmd, ...args].join(' '));
  if (cmd === 'defaults' && args[0] === 'read') { if (args[2] in store) return store[args[2]]; throw new Error('does not exist'); }
  if (cmd === 'defaults' && args[0] === 'write') { const [, , k, type, v] = args; store[k] = type === '-bool' ? (v === 'true' ? '1' : '0') : v; return ''; }
  if (cmd === 'defaults' && args[0] === 'delete') { delete store[args[2]]; return ''; }
  return ''; };
dock._exec = (cmd, args, cb) => { let out = null, err = null; try { out = run(cmd, args); } catch (e) { err = e; } setImmediate(() => cb && cb(err, out)); };
dock._execSync = (cmd, args) => run(cmd, args);

const settings = { modules: { dock: { ...dock.defaults } } }; let asked = 0;
const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k]; } };
const ctx = { app, os: require('os'), battery: null, settings, mod: id => settings.modules[id] || {}, applyPatch: p => { merge(settings, p); if (ctx.started) dock.onSettings(ctx); },
  dialog: async () => { asked++; return { response: 0 }; }, globalShortcut: { register() {}, unregister() {} }, runningApps: async () => [], log() {} };
dock._ctx = ctx;

app.whenReady().then(async () => {
  ok(dock.defaults.hideMacDock === true, 'replacing Apple\'s Dock is on by default with Surge Dock');

  // confirm: one question, no System Events permission
  calls.length = 0; ok(await dock._confirmMacDock(ctx) === true && asked === 1, 'one question, then it is done');
  ok(!calls.some(c => /osascript|System Events/.test(c)), 'no System Events permission is asked for');

  // removing it
  calls.length = 0; ok(await dock._macDock(true, ctx) === true, 'Apple\'s Dock is removed');
  ok(store.autohide === '1' && +store['autohide-delay'] >= 999 && store['no-bouncing'] === '1' && store['static-only'] === '1' && store.tilesize === '16', 'it can never slide up at the edge or bounce: ' + JSON.stringify(store));
  ok(store.orientation === 'left', 'and it is parked away from Surge Dock\'s edge');
  ok(calls.includes('killall Dock'), 'the Dock restarts so it takes effect right away');
  ok(sorted(settings.modules.dock.macDockBackup) === sorted(ORIGINAL), 'the owner\'s own Dock settings are saved first: ' + JSON.stringify(settings.modules.dock.macDockBackup));

  // macOS or System Settings brings it back: Surge notices and removes it again, without overwriting the saved settings
  store.autohide = '0'; delete store['autohide-delay'];
  await dock._macDockCheck(ctx);
  ok(store.autohide === '1' && +store['autohide-delay'] >= 999, 'if the Dock comes back, Surge removes it again');
  ok(sorted(settings.modules.dock.macDockBackup) === sorted(ORIGINAL), 'and still remembers the owner\'s real settings');

  // quitting puts it back exactly, synchronously
  dock._macDockRestoreSync(ctx);
  ok(JSON.stringify(Object.keys(store).sort().reduce((o, k) => (o[k] = store[k], o), {})) === JSON.stringify(Object.keys(ORIGINAL).sort().reduce((o, k) => (o[k] = ORIGINAL[k], o), {})), 'quitting puts Apple\'s Dock back exactly as it was: ' + JSON.stringify(store));
  ok(settings.modules.dock.macDockBackup === null, 'and forgets the saved copy');

  // Surge Dock itself: a Dock, not a window
  settings.modules.dock = { ...dock.defaults, macDockConfirmed: false, hideMacDock: false }; asked = 0;
  let dw = null; app.once('browser-window-created', (_e, w) => (dw = w));
  let allSpaces = false; const realVAW = BrowserWindow.prototype.setVisibleOnAllWorkspaces; BrowserWindow.prototype.setVisibleOnAllWorkspaces = function (v, o) { if (v) allSpaces = true; return realVAW.call(this, v, o); };
  ctx.started = true; dock.start(ctx); await new Promise(r => setTimeout(r, 2500));
  ok(!!dw && dw.isAlwaysOnTop() && !dw.isFocusable(), 'Surge Dock sits above app windows and never takes focus');
  ok(allSpaces, 'and asks to be on every desktop');   // a virtual display without a window manager cannot report it back
  ok(settings.modules.dock.macDockV2 === true && settings.modules.dock.hideMacDock === true && asked === 1, 'anyone whose option was switched off by the old permission is asked once more');
  await new Promise(r => setTimeout(r, 300));
  dock.stop(ctx);
  ok(store.autohide === ORIGINAL.autohide && store.tilesize === ORIGINAL.tilesize, 'stopping Surge Dock brings Apple\'s Dock back');
  ok(BrowserWindow.getAllWindows().length === 0, 'and leaves no window behind');

  clearTimeout(guard); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); app.exit(fails ? 1 : 0);
});
