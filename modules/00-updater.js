// Auto Update — GitHub Releases → zip → staged .app → swap → relaunch.
// State machine: idle → checking → available → downloading → unpacking → ready → installing  (error → retry with backoff)
// What it reads: the redirect of github.com/<repo>/releases/latest (→ the newest tag), then the release asset
// Surge-mac-arm64.zip (macOS) or Surge-win-x64.exe (Windows) that .github/workflows/build.yml uploads. No latest-mac.yml needed.
// Zero lag: one tiny HEAD request every 30 minutes (and on wake, and when you open the menu, at most once a minute).
// Never freezes: every network and disk step is async (curl, ditto, hdiutil run as child processes), and a failure only
// ever leaves the current Surge running with a calm "Update paused" and a retry later.
const { execFile, spawn } = require('child_process');
const { BrowserWindow, screen } = require('electron');
const fs = require('fs'); const path = require('path');
const REPO = 'mabdulhadi0208-afk/surge', ZIP = 'Surge-mac-arm64.zip', DMG = 'Surge-mac-arm64.dmg', EXE = 'Surge-win-x64.exe';
const IS_WIN = process.platform === 'win32';
let timer = null, popup = null, snoozedUntil = 0, skipVersion = null, polling = false, misses = 0, lastTag = null, lastCheck = 0, dlProc = null, lastPeek = 0, retryT = null, fails = 0;
// shown on the card right after an update lands (keep it to this version's changes)
const WHATS_NEW = ['A whole new look: deep colour, glass and hero banners everywhere', 'Zero lag: Surge now sleeps when you are not using it', 'A new menu-bar icon, update card and sounds'];
const NO_BUILD = process.platform === 'darwin' && process.arch !== 'arm64';   // only an Apple silicon build is published
const state = { status: 'idle', latest: null, url: null, size: 0, progress: 0, bytes: 0, speed: 0, eta: 0, error: null, staged: null, isZip: true };

const semver = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
const newer = (a, b) => { const A = semver(a), B = semver(b); for (let i = 0; i < 3; i++) { if ((A[i] || 0) > (B[i] || 0)) return true; if ((A[i] || 0) < (B[i] || 0)) return false; } return false; };
const same = (a, b) => semver(a).join('.') === semver(b).join('.');
function sh(cmd, args, opts = {}) { return new Promise((res, rej) => execFile(cmd, args, { timeout: 600000, maxBuffer: 1 << 24, ...opts }, (e, out, err) => e ? rej(new Error((err || e.message).trim())) : res(out))); }
function latestTag() { return sh('curl', ['-sI', '-o', '/dev/null', '-w', '%{redirect_url}', `https://github.com/${REPO}/releases/latest`], { timeout: 8000 }).then(u => (/\/tag\/([^\/\s]+)/.exec(u) || [])[1] || null).catch(() => null); }
async function probe(url) { const h = await sh('curl', ['-sIL', url], { timeout: 15000 }).catch(() => ''); const codes = [...h.matchAll(/^HTTP\/[\d.]+ (\d{3})/gm)].map(m => +m[1]); const len = [...h.matchAll(/^content-length:\s*(\d+)/gmi)].map(m => +m[1]); return { ok: codes.length > 0 && codes[codes.length - 1] === 200, size: len.length ? len[len.length - 1] : 0 }; }
function stagedVersion(appPath) { try { const pl = fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'utf8'); const v = /CFBundleShortVersionString<\/key>\s*<string>([^<]+)/.exec(pl)?.[1]; if (v) return v; } catch {} try { return require('child_process').execFileSync('defaults', ['read', path.join(appPath, 'Contents', 'Info.plist'), 'CFBundleShortVersionString']).toString().trim(); } catch { return null; } }
function bundlePath() { const p = process.execPath; const i = p.indexOf('.app/Contents/MacOS/'); return i > 0 ? p.slice(0, i + 4) : null; }
const fmtMB = b => (b / 1048576).toFixed(1) + ' MB';

let C = null; // ctx
let adhoc = false, migrate = false;
const migratedFlag = () => path.join(C.app.getPath('userData'), 'migrated-' + C.app.getVersion());
const log = (...a) => { try { fs.appendFileSync(path.join(C.app.getPath('logs'), 'surge.log'), `[${new Date().toISOString()}] updater: ${a.join(' ')}\n`); } catch {} };
const updDir = () => path.join(C.app.getPath('userData'), 'update');
function clearStaged() { try { fs.rmSync(updDir(), { recursive: true, force: true }); } catch {} state.staged = null; }
function push() { const s = { ...state, current: C.app.getVersion(), lastCheck, whatsNew: WHATS_NEW, noBuild: NO_BUILD }; C.broadcast('updater:state', s); if (popup && !popup.isDestroyed()) { try { popup.webContents.send('updater:state', s); } catch {} } }
function set(patch) { if (['available', 'ready'].includes(patch.status) || (patch.status === 'uptodate' && !retryT)) fails = 0; Object.assign(state, patch); push(); }

function showCard() {
  if (!C.mod('updater').popup) return;
  if (popup && !popup.isDestroyed()) { if (!popup.isVisible()) popup.showInactive(); push(); return; }
  const d = screen.getPrimaryDisplay().workArea; const w = 520, h = 236;
  popup = new BrowserWindow({ width: w, height: h, x: Math.round(d.x + d.width / 2 - w / 2), y: d.y + 12, frame: false, transparent: true, hasShadow: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: true, fullscreenable: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true } });
  popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); popup.setAlwaysOnTop(true, 'screen-saver');
  popup.loadFile(path.join(__dirname, '..', 'update.html')); popup.once('ready-to-show', () => { popup.showInactive(); push(); }); popup.on('closed', () => (popup = null));
  popup.webContents.on('ipc-message', (_e, ch, hgt) => { if (ch === 'update:height' && popup && !popup.isDestroyed()) { const b = popup.getBounds(), H = Math.max(150, Math.min(420, Math.ceil(+hgt || h))); if (b.height !== H) popup.setBounds({ ...b, height: H }, false); } });
  try { C.uiSound?.('update'); } catch {}
}
function hideCard() { if (popup && !popup.isDestroyed()) popup.hide(); }
// a failed check or download never shows as a red error on its own: it waits and tries again (1, 5, 15, 30 min)
function retryLater() { clearTimeout(retryT); const mins = [1, 5, 15, 30][Math.min(fails++, 3)]; retryT = setTimeout(() => { retryT = null; lastTag = null; check(false); }, mins * 60000); log('will retry in', mins, 'min'); }

async function check(manual) {
  if (['downloading', 'unpacking', 'installing'].includes(state.status)) return state;
  set({ status: 'checking', error: null }); lastCheck = Date.now();
  if (NO_BUILD) { set({ status: 'uptodate', latest: null, note: 'Updates for Intel Macs come from the website' }); return state; }
  try {
    const latest = await latestTag(); if (!latest) throw new Error('GitHub did not answer');
    const cur = C.app.getVersion();
    if (!newer(latest, cur) && adhoc && same(latest, cur) && !fs.existsSync(migratedFlag())) { migrate = true; log('identity switch: fetching the cert-signed build of', latest); }
    else if (!newer(latest, cur)) { if (state.staged) clearStaged(); set({ status: 'uptodate', latest }); C.setTray('updater', { title: '' }); if (manual) C.fireGlow('hud', { hud: { text: `Surge ${cur} is up to date`, color: '#19D69A' } }); return state; }
    if (!manual && !migrate && skipVersion === latest) { set({ status: 'uptodate', latest }); return state; }
    // staged copy must be exactly this version, otherwise it's stale
    if (state.staged) { const sv = stagedVersion(state.staged); if (!sv || !same(sv, latest)) { log('discard stale staged', sv); clearStaged(); } }
    if (state.staged) { set({ status: 'ready', latest }); showCardIfAllowed(manual); return state; }
    let url = `https://github.com/${REPO}/releases/download/${latest}/${IS_WIN ? EXE : ZIP}`, isZip = !IS_WIN, p = await probe(url);
    if (!p.ok && !IS_WIN) { url = `https://github.com/${REPO}/releases/download/${latest}/${DMG}`; isZip = false; p = await probe(url); }
    if (!p.ok) { log(latest, 'is published but its file is not up yet'); set({ status: 'uptodate', latest: 'v' + cur }); lastTag = null; retryLater(); return state; }   // CI still uploading: quietly look again soon
    set({ status: 'available', latest, url, isZip, size: p.size, progress: 0, bytes: 0 });
    log('available', latest, isZip ? 'zip' : 'dmg', fmtMB(p.size));
    if (migrate) { download().then(() => { if (state.staged) { try { fs.writeFileSync(migratedFlag(), '1'); } catch {} install(); } }); return state; }
    C.setTray('updater', { title: '↑', menu: [{ label: `Update to ${latest}`, click: () => install() }] });
    showCardIfAllowed(manual);
    if (C.mod('updater').auto) download();
  } catch (e) { log('check failed:', e.message); lastTag = null; if (manual) { set({ status: 'error', error: 'Could not reach GitHub. Surge will try again on its own.' }); C.fireGlow('hud', { hud: { text: 'Could not reach GitHub', color: '#FFA514' } }); } else set({ status: state.staged ? 'ready' : 'idle' }); retryLater(); }
  return state;
}
function showCardIfAllowed(manual) { if (manual || Date.now() > snoozedUntil) showCard(); }

async function download() {
  if (!state.url || ['downloading', 'unpacking', 'installing'].includes(state.status)) return;
  if (state.staged) { const sv = stagedVersion(state.staged); if (sv && same(sv, state.latest)) { set({ status: 'ready' }); return; } clearStaged(); }
  const dir = updDir(); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, IS_WIN ? EXE : state.isZip ? ZIP : DMG), mnt = path.join(dir, 'mnt');
  let prog = null;
  try {
    set({ status: 'downloading', progress: 0, bytes: 0, speed: 0, eta: 0 });
    let lastB = 0, lastT = Date.now();
    prog = setInterval(() => { try { const b = fs.statSync(file).size; const now = Date.now(); const sp = (b - lastB) / Math.max(.001, (now - lastT) / 1000); lastB = b; lastT = now;
      set({ bytes: b, speed: sp, progress: state.size ? Math.min(99, Math.round(b / state.size * 100)) : 0, eta: sp > 0 && state.size ? Math.round((state.size - b) / sp) : 0 }); } catch {} }, 300);
    // 3 attempts, resumable
    let ok = false, err = null;
    for (let i = 0; i < 3 && !ok; i++) { try { await new Promise((res, rej) => { dlProc = execFile('curl', ['-L', '--fail', '--silent', '--show-error', '-C', '-', '--retry', '2', '-o', file, state.url], { timeout: 900000 }, (e, o, se) => { dlProc = null; e ? rej(new Error((se || e.message).trim())) : res(); }); }); ok = true; } catch (e) { err = e; log('download attempt', i + 1, 'failed:', e.message); await new Promise(r => setTimeout(r, 1500)); } }
    if (!ok) throw err || new Error('download failed');
    if (state.status !== 'downloading') { log('download cancelled'); return; }
    clearInterval(prog); prog = null;
    if (state.size && fs.statSync(file).size !== state.size) throw new Error('download incomplete');
    set({ progress: 100, status: 'unpacking' });
    if (IS_WIN) { set({ staged: file, status: 'ready' }); log('staged installer', state.latest); C.setTray('updater', { title: '↑', menu: [{ label: `Restart to update to ${state.latest}`, click: () => install() }] }); showCardIfAllowed(false); C.notify(`Surge ${String(state.latest).replace(/^v/, '')} is ready`, 'Restart from the update card or the Surge menu. It takes about 3 seconds.'); return; }
    if (state.isZip) { await sh('ditto', ['-x', '-k', file, dir]); const app = fs.readdirSync(dir).find(f => f.endsWith('.app')); if (!app) throw new Error('No .app in zip'); if (app !== 'Surge.app') fs.renameSync(path.join(dir, app), path.join(dir, 'Surge.app')); }
    else { fs.mkdirSync(mnt, { recursive: true }); await sh('hdiutil', ['attach', '-nobrowse', '-quiet', '-mountpoint', mnt, file]); const app = fs.readdirSync(mnt).find(f => f.endsWith('.app')); if (!app) throw new Error('No .app in DMG'); await sh('ditto', [path.join(mnt, app), path.join(dir, 'Surge.app')]); await sh('hdiutil', ['detach', '-quiet', mnt]).catch(() => {}); }
    fs.rmSync(file, { force: true });
    const staged = path.join(dir, 'Surge.app'); const sv = stagedVersion(staged);
    if (!sv || !same(sv, state.latest)) throw new Error(`unpacked version mismatch (${sv})`);
    await sh('xattr', ['-cr', staged]).catch(() => {});
    set({ staged, status: 'ready' }); log('staged', state.latest);
    if (migrate) return;
    C.setTray('updater', { title: '↑', menu: [{ label: `Restart to update to ${state.latest}`, click: () => install() }] });
    showCardIfAllowed(false); C.notify(`Surge ${String(state.latest).replace(/^v/, '')} is ready`, 'Restart from the update card or the Surge menu. It takes about 3 seconds.');
  } catch (e) { clearInterval(prog); log('download failed:', e.message); try { await sh('hdiutil', ['detach', '-quiet', mnt]); } catch {} if (state.status === 'downloading' || state.status === 'unpacking') { set({ status: 'error', error: 'The download stopped. Surge will try again in a minute.' }); retryLater(); } }
}

async function install() {
  if (!state.staged) { if (state.status !== 'downloading' && state.status !== 'unpacking') await download(); if (!state.staged) return state; }
  if (IS_WIN) {
    // NSIS one-click installer: /S = silent; it replaces the app in place and relaunches it. Marker makes the new build show the "Updated" glow.
    try { fs.writeFileSync(path.join(C.app.getPath('userData'), 'just-updated'), ''); } catch {}
    set({ status: 'installing' }); log('installing (windows)', state.latest);
    try { C.markCleanExit?.(); } catch {}
    // The installer occasionally crashes on its first try (seen on clean Windows machines: exit 0xC0000005). Never leave the user without Surge:
    // a tiny script retries it up to 4 times, makes sure Surge is running afterwards, and reopens the old version if every try failed.
    const exe = process.execPath, cmd = path.join(updDir(), 'update.cmd'), wl = path.join(C.app.getPath('logs'), 'update.log');
    fs.writeFileSync(cmd, ['@echo off', 'setlocal', `set "LOG=${wl}"`, `echo === %DATE% %TIME% installing ${state.latest} >> "%LOG%"`, 'timeout /t 2 /nobreak >nul', 'set N=0', ':try',
      `"${state.staged}" /S --force-run`, 'set RC=%ERRORLEVEL%', 'echo installer exit %RC% >> "%LOG%"', 'if "%RC%"=="0" goto ok', 'set /a N+=1', 'if %N% GEQ 4 goto fail', 'timeout /t 3 /nobreak >nul', 'goto try',
      ':ok', 'timeout /t 6 /nobreak >nul', `tasklist /FI "IMAGENAME eq Surge.exe" | find /I "Surge.exe" >nul || start "" "${exe}"`, 'echo done >> "%LOG%"', 'exit /b 0',
      ':fail', 'echo all attempts failed, reopening the current version >> "%LOG%"', `start "" "${exe}"`, 'exit /b 1'].join('\r\n'));
    const child = spawn('cmd.exe', ['/c', cmd], { detached: true, stdio: 'ignore', windowsHide: true }); child.unref();
    setTimeout(() => C.app.exit(0), 400);
    return state;
  }
  const sv = stagedVersion(state.staged); if (!sv || !(newer(sv, C.app.getVersion()) || (migrate && same(sv, C.app.getVersion())))) { clearStaged(); set({ status: 'error', error: 'staged copy was not newer — fetching again' }); return check(true); }
  const target = bundlePath(); if (!target) { set({ status: 'error', error: 'Not running from an .app bundle' }); return state; }
  const logf = path.join(C.app.getPath('logs'), 'update.log'); const script = path.join(updDir(), 'swap.sh');
  fs.writeFileSync(script, `#!/bin/bash
exec >> "${logf}" 2>&1
unset SURGE_SELFTEST SURGE_RELAUNCH
echo "=== $(date) swap ${C.app.getVersion()} -> ${sv}"
NEW="${state.staged}"; APP="${target}"; OLDPID=${process.pid}
# wait for the old Surge (this exact pid) to be gone; escalate to SIGKILL if it hangs on exit so the new one can take the single-instance lock
for i in $(seq 1 40); do kill -0 $OLDPID 2>/dev/null || break; sleep 0.1; done
kill -0 $OLDPID 2>/dev/null && { echo "old pid $OLDPID still alive, SIGTERM"; kill -TERM $OLDPID 2>/dev/null; sleep 1; }
kill -0 $OLDPID 2>/dev/null && { echo "old pid $OLDPID stuck, SIGKILL"; kill -KILL $OLDPID 2>/dev/null; sleep 0.5; }
pkill -x Surge 2>/dev/null; sleep 0.3
rm -rf "$APP.old"; mv "$APP" "$APP.old" || { echo "mv failed"; exit 1; }
if mv "$NEW" "$APP" 2>/dev/null || ditto "$NEW" "$APP"; then xattr -cr "$APP" 2>/dev/null; echo "swapped"; else echo "swap failed, rolling back"; rm -rf "$APP"; mv "$APP.old" "$APP"; fi
touch "${path.join(C.app.getPath('userData'), 'just-updated')}"
open -a "$APP" || ("$APP/Contents/MacOS/Surge" >/dev/null 2>&1 & disown)
for i in $(seq 1 40); do pgrep -f "$APP/Contents/MacOS/Surge" >/dev/null && break; sleep 0.25; done
if pgrep -f "$APP/Contents/MacOS/Surge" >/dev/null; then echo "launched OK"; rm -rf "$APP.old" "$NEW"; else echo "launch failed, restoring old"; rm -rf "$APP"; mv "$APP.old" "$APP" 2>/dev/null; open -a "$APP"; fi
# belt and braces: if 8s later there's still no Surge in the menu bar, launch it again
sleep 8; pgrep -f "$APP/Contents/MacOS/Surge" >/dev/null || { echo "no Surge running after swap, relaunching"; open -a "$APP"; }
echo "=== done"
`); fs.chmodSync(script, 0o755);
  set({ status: 'installing' }); log('installing', sv); showCard();
  await new Promise(r => setTimeout(r, process.env.SURGE_SELFTEST ? 0 : 900));        // let the card say "Restarting" before Surge goes
  const child = spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }); child.unref();
  try { C.markCleanExit?.(); C.stopHook?.(); } catch {}              // marker: the watchdog must not fight the swap; the native hook is what makes exit hang
  setTimeout(() => C.app.exit(0), 150);
  setTimeout(() => { try { process.kill(process.pid, 'SIGKILL'); } catch {} }, 2500);   // if Electron won't die, make it
  return state;
}

async function poll() {
  if (NO_BUILD) return;
  if (polling || ['downloading', 'unpacking', 'installing', 'checking'].includes(state.status)) return; polling = true;
  const tag = await latestTag().finally(() => (polling = false));
  if (!tag) { misses++; return; } misses = 0;
  if (tag === lastTag) return; lastTag = tag;
  if (newer(tag, C.app.getVersion())) check(false); else if (state.status === 'idle') set({ status: 'uptodate', latest: tag });
}

module.exports = {
  id: 'updater', name: 'Auto Update', icon: 'refresh', group: 'System', defaultEnabled: true,
  desc: 'Watches GitHub for new versions, downloads them in the background, verifies them, and installs in one click.',
  defaults: { auto: true, popup: true, pollSeconds: 1800, skipped: null },
  schema: [
    { k: 'auto', t: 'toggle', label: 'Download automatically', hint: 'New versions download in the background; you choose when to restart' },
    { k: 'popup', t: 'toggle', label: 'Show the update card', hint: 'A floating card appears on top of whatever you\'re doing' },
    { k: 'pollSeconds', t: 'seg', label: 'Check every', opts: [[1800,'30 min'],[3600,'1 hour'],[21600,'6 hours']] },
  ],
  actions: {
    check: () => check(true), install: () => install(), download: () => download(),
    later: () => { snoozedUntil = Date.now() + 2 * 3600000; hideCard(); }, skip: () => { skipVersion = state.latest; C.applyPatch({ modules: { updater: { skipped: skipVersion } } }); hideCard(); },
    cancel: () => { set({ status: 'available', progress: 0 }); try { dlProc?.kill('SIGTERM'); } catch {} },
    card: () => { showCard(); return true; }, close: () => { hideCard(); if (state.status === 'updated') set({ status: 'uptodate' }); },
    state: () => ({ ...state, current: C.app.getVersion(), lastCheck, whatsNew: WHATS_NEW, noBuild: NO_BUILD }),
  },
  start(ctx) {
    C = ctx; skipVersion = ctx.mod('updater').skipped || null;
    try { const f = path.join(ctx.app.getPath('userData'), 'just-updated'); if (fs.existsSync(f)) { fs.rmSync(f); setTimeout(() => ctx.fireGlow('full', { level: 100, hud: { text: `Updated to Surge ${ctx.app.getVersion()}`, color: '#19D69A' } }), 1500); log('updated to', ctx.app.getVersion());
        // the restart flow ends on a "you're on the new version" card with what changed; it hides itself after 12 s
        setTimeout(() => { if (process.env.SURGE_SELFTEST) return; set({ status: 'updated', latest: 'v' + ctx.app.getVersion() }); showCard(); setTimeout(() => { if (state.status === 'updated') { hideCard(); set({ status: 'uptodate' }); } }, 12000); }, 2600);
        setTimeout(() => { try { const { systemPreferences } = require('electron'); if (process.platform === 'darwin') log('after update: accessibility trusted =', systemPreferences.isTrustedAccessibilityClient(false)); } catch {} }, 2500); } } catch {}
    // A fresh DMG install is ad-hoc signed (so Gatekeeper opens it). Updates are cert-signed (so permissions survive). Switch to the cert build
    // of the SAME version right away, before the user grants anything, so no later update ever changes the app's identity.
    if (process.platform === 'darwin' && ctx.app.isPackaged && bundlePath()) execFile('codesign', ['-dv', bundlePath()], (e, o, er) => { adhoc = /Signature=adhoc/.test((o || '') + (er || '')); if (adhoc) log('ad-hoc build detected → will switch to the stable-identity build'); });
    if (process.env.SURGE_SELFTEST === 'swap') setTimeout(async () => { try { log('SELFTEST swap: staging a copy of myself'); const dir = updDir(); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); await sh('ditto', [bundlePath(), path.join(dir, 'Surge.app')]); state.staged = path.join(dir, 'Surge.app'); state.latest = 'v' + ctx.app.getVersion(); migrate = true; await install(); } catch (e) { log('SELFTEST failed', e.message); } }, 5000);
    const staged = path.join(updDir(), 'Surge.app');
    if (fs.existsSync(staged)) { const sv = stagedVersion(staged); if (sv && newer(sv, ctx.app.getVersion())) { state.staged = staged; state.status = 'ready'; state.latest = 'v' + sv; } else clearStaged(); }
    setTimeout(() => check(false), 3000);
    timer = setInterval(poll, Math.max(900, ctx.mod('updater').pollSeconds || 1800) * 1000);
    try { const { powerMonitor } = require('electron'); powerMonitor.on('resume', () => setTimeout(() => check(false), 8000)); } catch {}
  },
  onSettings(ctx) { const ms = Math.max(900, ctx.mod('updater').pollSeconds || 1800) * 1000; if (timer && timer._ms === ms) return; clearInterval(timer); timer = setInterval(poll, ms); timer._ms = ms; },
  stop(ctx) { clearInterval(timer); clearTimeout(retryT); ctx.setTray('updater', { title: '' }); if (popup && !popup.isDestroyed()) popup.destroy(); popup = null; },
  _check: (ctx, manual) => check(!!manual),
  _peek: () => { if (Date.now() - lastPeek < 60000) return; lastPeek = Date.now(); poll(); },
  // tests and screenshots: put the card in any state without the network
  _test: (status, extra = {}) => { if (status === 'idle') { Object.assign(state, { status: 'idle', latest: null, staged: null }); hideCard(); push(); return state; }
    Object.assign(state, { status, latest: 'v' + C.app.getVersion().replace(/^(\d+)\.(\d+).*/, (m, a, b) => a + '.' + (+b + 1) + '.0'), url: 'test', size: 96 * 1048576, bytes: 60 * 1048576, speed: 8.4 * 1048576, eta: 4, error: status === 'error' ? 'Could not reach GitHub. Surge will try again on its own.' : null, ...extra });
    if (status === 'downloading') state.bytes = Math.round(state.size * (state.progress || 0) / 100);
    showCard(); push(); return state; },
  _migrating: () => adhoc && !fs.existsSync(migratedFlag()),
};
