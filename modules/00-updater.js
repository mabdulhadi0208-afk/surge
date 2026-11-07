// Auto Update — GitHub Releases → zip → staged .app → swap → relaunch.
// State machine: idle → checking → available → downloading → unpacking → ready → installing  (error → retry)
const { execFile, spawn } = require('child_process');
const { BrowserWindow, screen } = require('electron');
const fs = require('fs'); const path = require('path');
const REPO = 'mabdulhadi0208-afk/surge', ZIP = 'Surge-mac-arm64.zip', DMG = 'Surge-mac-arm64.dmg';
let timer = null, popup = null, snoozedUntil = 0, skipVersion = null, polling = false, misses = 0, lastTag = null, lastCheck = 0, dlProc = null;
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
const log = (...a) => { try { fs.appendFileSync(path.join(C.app.getPath('logs'), 'surge.log'), `[${new Date().toISOString()}] updater: ${a.join(' ')}\n`); } catch {} };
const updDir = () => path.join(C.app.getPath('userData'), 'update');
function clearStaged() { try { fs.rmSync(updDir(), { recursive: true, force: true }); } catch {} state.staged = null; }
function push() { const s = { ...state, current: C.app.getVersion(), lastCheck }; C.broadcast('updater:state', s); if (popup && !popup.isDestroyed()) { try { popup.webContents.send('updater:state', s); } catch {} } }
function set(patch) { Object.assign(state, patch); push(); }

function showCard() {
  if (!C.mod('updater').popup) return;
  if (popup && !popup.isDestroyed()) { if (!popup.isVisible()) popup.showInactive(); push(); return; }
  const d = screen.getPrimaryDisplay().workArea; const w = 560, h = 186;
  popup = new BrowserWindow({ width: w, height: h, x: Math.round(d.x + d.width / 2 - w / 2), y: d.y + 12, frame: false, transparent: true, hasShadow: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: true, fullscreenable: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true } });
  popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); popup.setAlwaysOnTop(true, 'screen-saver');
  popup.loadFile(path.join(__dirname, '..', 'update.html')); popup.once('ready-to-show', () => { popup.showInactive(); push(); }); popup.on('closed', () => (popup = null));
  try { C.sysSound('Glass'); } catch {}
}
function hideCard() { if (popup && !popup.isDestroyed()) popup.hide(); }

async function check(manual) {
  if (['downloading', 'unpacking', 'installing'].includes(state.status)) return state;
  set({ status: 'checking', error: null }); lastCheck = Date.now();
  try {
    const latest = await latestTag(); if (!latest) throw new Error('GitHub did not answer');
    const cur = C.app.getVersion();
    if (!newer(latest, cur)) { if (state.staged) clearStaged(); set({ status: 'uptodate', latest }); C.setTray('updater', { title: '' }); if (manual) C.fireGlow('hud', { hud: { text: `Surge ${cur} is up to date`, color: '#00FF85' } }); return state; }
    if (!manual && skipVersion === latest) { set({ status: 'uptodate', latest }); return state; }
    // staged copy must be exactly this version, otherwise it's stale
    if (state.staged) { const sv = stagedVersion(state.staged); if (!sv || !same(sv, latest)) { log('discard stale staged', sv); clearStaged(); } }
    if (state.staged) { set({ status: 'ready', latest }); showCardIfAllowed(manual); return state; }
    let url = `https://github.com/${REPO}/releases/download/${latest}/${ZIP}`, isZip = true, p = await probe(url);
    if (!p.ok) { url = `https://github.com/${REPO}/releases/download/${latest}/${DMG}`; isZip = false; p = await probe(url); }
    if (!p.ok) throw new Error(`${latest} is published but the file isn't ready yet`);
    set({ status: 'available', latest, url, isZip, size: p.size, progress: 0, bytes: 0 });
    log('available', latest, isZip ? 'zip' : 'dmg', fmtMB(p.size));
    C.setTray('updater', { title: '↑', menu: [{ label: `Update to ${latest}`, click: () => install() }] });
    showCardIfAllowed(manual);
    if (C.mod('updater').auto) download();
  } catch (e) { set({ status: 'error', error: e.message }); log('check failed:', e.message); lastTag = null; if (manual) C.fireGlow('hud', { hud: { text: 'Update check failed', color: '#FFB300' } }); }
  return state;
}
function showCardIfAllowed(manual) { if (manual || Date.now() > snoozedUntil) showCard(); }

async function download() {
  if (!state.url || ['downloading', 'unpacking', 'installing'].includes(state.status)) return;
  if (state.staged) { const sv = stagedVersion(state.staged); if (sv && same(sv, state.latest)) { set({ status: 'ready' }); return; } clearStaged(); }
  const dir = updDir(); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, state.isZip ? ZIP : DMG), mnt = path.join(dir, 'mnt');
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
    clearInterval(prog); prog = null;
    if (state.size && fs.statSync(file).size !== state.size) throw new Error('download incomplete');
    set({ progress: 100, status: 'unpacking' });
    if (state.isZip) { await sh('ditto', ['-x', '-k', file, dir]); const app = fs.readdirSync(dir).find(f => f.endsWith('.app')); if (!app) throw new Error('No .app in zip'); if (app !== 'Surge.app') fs.renameSync(path.join(dir, app), path.join(dir, 'Surge.app')); }
    else { fs.mkdirSync(mnt, { recursive: true }); await sh('hdiutil', ['attach', '-nobrowse', '-quiet', '-mountpoint', mnt, file]); const app = fs.readdirSync(mnt).find(f => f.endsWith('.app')); if (!app) throw new Error('No .app in DMG'); await sh('ditto', [path.join(mnt, app), path.join(dir, 'Surge.app')]); await sh('hdiutil', ['detach', '-quiet', mnt]).catch(() => {}); }
    fs.rmSync(file, { force: true });
    const staged = path.join(dir, 'Surge.app'); const sv = stagedVersion(staged);
    if (!sv || !same(sv, state.latest)) throw new Error(`unpacked version mismatch (${sv})`);
    await sh('xattr', ['-cr', staged]).catch(() => {});
    set({ staged, status: 'ready' }); log('staged', state.latest);
    C.setTray('updater', { title: '↑', menu: [{ label: `Restart to update to ${state.latest}`, click: () => install() }] });
    showCardIfAllowed(false); C.notify('Surge update ready', `${state.latest} is downloaded. Click Restart on the card.`);
  } catch (e) { clearInterval(prog); set({ status: 'error', error: e.message }); log('download failed:', e.message); try { await sh('hdiutil', ['detach', '-quiet', mnt]); } catch {} }
}

async function install() {
  if (!state.staged) { if (state.status !== 'downloading' && state.status !== 'unpacking') await download(); if (!state.staged) return state; }
  const sv = stagedVersion(state.staged); if (!sv || !newer(sv, C.app.getVersion())) { clearStaged(); set({ status: 'error', error: 'staged copy was not newer — fetching again' }); return check(true); }
  const target = bundlePath(); if (!target) { set({ status: 'error', error: 'Not running from an .app bundle' }); return state; }
  const logf = path.join(C.app.getPath('logs'), 'update.log'); const script = path.join(updDir(), 'swap.sh');
  fs.writeFileSync(script, `#!/bin/bash
exec >> "${logf}" 2>&1
echo "=== $(date) swap ${C.app.getVersion()} -> ${sv}"
NEW="${state.staged}"; APP="${target}"
for i in $(seq 1 60); do pgrep -x Surge >/dev/null || break; sleep 0.1; done
pkill -x Surge 2>/dev/null; sleep 0.3
rm -rf "$APP.old"; mv "$APP" "$APP.old" || { echo "mv failed"; exit 1; }
if mv "$NEW" "$APP" 2>/dev/null || ditto "$NEW" "$APP"; then xattr -cr "$APP" 2>/dev/null; echo "swapped"; else echo "swap failed, rolling back"; rm -rf "$APP"; mv "$APP.old" "$APP"; fi
touch "${path.join(C.app.getPath('userData'), 'just-updated')}"
open -a "$APP" || ("$APP/Contents/MacOS/Surge" >/dev/null 2>&1 & disown)
for i in $(seq 1 40); do pgrep -f "$APP/Contents/MacOS/Surge" >/dev/null && break; sleep 0.25; done
if pgrep -f "$APP/Contents/MacOS/Surge" >/dev/null; then echo "launched OK"; rm -rf "$APP.old" "$NEW"; else echo "launch failed, restoring old"; rm -rf "$APP"; mv "$APP.old" "$APP" 2>/dev/null; open -a "$APP"; fi
echo "=== done"
`); fs.chmodSync(script, 0o755);
  set({ status: 'installing' }); log('installing', sv);
  const child = spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }); child.unref();
  setTimeout(() => C.app.exit(0), 150);
  return state;
}

async function poll() {
  if (polling || ['downloading', 'unpacking', 'installing', 'checking'].includes(state.status)) return; polling = true;
  const tag = await latestTag().finally(() => (polling = false));
  if (!tag) { misses++; if (misses === 20) { clearInterval(timer); timer = setInterval(poll, 30000); log('backing off to 30s'); } return; } misses = 0;
  if (tag === lastTag) return; lastTag = tag;
  if (newer(tag, C.app.getVersion())) check(false); else if (state.status === 'idle') set({ status: 'uptodate', latest: tag });
}

module.exports = {
  id: 'updater', name: 'Auto Update', icon: 'refresh', group: 'System', defaultEnabled: true,
  desc: 'Watches GitHub for new versions, downloads them in the background, verifies them, and installs in one click.',
  defaults: { auto: true, popup: true, pollSeconds: 5 },
  schema: [
    { k: 'auto', t: 'toggle', label: 'Download automatically', hint: 'New versions download in the background; you choose when to restart' },
    { k: 'popup', t: 'toggle', label: 'Show the update card', hint: 'A floating card appears on top of whatever you\'re doing' },
    { k: 'pollSeconds', t: 'seg', label: 'Check every', opts: [[1,'1 s'],[5,'5 s'],[30,'30 s'],[300,'5 min']] },
    { t: 'actions', label: 'Update', opts: [['check','Check now'],['install','Install update']] },
  ],
  actions: {
    check: () => check(true), install: () => install(), download: () => download(),
    later: () => { snoozedUntil = Date.now() + 2 * 3600000; hideCard(); }, skip: () => { skipVersion = state.latest; hideCard(); },
    cancel: () => { try { dlProc?.kill('SIGTERM'); } catch {} set({ status: 'available', progress: 0 }); },
    state: () => ({ ...state, current: C.app.getVersion(), lastCheck }),
  },
  start(ctx) {
    C = ctx;
    try { const f = path.join(ctx.app.getPath('userData'), 'just-updated'); if (fs.existsSync(f)) { fs.rmSync(f); setTimeout(() => ctx.fireGlow('full', { level: 100, hud: { text: `Updated to Surge ${ctx.app.getVersion()}`, color: '#00FF85' } }), 1500); log('updated to', ctx.app.getVersion()); } } catch {}
    const staged = path.join(updDir(), 'Surge.app');
    if (fs.existsSync(staged)) { const sv = stagedVersion(staged); if (sv && newer(sv, ctx.app.getVersion())) { state.staged = staged; state.status = 'ready'; state.latest = 'v' + sv; } else clearStaged(); }
    setTimeout(() => check(false), 3000);
    timer = setInterval(poll, Math.max(1, ctx.mod('updater').pollSeconds || 5) * 1000);
    try { const { powerMonitor } = require('electron'); powerMonitor.on('resume', () => setTimeout(() => check(false), 8000)); } catch {}
  },
  onSettings(ctx) { clearInterval(timer); timer = setInterval(poll, Math.max(1, ctx.mod('updater').pollSeconds || 5) * 1000); },
  stop(ctx) { clearInterval(timer); ctx.setTray('updater', { title: '' }); if (popup && !popup.isDestroyed()) popup.destroy(); popup = null; },
  _check: (ctx, manual) => check(!!manual),
};
