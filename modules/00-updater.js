// Auto Update — polls GitHub Releases, downloads the DMG, swaps the .app bundle, relaunches.
// Works with ad-hoc signed builds (Electron's Squirrel updater refuses those on macOS).
const { execFile, spawn } = require('child_process');
const fs = require('fs'); const path = require('path');
const REPO = 'mabdulhadi0208-afk/surge', ASSET = 'Surge-mac-arm64.dmg';
let timer = null, state = { status: 'idle', latest: null, url: null, progress: 0, error: null, staged: null };
const semver = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
const newer = (a, b) => { const A = semver(a), B = semver(b); for (let i = 0; i < 3; i++) { if ((A[i] || 0) > (B[i] || 0)) return true; if ((A[i] || 0) < (B[i] || 0)) return false; } return false; };
function get(url) { return sh('curl', ['-sL', '--fail', '-A', 'Surge-updater', '-H', 'Accept: application/vnd.github+json', url], { timeout: 20000 }).then(body => ({ status: 200, body })); }
function bundlePath(ctx) { const p = process.execPath; const i = p.indexOf('.app/Contents/MacOS/'); return i > 0 ? p.slice(0, i + 4) : null; }
function sh(cmd, args, opts = {}) { return new Promise((res, rej) => execFile(cmd, args, { timeout: 600000, ...opts }, (e, out, err) => e ? rej(new Error(err || e.message)) : res(out))); }

module.exports = {
  id: 'updater', name: 'Auto Update', icon: 'refresh', group: 'System', defaultEnabled: true,
  desc: 'Checks GitHub for new versions, downloads them in the background and installs on restart (or instantly).',
  defaults: { auto: true, every: 1 },
  schema: [
    { k: 'auto', t: 'toggle', label: 'Install automatically', hint: 'Downloads in the background and relaunches when ready' },
    { k: 'every', t: 'seg', label: 'Check every', opts: [[1,'1h'],[3,'3h'],[6,'6h'],[24,'24h']] },
    { t: 'actions', label: 'Update', opts: [['check','Check now'],['install','Install update']] },
  ],
  actions: {
    check: (ctx) => module.exports._check(ctx, true),
    install: (ctx) => module.exports._install(ctx),
    state: () => ({ ...state, current: require('electron').app.getVersion() }),
  },
  async _check(ctx, manual) {
    if (state.status === 'downloading' || state.status === 'installing') return state;
    try {
      state.status = 'checking'; state.error = null;
      const r = await get(`https://api.github.com/repos/${REPO}/releases/latest`);
      if (r.status !== 200) throw new Error('GitHub ' + r.status);
      const rel = JSON.parse(r.body); const asset = (rel.assets || []).find(a => a.name === ASSET);
      const cur = ctx.app.getVersion(), latest = rel.tag_name;
      if (asset && newer(latest, cur)) {
        state.latest = latest; state.url = asset.browser_download_url; state.status = 'available';
        ctx.setTray('updater', { title: '↑', menu: [{ label: `Update ${latest} available`, click: () => module.exports._install(ctx) }] });
        if (ctx.mod('updater').auto) module.exports._download(ctx); else if (manual) ctx.fireGlow('hud', { hud: { text: `Surge ${latest} available`, color: '#7DF9FF' } });
      } else { state.status = 'uptodate'; state.latest = latest; ctx.setTray('updater', { title: '' }); if (manual) ctx.fireGlow('hud', { hud: { text: `Surge ${cur} is up to date`, color: '#00FF85' } }); }
    } catch (e) { state.status = 'error'; state.error = e.message; if (manual) ctx.fireGlow('hud', { hud: { text: 'Update check failed', color: '#FFB300' } }); }
    ctx.broadcast('updater:state', state); return state;
  },
  async _download(ctx) {
    if (!state.url || state.status === 'downloading' || state.staged) return;
    const dir = path.join(ctx.app.getPath('userData'), 'update'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const dmg = path.join(dir, ASSET), mnt = path.join(dir, 'mnt');
    try {
      state.status = 'downloading'; ctx.broadcast('updater:state', state);
      await sh('curl', ['-L', '--fail', '--silent', '--show-error', '-o', dmg, state.url]);
      fs.mkdirSync(mnt, { recursive: true });
      await sh('hdiutil', ['attach', '-nobrowse', '-quiet', '-mountpoint', mnt, dmg]);
      const app = fs.readdirSync(mnt).find(f => f.endsWith('.app')); if (!app) throw new Error('No .app in DMG');
      await sh('cp', ['-R', path.join(mnt, app), path.join(dir, 'Surge.app')]);
      await sh('hdiutil', ['detach', '-quiet', mnt]).catch(() => {}); fs.rmSync(dmg, { force: true });
      await sh('xattr', ['-cr', path.join(dir, 'Surge.app')]).catch(() => {});
      state.staged = path.join(dir, 'Surge.app'); state.status = 'ready';
      ctx.setTray('updater', { title: '↑', menu: [{ label: `Restart to update to ${state.latest}`, click: () => module.exports._install(ctx) }] });
      ctx.fireGlow('hud', { hud: { text: `Surge ${state.latest} ready — restart to update`, color: '#00FF85' } });
      ctx.notify('Surge update ready', `${state.latest} is downloaded. Open the menu-bar panel to restart.`);
    } catch (e) { state.status = 'error'; state.error = e.message; try { await sh('hdiutil', ['detach', '-quiet', mnt]); } catch {} }
    ctx.broadcast('updater:state', state);
  },
  async _install(ctx) {
    if (!state.staged) { if (state.status === 'available') await module.exports._download(ctx); if (!state.staged) return state; }
    const target = bundlePath(ctx); if (!target) { state.status = 'error'; state.error = 'Not running from an .app bundle'; return state; }
    const script = path.join(ctx.app.getPath('userData'), 'update', 'swap.sh');
    fs.writeFileSync(script, `#!/bin/bash
NEW="${state.staged}"; APP="${target}"
for i in $(seq 1 100); do pgrep -x Surge >/dev/null || break; sleep 0.2; done
rm -rf "$APP.old"; mv "$APP" "$APP.old" 2>/dev/null
if cp -R "$NEW" "$APP"; then rm -rf "$APP.old" "$NEW"; xattr -cr "$APP" 2>/dev/null; else mv "$APP.old" "$APP"; fi
open "$APP"
`); fs.chmodSync(script, 0o755);
    state.status = 'installing'; ctx.broadcast('updater:state', state);
    const child = spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }); child.unref();
    setTimeout(() => ctx.app.quit(), 300);
    return state;
  },
  start(ctx) {
    // a staged update from last session? finish it now, at launch, when nothing is lost
    const staged = path.join(ctx.app.getPath('userData'), 'update', 'Surge.app');
    if (fs.existsSync(staged)) { try { const pl = fs.readFileSync(path.join(staged, 'Contents', 'Info.plist'), 'utf8'); const v = /CFBundleShortVersionString<\/key>\s*<string>([^<]+)/.exec(pl)?.[1]; if (!v || !newer(v, ctx.app.getVersion())) fs.rmSync(path.dirname(staged), { recursive: true, force: true }); } catch {} }
    if (fs.existsSync(staged)) { state.staged = staged; state.status = 'ready'; state.latest = 'staged'; if (ctx.mod('updater').auto) return module.exports._install(ctx); }
    setTimeout(() => module.exports._check(ctx, false), process.env.SURGE_FAST_CHECK ? 1500 : 8000);
    const { powerMonitor } = require('electron'); powerMonitor.on('resume', () => setTimeout(() => module.exports._check(ctx, false), 10000));
    timer = setInterval(() => module.exports._check(ctx, false), Math.max(1, ctx.mod('updater').every) * 3600000);
  },
  onSettings(ctx) { clearInterval(timer); timer = setInterval(() => module.exports._check(ctx, false), Math.max(1, ctx.mod('updater').every) * 3600000); },
  stop(ctx) { clearInterval(timer); ctx.setTray('updater', { title: '' }); },
};
