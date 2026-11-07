// Surge Dock — a floating glass widget bar: clock, battery, stats, now playing, volume, focus, caffeine, quick glow, notes.
const { BrowserWindow, screen } = require('electron');
const path = require('path'); const { execFile } = require('child_process');
let win = null, poll = null, prevCpu = null, hidden = false, macDockHidden = false;
const WIDGETS = ['apps', 'clock', 'battery', 'stats', 'media', 'volume', 'focus', 'caffeine', 'glow', 'notes', 'spotlight'];
const DEFAULT_PINS = ['/System/Library/CoreServices/Finder.app', '/Applications/Safari.app', '/System/Applications/Messages.app', '/System/Applications/Mail.app', '/System/Applications/Music.app', '/System/Applications/Notes.app', '/System/Applications/System Settings.app'];
function osa(script) { return new Promise(res => execFile('osascript', ['-e', script], { timeout: 2500 }, (e, out) => res(e ? null : out.trim()))); }
function cpu(os) { const c = os.cpus(); let idle = 0, total = 0; for (const k of c) { for (const t in k.times) total += k.times[t]; idle += k.times.idle; } const r = prevCpu ? 1 - (idle - prevCpu.idle) / Math.max(1, total - prevCpu.total) : 0; prevCpu = { idle, total }; return Math.max(0, Math.min(1, r)); }

module.exports = {
  id: 'dock', name: 'Surge Dock', icon: 'dock', group: 'Screen',
  desc: 'A full Dock replacement: your apps (pinned + running, macOS-style magnification) plus widgets — clock, battery, CPU, now playing, volume, focus, caffeine. Can hide the macOS Dock for good.',
  defaults: { edge: 'bottom', offset: 10, size: 1, autohide: false, hideMacDock: true, magnify: true, pinned: DEFAULT_PINS, widgets: ['apps', 'clock', 'battery', 'volume', 'focus', 'caffeine'] },
  schema: [
    { k: 'edge', t: 'seg', label: 'Edge', opts: [['bottom', 'Bottom'], ['top', 'Top']] },
    { k: 'offset', t: 'range', label: 'Distance from edge', min: 0, max: 120, step: 2, fmt: 'px' },
    { k: 'size', t: 'range', label: 'Size', min: .8, max: 1.4, step: .05, fmt: 'x' },
    { k: 'hideMacDock', t: 'toggle', label: 'Hide the macOS Dock', hint: 'Surge Dock replaces it. Restored when you turn this off or disable the module.' },
    { k: 'magnify', t: 'toggle', label: 'Magnify icons on hover' },
    { k: 'autohide', t: 'toggle', label: 'Auto-hide', hint: 'Shrinks to a thin pill until you hover it' },
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
  _place(ctx) {
    if (!win || win.isDestroyed()) return;
    const s = (ctx || module.exports._ctx).mod('dock'); const d = screen.getPrimaryDisplay(); const wa = d.workArea; const [w, h] = win.getSize();
    const x = Math.round(wa.x + wa.width / 2 - w / 2);
    const y = s.edge === 'top' ? wa.y + s.offset : wa.y + wa.height - h - s.offset;
    win.setPosition(x, y, false);
  },
  _macDock(hide) {
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
    win = new BrowserWindow({ width: 900, height: 128, show: false, frame: false, transparent: true, hasShadow: false, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, focusable: true, fullscreenable: false, backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, backgroundThrottling: false } });
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'floating');
    win.loadFile(path.join(__dirname, '..', 'dock.html'));
    win.webContents.on('did-finish-load', () => { win.webContents.send('settings:update', ctx.settings); module.exports._place(ctx); win.showInactive(); module.exports._tick(ctx); });
    win.on('closed', () => (win = null));
    poll = setInterval(() => module.exports._tick(ctx), 2000);
    try { ctx.globalShortcut.register('CommandOrControl+Shift+D', () => module.exports._toggle(ctx)); } catch {}
    screen.on('display-metrics-changed', () => module.exports._place(ctx));
    if (ctx.mod('dock').hideMacDock) module.exports._macDock(true);
  },
  onSettings(ctx) { module.exports._place(ctx); const h = !!ctx.mod('dock').hideMacDock; if (h !== macDockHidden) module.exports._macDock(h); if (win && !win.isDestroyed()) win.webContents.send('settings:update', ctx.settings); },
  stop(ctx) { clearInterval(poll); if (macDockHidden) module.exports._macDock(false); try { ctx.globalShortcut.unregister('CommandOrControl+Shift+D'); } catch {} if (win && !win.isDestroyed()) win.destroy(); win = null; },
};
