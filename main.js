// Surge — core. Loads modules, owns windows (overlay / settings / audio / notes), tray, settings.
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell, globalShortcut, powerSaveBlocker, clipboard, Notification, nativeTheme, dialog, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const IS_MAC = process.platform === 'darwin', IS_WIN = process.platform === 'win32';

/* ------------------------------------------------------------------ logging (~/Library/Logs/Surge/surge.log) */
let logStream = null;
function log(...a) { const line = `[${new Date().toISOString()}] ${a.map(x => x instanceof Error ? (x.stack || x.message) : typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')}\n`; try { if (logFile) fs.appendFileSync(logFile, line); } catch {} try { process.stderr.write(line); } catch {} }   // synchronous on purpose: if the app ever freezes, the last line shows where
let logFile = null; try { const dir = app.getPath('logs'); fs.mkdirSync(dir, { recursive: true }); logFile = path.join(dir, 'surge.log'); } catch {}
process.on('uncaughtException', e => log('UNCAUGHT', e)); process.on('unhandledRejection', e => log('UNHANDLED', e));
console.error = (...a) => log('ERR', ...a); console.warn = (...a) => log('WARN', ...a);

/* ------------------------------------------------------------------ settings */
const MODULES = {};                       // id → module
let settings = { modules: {} };
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
function defaultsFor(m) { return { enabled: !!m.defaultEnabled, ...(m.defaults || {}) }; }
function loadSettings() {
  let raw = {}; try { raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch {}
  settings = { launchAtLogin: !!raw.launchAtLogin, masterVolume: raw.masterVolume ?? 1, muted: !!raw.muted, welcomed: raw.welcomed, soundFix: raw.soundFix, chipFix: raw.chipFix, modules: {} };
  // one-time: the menu-bar icon moves to the new charge chip (people who picked another style on purpose keep it)
  if (!raw.chipFix) { setTimeout(() => { try { if (settings.modules.glow && (settings.modules.glow.trayStyle === 'both' || !settings.modules.glow.trayStyle)) { settings.modules.glow.trayStyle = 'chip'; } saveSettings(); } catch {} }, 0); }
  settings.chipFix = 1;
  if (!settings.soundFix) { if (settings.muted || settings.masterVolume === 0) setTimeout(() => log('one-time sound reset: was muted =', settings.muted, 'master =', settings.masterVolume), 0); settings.muted = false; if (!(settings.masterVolume > 0.05)) settings.masterVolume = 1; settings.soundFix = 1; }
  for (const id in MODULES) settings.modules[id] = { ...defaultsFor(MODULES[id]), ...(raw.modules?.[id] || {}) };
}
function saveSettings() { try { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2)); } catch (e) { console.error(e); } }
function mod(id) { return settings.modules[id]; }

/* ------------------------------------------------------------------ global input hook (optional native dep) */
let hookAvail = false, hookState = 'unavailable';
try { require.resolve('uiohook-napi'); hookAvail = true; hookState = 'ready'; } catch (e) { setTimeout(() => log('uiohook-napi not available:', e.message), 0); }
const hookListeners = { keydown: new Set(), keyup: new Set(), mousedown: new Set(), mouseup: new Set(), wheel: new Set(), mousemove: new Set() };
let hookMode = 'worker';   // 'worker' = thread inside Surge (preferred); 'process' = separate helper (fallback)
let hookStarted = false, hookStarting = false, hookProc = null, hookTries = 0, hookRetry = null, axPrompted = false, quitting = false;
function accessibilityOK(prompt) { if (process.platform !== 'darwin') return true; try { return systemPreferences.isTrustedAccessibilityClient(!!prompt); } catch { return true; } }
function ensureHook() {
  if (!hookAvail || hookStarted || hookStarting || quitting) return hookStarted;
  if (!accessibilityOK(false)) {
    // silent: no macOS prompt, no dialog. The popover/settings show a single Allow button that triggers the prompt.
    hookState = 'needs-accessibility'; if (!axPrompted) { axPrompted = true; log('hook waiting for Accessibility permission'); }
    if (!hookRetry) hookRetry = setInterval(() => { if (accessibilityOK(false)) { clearInterval(hookRetry); hookRetry = null; ensureHook(); ctx.broadcast('settings:update', settings); } }, 3000);
    return false;
  }
  // The native hook lives in a helper process (hookhost.js). If its start() blocks, only the helper is stuck: we kill it and try again.
  hookStarting = true; let started = false; const mode = hookMode; log(`hook starting (${mode}), try`, hookTries + 1);
  let child; try {
    if (mode === 'worker') { const { Worker } = require('worker_threads'); child = new Worker(path.join(__dirname, 'hookworker.js')); child.kill = () => child.terminate(); child.on('error', (e) => log('hook worker error:', e && e.message)); }
    else { const { utilityProcess } = require('electron'); child = utilityProcess.fork(path.join(__dirname, 'hookhost.js'), [], { serviceName: 'Surge Input', stdio: 'ignore' }); }
  } catch (e) { hookStarting = false; log(`hook ${mode} could not be created:`, e.message); if (mode === 'worker') { hookMode = 'process'; setTimeout(ensureHook, 300); } else hookState = 'error'; return false; }
  hookProc = child;
  const t = setTimeout(() => { if (!started) { log(`hook (${mode}) did not start within 5s — stopping it`); try { child.kill(); } catch {} } }, 5000);
  child.on('message', (m) => {
    if (m.ev) { lastInputAt = Date.now(); inputCount++; if (m.ev === 'keydown') keyCount++; if (!hookEvents++) log('hook first event'); hookListeners[m.ev]?.forEach(fn => { try { fn(m.e); } catch (err) { console.error(err); } }); return; }
    if (m.started) { started = true; clearTimeout(t); hookStarting = false; hookStarted = true; hookState = 'running'; log(`hook started (${mode})`); setTimeout(() => { if (hookProc === child) hookTries = 0; }, 30000); watchHookAlive(); ctx.broadcast('settings:update', settings); }
    else if (m.error) log('hook host error:', m.error);
  });
  child.on('exit', (code) => {
    clearTimeout(t); if (hookProc !== child) return; hookProc = null; const was = hookStarted; hookStarted = false; hookStarting = false; if (quitting) return;
    log('hook host exited', code, was ? '(was running)' : '(never started)');
    if (++hookTries < 3) setTimeout(ensureHook, 700 * hookTries);
    else if (mode === 'worker') { log('hook worker failed 3 times → trying the helper process instead'); hookMode = 'process'; hookTries = 0; setTimeout(ensureHook, 500); }
    else { hookState = accessibilityOK(false) ? 'stale' : 'needs-accessibility'; log('hook host gave up after 4 tries →', hookState); ctx.broadcast('settings:update', settings); }
  });
  return false;
}
function stopHook() { const c = hookProc; hookProc = null; hookStarted = false; hookStarting = false; try { c?.kill(); } catch {} }
// macOS can leave the hook "running" but silently deliver nothing (stale Accessibility / Input Monitoring entry after an update).
// Detect it the honest way: the cursor moves (Electron sees that without any permission) but the hook reports no events → the grant is dead.
let hookEvents = 0, deadFixes = 0, aliveT = null;
function watchHookAlive() {
  if (process.platform !== 'darwin' || aliveT) return;
  // runs for as long as the hook does (not just at startup): the cursor moving ~5 s with zero hook events since = the hook went deaf
  let moves = 0, last = null, seen = hookEvents;
  aliveT = setInterval(() => {
    if (!hookStarted) { clearInterval(aliveT); aliveT = null; return; }
    if (hookEvents !== seen) { seen = hookEvents; moves = 0; }
    const c = screen.getCursorScreenPoint(); if (last && (c.x !== last.x || c.y !== last.y)) moves++; last = c;
    if (moves >= 12) { clearInterval(aliveT); aliveT = null; onHookDead(); }
  }, 400);
}
function onHookDead() {
  log(`hook dead: cursor moved but no events (AX trusted=${accessibilityOK(false)})`);
  stopHook();
  // NEVER reset the permission entry from a running Surge: macOS terminates the app whose entry is reset (that was the "updated and quit" bug).
  // Mark it stale instead; the popover/settings offer a one-click Repair that resets + relaunches on purpose.
  if (deadFixes++ < 2) { if (deadFixes === 2) hookMode = hookMode === 'worker' ? 'process' : 'worker'; log('hook went deaf → restarting it as', hookMode, '(attempt', deadFixes, ')'); hookTries = 0; setTimeout(ensureHook, 500); return; }   // a fresh helper usually hears again
  hookState = 'stale'; ctx.broadcast('settings:update', settings);
  if (deadFixes === 3) fireGlow('warn', { hud: { text: 'Keyboard & mouse permission needs a repair — click ⚡ → Repair', color: '#FFD60A' } });
}
/* ---- clean-exit marker + watchdog: if Surge dies without meaning to (crash, killed by macOS), it comes back by itself */
const cleanExitPath = () => path.join(app.getPath('userData'), 'clean-exit');
function markCleanExit() { try { fs.writeFileSync(cleanExitPath(), String(Date.now())); } catch {} }
function bundlePath() { const p = process.execPath; const i = p.indexOf('.app/Contents/MacOS/'); return i > 0 ? p.slice(0, i + 4) : null; }
function startWatchdog() {
  try { fs.rmSync(cleanExitPath(), { force: true }); } catch {}
  const bundle = bundlePath(); if (!IS_MAC || !app.isPackaged || !bundle) return;
  const cnt = path.join(app.getPath('userData'), 'watchdog-count'), lg = path.join(app.getPath('logs'), 'surge.log');
  // waits for this pid to end; a clean exit leaves the marker → do nothing. Otherwise reopen (max 3 times per 5 minutes, so a real crash loop can't spin forever)
  const sh = `PID=${process.pid}; while kill -0 $PID 2>/dev/null; do sleep 2; done
[ -f "${cleanExitPath()}" ] && exit 0
sleep 1; pgrep -f "${bundle}/Contents/MacOS/Surge" >/dev/null && exit 0
NOW=$(date +%s); T=0; N=0; [ -f "${cnt}" ] && read T N < "${cnt}"; [ $((NOW-T)) -gt 300 ] && { T=$NOW; N=0; }
[ "$N" -ge 3 ] && { echo "[watchdog] giving up after 3 relaunches in 5 min" >> "${lg}"; exit 0; }
echo "$T $((N+1))" > "${cnt}"; echo "[watchdog] Surge ended unexpectedly — relaunching" >> "${lg}"; open -a "${bundle}"`;
  try { require('child_process').spawn('/bin/bash', ['-c', sh], { detached: true, stdio: 'ignore' }).unref(); log('watchdog armed'); } catch (e) { log('watchdog failed', e.message); }
}
// deliberate repair: reset the stale entries from a detached script, relaunch, and let the fresh launch ask once
function repairAccessibility() {
  const bundle = bundlePath(); if (!IS_MAC || !bundle) return;
  try { fs.writeFileSync(path.join(app.getPath('userData'), 'ax-prompt'), '1'); } catch {}
  const sh = `sleep 0.6; tccutil reset Accessibility app.surge.glow; tccutil reset ListenEvent app.surge.glow; sleep 1; pkill -x Surge; sleep 0.5; open -a "${bundle}"`;
  log('permission repair: reset + relaunch'); markCleanExit();
  require('child_process').spawn('/bin/bash', ['-c', sh], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.exit(0), 300);
}
ipcMain.on('ax:repair', repairAccessibility);
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
function play(sound, opts = {}) { if (settings.muted && !opts.force) return; lastSoundAt = Date.now(); soundCount++; const w = ensureAudio(); if (!w || w.isDestroyed()) return; const send = () => { try { w.webContents.send('audio:play', { sound, master: settings.masterVolume ?? 1, ...opts }); } catch {} }; w.webContents.isLoading() ? w.webContents.once('did-finish-load', send) : send(); }
function sysSound(name) { if (IS_MAC) execFile('afplay', [`/System/Library/Sounds/${name}.aiff`], () => {}); else play('chime', { name, volume: .6 }); }

/* ------------------------------------------------------------------ battery (shared by modules) */
let battery = null;
function readBattery(cb) {
  if (IS_WIN) {
    // WMI: EstimatedChargeRemaining (%), BatteryStatus 1=discharging 2=on AC 3=fully charged (6-9 = charging states); EstimatedRunTime in minutes
    return execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', '$b=Get-CimInstance Win32_Battery | Select-Object -First 1; if($b){"$($b.EstimatedChargeRemaining)|$($b.BatteryStatus)|$($b.EstimatedRunTime)"}'], { timeout: 5000, windowsHide: true }, (err, out) => {
      const m = /^(\d+)\|(\d+)\|(-?\d+)?/.exec((out || '').trim()); if (err || !m) return cb(null);
      const level = Math.min(100, +m[1]), st = +m[2]; const { powerMonitor } = require('electron'); let ac = st !== 1; try { ac = !powerMonitor.isOnBatteryPower(); } catch {}
      const mins = +m[3]; const remaining = !ac && mins > 0 && mins < 71582 ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}` : null;
      cb({ level, charging: ac, holding: false, remaining, charged: ac && (st === 3 || level >= 100) });
    });
  }
  if (!IS_MAC) return cb(null);
  execFile('pmset', ['-g', 'batt'], { timeout: 3000 }, (err, out) => {
    if (err || !out) return cb(null);
    const src = /'(AC|Battery) Power'/.exec(out), lvl = /(\d{1,3})%/.exec(out);
    if (!lvl) return cb(null);
    const time = /(\d{1,2}:\d{2}) remaining/.exec(out);
    const ac = src ? src[1] === 'AC' : !/discharging/i.test(out);
    cb({ level: parseInt(lvl[1], 10), charging: ac, holding: ac && /not charging/i.test(out), remaining: time ? time[1] : null, charged: /charged/i.test(out) });
  });
}

/* ------------------------------------------------------------------ settings / notes windows */
let settingsWin = null, notesWin = null;
function openSettings(pane) {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); if (pane) settingsWin.webContents.send('nav', pane); return; }
  settingsWin = new BrowserWindow({
    width: 980, height: 660, minWidth: 820, minHeight: 540, show: false, frame: false, transparent: true, hasShadow: true,
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 }, vibrancy: 'under-window', visualEffectState: 'active' } : {}), backgroundColor: '#00000000',
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
const winapps = IS_WIN ? require('./winapps') : null;
const isApp = p => typeof p === 'string' && !!p && (IS_WIN ? /\.(exe|lnk)$/i.test(p) : p.endsWith('.app'));
let winInstalled = null, winRunning = [];
function installedWin() {
  // Start Menu shortcuts → their target .exe (lower-cased path is the app's identity on Windows)
  if (winInstalled) return winInstalled;
  const out = new Map();
  const roots = [path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')];
  const walk = (d, depth) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { const f = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 4) walk(f, depth + 1); continue; }
      if (!/\.lnk$/i.test(e.name)) continue; const name = e.name.replace(/\.lnk$/i, '');
      if (/uninstall|readme|help|documentation|website|license|release notes/i.test(name)) continue;
      try { const t = shell.readShortcutLink(f).target; if (t && /\.exe$/i.test(t) && fs.existsSync(t)) { const k = t.toLowerCase(); if (!out.has(k) && !/\\surge\.exe$/.test(k)) out.set(k, { name, path: k }); } } catch {} } };
  roots.forEach(r => walk(r, 0));
  const ex = 'c:\\windows\\explorer.exe'; out.set(ex, { name: 'File Explorer', path: ex });
  winInstalled = [...out.values()].sort((a, b) => a.name.localeCompare(b.name)); setTimeout(() => (winInstalled = null), 60000);
  return winInstalled;
}
function appIcon(appPath) {
  if (iconCache.has(appPath)) return Promise.resolve(iconCache.get(appPath));
  if (IS_WIN) return (async () => { let v = null;
    try { const b64 = await winapps.icon(appPath); if (b64 && b64.length > 200) v = 'data:image/png;base64,' + b64; } catch {}
    if (!v) { try { const img = await app.getFileIcon(appPath, { size: 'large' }); if (!img.isEmpty()) v = img.toDataURL(); } catch {} }
    iconCache.set(appPath, v); return v; })();
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
  if (IS_WIN) return winapps.list().then(l => { if (!l) return winRunning;
    const names = new Map(installedWin().map(a => [a.path, a.name])); const seen = new Map();
    for (const a of l) { const k = a.path.toLowerCase(); if (/\\windows\\systemapps\\|applicationframehost|textinputhost|shellexperiencehost|\\surge\.exe$/.test(k)) continue;
      const e = seen.get(k); if (e) { e.front = e.front || a.front; continue; }
      seen.set(k, { name: names.get(k) || a.desc || a.name, bundleId: null, path: k, pid: a.pid, front: a.front, bg: false }); }
    return (winRunning = [...seen.values()]); });
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
ipcMain.handle('apps:installed', async () => { if (IS_WIN) return installedWin(); const dirs = ['/Applications', '/System/Applications', path.join(os.homedir(), 'Applications')]; const out = [];
  for (const d of dirs) { try { for (const f of fs.readdirSync(d)) if (f.endsWith('.app')) out.push({ name: f.replace(/\.app$/, ''), path: path.join(d, f) }); } catch {} }
  out.sort((a, b) => a.name.localeCompare(b.name)); return out; });
ipcMain.handle('apps:icon', (_e, p) => appIcon(p));
ipcMain.on('apps:reveal', (_e, p) => { if (!isApp(p)) return; if (IS_WIN) shell.showItemInFolder(p); else execFile('open', ['-R', p], () => {}); });
ipcMain.on('apps:forcequit', (_e, pid) => { if (!Number.isInteger(pid) || pid <= 1) return; if (IS_WIN) execFile('taskkill', ['/PID', String(pid), '/F'], { windowsHide: true }, () => {}); else { try { process.kill(pid, 'SIGKILL'); } catch {} } });
ipcMain.on('apps:openwith', (_e, p, files) => { if (!isApp(p) || !Array.isArray(files)) return; const fl = files.filter(f => typeof f === 'string').slice(0, 50); if (IS_WIN) { try { require('child_process').spawn(p, fl, { detached: true, stdio: 'ignore' }).unref(); } catch {} } else execFile('open', ['-a', p, ...fl], () => {}); });
ipcMain.on('apps:open', (_e, p) => { if (typeof p !== 'string' || !p) return; if (IS_WIN) { if (isApp(p)) shell.openPath(p); return; } execFile('open', ['-a', p], (err) => err && execFile('open', [p], () => {})); });
ipcMain.on('apps:activate', (_e, bundleId, p) => { if (IS_WIN) { const r = winRunning.find(a => a.path === p); if (r) winapps.activate(r.pid); else if (isApp(p)) shell.openPath(p); return; } if (p) execFile('open', ['-a', p], (err) => err && bundleId && execFile('open', ['-b', bundleId], () => {})); else if (bundleId) execFile('open', ['-b', bundleId], () => {}); });
ipcMain.on('apps:quit', (_e, bundleId, pid) => { if (IS_WIN) { if (Number.isInteger(pid) && pid > 1) execFile('taskkill', ['/PID', String(pid)], { windowsHide: true }, () => {}); return; } if (pid) { try { process.kill(pid, 'SIGTERM'); } catch {} } else if (bundleId) execFile('osascript', ['-e', `tell application id "${bundleId}" to quit`], () => {}); });

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
let popBelow = true;
ipcMain.on('popover:height', (_e, h) => { const w = popWin; if (!w || w.isDestroyed() || !(h > 200)) return; h = Math.round(Math.min(h, 860)); const b = w.getBounds(); if (b.height === h) return;
  const d = screen.getDisplayNearestPoint({ x: b.x, y: b.y }); const maxH = d.workArea.height - 16; h = Math.min(h, maxH);
  let y = popBelow ? b.y : b.y + b.height - h; y = Math.max(d.workArea.y + 6, Math.min(y, d.workArea.y + d.workArea.height - h - 6));
  w.setBounds({ x: b.x, y, width: b.width, height: h }, false); });
function togglePopover() {
  const w = ensurePopover();
  if (w.isVisible()) { w.hide(); return; }
  if (Date.now() - popHidAt < 250) return;
  const b = tray.getBounds(); const d = screen.getDisplayNearestPoint({ x: b.x, y: b.y });
  const [pw, ph] = w.getSize();
  let x = Math.round(b.x + b.width / 2 - pw / 2); const below = b.y < d.workArea.y + d.workArea.height / 2; let y = below ? Math.round(b.y + b.height + 4) : Math.round(b.y - ph - 8);
  if (!b.width && !b.height) { x = d.workArea.x + d.workArea.width - pw - 12; y = d.workArea.y + d.workArea.height - ph - 12; }   // some Windows trays report no bounds
  x = Math.max(d.workArea.x + 6, Math.min(x, d.workArea.x + d.workArea.width - pw - 6)); y = Math.max(d.workArea.y + 6, Math.min(y, d.workArea.y + d.workArea.height - ph - 6));
  popBelow = below; w.webContents.send('popover:edge', below ? 'top' : 'bottom');
  w.setPosition(x, y, false); w.show(); w.focus(); w.webContents.send('popover:show');
  try { if (running.has('updater')) MODULES.updater._check(ctx, false); } catch {}
}

/* ------------------------------------------------------------------ tray */
let tray = null, trayMenu = null, trayExtras = {};           // module id → { title?: string, menu?: MenuItem[] }
function trayIcon(b) {
  if (!IS_MAC) {
    const name = (!b || b.level == null) ? 'bolt' : `b${Math.round(Math.max(0, Math.min(100, b.level)) / 10) * 10}${b.charging ? 'c' : ''}`;
    try { return nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray', name + '.png')); } catch { return nativeImage.createEmpty(); }
  }
  // Menu-bar battery: live fill level, bolt while charging, hollow + warning tick when low. Template image → follows light/dark menu bar.
  if (!b || b.level == null) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24"><path fill="black" d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`;
    const img = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')).resize({ width: 18, height: 18 }); img.setTemplateImage(true); return img;
  }
  const lvl = Math.max(0, Math.min(100, b.level)), low = !b.charging && lvl <= 20, full = lvl >= 100;
  const W = 25, H = 12, R = 3.2, inner = 2, fillW = Math.max(1.2, (W - inner * 2 - 2) * lvl / 100);
  const body = `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${R}" fill="none" stroke="black" stroke-width="1.4" opacity="${low ? 1 : .55}"/>`;
  const nub = `<rect x="${W - .2}" y="${H / 2 - 2}" width="2" height="4" rx="1" fill="black" opacity=".55"/>`;
  const boltT = `translate(${W / 2 - 3.2},${H / 2 - 4.2}) scale(.36)`, boltD = 'M13 2 4 14h7l-1 8 9-12h-7z';
  // template images only use alpha → a "white" bolt would still render solid, so the bolt is cut out of the fill with a mask (transparent halo), then drawn in black on top
  const mask = b.charging ? `<mask id="m"><rect width="100%" height="100%" fill="white"/><path transform="${boltT}" d="${boltD}" fill="black" stroke="black" stroke-width="3.5" stroke-linejoin="round"/></mask>` : '';
  const fill = `<rect x="${inner + 1}" y="${inner + 1}" width="${fillW}" height="${H - inner * 2 - 2}" rx="${R - 1.6}" fill="black" ${b.charging ? 'mask="url(#m)"' : ''}/>`;
  const bolt = b.charging ? `<path transform="${boltT}" d="${boltD}" fill="black"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(W + 2) * 2}" height="${H * 2}" viewBox="0 0 ${W + 2} ${H}">${mask}${body}${nub}${fill}${bolt}</svg>`;
  const img = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')).resize({ width: W + 2, height: H });
  img.setTemplateImage(true); return img;
}
let trayIconKey = '';
let chipLogged = false, chipBad = false;
function trayChip(b) {
  // the charge chip: a tiny tank in the menu bar (colour image, not a template, so it keeps its state colours)
  try { const { chipPNG } = require('./traychip.js'); const g = mod('glow') || {};
    if (chipBad) return null;
    const png = chipPNG(b, { accent: g.theme === 'solid' ? g.color : '#00FF85', scale: 2 });
    const img = nativeImage.createFromBuffer(png, { scaleFactor: 2 });                       // 80×36 pixels shown at 40×18 → crisp on Retina
    const sz = img.isEmpty() ? { width: 0, height: 0 } : img.getSize();
    if (!chipLogged) { chipLogged = true; log(`tray chip ok ${sz.width}x${sz.height} png=${png.length}`); }
    if (sz.width !== 40 || sz.height !== 18) { chipBad = true; log('tray chip bad size'); return null; }
    img.setTemplateImage(false); return img; } catch (e) { log('tray chip error ' + e.message); return null; }
}
function setTrayBattery(b, style) {
  if (!tray) return;
  const chip = IS_MAC && style === 'chip' && b && b.level != null;
  const k = b ? `${Math.round(b.level)}|${b.charging ? 1 : 0}|${b.charged ? 1 : 0}|${chip ? 'chip' + (mod('glow')?.color || '') + (mod('glow')?.theme || '') : ''}` : 'bolt';
  if (k === trayIconKey) return; trayIconKey = k;
  try { tray.setImage((chip && trayChip(b)) || trayIcon(b)); } catch (e) { console.error('tray icon', e); }
}
function setTray(id, extra) { const k = JSON.stringify(extra, (kk, v) => typeof v === 'function' ? undefined : v); if (trayKeys[id] === k) return; trayKeys[id] = k; trayExtras[id] = extra; updateTray(); }
const trayKeys = {};
function updateTray() {
  if (!tray) return;
  const titles = Object.values(trayExtras).map(e => e?.title).filter(Boolean); if (settings.muted) titles.push(IS_MAC ? '🔇' : '(muted)');
  if (IS_MAC) tray.setTitle(titles.length ? ' ' + titles.join('  ') : ''); else tray.setToolTip(['Surge', ...titles].join('  '));
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
  frontApp: async () => { try { return (await runningApps()).find(a => a.front) || null; } catch { return null; } },
  activateApp: (a) => { if (!a) return; if (IS_WIN) { if (a.pid) winapps.activate(a.pid); } else if (a.path) execFile('open', ['-a', a.path], () => {}); },
  setTray, setTrayBattery, openSettings, toggleNotes, readBattery, markCleanExit, bundlePath, stopHook: () => { quitting = true; stopHook(); }, applyPatch: (p) => applyPatch(p), get battery() { return battery; }, set battery(v) { battery = v; },
  notify: (title, body) => { try { new Notification({ title, body, silent: true }).show(); } catch {} },
  broadcast: (ch, p) => { [settingsWin, notesWin, audioWin, popWin, ...overlays].forEach(w => { try { if (w && !w.isDestroyed()) w.webContents.send(ch, p); } catch {} }); },
};
const running = new Set();
function startModule(id) { const m = MODULES[id]; if (!m || running.has(id)) return; try { log('starting', id); m.start?.(ctx); running.add(id); log('start', id); } catch (e) { console.error(`[${id}] start`, e); } }
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
  if ('muted' in patch) { settings.muted = !!patch.muted; setTimeout(updateTray, 0); }
  if ('launchAtLogin' in patch) { settings.launchAtLogin = !!patch.launchAtLogin; if (IS_MAC || IS_WIN) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, openAsHidden: true }); }
  if (patch.modules) for (const id in patch.modules) settings.modules[id] = { ...settings.modules[id], ...patch.modules[id] };
  saveSettings(); reconcile(); ctx.broadcast('settings:update', settings); updateTray();
}

/* ------------------------------------------------------------------ ipc */
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_e, patch) => { applyPatch(patch); return settings; });
ipcMain.handle('settings:reset', () => { settings = { launchAtLogin: settings.launchAtLogin, masterVolume: 1, muted: false, welcomed: true, modules: {} }; for (const id in MODULES) settings.modules[id] = defaultsFor(MODULES[id]); saveSettings(); reconcile(); ctx.broadcast('settings:update', settings); updateTray(); return settings; });
ipcMain.handle('modules:list', () => Object.values(MODULES).map(m => ({ id: m.id, name: m.name, icon: m.icon, group: m.group, desc: m.desc, needsHook: !!m.needsHook, schema: m.schema || [] })));
ipcMain.handle('battery:get', () => battery);
ipcMain.handle('hook:state', () => hookState);
let lastInputAt = 0, lastSoundAt = 0, audioState = '', inputCount = 0, keyCount = 0, soundCount = 0;
// one plain-language answer to "why is there no sound?", shown in the popover
ipcMain.handle('sound:diag', () => {
  const k = mod('keys') || {}, m = mod('mouse') || {};
  let code = 'ok', text = 'Sounds are working';
  if (settings.muted) { code = 'muted'; text = 'Surge is muted'; }
  else if (!((settings.masterVolume ?? 1) > 0.02)) { code = 'volume'; text = 'Surge volume is at zero'; }
  else if (!k.enabled && !m.enabled) { code = 'off'; text = 'Keyboard and mouse sounds are turned off'; }
  else if (hookState === 'needs-accessibility') { code = 'permission'; text = 'macOS has not allowed keyboard & mouse access'; }
  else if (hookState === 'stale') { code = 'stale'; text = 'The keyboard & mouse permission is stuck'; }
  else if (hookState === 'error' || hookState === 'unavailable') { code = 'error'; text = 'The keyboard & mouse listener could not start'; }
  else if (hookState !== 'running') { code = 'starting'; text = 'Starting the keyboard & mouse listener…'; }
  else if ((k.enabled && !(k.volume > 0.02)) && (!m.enabled || !(m.volume > 0.02))) { code = 'modvol'; text = 'Keyboard sound volume is at zero'; }
  else if (!lastInputAt) { code = 'waiting'; text = 'Listening — press any key to test'; }
  return { code, text, hookState, lastInputAt, lastSoundAt, audioState, keys: !!k.enabled, mouse: !!m.enabled, inputCount, keyCount, soundCount, preset: k.preset, keyVol: k.volume };
});
ipcMain.on('audio:ack', (_e, st) => { if (!audioState) log('audio ok — first sound played, context', st); else log('audio:', st); audioState = String(st); });
ipcMain.handle('module:action', (_e, id, action, arg) => { try { return MODULES[id]?.actions?.[action]?.(ctx, arg); } catch (e) { console.error(e); } });
ipcMain.on('glow:preview', (_e, kind) => fireGlow(kind || 'preview', kind === 'low' ? { level: 12 } : kind === 'full' ? { level: 100 } : {}));
ipcMain.on('audio:test', (_e, sound, opts) => play(sound, { ...(opts || {}), force: true }));
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
if (!gotLock) {
  // Another Surge holds the lock. Right after an update that's the OLD process still shutting down (the native input hook can take a
  // few seconds to let go) — if we just quit here, nothing ever appears in the menu bar. So retry a few times instead of dying silently.
  const n = +(process.env.SURGE_RELAUNCH || 0);
  log('single-instance lock busy, attempt', n);
  if (n < 10) { process.env.SURGE_RELAUNCH = String(n + 1); setTimeout(() => { app.relaunch(); app.exit(0); }, 1500); }
  else app.exit(0);
}
app.on('second-instance', () => { if (gotLock) openSettings(); });
app.on('before-quit', markCleanExit);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { markCleanExit(); app.quit(); });
app.whenReady().then(async () => {
  if (!gotLock) return;
  startWatchdog();
  try { const f = path.join(app.getPath('userData'), 'ax-prompt'); if (fs.existsSync(f)) { fs.rmSync(f); setTimeout(() => { try { systemPreferences.isTrustedAccessibilityClient(true); } catch {} }, 1500); } } catch {}
  log('boot', app.getVersion(), process.platform, process.arch, 'electron', process.versions.electron, process.execPath);
  if (IS_MAC) try { require('child_process').execFile('codesign', ['-d', '-r-', app.getAppPath().replace(/\/Contents\/Resources\/app(\.asar)?$/, '')], (e, o, er) => log('codesign', ((o || '') + (er || '')).replace(/\s+/g, ' '))); } catch {}
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
    try { const m = require(path.join(__dirname, 'modules', f)); if (m.platforms && !m.platforms.includes(process.platform)) continue; MODULES[m.id] = m; } catch (e) { console.error('module load', f, e); }
  }
  log('modules', Object.keys(MODULES).join(','), 'hook', hookState);
  const firstRun = !fs.existsSync(settingsPath());
  loadSettings(); if (firstRun) { settings.launchAtLogin = true; settings.welcomed = false; } saveSettings();
  if ((IS_MAC || IS_WIN) && app.isPackaged) { try { if (app.getLoginItemSettings().openAtLogin !== settings.launchAtLogin) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, openAsHidden: true }); } catch {} }
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Surge', submenu: [
    { label: 'Settings…', accelerator: 'Cmd+,', click: () => openSettings() },
    { label: 'Quick Notes', accelerator: 'Cmd+Shift+N', click: toggleNotes },
    { label: 'Preview glow', accelerator: 'Cmd+P', click: () => fireGlow('preview') },
    { type: 'separator' }, { role: 'close' }, { role: 'minimize' }, { role: 'quit' } ]}, { role: 'editMenu' }]));
  if (process.platform === 'darwin') app.dock?.hide();
  createOverlays(); ensureAudio();
  tray = new Tray(trayIcon()); tray.setIgnoreDoubleClickEvents(true); tray.setToolTip('Surge');
  if (IS_MAC && process.env.SURGE_SELFTEST) { try { const t = trayChip({ level: 67, charging: true }); log('tray chip selftest ' + (t ? 'pass' : 'FAIL')); log('tray svg icon ' + (trayIcon({ level: 50 }).isEmpty() ? 'EMPTY' : 'ok')); } catch (e) { log('tray chip selftest FAIL ' + e.message); } }
  tray.on('click', togglePopover);
  tray.on('right-click', () => trayMenu && tray.popUpContextMenu(trayMenu));
  if (IS_WIN) app.setAppUserModelId('app.surge.glow');
  updateTray(); ensurePopover();
  let dispT; const rebuild = () => { clearTimeout(dispT); dispT = setTimeout(() => { createOverlays(); running.forEach(id => MODULES[id].onSettings?.(ctx)); }, 600); };
  screen.on('display-added', rebuild); screen.on('display-removed', rebuild); screen.on('display-metrics-changed', rebuild);
  try { globalShortcut.register('CommandOrControl+Shift+N', toggleNotes); } catch {}
  reconcile();
  // Welcome shows once. A fresh DMG install first swaps itself to the stable-identity build (see updater), so wait for that restart before greeting.
  if (!firstRun && settings.welcomed === undefined) { settings.welcomed = true; saveSettings(); }
  const greet = () => { if (settings.welcomed) return; settings.welcomed = true; saveSettings(); openSettings('welcome'); };
  if (firstRun) setTimeout(() => fireGlow('preview'), 900);
  if (!settings.welcomed) setTimeout(() => { if (MODULES.updater?._migrating?.()) setTimeout(greet, 45000); else greet(); }, 2500);
});
app.on('window-all-closed', () => {});
app.on('will-quit', () => { quitting = true; stopHook(); try { winapps?.stop(); } catch {} try { globalShortcut.unregisterAll(); const dk = MODULES.dock; if (dk && running.has('dock')) dk.stop(ctx); } catch {} });
