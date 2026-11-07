// Auto Update — polls GitHub Releases, downloads the DMG, swaps the .app bundle, relaunches.
// Works with ad-hoc signed builds (Electron's Squirrel updater refuses those on macOS).
const { execFile, spawn } = require('child_process');
const { BrowserWindow, screen } = require('electron');
let popup = null, snoozedUntil = 0, polling = false, misses = 0;
const fs = require('fs'); const path = require('path');
const REPO = 'mabdulhadi0208-afk/surge', ASSET = 'Surge-mac-arm64.dmg', ZIP = 'Surge-mac-arm64.zip';
let timer = null, state = { status: 'idle', latest: null, url: null, progress: 0, error: null, staged: null };
const semver = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
const newer = (a, b) => { const A = semver(a), B = semver(b); for (let i = 0; i < 3; i++) { if ((A[i] || 0) > (B[i] || 0)) return true; if ((A[i] || 0) < (B[i] || 0)) return false; } return false; };
let lastTag = null;
// cheap: HEAD https://github.com/<repo>/releases/latest → Location: .../tag/vX.Y.Z (no API rate limit)
function latestTagFast() { return sh('curl', ['-sI', '-o', '/dev/null', '-w', '%{redirect_url}', `https://github.com/${REPO}/releases/latest`], { timeout: 8000 }).then(u => (/\/tag\/([^\/\s]+)/.exec(u) || [])[1] || null).catch(() => null); }
function get(url) { return sh('curl', ['-sL', '--fail', '-A', 'Surge-updater', '-H', 'Accept: application/vnd.github+json', url], { timeout: 20000 }).then(body => ({ status: 200, body })); }
function stagedVersion(appPath) { try { const pl = fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'utf8'); const v = /CFBundleShortVersionString<\/key>\s*<string>([^<]+)/.exec(pl)?.[1]; if (v) return v; } catch {} try { return require('child_process').execFileSync('defaults', ['read', path.join(appPath, 'Contents', 'Info.plist'), 'CFBundleShortVersionString']).toString().trim(); } catch { return null; } }
function clearStaged(ctx) { try { fs.rmSync(path.join(ctx.app.getPath('userData'), 'update'), { recursive: true, force: true }); } catch {} state.staged = null; }
function bundlePath(ctx) { const p = process.execPath; const i = p.indexOf('.app/Contents/MacOS/'); return i > 0 ? p.slice(0, i + 4) : null; }
function sh(cmd, args, opts = {}) { return new Promise((res, rej) => execFile(cmd, args, { timeout: 600000, ...opts }, (e, out, err) => e ? rej(new Error(err || e.message)) : res(out))); }

module.exports = {
  id: 'updater', name: 'Auto Update', icon: 'refresh', group: 'System', defaultEnabled: true,
  desc: 'Checks GitHub for new versions, downloads them in the background and installs on restart (or instantly).',
  defaults: { auto: true, every: 1, popup: true, pollSeconds: 5 },
  schema: [
    { k: 'auto', t: 'toggle', label: 'Download automatically', hint: 'New versions download in the background' },
    { k: 'popup', t: 'toggle', label: 'Pop up when an update is out', hint: 'A floating card appears on top of whatever you\'re doing' },
    { k: 'pollSeconds', t: 'seg', label: 'Check every', opts: [[1,'1 s'],[5,'5 s'],[10,'10 s'],[30,'30 s']] },
    { t: 'actions', label: 'Update', opts: [['check','Check now'],['install','Install update']] },
  ],
  actions: {
    check: (ctx) => module.exports._check(ctx, true),
    install: (ctx) => module.exports._install(ctx),
    download: (ctx) => module.exports._download(ctx),
    later: () => { snoozedUntil = Date.now() + 2 * 3600000; module.exports._hide(); },
    state: () => ({ ...state, current: require('electron').app.getVersion() }),
  },
  _show(ctx) {
    if (popup && !popup.isDestroyed()) { popup.showInactive(); popup.webContents.send('updater:state', state); return; }
    const d = screen.getPrimaryDisplay().workArea; const w = 640, h = 104;
    popup = new BrowserWindow({ width: w, height: h, x: Math.round(d.x + d.width / 2 - w / 2), y: d.y + 14, frame: false, transparent: true, hasShadow: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: true, fullscreenable: false, backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true } });
    popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); popup.setAlwaysOnTop(true, 'screen-saver');
    popup.loadFile(path.join(__dirname, '..', 'update.html')); popup.once('ready-to-show', () => popup.showInactive()); popup.on('closed', () => (popup = null));
    try { ctx.sysSound('Glass'); } catch {}
  },
  _hide() { if (popup && !popup.isDestroyed()) popup.hide(); },
  async _poll(ctx) {
    if (polling || state.status === 'downloading' || state.status === 'installing') return; polling = true;
    const tag = await latestTagFast().finally(() => (polling = false));
    if (!tag) { misses++; if (misses === 20) { clearInterval(timer); timer = setInterval(() => module.exports._poll(ctx), 30000); } return; } misses = 0;
    if (tag === lastTag) return; lastTag = tag;
    if (newer(tag, ctx.app.getVersion())) module.exports._check(ctx, false);
  },
  async _check(ctx, manual) {
    if (state.status === 'downloading' || state.status === 'installing') return state;
    const log = (...a) => { try { fs.appendFileSync(path.join(ctx.app.getPath('logs'), 'surge.log'), `[${new Date().toISOString()}] updater: ${a.join(' ')}\n`); } catch {} };
    try {
      state.status = 'checking'; state.error = null;
      const latest = await latestTagFast(); if (!latest) throw new Error('no redirect from GitHub');
      const cur = ctx.app.getVersion();
      if (newer(latest, cur)) {
        // no API: build the asset URL from the tag, then HEAD it for size
        const probe = async (u) => { const h = await sh('curl', ['-sIL', u], { timeout: 15000 }).catch(() => ''); const codes = [...h.matchAll(/^HTTP\/[\d.]+ (\d{3})/gm)].map(m => +m[1]); const len = [...h.matchAll(/^content-length:\s*(\d+)/gmi)].map(m => +m[1]); return { ok: codes.length && codes[codes.length - 1] === 200, size: len.length ? len[len.length - 1] : 0 }; };
        let url = `https://github.com/${REPO}/releases/download/${latest}/${ZIP}`, isZip = true, p = await probe(url);
        if (!p.ok) { url = `https://github.com/${REPO}/releases/download/${latest}/${ASSET}`; isZip = false; p = await probe(url); }
        if (!p.ok) throw new Error('asset not ready yet');
        if (state.staged) { const sv = stagedVersion(state.staged); if (!sv || 'v' + sv !== latest.replace(/^v?/, 'v')) { log('discarding stale staged', sv); clearStaged(ctx); } }
        state.latest = latest; state.url = url; state.isZip = isZip; state.size = p.size; state.status = state.staged ? 'ready' : 'available';
        log('available', latest, isZip ? 'zip' : 'dmg', state.size);
        ctx.setTray('updater', { title: '↑', menu: [{ label: `Update ${latest} available`, click: () => module.exports._install(ctx) }] });
        if (ctx.mod('updater').popup && (manual || Date.now() > snoozedUntil)) module.exports._show(ctx);
        if (ctx.mod('updater').auto) module.exports._download(ctx); else if (manual) ctx.fireGlow('hud', { hud: { text: `Surge ${latest} available`, color: '#7DF9FF' } });
      } else { state.status = 'uptodate'; state.latest = latest; ctx.setTray('updater', { title: '' }); if (manual) ctx.fireGlow('hud', { hud: { text: `Surge ${cur} is up to date`, color: '#00FF85' } }); }
    } catch (e) { state.status = 'error'; state.error = e.message; log('check failed:', e.message); lastTag = null; if (manual) ctx.fireGlow('hud', { hud: { text: 'Update check failed', color: '#FFB300' } }); }
    ctx.broadcast('updater:state', state); if (popup && !popup.isDestroyed()) popup.webContents.send('updater:state', { ...state, current: ctx.app.getVersion() }); return state;
  },
  async _download(ctx) {
    if (!state.url || state.status === 'downloading' || state.status === 'unpacking') return;
    if (state.staged) { const sv = stagedVersion(state.staged); if (sv && 'v' + sv === state.latest.replace(/^v?/, 'v')) { state.status = 'ready'; return; } clearStaged(ctx); }
    const dir = path.join(ctx.app.getPath('userData'), 'update'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, state.isZip ? ZIP : ASSET), mnt = path.join(dir, 'mnt');
    const push = () => { ctx.broadcast('updater:state', state); if (popup && !popup.isDestroyed()) popup.webContents.send('updater:state', { ...state, current: ctx.app.getVersion() }); };
    let prog = null;
    try {
      state.status = 'downloading'; state.progress = 0; push();
      prog = setInterval(() => { try { const s = fs.statSync(file).size; if (state.size) state.progress = Math.min(99, Math.round(s / state.size * 100)); push(); } catch {} }, 250);
      await sh('curl', ['-L', '--fail', '--silent', '--show-error', '-o', file, state.url]);
      clearInterval(prog); prog = null; state.progress = 100; state.status = 'unpacking'; push();
      if (state.isZip) {
        await sh('ditto', ['-x', '-k', file, dir]);                       // fast native unzip, one copy
        const app = fs.readdirSync(dir).find(f => f.endsWith('.app')); if (!app) throw new Error('No .app in zip');
        if (app !== 'Surge.app') fs.renameSync(path.join(dir, app), path.join(dir, 'Surge.app'));
      } else {
        fs.mkdirSync(mnt, { recursive: true });
        await sh('hdiutil', ['attach', '-nobrowse', '-quiet', '-mountpoint', mnt, file]);
        const app = fs.readdirSync(mnt).find(f => f.endsWith('.app')); if (!app) throw new Error('No .app in DMG');
        await sh('ditto', [path.join(mnt, app), path.join(dir, 'Surge.app')]);
        await sh('hdiutil', ['detach', '-quiet', mnt]).catch(() => {});
      }
      fs.rmSync(file, { force: true });
      await sh('xattr', ['-cr', path.join(dir, 'Surge.app')]).catch(() => {});
      state.staged = path.join(dir, 'Surge.app'); state.status = 'ready';
      try { fs.appendFileSync(path.join(ctx.app.getPath('logs'), 'surge.log'), `[${new Date().toISOString()}] updater: staged ${state.latest}\n`); } catch {}
      ctx.setTray('updater', { title: '↑', menu: [{ label: `Restart to update to ${state.latest}`, click: () => module.exports._install(ctx) }] });
      if (ctx.mod('updater').popup && Date.now() > snoozedUntil) module.exports._show(ctx);
      ctx.notify('Surge update ready', `${state.latest} is downloaded. Click Restart on the card.`);
    } catch (e) { clearInterval(prog); state.status = 'error'; state.error = e.message; try { fs.appendFileSync(path.join(ctx.app.getPath('logs'), 'surge.log'), `[${new Date().toISOString()}] updater: download failed: ${e.message}\n`); } catch {} try { await sh('hdiutil', ['detach', '-quiet', mnt]); } catch {} }
    push();
  },
  async _install(ctx) {
    if (!state.staged) { if (state.status === 'available') await module.exports._download(ctx); if (!state.staged) return state; }
    { const sv = stagedVersion(state.staged); if (!sv || !newer(sv, ctx.app.getVersion())) { clearStaged(ctx); state.status = 'error'; state.error = 'staged copy is not newer — re-downloading'; module.exports._check(ctx, true); return state; } }
    const target = bundlePath(ctx); if (!target) { state.status = 'error'; state.error = 'Not running from an .app bundle'; return state; }
    const script = path.join(ctx.app.getPath('userData'), 'update', 'swap.sh');
    const logf = path.join(ctx.app.getPath('logs'), 'update.log');
    fs.writeFileSync(script, `#!/bin/bash
exec >> "${logf}" 2>&1
echo "=== $(date) swap start"
NEW="${state.staged}"; APP="${target}"
for i in $(seq 1 50); do pgrep -x Surge >/dev/null || break; sleep 0.1; done
pkill -x Surge 2>/dev/null; sleep 0.3
rm -rf "$APP.old"; mv "$APP" "$APP.old" || { echo "mv failed"; exit 1; }
if mv "$NEW" "$APP" 2>/dev/null || ditto "$NEW" "$APP"; then xattr -cr "$APP" 2>/dev/null; echo "swapped"; else echo "swap failed, rolling back"; rm -rf "$APP"; mv "$APP.old" "$APP"; fi
open -a "$APP" || ("$APP/Contents/MacOS/Surge" >/dev/null 2>&1 & disown); sleep 6
if pgrep -f "$APP/Contents/MacOS/Surge" >/dev/null; then echo "launched OK"; rm -rf "$APP.old" "$NEW"; else echo "launch failed, restoring old"; rm -rf "$APP"; mv "$APP.old" "$APP" 2>/dev/null; "$APP/Contents/MacOS/Surge" >/dev/null 2>&1 & disown; fi
echo "=== done"
`); fs.chmodSync(script, 0o755);
    state.status = 'installing'; ctx.broadcast('updater:state', state);
    const child = spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }); child.unref();
    try { require('fs').appendFileSync(path.join(ctx.app.getPath('logs'), 'surge.log'), `[${new Date().toISOString()}] updater: installing ${state.latest} via ${script}\n`); } catch {}
    setTimeout(() => ctx.app.exit(0), 150);
    return state;
  },
  start(ctx) {
    // a staged update from last session? finish it now, at launch, when nothing is lost
    const staged = path.join(ctx.app.getPath('userData'), 'update', 'Surge.app');
    if (fs.existsSync(staged)) { const sv = stagedVersion(staged); if (sv && newer(sv, ctx.app.getVersion())) { state.staged = staged; state.status = 'ready'; state.latest = 'v' + sv; } else clearStaged(ctx); }
    setTimeout(() => module.exports._check(ctx, false), process.env.SURGE_FAST_CHECK ? 1500 : 8000);
    const { powerMonitor } = require('electron'); powerMonitor.on('resume', () => setTimeout(() => module.exports._check(ctx, false), 10000));
    timer = setInterval(() => module.exports._poll(ctx), Math.max(1, ctx.mod('updater').pollSeconds || 1) * 1000);
  },
  onSettings(ctx) { clearInterval(timer); timer = setInterval(() => module.exports._poll(ctx), Math.max(1, ctx.mod('updater').pollSeconds || 1) * 1000); },
  stop(ctx) { clearInterval(timer); ctx.setTray('updater', { title: '' }); if (popup && !popup.isDestroyed()) popup.destroy(); popup = null; },
};
