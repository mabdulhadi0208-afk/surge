// Surge Dock — a floating glass widget bar: clock, battery, stats, now playing, volume, focus, caffeine, quick glow, notes.
const { BrowserWindow, screen, dialog } = require('electron');
const path = require('path'); const { execFile } = require('child_process');
let win = null, poll = null, prevCpu = null, macDockHidden = false, edgePoll = null, revealed = true, animT = null, hideT = null, H = 150;
const WIDGETS = ['apps', 'clock', 'battery', 'stats', 'media', 'volume', 'focus', 'caffeine', 'glow', 'notes', 'spotlight'];
const DEFAULT_PINS = ['/System/Library/CoreServices/Finder.app', '/Applications/Safari.app', '/System/Applications/Messages.app', '/System/Applications/Mail.app', '/System/Applications/Music.app', '/System/Applications/Notes.app', '/System/Applications/System Settings.app'];
function osa(script) { return new Promise(res => execFile('osascript', ['-e', script], { timeout: 2500 }, (e, out) => res(e ? null : out.trim()))); }
function cpu(os) { const c = os.cpus(); let idle = 0, total = 0; for (const k of c) { for (const t in k.times) total += k.times[t]; idle += k.times.idle; } const r = prevCpu ? 1 - (idle - prevCpu.idle) / Math.max(1, total - prevCpu.total) : 0; prevCpu = { idle, total }; return Math.max(0, Math.min(1, r)); }

module.exports = {
  id: 'dock', name: 'Surge Dock', icon: 'dock', group: 'Screen',
  desc: 'A full Dock replacement: your apps (pinned + running, macOS-style magnification) plus widgets — clock, battery, CPU, now playing, volume, focus, caffeine. Can hide the macOS Dock for good.',
  defaults: { edge: 'bottom', offset: 10, size: 1, autohide: false, hideMacDock: false, magnify: true, pinned: DEFAULT_PINS, widgets: ['apps', 'clock', 'battery', 'volume', 'focus', 'caffeine'] },
  schema: [
    { k: 'edge', t: 'seg', label: 'Edge', opts: [['bottom', 'Bottom'], ['top', 'Top']] },
    { k: 'offset', t: 'range', label: 'Distance from edge', min: 0, max: 120, step: 2, fmt: 'px' },
    { k: 'size', t: 'range', label: 'Size', min: .8, max: 1.4, step: .05, fmt: 'x' },
    { k: 'hideMacDock', t: 'toggle', label: 'Replace the macOS Dock', hint: 'Asks for confirmation. Apple\'s Dock comes back the moment you turn this off, disable the module, or quit Surge.' },
    { k: 'magnify', t: 'toggle', label: 'Magnify icons on hover' },
    { k: 'autohide', t: 'toggle', label: 'Auto-hide', hint: 'Slides away; move the cursor to the screen edge to bring it back' },
    { k: 'pinned', t: 'apps', label: 'Pinned apps' },
    { k: 'widgets', t: 'widgets', label: 'Widgets', opts: WIDGETS },
  ],
  actions: {
    state: () => ({ shown: !!win && !win.isDestroyed() && win.isVisible() }),
    toggle: (ctx) => module.exports._toggle(ctx),
    media: async (_ctx, cmd) => { for (const app of ['Spotify', 'Music']) { const running = await osa(`application "${app}" is running`); if (running === 'true') { await osa(`tell application "${app}" to ${cmd === 'next' ? 'next track' : cmd === 'prev' ? 'previous track' : 'playpause'}`); return true; } } return false; },
    volume: async (_ctx, v) => { await osa(`set volume output volume ${Math.round(v)}`); return true; },
    pin: (ctx, p) => { const s = ctx.mod('dock'); const pins = s.pinned.includes(p) ? s.pinned.filter(x => x !== p) : [...s.pinned, p]; ctx.applyPatch({ modules: { dock: { pinned: pins } } }); return pins; },
    resize: (_ctx, w) => { if (win && !win.isDestroyed()) { const [, h] = win.getSize(); win.setSize(Math.round(w), h, false); module.exports._place(); } },
  },
  _geom(ctx) {
    const s = (ctx || module.exports._ctx).mod('dock'); const d = screen.getPrimaryDisplay(); const b = d.bounds; const wa = d.workArea; const [w, h] = win.getSize();
    const x = Math.round(wa.x + wa.width / 2 - w / 2);
    const shown = s.edge === 'top' ? wa.y + s.offset : wa.y + wa.height - h - s.offset;
    const hidden = s.edge === 'top' ? b.y - h - 2 : b.y + b.height + 2;      // fully off-screen → no clipped corners
    return { x, shown, hidden, h, s, b };
  },
  _place(ctx) {
    if (!win || win.isDestroyed()) return;
    const g = module.exports._geom(ctx);
    if (!g.s.autohide) revealed = true;
    win.setPosition(g.x, revealed ? g.shown : g.hidden, false);
  },
  _slide(ctx, show) {
    if (!win || win.isDestroyed() || revealed === show) return; revealed = show;
    const g = module.exports._geom(ctx); const from = win.getPosition()[1], to = show ? g.shown : g.hidden; const t0 = Date.now(), dur = 220;
    clearInterval(animT);
    animT = setInterval(() => { const p = Math.min(1, (Date.now() - t0) / dur); const e = show ? 1 - Math.pow(1 - p, 3) : p * p; win.setPosition(g.x, Math.round(from + (to - from) * e), false); if (p >= 1) clearInterval(animT); }, 16);
  },
  _edgeTick(ctx) {
    if (!win || win.isDestroyed()) return; const s = ctx.mod('dock'); if (!s.autohide) return;
    const p = screen.getCursorScreenPoint(); const g = module.exports._geom(ctx); const [w, h] = win.getSize(); const [wx, wy] = win.getPosition();
    const atEdge = s.edge === 'top' ? p.y <= g.b.y + 1 : p.y >= g.b.y + g.b.height - 2;
    const overDock = revealed && p.x >= wx && p.x <= wx + w && p.y >= wy && p.y <= wy + h;
    if (atEdge || overDock) { clearTimeout(hideT); hideT = null; module.exports._slide(ctx, true); }
    else if (revealed && !hideT) hideT = setTimeout(() => { hideT = null; module.exports._slide(ctx, false); }, 500);
  },
  async _confirmMacDock(ctx) {
    const r = await dialog.showMessageBox({ type: 'question', buttons: ['Replace it', 'Keep the macOS Dock'], defaultId: 0, cancelId: 1, message: 'Replace the macOS Dock with Surge Dock?',
      detail: 'Apple\'s Dock will be hidden while this is on. It comes back instantly if you turn this off, disable Surge Dock, or quit Surge.' });
    if (r.response !== 0) { ctx.applyPatch({ modules: { dock: { hideMacDock: false } } }); return false; }
    return true;
  },
  _macDock(hide) {
    try { const cur = require('child_process').execFileSync('defaults', ['read', 'com.apple.dock', 'autohide-delay']).toString().trim(); if ((hide && cur === '1000') || (!hide && cur !== '1000')) { macDockHidden = hide; return; } } catch { if (!hide) { macDockHidden = false; return; } }
    const cmds = hide
      ? [['defaults', ['write', 'com.apple.dock', 'autohide', '-bool', 'true']], ['defaults', ['write', 'com.apple.dock', 'autohide-delay', '-float', '1000']], ['defaults', ['write', 'com.apple.dock', 'autohide-time-modifier', '-float', '0']]]
      : [['defaults', ['write', 'com.apple.dock', 'autohide', '-bool', 'false']], ['defaults', ['delete', 'com.apple.dock', 'autohide-delay']], ['defaults', ['delete', 'com.apple.dock', 'autohide-time-modifier']]];
    const run = (i) => { if (i >= cmds.length) return execFile('killall', ['Dock'], () => {}); execFile(cmds[i][0], cmds[i][1], () => run(i + 1)); }; run(0);
    macDockHidden = hide;
  },
  _toggle(ctx) { if (!win || win.isDestroyed()) return; win.isVisible() ? win.hide() : win.showInactive(); },
  async _tick(ctx) {
    if (!win || win.isDestroyed()) return;
    const s = ctx.mod('dock'); const data = { t: Date.now() };
    if (s.widgets.includes('battery')) data.battery = ctx.battery;
    if (s.widgets.includes('stats')) data.stats = { cpu: cpu(ctx.os), mem: 1 - ctx.os.freemem() / ctx.os.totalmem() };
    if (s.widgets.includes('media')) { let m = null; for (const app of ['Spotify', 'Music']) { const r = await osa(`application "${app}" is running`); if (r === 'true') { const info = await osa(`tell application "${app}" to if player state is playing then return (name of current track) & "|" & (artist of current track) & "|playing" else return (name of current track) & "|" & (artist of current track) & "|paused"`); if (info) { const [name, artist, st] = info.split('|'); m = { app, name, artist, playing: st === 'playing' }; break; } } } data.media = m; }
    if (s.widgets.includes('volume')) { const v = await osa('output volume of (get volume settings)'); data.volume = v == null ? null : +v; }
    if (s.widgets.includes('focus')) { try { data.focus = require('./10-focus.js').actions.state(); data.focusOn = !!ctx.mod('focus').enabled; } catch {} }
    if (s.widgets.includes('caffeine')) { try { data.caffeine = require('./08-caffeine.js').actions.state(); } catch {} }
    try { if (win && !win.isDestroyed()) win.webContents.send('dock:data', data); } catch {}
  },
  start(ctx) {
    module.exports._ctx = ctx;
    win = new BrowserWindow({ width: 900, height: 150, show: false, frame: false, transparent: true, hasShadow: false, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, focusable: true, fullscreenable: false, backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, backgroundThrottling: false } });
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'floating');
    win.loadFile(path.join(__dirname, '..', 'dock.html'));
    win.webContents.on('did-finish-load', () => { win.webContents.send('settings:update', ctx.settings); module.exports._place(ctx); win.showInactive(); module.exports._tick(ctx); });
    win.on('closed', () => (win = null));
    poll = setInterval(() => module.exports._tick(ctx), 2000);
    try { ctx.globalShortcut.register('CommandOrControl+Shift+D', () => module.exports._toggle(ctx)); } catch {}
    if (!module.exports._dispHooked) { module.exports._dispHooked = true; screen.on('display-metrics-changed', () => module.exports._place(ctx)); }
    if (ctx.mod('dock').hideMacDock && !macDockHidden) module.exports._confirmMacDock(ctx).then(ok => ok && module.exports._macDock(true));
    edgePoll = setInterval(() => module.exports._edgeTick(ctx), 60);
  },
  onSettings(ctx) { module.exports._place(ctx); const h = !!ctx.mod('dock').hideMacDock; if (h && !macDockHidden) module.exports._confirmMacDock(ctx).then(ok => ok && module.exports._macDock(true)); else if (!h && macDockHidden) module.exports._macDock(false); if (win && !win.isDestroyed()) win.webContents.send('settings:update', ctx.settings); },
  stop(ctx) { clearInterval(poll); clearInterval(edgePoll); clearInterval(animT); clearTimeout(hideT); if (macDockHidden) module.exports._macDock(false); try { ctx.globalShortcut.unregister('CommandOrControl+Shift+D'); } catch {} if (win && !win.isDestroyed()) win.destroy(); win = null; },
};
