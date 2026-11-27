// Surge — core. Loads modules, owns windows (overlay / settings / audio / notes), tray, settings.
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell, globalShortcut, powerSaveBlocker, clipboard, Notification, nativeTheme, dialog, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const IS_MAC = process.platform === 'darwin', IS_WIN = process.platform === 'win32';
const Nova = require('./novaui.js');
const WhatsNew = require('./whatsnew.js');      // the What's new film that plays once after an update (whatsnew.html)           // Surge's own right-click menu and dialogs (fall back to the native ones)

/* ------------------------------------------------------------------ logging (~/Library/Logs/Surge/surge.log) */
let logStream = null;
function log(...a) { const line = `[${new Date().toISOString()}] ${a.map(x => x instanceof Error ? (x.stack || x.message) : typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')}\n`; try { if (logFile) fs.appendFileSync(logFile, line); } catch {} try { process.stderr.write(line); } catch {} }   // synchronous on purpose: if the app ever freezes, the last line shows where
let logFile = null; try { const dir = app.getPath('logs'); fs.mkdirSync(dir, { recursive: true }); logFile = path.join(dir, 'surge.log'); } catch {}
process.on('uncaughtException', e => log('UNCAUGHT', e)); process.on('unhandledRejection', e => log('UNHANDLED', e));
console.error = (...a) => log('ERR', ...a); console.warn = (...a) => log('WARN', ...a);

/* ------------------------------------------------------------------ lag watch: every IPC handler is timed and the main event loop is
   watched; anything that holds the main process for more than 100 ms is written to surge.log with what was running (at most one
   line every 10 s per name). On a Mac, a stalled main process also stalls every Surge window, so this is where lag shows up first. */
const stats = { patches: 0, saves: 0, ipc: new Map(), stalls: [], current: '' };
const slowLogged = new Map();
function noteSlow(name, ms) { const n = Date.now(); if (ms < 100 || n - (slowLogged.get(name) || 0) < 10000) return; slowLogged.set(name, n); log(`lag: ${name} held the main process for ${Math.round(ms)} ms`); }
function timed(name, fn) { return function (...a) { const t0 = performance.now(), prev = stats.current; stats.current = name; try { return fn.apply(this, a); } finally { const ms = performance.now() - t0; stats.current = prev; const e = stats.ipc.get(name) || { n: 0, total: 0, max: 0 }; e.n++; e.total += ms; e.max = Math.max(e.max, ms); stats.ipc.set(name, e); noteSlow('ipc ' + name, ms); } }; }
{ const h = ipcMain.handle.bind(ipcMain), o = ipcMain.on.bind(ipcMain); ipcMain.handle = (ch, fn) => h(ch, timed(ch, fn)); ipcMain.on = (ch, fn) => o(ch, timed(ch, fn)); }
{ let last = performance.now(); const t = setInterval(() => { const n = performance.now(), late = n - last - 250; last = n; if (late > 16) { stats.stalls.push(Math.round(late)); if (stats.stalls.length > 200) stats.stalls.shift(); noteSlow('main event loop (last: ' + (stats.current || 'timer or module') + ')', late); } }, 250); t.unref?.(); }

/* ------------------------------------------------------------------ settings */
const MODULES = {};                       // id → module
let settings = { modules: {} };
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
function defaultsFor(m) { return { enabled: !!m.defaultEnabled, ...(m.defaults || {}) }; }
function loadSettings() {
  let raw = {}; try { raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch {}
  settings = { launchAtLogin: !!raw.launchAtLogin, masterVolume: raw.masterVolume ?? 1, muted: !!raw.muted, welcomed: raw.welcomed, soundFix: raw.soundFix, chipFix: raw.chipFix, uiSounds: !!raw.uiSounds, trayFix3: raw.trayFix3, whatsNewSeen: raw.whatsNewSeen, modules: {} };
  // one-time: the menu-bar icon moves to the new charge chip (people who picked another style on purpose keep it)
  if (!raw.chipFix) { setTimeout(() => { try { if (settings.modules.glow && (settings.modules.glow.trayStyle === 'both' || !settings.modules.glow.trayStyle)) { settings.modules.glow.trayStyle = 'chip'; } saveSettings(); } catch {} }, 0); }
  settings.chipFix = 1;
  if (!settings.soundFix) { if (settings.muted || settings.masterVolume === 0) setTimeout(() => log('one-time sound reset: was muted =', settings.muted, 'master =', settings.masterVolume), 0); settings.muted = false; if (!(settings.masterVolume > 0.05)) settings.masterVolume = 1; settings.soundFix = 1; }
  for (const id in MODULES) settings.modules[id] = { ...defaultsFor(MODULES[id]), ...(raw.modules?.[id] || {}) };
  // 3.0: the menu-bar icon is the new Surge mark (a macOS template image); the colour chip that never stopped animating is retired
  // as the default. Anyone can still pick the charge chip, now a still template image too.
  if (!raw.trayFix3) { if (settings.modules.glow && (settings.modules.glow.trayStyle === 'chip' || !settings.modules.glow.trayStyle)) settings.modules.glow.trayStyle = 'mark'; settings.trayFix3 = 1; }
  // 3.0: checking GitHub every second spawned a process every second. Updates are now checked every 30 minutes, on wake and when you open the menu.
  if (settings.modules.updater && !(settings.modules.updater.pollSeconds >= 900)) settings.modules.updater.pollSeconds = 1800;
}
function saveSettings() { stats.saves++; try { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2)); } catch (e) { console.error(e); } }
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
    if (m.alive) { hookEvents++; return; }                      // the hook still hears (a mouse moved); no coordinates, nothing else to do
    if (m.ev) return dispatchInput(m);
    if (m.started) { started = true; clearTimeout(t); hookStarting = false; hookStarted = true; hookState = 'running'; log(`hook started (${mode})`); syncMoves(); setTimeout(() => { if (hookProc === child) hookTries = 0; }, 30000); watchHookAlive(); ctx.broadcast('settings:update', settings); }
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
function dispatchInput(m) { lastInputAt = Date.now(); inputCount++; if (m.ev === 'keydown') keyCount++; if (!hookEvents++) log('hook first event'); hookListeners[m.ev]?.forEach(fn => { try { fn(m.e); } catch (err) { console.error(err); } }); }
function stopHook() { const c = hookProc; hookProc = null; hookStarted = false; hookStarting = false; try { c?.kill(); } catch {} }
// macOS can leave the hook "running" but silently deliver nothing (stale Accessibility / Input Monitoring entry after an update).
// Detect it the honest way: the cursor moves (Electron sees that without any permission) but the hook reports no events → the grant is dead.
let hookEvents = 0, deadFixes = 0, aliveT = null;
function watchHookAlive() {
  if (process.platform !== 'darwin' || aliveT) return;
  // runs for as long as the hook does: the cursor moving for ~10 s with zero hook events (the hook sends a tiny "alive" ping
  // at most every 2 s while the mouse moves) = the hook went deaf. One cursor read every 2 s; nothing else.
  let moves = 0, last = null, seen = hookEvents;
  aliveT = setInterval(() => {
    if (!hookStarted) { clearInterval(aliveT); aliveT = null; return; }
    if (hookEvents !== seen) { seen = hookEvents; moves = 0; }
    const c = screen.getCursorScreenPoint(); if (last && (c.x !== last.x || c.y !== last.y)) moves++; last = c;
    if (moves >= 5) { clearInterval(aliveT); aliveT = null; onHookDead(); }
  }, 2000);
}
function onHookDead() {
  log(`hook dead: cursor moved but no events (AX trusted=${accessibilityOK(false)})`);
  stopHook();
  // NEVER reset the permission entry from a running Surge: macOS terminates the app whose entry is reset (that was the "updated and quit" bug).
  // Mark it stale instead; the popover/settings offer a one-click Repair that resets + relaunches on purpose.
  if (deadFixes++ < 2) { if (deadFixes === 2) hookMode = hookMode === 'worker' ? 'process' : 'worker'; log('hook went deaf → restarting it as', hookMode, '(attempt', deadFixes, ')'); hookTries = 0; setTimeout(ensureHook, 500); return; }   // a fresh helper usually hears again
  hookState = 'stale'; ctx.broadcast('settings:update', settings);
  if (deadFixes === 3) fireGlow('warn', { hud: { text: 'Keyboard & mouse permission needs a repair — open Surge → Repair', color: '#FFD60A' } });
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
// Mouse MOVES are the one event that fires hundreds of times a second. The hook keeps them to itself unless a feature that
// draws on them is running (the comet trail); this tells it whether anyone is listening.
let movesOn = false;
function syncMoves() { const want = hookListeners.mousemove.size > 0; if (want === movesOn && hookStarted) return; movesOn = want; try { hookProc?.postMessage?.({ move: want }); } catch {} }
function onInput(ev, fn) { hookListeners[ev].add(fn); ensureHook(); if (ev === 'mousemove') syncMoves(); return () => { hookListeners[ev].delete(fn); if (ev === 'mousemove') syncMoves(); }; }

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
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
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
// Click Ripple without a full-screen window: each burst gets a small transparent window just big enough for it, shown for
// the burst and hidden right after. (The full-screen overlay is only kept up while Night Tint, Spotlight or the trail is on.)
const fxPool = []; let fxNext = 0;
function fxWin() {
  let w = fxPool[fxNext % 3]; fxNext++;
  if (w && !w.isDestroyed()) return w;
  w = new BrowserWindow({ width: 200, height: 200, transparent: true, frame: false, hasShadow: false, resizable: false, movable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, roundedCorners: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  w.setIgnoreMouseEvents(true); w.setAlwaysOnTop(true, 'screen-saver'); w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  w.loadFile(path.join(__dirname, 'glow.html'), { query: { fx: '1' } }); w._ready = new Promise(r => w.webContents.once('did-finish-load', r));
  fxPool[(fxNext - 1) % 3] = w; return w;
}
function ripple(p) {
  if (overlays.some(w => !w.isDestroyed() && w.isVisible())) return overlaySend('ripple', p);
  const S = Math.ceil((p.size || 60) * 3.2) + 40, b = { x: Math.round(p.x - S / 2), y: Math.round(p.y - S / 2), width: S, height: S };
  const w = fxWin(); clearTimeout(w._hideT);
  w._ready.then(() => { if (w.isDestroyed()) return; w.setBounds(b, false); w.webContents.send('overlay:bounds', b); w.webContents.send('ripple', p); if (!w.isVisible()) w.showInactive();
    w._hideT = setTimeout(() => { if (!w.isDestroyed()) { w.hide(); w.webContents.send('fx:clear'); } }, 950); });
}
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
  // WebAudio schedules on its own audio clock, so a throttled (normal) hidden window plays sounds on time. The page suspends its
  // audio engine after 20 s of silence, so an idle Surge has no audio thread running at all.
  audioWin = new BrowserWindow({ show: false, width: 10, height: 10, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' } });
  audioWin.loadFile(path.join(__dirname, 'audio.html'));
  audioWin.webContents.on('console-message', (_e, lvl, msg) => lvl >= 2 && log('audio', msg));
  return audioWin;
}
function play(sound, opts = {}) { if (settings.muted && !opts.force) return; lastSoundAt = Date.now(); soundCount++; const w = ensureAudio(); if (!w || w.isDestroyed()) return; const send = () => { try { w.webContents.send('audio:play', { sound, master: settings.masterVolume ?? 1, ...opts }); } catch {} }; w.webContents.isLoading() ? w.webContents.once('did-finish-load', send) : send(); }
// Surge's own glassy chimes (assets/sounds, drawn by tools/make-sounds.py). Older names map onto them.
const CHIMES = { Glass: 'plug', Pop: 'unplug', Hero: 'full', Basso: 'low', Blow: 'breath', update: 'update', tap: 'tap', open: 'open' };
function sysSound(name) { if (settings.muted) return; const f = path.join(__dirname, 'assets', 'sounds', (CHIMES[name] || 'tap') + '.wav');
  if (IS_MAC && fs.existsSync(f)) execFile('afplay', ['-v', String(Math.max(.05, Math.min(1, (settings.masterVolume ?? 1) * .7))), f], () => {}); else play('chime', { name, volume: .5 }); }
// interface sounds: off by default (Settings, About, Interface sounds)
function uiSound(name) { if (settings.uiSounds) sysSound(name); }

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
    width: 1040, height: 700, minWidth: 880, minHeight: 560, show: false, frame: false, transparent: true, hasShadow: true,
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
const iconCache = new Map(), iconJobs = new Map();
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
  // Launchpad and the Dock ask for dozens of icons at once. Nothing here blocks the main process: the converted PNG is looked
  // up on disk FIRST (it is keyed by the app's path), and only a missing one runs plutil + sips (async helper processes).
  // Requests for the same app share one job.
  if (iconJobs.has(appPath)) return iconJobs.get(appPath);
  const job = new Promise((resolve) => {
    const done = (v) => { iconCache.set(appPath, v); iconJobs.delete(appPath); resolve(v); };
    const dir = path.join(app.getPath('userData'), 'icons'), key = Buffer.from(appPath).toString('base64url').slice(-40), out = path.join(dir, key + '.png');
    const fromDisk = (orElse) => fs.readFile(out, (e, buf) => (!e && buf.length ? done('data:image/png;base64,' + buf.toString('base64')) : orElse()));
    fromDisk(() => {
      execFile('plutil', ['-extract', 'CFBundleIconFile', 'raw', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')], { timeout: 3000 }, (pe, po) => {
        let icns = pe ? null : String(po || '').trim();
        const next = () => {
          if (icns && !icns.endsWith('.icns')) icns += '.icns';
          const src = icns && !icns.includes('..') && path.join(appPath, 'Contents', 'Resources', icns);
          fs.access(src || '', (ae) => {
            if (!src || ae) return fallback();
            fs.mkdir(dir, { recursive: true }, () => execFile('sips', ['-s', 'format', 'png', '--resampleWidth', '128', src, '--out', out], { timeout: 8000 }, (e) => { if (e) return fallback(); fromDisk(fallback); }));
          });
        };
        if (icns) return next();
        fs.readFile(path.join(appPath, 'Contents', 'Info.plist'), 'utf8', (re, plist) => { if (!re) icns = /CFBundleIconFile<\/key>\s*<string>([^<]+)/.exec(plist)?.[1] || null; next(); });
      });
    });
    function fallback() {
      // asset-catalog icons (Assets.car): let Quick Look render the bundle's icon — a separate process, cannot crash us
      const tmp = path.join(dir, 'ql-' + key);
      fs.mkdir(tmp, { recursive: true }, () => execFile('qlmanage', ['-t', '-s', '128', '-o', tmp, appPath], { timeout: 8000 }, () => {
        fs.readdir(tmp, (de, list) => { const f = !de && (list || []).find(x => x.endsWith('.png'));
          if (!f) { fs.rm(tmp, { recursive: true, force: true }, () => {}); return done(null); }
          fs.rename(path.join(tmp, f), out, (rn) => { fs.rm(tmp, { recursive: true, force: true }, () => {}); if (rn) return done(null); fromDisk(() => done(null)); }); });
      }));
    }
  });
  iconJobs.set(appPath, job); return job;
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
let appsWarned = false, appsJob = null, appsAt = 0, appsLast = null;
// The Dock refreshes its apps on its 5 s tick and its own 15 s timer, the clipboard picker asks for the front app: callers that
// arrive together share one lsappinfo run, and an answer under a second old is reused instead of spawning another process.
function runningApps() {
  if (appsLast && Date.now() - appsAt < 1000) return Promise.resolve(appsLast);
  if (appsJob) return appsJob;
  appsJob = listRunningApps().then(l => { appsLast = l; appsAt = Date.now(); appsJob = null; return l; }, e => { appsJob = null; throw e; });
  return appsJob;
}
function listRunningApps() {
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
  uiSound('open'); trayFlowOnce();
  try { if (running.has('updater')) MODULES.updater._peek?.(ctx); } catch {}      // a cheap look at GitHub, at most once a minute
}

/* ------------------------------------------------------------------ tray */
let tray = null, trayExtras = {};           // module id → { title?: string, menu?: MenuItem[] }
// Surge 3.0 menu-bar icons (traychip.js): COLOUR by default, in Surge's palette, with a light- and a dark-menu-bar variant
// that switch live with the appearance; MONOCHROME (Settings, Charge Glow, Monochrome icon) gives macOS TEMPLATE images.
// Zero lag: nothing animates in the menu bar. An icon is painted once per state (level, charging, style, look) and cached;
// the battery icon is only redrawn when the level moves by 1% or charging flips, and level changes at most every 4 s.
const TC = require('./traychip.js');
const trayCache = new Map();
function cached(key, draw, size, template) {
  if (trayCache.has(key)) return trayCache.get(key);
  let img = nativeImage.createEmpty();
  try { const [w, h] = size; img = nativeImage.createFromBuffer(draw(1), { width: w, height: h });
    // 2x always (every Retina Mac); 3x only when a display actually runs at 3x, so a level change costs a few ms, not more
    const maxSF = (() => { try { return Math.max(...screen.getAllDisplays().map(d => d.scaleFactor || 1)); } catch { return 2; } })();
    for (const sf of maxSF > 2 ? [2, 3] : [2]) img.addRepresentation({ scaleFactor: sf, buffer: draw(sf), width: w, height: h });
    if (template && IS_MAC) img.setTemplateImage(true); } catch (e) { log('tray icon error ' + e.message); }
  if (img.isEmpty()) { try { img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray', IS_MAC ? 'surgeTemplate.png' : 'bolt.png')); if (IS_MAC) img.setTemplateImage(true); } catch {} }
  if (trayCache.size > 80) trayCache.clear(); trayCache.set(key, img); return img;
}
// which menu bar we sit on: macOS draws a dark menu bar in Dark Mode
const darkBar = () => { try { return nativeTheme.shouldUseDarkColors; } catch { return true; } };
const mono = () => !!mod('glow')?.trayMono;
const markIcon = () => mono() ? cached('m-mark', s => TC.markPNG(s), TC.SIZES.mark, true) : cached(`c-mark-${darkBar() ? 'd' : 'l'}`, s => TC.colorPNG('mark', null, s, darkBar()).png, [16, 16]);
function trayChip(b) { const lvl = Math.round(b.level), bb = { level: lvl, charging: !!b.charging };
  return mono() ? cached(`m-chip${lvl}${bb.charging ? 'c' : ''}`, s => TC.chipPNG(bb, s), TC.SIZES.chip, true) : cached(`c-chip${lvl}${bb.charging ? 'c' : ''}-${darkBar() ? 'd' : 'l'}`, s => TC.colorPNG('chip', bb, s, darkBar()).png, TC.colorSize('chip', bb)); }
function trayBattery(b) { const lvl = Math.round(b.level), bb = { level: lvl, charging: !!b.charging };
  return mono() ? cached(`m-bat${lvl}${bb.charging ? 'c' : ''}`, s => TC.batteryPNG(bb, s), TC.SIZES.battery, true) : cached(`c-bat${lvl}${bb.charging ? 'c' : ''}-${darkBar() ? 'd' : 'l'}`, s => TC.colorPNG('battery', bb, s, darkBar()).png, [27, 16]); }
function trayIcon(b, style) {
  if (!b || b.level == null || style === 'mark' || style === 'bolt' || style === 'pct') return markIcon();
  if (style === 'chip') return trayChip(b);
  return trayBattery(b);
}
// ---- the flowing battery. Colour icons are painted as a short loop of frames (FLOW_N, a meniscus wave and a sheen) by
// traywork.js on a worker thread, then cached as ready images per state, so the main process never stalls drawing them.
// Flow runs continuously ONLY while charging, at FLOW_FPS (a cached tray.setImage per frame, nothing else). On battery it
// plays one pass when the level changes, on plug/unplug and when the menu opens, then stands still. It pauses when the screen
// locks, the Mac sleeps, the session goes inactive or nobody has touched the Mac for 2 minutes (the display is likely asleep).
const FLOW_N = 10, FLOW_FPS = 7;
let trayWorker = null, trayJobs = new Map(), trayJobId = 0; const frameCache = new Map();
const maxSF = () => { try { return Math.max(...screen.getAllDisplays().map(d => d.scaleFactor || 1)); } catch { return 2; } };
function ensureTrayWorker() {
  if (trayWorker) return trayWorker;
  try { const { Worker } = require('worker_threads'); trayWorker = new Worker(path.join(__dirname, 'traywork.js'));
    trayWorker.on('message', m => { const j = trayJobs.get(m.id); if (!j) return; trayJobs.delete(m.id); m.error ? j.rej(new Error(m.error)) : j.res(m); });
    trayWorker.on('error', e => { log('tray worker error', e && e.message); }); trayWorker.on('exit', () => { trayWorker = null; for (const j of trayJobs.values()) j.rej(new Error('worker gone')); trayJobs.clear(); });
    trayWorker.unref?.(); } catch (e) { log('tray worker unavailable', e.message); trayWorker = null; }
  return trayWorker;
}
function toImages(m, scales) { return m.frames.map(fr => { const [w, h] = m.size; const im = nativeImage.createFromBuffer(Buffer.from(fr[0]), { width: w, height: h }); fr.slice(1).forEach((buf, i) => im.addRepresentation({ scaleFactor: scales[i + 1], buffer: Buffer.from(buf), width: w, height: h })); return im; }); }
function flowFrames(kind, b, dark, n) {
  const scales = maxSF() > 2 ? [1, 2, 3] : [1, 2], bb = b ? { level: Math.round(b.level), charging: !!b.charging } : null;
  const key = `${kind}|${bb ? bb.level + (bb.charging ? 'c' : '') : '-'}|${dark ? 'd' : 'l'}|${n}|${scales.length}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const w = ensureTrayWorker();
  const p = (w ? new Promise((res, rej) => { const id = ++trayJobId; trayJobs.set(id, { res, rej }); w.postMessage({ id, kind, b: bb, dark, frames: n, scales }); })
    : Promise.resolve({ frames: [scales.map(sc => TC.colorPNG(kind, bb, sc, dark, 0).png)], size: TC.colorSize(kind, bb) }))
    .then(m => toImages(m, scales)).catch(e => { frameCache.delete(key); throw e; });
  frameCache.set(key, p); if (frameCache.size > 10) frameCache.delete(frameCache.keys().next().value);
  return p;
}
const flow = { frames: null, i: 0, t: null, mode: 'still', paused: false, idleT: null, ticks: 0 };
function flowStop() { clearInterval(flow.t); flow.t = null; }
function flowPlay(frames, mode) {
  flowStop(); flow.frames = frames; flow.mode = mode; flow.i = 0;
  try { tray.setImage(frames[0]); } catch {}
  if (mode === 'still' || frames.length < 2 || flow.paused) return;
  flow.t = setInterval(() => {
    if (!tray || tray.isDestroyed()) return flowStop();
    if (++flow.ticks % (FLOW_FPS * 10) === 0 && flow.mode === 'loop') { let idle = 0; try { idle = require('electron').powerMonitor.getSystemIdleTime(); } catch {} if (idle > 120) return flowPause('idle'); }
    flow.i++; if (flow.i >= flow.frames.length) { if (flow.mode === 'once') { flowStop(); flow.mode = 'still'; try { tray.setImage(flow.frames[0]); } catch {} return; } flow.i = 0; }
    try { tray.setImage(flow.frames[flow.i]); } catch {}
  }, Math.round(1000 / FLOW_FPS));
}
function flowPause(why) {
  if (flow.paused) return; flow.paused = why; flowStop(); try { if (flow.frames) tray.setImage(flow.frames[0]); } catch {}
  if (why === 'idle') { clearInterval(flow.idleT); flow.idleT = setInterval(() => { let idle = 0; try { idle = require('electron').powerMonitor.getSystemIdleTime(); } catch {} if (idle < 5) flowResume('idle'); }, 5000); }
}
function flowResume(why) { if (!flow.paused || (why && flow.paused !== why && why !== 'any')) return; flow.paused = false; clearInterval(flow.idleT); flow.idleT = null; if (flow.frames && flow.mode === 'loop') flowPlay(flow.frames, 'loop'); }
app.whenReady().then(() => { try { const { powerMonitor: pm } = require('electron');
  for (const e of ['lock-screen', 'suspend', 'user-did-resign-active']) pm.on(e, () => flowPause(e));
  for (const e of ['unlock-screen', 'resume', 'user-did-become-active']) pm.on(e, () => flowResume('any')); } catch {} });
// one flow pass on demand (the menu opened), only when the battery icon is still
function trayFlowOnce() { if (flow.frames && flow.frames.length > 1 && !flow.t && !flow.paused && flow.mode !== 'loop') flowPlay(flow.frames, 'once'); }
const animOn = () => mod('glow')?.trayAnim !== false;
let trayIconKey = '', trayAt = 0, trayLater = null, trayGen = 0;
function setTrayBattery(b, style) {
  if (!tray) return;
  const st = style || mod('glow')?.trayStyle || 'mark', look = `${mono() ? 'm' : 'c'}${darkBar() ? 'd' : 'l'}${animOn() ? 'a' : 's'}`;
  const usesLevel = b && b.level != null && (st === 'chip' || st === 'icon' || st === 'both');
  const chg = !!(b && b.charging && !b.charged && b.level < 100);
  const k = usesLevel ? `${st}|${look}|${Math.round(b.level)}|${chg ? 1 : 0}` : `mark|${look}|${chg ? 1 : 0}`;
  if (k === trayIconKey) return;
  const prev = trayIconKey.split('|'), onlyLevel = usesLevel && prev[0] === st && prev[1] === look && prev[3] === (chg ? '1' : '0'), first = !trayIconKey;
  const apply = () => {
    trayLater = null; trayIconKey = k; trayAt = Date.now(); const gen = ++trayGen;
    if (mono()) { flowStop(); flow.frames = null; try { tray.setImage(trayIcon(b, st)); } catch (e) { console.error('tray icon', e); } return; }   // monochrome stays still
    const kind = usesLevel ? (st === 'chip' ? 'chip' : 'battery') : 'mark', bb = usesLevel ? { level: b.level, charging: chg } : { level: 100, charging: chg };
    const n = animOn() && (usesLevel || chg) ? FLOW_N : 1;
    flowFrames(kind, bb, darkBar(), n).then(frames => {
      if (gen !== trayGen) return;
      const mode = n < 2 ? 'still' : chg ? 'loop' : (usesLevel && !first) ? 'once' : 'still';
      flowPlay(frames, mode);
    }).catch(e => { log('tray frames failed', e.message); try { tray.setImage(trayIcon(b, st)); } catch {} });
  };
  clearTimeout(trayLater);
  if (onlyLevel && Date.now() - trayAt < 4000) { trayLater = setTimeout(apply, 4000 - (Date.now() - trayAt)); return; }   // a level tick waits its turn; plug, unplug and style changes are instant
  apply();
}
// the menu bar changes between light and dark with the system appearance: swap to the matching variant (cached, no repaint loop)
function onAppearance() { if (!tray || mono()) return; trayIconKey = ''; try { MODULES.glow?.onSettings?.(ctx); } catch {} if (!running.has('glow') || !battery) setTrayBattery(null, 'mark'); }
app.whenReady().then(() => { try { nativeTheme.on('updated', onAppearance); } catch {} if (IS_MAC) { try { systemPreferences.subscribeNotification('AppleInterfaceThemeChangedNotification', () => setTimeout(onAppearance, 120)); } catch {} } });
function setTray(id, extra) { const k = JSON.stringify(extra, (kk, v) => typeof v === 'function' ? undefined : v); if (trayKeys[id] === k) return; trayKeys[id] = k; trayExtras[id] = extra; updateTray(); }
const trayKeys = {};
let lastTitle = null, titleAt = 0, titleT = null;
function updateTray() {
  if (!tray) return;
  const titles = Object.values(trayExtras).map(e => e?.title).filter(Boolean); if (settings.muted) titles.push(IS_MAC ? 'Muted' : '(muted)');
  const t = titles.join('  ');
  if (t === lastTitle) return;
  // Typing Stats changes its "wpm" text on nearly every keystroke, and each setTitle makes macOS lay out the menu bar again.
  // The text is set at most 4 times a second (a change that arrives sooner is shown 250 ms after the last one, never lost).
  const since = Date.now() - titleAt; if (since < 250 && lastTitle !== null) { if (!titleT) titleT = setTimeout(() => { titleT = null; updateTray(); }, 250 - since); return; }
  lastTitle = t; titleAt = Date.now();
  if (IS_MAC) tray.setTitle(t ? ' ' + t : '', { fontType: 'monospacedDigit' }); else tray.setToolTip(['Surge', ...titles].join('  '));
}
// the right-click menu, built from the modules' items only when it opens (it used to be rebuilt every time a title changed)
function trayTemplate() {
  const items = [];
  for (const [, e] of Object.entries(trayExtras)) if (e?.menu?.length) { items.push(...e.menu); items.push({ type: 'separator' }); }
  return [
    ...items,
    { label: 'Settings', accelerator: 'Cmd+,', click: () => openSettings() },
    { label: 'Quick Notes', accelerator: 'Cmd+Shift+N', click: toggleNotes },
    { label: 'Check for updates', click: () => { try { MODULES.updater?._check(ctx, true); MODULES.updater?.actions?.card(); } catch {} } },
    { label: 'What\'s new', click: () => playWhatsNew('replay') },
    { label: 'About Surge', click: () => openSettings('about') },
    { type: 'separator' },
    { label: 'Mute all sounds', type: 'checkbox', checked: !!settings.muted, accelerator: 'Cmd+Shift+M', click: (m) => applyPatch({ muted: m.checked }) },
    { label: 'Launch at login', type: 'checkbox', checked: !!settings.launchAtLogin, click: (m) => applyPatch({ launchAtLogin: m.checked }) },
    { label: 'Quit Surge', accelerator: 'Cmd+Q', click: () => app.quit() },
  ];
}
function openTrayMenu() {
  const tpl = trayTemplate(); const b = tray.getBounds();
  if (Nova.popupMenu(tpl, b)) return;
  try { tray.popUpContextMenu(Menu.buildFromTemplate(tpl)); } catch (e) { log('tray menu', e.message); }
}

/* ------------------------------------------------------------------ module context + lifecycle */
const ctx = {
  app, screen, clipboard, Notification, nativeTheme, powerSaveBlocker, globalShortcut, execFile, os,
  get settings() { return settings; }, log, mod, fireGlow, overlaySend, setOverlayPersistent, play, sysSound, uiSound, ripple, onInput, hookState: () => hookState,
  runningApps: () => runningApps(), save: () => saveSettings(), get booting() { return booting; },
  frontApp: async () => { try { return (await runningApps()).find(a => a.front) || null; } catch { return null; } },
  activateApp: (a) => { if (!a) return; if (IS_WIN) { if (a.pid) winapps.activate(a.pid); } else if (a.path) execFile('open', ['-a', a.path], () => {}); },
  setTray, setTrayBattery, openSettings, whatsNewPending: () => whatsNewBoot, dialog: (o) => Nova.dialog(o), toggleNotes, readBattery, markCleanExit, bundlePath, stopHook: () => { quitting = true; stopHook(); }, applyPatch: (p) => applyPatch(p), get battery() { return battery; }, set battery(v) { battery = v; },
  notify: (title, body) => { try { new Notification({ title, body, silent: true }).show(); } catch {} },
  broadcast: (ch, p) => { [settingsWin, notesWin, audioWin, popWin, ...overlays].forEach(w => { try { if (w && !w.isDestroyed()) w.webContents.send(ch, p); } catch {} }); },
};
const running = new Set(); let booting = true;   // true while the modules start at launch
if (process.env.SURGE_TEST) global.__surge = { ctx, ripple, MODULES, flow, setTrayBattery, markIcon, trayChip, trayBattery, applyPatch: (p) => applyPatch(p), get tray() { return tray; }, stats, input: (ev, e) => dispatchInput({ ev, e }), get listeners() { return hookListeners; } };   // tests only
function startModule(id) { const m = MODULES[id]; if (!m || running.has(id)) return; try { log('starting', id); m.start?.(ctx); running.add(id); log('start', id); } catch (e) { console.error(`[${id}] start`, e); } }
function stopModule(id) { const m = MODULES[id]; if (!m || !running.has(id)) return; try { m.stop?.(ctx); } catch (e) { console.error(`[${id}] stop`, e); } running.delete(id); trayExtras[id] = null; delete trayKeys[id]; updateTray(); }
// changed: the module ids whose settings were just patched (null = all of them). A module only hears onSettings when ITS settings
// changed: flipping one switch used to wake all twenty modules, and Auto Dark Mode answered every one of them with an osascript call.
function reconcile(changed = null) {
  if (['keys', 'mouse', 'caps', 'chime'].some(id => mod(id)?.enabled)) setTimeout(ensureAudio, 1500);
  for (const id in MODULES) {
    const want = !!mod(id).enabled;
    if (want && !running.has(id)) startModule(id);
    else if (!want && running.has(id)) stopModule(id);
    else if (want && (!changed || changed.has(id))) { try { MODULES[id].onSettings?.(ctx); } catch (e) { console.error(`[${id}] onSettings`, e); } }
  }
}
function applyPatch(patch) {
  if ('masterVolume' in patch) settings.masterVolume = Math.max(0, Math.min(1, +patch.masterVolume));
  if ('muted' in patch) { settings.muted = !!patch.muted; setTimeout(updateTray, 0); }
  if ('uiSounds' in patch) { settings.uiSounds = !!patch.uiSounds; if (settings.uiSounds) sysSound('tap'); }
  if ('launchAtLogin' in patch) { settings.launchAtLogin = !!patch.launchAtLogin; if (IS_MAC || IS_WIN) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, openAsHidden: true }); }
  if (patch.modules) for (const id in patch.modules) settings.modules[id] = { ...settings.modules[id], ...patch.modules[id] };
  stats.patches++; saveSettings(); reconcile(new Set(Object.keys(patch.modules || {}))); ctx.broadcast('settings:update', settings); updateTray();
}

/* ------------------------------------------------------------------ ipc */
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_e, patch) => { applyPatch(patch); try { if (IS_MAC && patch && patch.modules && mod('mouse')?.haptic !== false) require('./haptics.js').tap(0, 60); } catch {} return settings; });
ipcMain.handle('settings:reset', () => { settings = { launchAtLogin: settings.launchAtLogin, masterVolume: 1, muted: false, welcomed: true, whatsNewSeen: settings.whatsNewSeen, modules: {} }; for (const id in MODULES) settings.modules[id] = defaultsFor(MODULES[id]); saveSettings(); reconcile(); ctx.broadcast('settings:update', settings); updateTray(); return settings; });
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
// the What's new film: its words, its end (played out, skipped with Esc or a click), and a replay from Settings or the menu
let whatsNewBoot = false;
const playWhatsNew = (why) => { try { return WhatsNew.play({ app, settings: () => settings, save: saveSettings, log, preload: path.join(__dirname, 'preload.js') }, why); } catch (e) { log('whatsnew failed', e.message); } };
ipcMain.handle('whatsnew:data', () => WhatsNew.data(app));
ipcMain.on('whatsnew:done', (_e, how) => { log('whatsnew:', how); WhatsNew.done(how); });
ipcMain.on('whatsnew:play', () => playWhatsNew('replay'));
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
      const r = await Nova.dialog({ type: 'info', buttons: ['Move to Applications', 'Not now'], defaultId: 0, cancelId: 1, message: 'Move Surge to your Applications folder?',
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
  loadSettings(); if (firstRun) { settings.launchAtLogin = true; settings.welcomed = false; settings.whatsNewSeen = app.getVersion(); } saveSettings();
  // a fresh install has its own welcome, so the What's new film is for updates only: it plays once on the first launch of a new version
  whatsNewBoot = WhatsNew.wantsWhatsNew(app.getVersion(), settings.whatsNewSeen) && (!process.env.SURGE_TEST || !!process.env.SURGE_TEST_WHATSNEW);
  // Start at login: registered on the first run; after that, a launch never overrides what you set in System Settings (Login
  // Items): if you removed Surge there, Surge's own switch follows that instead of quietly adding itself back.
  if ((IS_MAC || IS_WIN) && app.isPackaged) { try { const sys = app.getLoginItemSettings().openAtLogin; if (firstRun) { if (sys !== settings.launchAtLogin) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, openAsHidden: true }); } else if (sys !== settings.launchAtLogin) { settings.launchAtLogin = !!sys; saveSettings(); } } catch {} }
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Surge', submenu: [
    { label: 'About Surge', click: () => openSettings('about') },
    { label: 'What\'s New in Surge', click: () => playWhatsNew('replay') },
    { label: 'Check for Updates', click: () => { try { MODULES.updater?._check(ctx, true); MODULES.updater?.actions?.card(); } catch {} } },
    { type: 'separator' },
    { label: 'Settings…', accelerator: 'Cmd+,', click: () => openSettings() },
    { label: 'Quick Notes', accelerator: 'Cmd+Shift+N', click: toggleNotes },
    { label: 'Preview glow', accelerator: 'Cmd+P', click: () => fireGlow('preview') },
    { type: 'separator' }, { role: 'close' }, { role: 'minimize' }, { role: 'quit' } ]}, { role: 'editMenu' }]));
  if (process.platform === 'darwin') app.dock?.hide();
  createOverlays();
  tray = new Tray(markIcon()); tray.setIgnoreDoubleClickEvents(true); tray.setToolTip('Surge');
  if (IS_MAC && process.env.SURGE_SELFTEST) { try {
      const imgs = [['mark', markIcon(), 16], ['chip', trayChip({ level: 67, charging: true }), 0], ['battery', trayBattery({ level: 50 }), 27]];
      const bad = imgs.filter(([, im, w]) => im.isEmpty() || (w && im.getSize().width !== w) || im.getSize().height !== 16 || im.getScaleFactors().indexOf(2) < 0).map(t => t[0]);
      const tm = [TC.markPNG(2), TC.chipPNG({ level: 67, charging: true }, 2)].map(b => nativeImage.createFromBuffer(b)).filter(im => im.isEmpty()).length;
      log(bad.length || tm ? 'tray icons selftest FAIL ' + bad.join(',') : 'tray icons selftest pass (colour mark, chip, battery at 1x and 2x; monochrome templates ok)'); } catch (e) { log('tray icons selftest FAIL ' + e.message); } }
  tray.on('click', togglePopover);
  tray.on('right-click', openTrayMenu);
  if (IS_WIN) app.setAppUserModelId('app.surge.glow');
  updateTray(); ensurePopover();
  let dispT; const rebuild = () => { clearTimeout(dispT); dispT = setTimeout(() => { createOverlays(); running.forEach(id => MODULES[id].onSettings?.(ctx)); }, 600); };
  screen.on('display-added', rebuild); screen.on('display-removed', rebuild); screen.on('display-metrics-changed', rebuild);
  try { globalShortcut.register('CommandOrControl+Shift+N', toggleNotes); } catch {}
  reconcile(); booting = false;
  // Welcome shows once. A fresh DMG install first swaps itself to the stable-identity build (see updater), so wait for that restart before greeting.
  if (!firstRun && settings.welcomed === undefined) { settings.welcomed = true; saveSettings(); }
  const greet = () => { if (settings.welcomed) return; settings.welcomed = true; saveSettings(); openSettings('welcome'); };
  if (firstRun) setTimeout(() => fireGlow('preview'), 900);
  if (!settings.welcomed) setTimeout(() => { if (MODULES.updater?._migrating?.()) setTimeout(greet, 45000); else greet(); }, 2500);
  if (whatsNewBoot) setTimeout(() => playWhatsNew('update'), +process.env.SURGE_WHATSNEW_DELAY || 2400);
});
app.on('window-all-closed', () => {});
app.on('will-quit', () => { quitting = true; stopHook(); try { winapps?.stop(); } catch {} try { globalShortcut.unregisterAll(); const dk = MODULES.dock; if (dk && running.has('dock')) dk.stop(ctx); } catch {} });
