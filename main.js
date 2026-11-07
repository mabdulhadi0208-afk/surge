// Surge — core. Loads modules, owns windows (overlay / settings / audio / notes), tray, settings.
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell, globalShortcut, powerSaveBlocker, clipboard, Notification, nativeTheme, dialog, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

/* ------------------------------------------------------------------ logging (~/Library/Logs/Surge/surge.log) */
let logStream = null;
function log(...a) { const line = `[${new Date().toISOString()}] ${a.map(x => x instanceof Error ? (x.stack || x.message) : typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')}\n`; try { logStream?.write(line); } catch {} process.stderr.write(line); }
try { const dir = app.getPath('logs'); fs.mkdirSync(dir, { recursive: true }); logStream = fs.createWriteStream(path.join(dir, 'surge.log'), { flags: 'a' }); } catch {}
process.on('uncaughtException', e => log('UNCAUGHT', e)); process.on('unhandledRejection', e => log('UNHANDLED', e));
console.error = (...a) => log('ERR', ...a); console.warn = (...a) => log('WARN', ...a);

/* ------------------------------------------------------------------ settings */
const MODULES = {};                       // id → module
let settings = { modules: {} };
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
function defaultsFor(m) { return { enabled: !!m.defaultEnabled, ...(m.defaults || {}) }; }
function loadSettings() {
  let raw = {}; try { raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch {}
  settings = { launchAtLogin: !!raw.launchAtLogin, masterVolume: raw.masterVolume ?? 1, muted: !!raw.muted, modules: {} };
  for (const id in MODULES) settings.modules[id] = { ...defaultsFor(MODULES[id]), ...(raw.modules?.[id] || {}) };
}
function saveSettings() { try { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2)); } catch (e) { console.error(e); } }
function mod(id) { return settings.modules[id]; }

/* ------------------------------------------------------------------ global input hook (optional native dep) */
let hook = null, hookState = 'unavailable';
try {
  const { uIOhook } = require('uiohook-napi');
  hook = uIOhook; hookState = 'ready'; try { hook.setMaxListeners(64); } catch {}
} catch (e) { setTimeout(() => log('uiohook-napi not available:', e.message), 0); }
const hookListeners = { keydown: new Set(), keyup: new Set(), mousedown: new Set(), mouseup: new Set(), wheel: new Set(), mousemove: new Set() };
let hookStarted = false;
let hookWired = false, hookRetry = null, axPrompted = false;
function accessibilityOK(prompt) { if (process.platform !== 'darwin') return true; try { return systemPreferences.isTrustedAccessibilityClient(!!prompt); } catch { return true; } }
function ensureHook() {
  if (!hook || hookStarted) return hookStarted;
  if (!accessibilityOK(false)) {
    // silent: no macOS prompt, no dialog. The popover/settings show a single Allow button that triggers the prompt.
    hookState = 'needs-accessibility'; if (!axPrompted) { axPrompted = true; log('hook waiting for Accessibility permission'); }
    if (!hookRetry) hookRetry = setInterval(() => { if (accessibilityOK(false)) { clearInterval(hookRetry); hookRetry = null; ensureHook(); ctx.broadcast('settings:update', settings); } }, 3000);
    return false;
  }
  try {
    if (!hookWired) { for (const ev of Object.keys(hookListeners)) hook.on(ev, (e) => hookListeners[ev].forEach(fn => { try { fn(e); } catch (err) { console.error(err); } })); hookWired = true; }
    hook.start(); hookStarted = true; hookState = 'running'; log('hook started');
    fireGlow('hud', { hud: { text: 'Keyboard & mouse hook active', color: '#00FF85' } });
  } catch (e) { hookState = 'error'; console.error('hook start failed', e.message); }
  return hookStarted;
}
ipcMain.on('open:accessibility', () => { try { systemPreferences.isTrustedAccessibilityClient(true); } catch {} shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'); });
ipcMain.on('open:inputmonitoring', () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent'));
function onInput(ev, fn) { hookListeners[ev].add(fn); ensureHook(); return () => hookListeners[ev].delete(fn); }

/* ------------------------------------------------------------------ overlay windows (one per display) */
let overlays = [];
let overlayPersistent = new Set();        // module ids that need the overlay always visible
let glowBusy = 0;
function destroyOverlays() { overlays.forEach(w => { try { w.destroy(); } catch {} }); overlays = []; }
function createOverlays() {
  destroyOverlays();
  for (const d of screen.getAllDisplays()) {
    const { x, y, width, height } = d.bounds;
    const win = new BrowserWindow({
      x, y, width, height, transparent: true, frame: false, hasShadow: false, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, roundedCorners: false, enableLargerThanScreen: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false },
    });
    win.displayId = d.id; win.displayBounds = d.bounds;
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadFile(path.join(__dirname, 'glow.html'));
    win.webContents.on('console-message', (_e, lvl, msg) => lvl >= 2 && log('overlay', msg));
    win.webContents.on('render-process-gone', (_e, d) => log('overlay gone', d));
    win.webContents.on('did-finish-load', () => { win.webContents.send('settings:update', settings); win.webContents.send('overlay:bounds', d.bounds); });
    overlays.push(win);
  }
  syncOverlayVisibility();
}
function syncOverlayVisibility() {
  const show = overlayPersistent.size > 0 || glowBusy > 0;
  overlays.forEach(w => { if (w.isDestroyed()) return; if (show) { if (!w.isVisible()) w.showInactive(); } else if (w.isVisible()) w.hide(); });
}
function overlaySend(ch, payload) { overlays.forEach(w => !w.isDestroyed() && w.webContents.send(ch, payload)); }
function setOverlayPersistent(id, on) { on ? overlayPersistent.add(id) : overlayPersistent.delete(id); syncOverlayVisibility(); }
/** kind: plug | unplug | low | full | info(ice) | warn(amber) | preview */
function fireGlow(kind, extra = {}) {
  glowBusy++; syncOverlayVisibility();
  overlaySend('glow:fire', { kind, level: extra.level ?? battery?.level ?? 100, settings: mod('glow'), ...extra });
}
ipcMain.on('glow:done', () => { glowBusy = Math.max(0, glowBusy - 1); syncOverlayVisibility(); });

/* ------------------------------------------------------------------ audio window (WebAudio synth) */
let audioWin = null;
function ensureAudio() {
  if (audioWin && !audioWin.isDestroyed()) return audioWin;
  audioWin = new BrowserWindow({ show: false, width: 10, height: 10, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  audioWin.loadFile(path.join(__dirname, 'audio.html'));
  audioWin.webContents.on('console-message', (_e, lvl, msg) => lvl >= 2 && log('audio', msg));
  return audioWin;
}
function play(sound, opts = {}) { if (settings.muted) return; const w = ensureAudio(); if (!w || w.isDestroyed()) return; const send = () => { try { w.webContents.send('audio:play', { sound, master: settings.masterVolume ?? 1, ...opts }); } catch {} }; w.webContents.isLoading() ? w.webContents.once('did-finish-load', send) : send(); }
function sysSound(name) { if (process.platform === 'darwin') execFile('afplay', [`/System/Library/Sounds/${name}.aiff`], () => {}); }

/* ------------------------------------------------------------------ battery (shared by modules) */
let battery = null;
function readBattery(cb) {
  if (process.platform !== 'darwin') return cb(null);
  execFile('pmset', ['-g', 'batt'], { timeout: 3000 }, (err, out) => {
    if (err || !out) return cb(null);
    const src = /'(AC|Battery) Power'/.exec(out), lvl = /(\d{1,3})%/.exec(out);
    if (!lvl) return cb(null);
    const time = /(\d{1,2}:\d{2}) remaining/.exec(out);
    cb({ level: parseInt(lvl[1], 10), charging: src ? src[1] === 'AC' : !/discharging/i.test(out), remaining: time ? time[1] : null, charged: /charged/i.test(out) });
  });
}

/* ------------------------------------------------------------------ settings / notes windows */
let settingsWin = null, notesWin = null;
function openSettings(pane) {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); if (pane) settingsWin.webContents.send('nav', pane); return; }
  settingsWin = new BrowserWindow({
    width: 980, height: 660, minWidth: 820, minHeight: 540, show: false, frame: false, transparent: true, hasShadow: true,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 }, vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.webContents.on('console-message', (_e, lvl, msg) => lvl >= 2 && log('settings', msg));
  settingsWin.once('ready-to-show', () => { settingsWin.show(); if (pane) settingsWin.webContents.send('nav', pane); });
  settingsWin.on('closed', () => { settingsWin = null; if (process.platform === 'darwin' && !(notesWin && !notesWin.isDestroyed())) app.dock?.hide(); });
  if (process.platform === 'darwin') app.dock?.show();
}
function toggleNotes() {
  if (notesWin && !notesWin.isDestroyed()) { notesWin.isVisible() ? notesWin.hide() : (notesWin.show(), notesWin.focus()); return; }
  notesWin = new BrowserWindow({ width: 360, height: 420, minWidth: 260, minHeight: 200, frame: false, transparent: true, alwaysOnTop: true, hasShadow: true, vibrancy: 'hud', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  notesWin.loadFile(path.join(__dirname, 'notes.html'));
  notesWin.setVisibleOnAllWorkspaces(true);
  notesWin.on('closed', () => (notesWin = null));
}

/* ------------------------------------------------------------------ apps (for Surge Dock) */
const iconCache = new Map();
function appIcon(appPath) {
  if (iconCache.has(appPath)) return Promise.resolve(iconCache.get(appPath));
  return new Promise((resolve) => {
    const done = (v) => { iconCache.set(appPath, v); resolve(v); };
    try {
      let icns = null;
      try { icns = require('child_process').execFileSync('plutil', ['-extract', 'CFBundleIconFile', 'raw', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')], { timeout: 3000 }).toString().trim(); } catch {}
      if (!icns) { try { const plist = fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'utf8'); icns = /CFBundleIconFile<\/key>\s*<string>([^<]+)/.exec(plist)?.[1]; } catch {} }
      if (icns && !icns.endsWith('.icns')) icns += '.icns';
      const src = icns && !icns.includes('..') && path.join(appPath, 'Contents', 'Resources', icns);
      if (src && fs.existsSync(src)) {
        const dir = path.join(app.getPath('userData'), 'icons'); fs.mkdirSync(dir, { recursive: true });
        const out = path.join(dir, Buffer.from(appPath).toString('base64url').slice(-40) + '.png');
        if (fs.existsSync(out)) return done('data:image/png;base64,' + fs.readFileSync(out).toString('base64'));
        return execFile('sips', ['-s', 'format', 'png', '--resampleWidth', '128', src, '--out', out], { timeout: 8000 }, (e) => { if (!e && fs.existsSync(out)) done('data:image/png;base64,' + fs.readFileSync(out).toString('base64')); else fallback(); });
      }
    } catch {}
    fallback();
    function fallback() {
      // asset-catalog icons (Assets.car): let Quick Look render the bundle's icon — a separate process, cannot crash us
      const dir = path.join(app.getPath('userData'), 'icons'); fs.mkdirSync(dir, { recursive: true });
      const tmp = path.join(dir, 'ql-' + Buffer.from(appPath).toString('base64url').slice(-40)); fs.mkdirSync(tmp, { recursive: true });
      execFile('qlmanage', ['-t', '-s', '128', '-o', tmp, appPath], { timeout: 8000 }, () => {
        try { const f = fs.readdirSync(tmp).find(x => x.endsWith('.png')); if (f) { const out = path.join(dir, Buffer.from(appPath).toString('base64url').slice(-40) + '.png'); fs.renameSync(path.join(tmp, f), out); fs.rmSync(tmp, { recursive: true, force: true }); return done('data:image/png;base64,' + fs.readFileSync(out).toString('base64')); } } catch {}
        fs.rmSync(tmp, { recursive: true, force: true }); done(null);
      });
    }
  });
}
function parseLsappinfo(o) {
  const out = []; let cur = null;
  for (const line of o.split('\n')) {
    const h = /^\s*\d+\)\s+"([^"]+)"/.exec(line);
    if (h) { if (cur) out.push(cur); cur = { name: h[1], bundleId: null, path: null, pid: null, front: /\(in front\)/.test(line), bg: false }; continue; }
    if (!cur) continue;
    let mm;
    if ((mm = /bundleID="([^"]+)"/.exec(line))) cur.bundleId = mm[1];
    if ((mm = /bundle path="([^"]+)"/.exec(line))) cur.path = mm[1];
    if ((mm = /\bpid\s*=\s*(\d+)/.exec(line))) cur.pid = +mm[1];
    if (/type="BackgroundOnly"|type="UIElement"/.test(line)) cur.bg = true;
    if (/\(in front\)/.test(line)) cur.front = true;
  }
  if (cur) out.push(cur);
  return out;
}
let appsWarned = false;
function runningApps() {
  return new Promise((resolve) => execFile('lsappinfo', ['list'], { timeout: 4000, maxBuffer: 8 * 1024 * 1024 }, (e, o) => {
    let list = (!e && o) ? parseLsappinfo(o) : [];
    list = list.filter(a => a.path && /\.app\/?$/.test(a.path) && !a.bg && a.name !== 'Surge');
    for (const a of list) a.path = a.path.replace(/\/$/, '');
    if (list.length) return resolve(list);
    // fallback: System Events (needs Automation permission, which the Dock takeover already asked for)
    execFile('osascript', ['-e', 'tell application "System Events" to set L to {} \n repeat with p in (every application process whose background only is false) \n try \n set end of L to (name of p) & "\t" & (bundle identifier of p) & "\t" & (POSIX path of (application file of p)) & "\t" & (unix id of p) & "\t" & (frontmost of p) \n end try \n end repeat \n set AppleScript\'s text item delimiters to linefeed \n return L as text'], { timeout: 6000 }, (e2, o2) => {
      const alt = [];
      if (!e2 && o2) for (const l of o2.split('\n')) { const [name, bundleId, p, pid, front] = l.split('\t'); if (p && p.endsWith('.app') && name !== 'Surge') alt.push({ name, bundleId, path: p.replace(/\/$/, ''), pid: +pid || null, front: front === 'true', bg: false }); }
      if (!appsWarned) { appsWarned = true; log(`apps: lsappinfo gave 0 apps (err=${e ? e.message : 'none'}, ${(o || '').length} bytes, head=${JSON.stringify((o || '').slice(0, 200))}); System Events fallback gave ${alt.length}${e2 ? ' err=' + e2.message : ''}`); }
      resolve(alt);
    });
  }));
}
ipcMain.handle('apps:running', () => runningApps());   // icons are fetched separately by the dock, never block the list
ipcMain.handle('apps:installed', async () => { const dirs = ['/Applications', '/System/Applications', path.join(os.homedir(), 'Applications')]; const out = [];
  for (const d of dirs) { try { for (const f of fs.readdirSync(d)) if (f.endsWith('.app')) out.push({ name: f.replace(/\.app$/, ''), path: path.join(d, f) }); } catch {} }
  out.sort((a, b) => a.name.localeCompare(b.name)); return out; });
ipcMain.handle('apps:icon', (_e, p) => appIcon(p));
ipcMain.on('apps:open', (_e, p) => { execFile('open', ['-a', p], (err) => err && execFile('open', [p], () => {})); });
ipcMain.on('apps:activate', (_e, bundleId, p) => { if (p) execFile('open', ['-a', p], (err) => err && bundleId && execFile('open', ['-b', bundleId], () => {})); else if (bundleId) execFile('open', ['-b', bundleId], () => {}); });
ipcMain.on('apps:quit', (_e, bundleId, pid) => { if (pid) { try { process.kill(pid, 'SIGTERM'); } catch {} } else if (bundleId) execFile('osascript', ['-e', `tell application id "${bundleId}" to quit`], () => {}); });

/* ------------------------------------------------------------------ popover (click the menu-bar bolt) */
let popWin = null, popHidAt = 0;
function ensurePopover() {
  if (popWin && !popWin.isDestroyed()) return popWin;
  popWin = new BrowserWindow({ width: 380, height: 500, show: false, frame: false, transparent: true, hasShadow: false, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  popWin.loadFile(path.join(__dirname, 'popover.html'));
  popWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  popWin.setAlwaysOnTop(true, 'pop-up-menu');
  popWin.on('blur', () => { if (popWin && !popWin.isDestroyed() && !popWin.webContents.isDevToolsOpened()) { popWin.hide(); popHidAt = Date.now(); } });
  popWin.webContents.on('console-message', (_e, lvl, msg) => lvl >= 2 && log('popover', msg));
  return popWin;
}
function togglePopover() {
  const w = ensurePopover();
  if (w.isVisible()) { w.hide(); return; }
  if (Date.now() - popHidAt < 250) return;
  const b = tray.getBounds(); const d = screen.getDisplayNearestPoint({ x: b.x, y: b.y });
  const [pw, ph] = w.getSize();
  let x = Math.round(b.x + b.width / 2 - pw / 2); const y = Math.round(b.y + b.height + 4);
  x = Math.max(d.workArea.x + 6, Math.min(x, d.workArea.x + d.workArea.width - pw - 6));
  w.setPosition(x, y, false); w.show(); w.focus(); w.webContents.send('popover:show');
  try { if (running.has('updater')) MODULES.updater._check(ctx, false); } catch {}
}

/* ------------------------------------------------------------------ tray */
let tray = null, trayMenu = null, trayExtras = {};           // module id → { title?: string, menu?: MenuItem[] }
function trayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24"><path fill="black" d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`;
  const img = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')).resize({ width: 18, height: 18 });
  img.setTemplateImage(true); return img;
}
function setTray(id, extra) { const k = JSON.stringify(extra, (kk, v) => typeof v === 'function' ? undefined : v); if (trayKeys[id] === k) return; trayKeys[id] = k; trayExtras[id] = extra; updateTray(); }
const trayKeys = {};
function updateTray() {
  if (!tray) return;
  const titles = Object.values(trayExtras).map(e => e?.title).filter(Boolean);
  tray.setTitle(titles.length ? ' ' + titles.join('  ') : '');
  const items = [];
  for (const [id, e] of Object.entries(trayExtras)) if (e?.menu?.length) { items.push(...e.menu); items.push({ type: 'separator' }); }
  trayMenu = Menu.buildFromTemplate([
    ...items,
    { label: 'Settings…', accelerator: 'Cmd+,', click: () => openSettings() },
    { label: 'Quick Notes', accelerator: 'Cmd+Shift+N', click: toggleNotes },
    { type: 'separator' },
    { label: 'Mute all sounds', type: 'checkbox', checked: !!settings.muted, accelerator: 'Cmd+Shift+M', click: (m) => applyPatch({ muted: m.checked }) },
    { label: 'Launch at login', type: 'checkbox', checked: !!settings.launchAtLogin, click: (m) => applyPatch({ launchAtLogin: m.checked }) },
    { label: 'Quit Surge', accelerator: 'Cmd+Q', click: () => app.quit() },
  ]);
}

/* ------------------------------------------------------------------ module context + lifecycle */
const ctx = {
  app, screen, clipboard, Notification, nativeTheme, powerSaveBlocker, globalShortcut, execFile, os,
  get settings() { return settings; }, mod, fireGlow, overlaySend, setOverlayPersistent, play, sysSound, onInput, hookState: () => hookState,
  setTray, openSettings, toggleNotes, readBattery, applyPatch: (p) => applyPatch(p), get battery() { return battery; }, set battery(v) { battery = v; },
  notify: (title, body) => { try { new Notification({ title, body, silent: true }).show(); } catch {} },
  broadcast: (ch, p) => { [settingsWin, notesWin, audioWin, popWin, ...overlays].forEach(w => { try { if (w && !w.isDestroyed()) w.webContents.send(ch, p); } catch {} }); },
};
const running = new Set();
function startModule(id) { const m = MODULES[id]; if (!m || running.has(id)) return; try { m.start?.(ctx); running.add(id); log('start', id); } catch (e) { console.error(`[${id}] start`, e); } }
function stopModule(id) { const m = MODULES[id]; if (!m || !running.has(id)) return; try { m.stop?.(ctx); } catch (e) { console.error(`[${id}] stop`, e); } running.delete(id); trayExtras[id] = null; delete trayKeys[id]; updateTray(); }
function reconcile() {
  for (const id in MODULES) {
    const want = !!mod(id).enabled;
    if (want && !running.has(id)) startModule(id);
    else if (!want && running.has(id)) stopModule(id);
    else if (want) { try { MODULES[id].onSettings?.(ctx); } catch (e) { console.error(`[${id}] onSettings`, e); } }
  }
}
function applyPatch(patch) {
  if ('masterVolume' in patch) settings.masterVolume = Math.max(0, Math.min(1, +patch.masterVolume));
  if ('muted' in patch) settings.muted = !!patch.muted;
  if ('launchAtLogin' in patch) { settings.launchAtLogin = !!patch.launchAtLogin; if (process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, openAsHidden: true }); }
  if (patch.modules) for (const id in patch.modules) settings.modules[id] = { ...settings.modules[id], ...patch.modules[id] };
  saveSettings(); reconcile(); ctx.broadcast('settings:update', settings); updateTray();
}

/* ------------------------------------------------------------------ ipc */
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_e, patch) => { applyPatch(patch); return settings; });
ipcMain.handle('settings:reset', () => { settings = { launchAtLogin: false, modules: {} }; for (const id in MODULES) settings.modules[id] = defaultsFor(MODULES[id]); saveSettings(); reconcile(); ctx.broadcast('settings:update', settings); return settings; });
ipcMain.handle('modules:list', () => Object.values(MODULES).map(m => ({ id: m.id, name: m.name, icon: m.icon, group: m.group, desc: m.desc, needsHook: !!m.needsHook, schema: m.schema || [] })));
ipcMain.handle('battery:get', () => battery);
ipcMain.handle('hook:state', () => hookState);
ipcMain.handle('module:action', (_e, id, action, arg) => { try { return MODULES[id]?.actions?.[action]?.(ctx, arg); } catch (e) { console.error(e); } });
ipcMain.on('glow:preview', (_e, kind) => fireGlow(kind || 'preview', kind === 'low' ? { level: 12 } : kind === 'full' ? { level: 100 } : {}));
ipcMain.on('audio:test', (_e, sound, opts) => play(sound, opts));
ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.on('win:hide', (e) => BrowserWindow.fromWebContents(e.sender)?.hide());
ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('open:external', (_e, url) => /^https?:\/\//.test(url) && shell.openExternal(url));
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('open:settings', () => openSettings());
ipcMain.on('notes:toggle', () => toggleNotes());
const notesPath = () => path.join(app.getPath('userData'), 'notes.txt');
ipcMain.handle('notes:load', () => { try { return fs.readFileSync(notesPath(), 'utf8'); } catch { return ''; } });
ipcMain.on('notes:save', (_e, text) => { try { fs.writeFileSync(notesPath(), String(text ?? '')); } catch {} });

/* ------------------------------------------------------------------ boot */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => openSettings());
app.whenReady().then(async () => {
  log('boot', app.getVersion(), process.platform, process.arch, 'electron', process.versions.electron, process.execPath);
  if (process.platform === 'darwin' && app.isPackaged) {
    const translocated = process.execPath.includes('/AppTranslocation/');
    if (translocated || !app.isInApplicationsFolder()) {
      const r = await dialog.showMessageBox({ type: 'info', buttons: ['Move to Applications', 'Not now'], defaultId: 0, cancelId: 1, message: 'Move Surge to your Applications folder?',
        detail: translocated ? 'macOS is running Surge from a temporary, read-only location (this happens when you open it from the DMG). Permissions and auto-updates only work from Applications.' : 'Surge works best — and can update itself — when it lives in Applications.' });
      if (r.response === 0) { try { if (app.moveToApplicationsFolder({ conflictHandler: () => true })) return; } catch (e) { log('move failed', e.message); } }
    } else {
      // kill the quarantine flag so Gatekeeper never translocates us again
      execFile('xattr', ['-cr', process.execPath.slice(0, process.execPath.indexOf('.app/') + 4)], () => {});
    }
  }
  for (const f of fs.readdirSync(path.join(__dirname, 'modules')).filter(f => f.endsWith('.js')).sort()) {
    try { const m = require(path.join(__dirname, 'modules', f)); MODULES[m.id] = m; } catch (e) { console.error('module load', f, e); }
  }
  log('modules', Object.keys(MODULES).join(','), 'hook', hookState);
  {
  }
  const firstRun = !fs.existsSync(settingsPath());
  loadSettings(); saveSettings();
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Surge', submenu: [
    { label: 'Settings…', accelerator: 'Cmd+,', click: () => openSettings() },
    { label: 'Quick Notes', accelerator: 'Cmd+Shift+N', click: toggleNotes },
    { label: 'Preview glow', accelerator: 'Cmd+P', click: () => fireGlow('preview') },
    { type: 'separator' }, { role: 'close' }, { role: 'minimize' }, { role: 'quit' } ]}, { role: 'editMenu' }]));
  if (process.platform === 'darwin') app.dock?.hide();
  createOverlays(); ensureAudio();
  tray = new Tray(trayIcon()); tray.setIgnoreDoubleClickEvents(true);
  tray.on('click', togglePopover);
  tray.on('right-click', () => trayMenu && tray.popUpContextMenu(trayMenu));
  updateTray(); ensurePopover();
  let dispT; const rebuild = () => { clearTimeout(dispT); dispT = setTimeout(() => { createOverlays(); running.forEach(id => MODULES[id].onSettings?.(ctx)); }, 600); };
  screen.on('display-added', rebuild); screen.on('display-removed', rebuild); screen.on('display-metrics-changed', rebuild);
  try { globalShortcut.register('CommandOrControl+Shift+N', toggleNotes); } catch {}
  reconcile();
  if (firstRun) setTimeout(() => { fireGlow('preview'); openSettings(); }, 900);
});
app.on('window-all-closed', () => {});
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); hook?.stop(); const dk = MODULES.dock; if (dk && running.has('dock')) dk.stop(ctx); } catch {} });
