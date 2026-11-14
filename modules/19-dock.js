// Surge Dock — a floating glass widget bar: clock, battery, stats, now playing, volume, focus, caffeine, quick glow, notes.
const { BrowserWindow, screen, dialog } = require('electron');
const path = require('path'); const { execFile } = require('child_process');
const IS_WIN = process.platform === 'win32';
let pill = null, pillHover = false;
let win = null, poll = null, prevCpu = null, macDockHidden = false, edgePoll = null, revealed = true, animT = null, hideT = null, H = 150;
const WIDGETS = IS_WIN ? ['apps', 'launchpad', 'clock', 'battery', 'stats', 'focus', 'caffeine', 'glow', 'notes', 'spotlight', 'date'] : ['apps', 'launchpad', 'clock', 'battery', 'stats', 'media', 'volume', 'focus', 'caffeine', 'glow', 'notes', 'spotlight', 'date'];
let pad = null;
const DEFAULT_PINS = IS_WIN ? ['c:\\windows\\explorer.exe', 'c:\\program files (x86)\\microsoft\\edge\\application\\msedge.exe'] : ['/System/Library/CoreServices/Finder.app', '/Applications/Safari.app', '/System/Applications/Messages.app', '/System/Applications/Mail.app', '/System/Applications/Music.app', '/System/Applications/Notes.app', '/System/Applications/System Settings.app'];
function osa(script) { return new Promise(res => execFile('osascript', ['-e', script], { timeout: 2500 }, (e, out) => res(e ? null : out.trim()))); }
function cpu(os) { const c = os.cpus(); let idle = 0, total = 0; for (const k of c) { for (const t in k.times) total += k.times[t]; idle += k.times.idle; } const r = prevCpu ? 1 - (idle - prevCpu.idle) / Math.max(1, total - prevCpu.total) : 0; prevCpu = { idle, total }; return Math.max(0, Math.min(1, r)); }

module.exports = {
  id: 'dock', name: 'Surge Dock', icon: 'dock', group: 'Screen', platforms: ['darwin', 'win32'],
  desc: IS_WIN ? 'A floating Dock for Windows: your apps (pinned + running, with magnification), Launchpad search, plus widgets — clock, battery, CPU, focus, caffeine.' : 'A full Dock replacement: your apps (pinned + running, macOS-style magnification) plus widgets — clock, battery, CPU, now playing, volume, focus, caffeine. Can hide the macOS Dock for good.',
  defaults: { edge: 'bottom', offset: 10, size: 1, autohide: false, hideMacDock: false, macDockConfirmed: false, fullscreen: false, magnify: true, look: 'islands', aura: true, reflect: true, labels: true, pinned: DEFAULT_PINS, widgets: IS_WIN ? ['apps', 'launchpad', 'clock', 'battery', 'focus', 'caffeine'] : ['apps', 'launchpad', 'clock', 'battery', 'volume', 'focus', 'caffeine'] },
  schema: [
    { k: 'edge', t: 'seg', label: 'Edge', opts: [['bottom', 'Bottom'], ['top', 'Top']] },
    { k: 'look', t: 'seg', label: 'Style', opts: [['islands', 'Islands'], ['pill', 'Pill'], ['float', 'Floating icons']] },
    { k: 'offset', t: 'range', label: 'Distance from edge', min: 0, max: 120, step: 2, fmt: 'px' },
    { k: 'size', t: 'range', label: 'Size', min: .8, max: 1.4, step: .05, fmt: 'x' },
    { k: 'hideMacDock', t: 'toggle', label: 'Replace the macOS Dock', hint: 'Asks for confirmation. Apple\'s Dock comes back the moment you turn this off, disable the module, or quit Surge.' },
    { k: 'magnify', t: 'toggle', label: 'Magnify icons on hover' },
    { k: 'aura', t: 'toggle', label: 'Colour glow under icons', hint: 'Each app lights the dock with its own colour as you hover it' },
    { k: 'reflect', t: 'toggle', label: 'Icon reflections' },
    { k: 'labels', t: 'toggle', label: 'Widget labels' },
    { k: 'autohide', t: 'toggle', label: 'Auto-hide', hint: 'Drops away the instant the cursor leaves it; touch the screen edge to bring it back' },
    { k: 'fullscreen', t: 'toggle', label: 'Show over fullscreen apps', hint: 'Off: the dock stays out of fullscreen videos, games and apps' },
    { k: 'pinned', t: 'apps', label: 'Pinned apps' },
    { k: 'widgets', t: 'widgets', label: 'Widgets', opts: WIDGETS },
  ].filter(f => !(IS_WIN && f.k === 'hideMacDock')),
  actions: {
    state: () => ({ shown: !!win && !win.isDestroyed() && win.isVisible() }),
    toggle: (ctx) => module.exports._toggle(ctx),
    launchpad: (ctx) => module.exports._launchpad(ctx),
    media: async (_ctx, cmd) => { for (const app of ['Spotify', 'Music']) { const running = await osa(`application "${app}" is running`); if (running === 'true') { await osa(`tell application "${app}" to ${cmd === 'next' ? 'next track' : cmd === 'prev' ? 'previous track' : 'playpause'}`); return true; } } return false; },
    volume: async (_ctx, v) => { await osa(`set volume output volume ${Math.round(v)}`); return true; },
    pin: (ctx, p) => { const s = ctx.mod('dock'); const pins = s.pinned.includes(p) ? s.pinned.filter(x => x !== p) : [...s.pinned, p]; ctx.applyPatch({ modules: { dock: { pinned: pins } } }); return pins; },
    // the window is bigger than the pill (room for magnification/tooltip) — only the pill itself should catch clicks, the rest passes through to whatever is behind
    hover: (_ctx, over) => { pillHover = !!over; if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!over, { forward: true }); },
    rect: (_ctx, r) => { if (r && isFinite(r.l + r.t + r.w + r.h)) pill = r; },
    resize: (_ctx, w) => { if (win && !win.isDestroyed()) { const [, h] = win.getSize(); win.setSize(Math.round(w), h, false); module.exports._place(); } },
  },
  _geom(ctx) {
    const s = (ctx || module.exports._ctx).mod('dock'); const d = screen.getPrimaryDisplay(); const b = d.bounds; const wa = d.workArea; const [w, h] = win.getSize();
    const x = Math.round(wa.x + wa.width / 2 - w / 2);
    const shown = s.edge === 'top' ? wa.y + s.offset : wa.y + wa.height - h - s.offset;
    const hidden = s.edge === 'top' ? b.y - h - 2 : b.y + b.height + 2;      // fully off-screen → no clipped corners
    const edgeY = s.edge === 'top' ? b.y + 1 : (IS_WIN ? wa.y + wa.height : b.y + b.height) - 2;   // Windows: the taskbar owns the real screen edge, so the trigger is the top of it
    return { x, shown, hidden, h, s, b, edgeY };
  },
  _place(ctx) {
    if (!win || win.isDestroyed()) return;
    const g = module.exports._geom(ctx);
    if (!g.s.autohide) revealed = true;
    win.setPosition(g.x, revealed ? g.shown : g.hidden, false);
  },
  _slide(ctx, show) {
    if (!win || win.isDestroyed() || revealed === show) return; revealed = show;
    const g = module.exports._geom(ctx); const from = win.getPosition()[1], to = show ? g.shown : g.hidden; const t0 = Date.now(), dur = show ? 220 : 130; if (!show) { pillHover = false; try { win.setIgnoreMouseEvents(true, { forward: true }); win.webContents.send('dock:hidden'); } catch {} }
    clearInterval(animT);
    animT = setInterval(() => { const p = Math.min(1, (Date.now() - t0) / dur); const e = show ? 1 - Math.pow(1 - p, 3) : p * p; win.setPosition(g.x, Math.round(from + (to - from) * e), false); if (p >= 1) clearInterval(animT); }, 16);
  },
  _edgeTick(ctx) {
    if (!win || win.isDestroyed()) return; const s = ctx.mod('dock'); if (!s.autohide) return;
    const p = screen.getCursorScreenPoint(); const g = module.exports._geom(ctx); const [w, h] = win.getSize(); const [wx, wy] = win.getPosition();
    const top = s.edge === 'top'; const atEdge = top ? p.y <= g.edgeY : p.y >= g.edgeY;
    const inWin = p.x >= wx && p.x <= wx + w && p.y >= wy && p.y <= wy + h;
    // "on the dock" = on the pill itself, or in the strip between the pill and the screen edge (so travelling edge → pill doesn't drop it),
    // or on something that pokes out of the pill (magnified icon, right-click menu, a drag) which the page reports via hover
    let onDock = false;
    if (revealed) { const r = pill || { l: 0, t: top ? 0 : h - 110, w, h: 110 }; const L = wx + r.l - 24, R = wx + r.l + r.w + 24;
      onDock = (p.x >= L && p.x <= R && (top ? p.y <= wy + r.t + r.h : p.y >= wy + r.t)) || (pillHover && inWin); }
    if (atEdge || onDock) module.exports._slide(ctx, true);
    else if (revealed) module.exports._slide(ctx, false);        // no delay: the instant the cursor is off the dock, it goes
  },
  async _confirmMacDock(ctx) {
    if (ctx.mod('dock').macDockConfirmed) return true;
    const r = await dialog.showMessageBox({ type: 'question', buttons: ['Replace it', 'Keep the macOS Dock'], defaultId: 0, cancelId: 1, message: 'Replace the macOS Dock with Surge Dock?',
      detail: 'Surge will take over the Dock. macOS will ask you to allow Surge to control "System Events" — that permission is what lets Surge switch the Dock off and on cleanly.\n\nApple\'s Dock comes back instantly if you turn this off, disable Surge Dock, or quit Surge.' });
    if (r.response !== 0) { ctx.applyPatch({ modules: { dock: { hideMacDock: false } } }); return false; }
    // this call triggers the Automation (System Events) permission prompt the first time
    const ok = await new Promise(res => execFile('osascript', ['-e', 'tell application "System Events" to set autohide of dock preferences to true'], { timeout: 15000 }, (e) => res(!e)));
    if (!ok) { await dialog.showMessageBox({ type: 'warning', buttons: ['Open Automation settings', 'Cancel'], defaultId: 0, cancelId: 1, message: 'Surge needs permission to control System Events',
        detail: 'System Settings → Privacy & Security → Automation → Surge → turn on System Events. Then flip "Replace the macOS Dock" on again.' }).then(x => x.response === 0 && require('electron').shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'));
      ctx.applyPatch({ modules: { dock: { hideMacDock: false } } }); return false; }
    ctx.applyPatch({ modules: { dock: { macDockConfirmed: true } } });
    return true;
  },
  _macDock(hide, ctx) {
    const edge = ((ctx || module.exports._ctx)?.mod('dock')?.edge) || 'bottom';
    const log = (m) => { try { require('fs').appendFileSync(path.join((ctx || module.exports._ctx).app.getPath('logs'), 'surge.log'), `[${new Date().toISOString()}] dock: ${m}\n`); } catch {} };
    const cmds = hide ? [
        ['defaults', ['write', 'com.apple.dock', 'autohide', '-bool', 'true']],
        ['defaults', ['write', 'com.apple.dock', 'autohide-delay', '-float', '1000']],
        ['defaults', ['write', 'com.apple.dock', 'autohide-time-modifier', '-float', '0']],
        ['defaults', ['write', 'com.apple.dock', 'orientation', '-string', edge === 'top' ? 'bottom' : 'left']],   // park Apple's Dock on another edge
        ['defaults', ['write', 'com.apple.dock', 'tilesize', '-int', '16']],
        ['osascript', ['-e', 'tell application "System Events" to set autohide of dock preferences to true']],
      ] : [
        ['defaults', ['write', 'com.apple.dock', 'autohide', '-bool', 'false']],
        ['defaults', ['delete', 'com.apple.dock', 'autohide-delay']],
        ['defaults', ['delete', 'com.apple.dock', 'autohide-time-modifier']],
        ['defaults', ['write', 'com.apple.dock', 'orientation', '-string', 'bottom']],
        ['defaults', ['delete', 'com.apple.dock', 'tilesize']],
        ['osascript', ['-e', 'tell application "System Events" to set autohide of dock preferences to false']],
      ];
    const run = (i) => { if (i >= cmds.length) return execFile('killall', ['Dock'], () => setTimeout(() => execFile('defaults', ['read', 'com.apple.dock', 'autohide-delay'], (e, o) => log(`macOS Dock ${hide ? 'hidden' : 'restored'} (delay=${(o || '').trim() || 'default'})`)), 1500)); execFile(cmds[i][0], cmds[i][1], () => run(i + 1)); }; run(0);
    macDockHidden = hide; module.exports._dockEdge = edge;
  },
  _launchpad(ctx) {
    if (pad && !pad.isDestroyed()) { if (pad.isVisible()) { pad.hide(); return; } }
    else {
      const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()); const wa = d.workArea; const W = Math.min(880, wa.width - 80), Hh = Math.min(600, wa.height - 120);
      pad = new BrowserWindow({ width: W, height: Hh, x: Math.round(wa.x + wa.width / 2 - W / 2), y: Math.round(wa.y + wa.height / 2 - Hh / 2), show: false, frame: false, transparent: true, hasShadow: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, backgroundColor: '#00000000', vibrancy: 'hud',
        webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true } });
      pad.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); pad.setAlwaysOnTop(true, 'floating');
      pad.loadFile(path.join(__dirname, '..', 'launchpad.html'));
      pad.on('blur', () => { if (pad && !pad.isDestroyed()) pad.hide(); });
      pad.on('closed', () => (pad = null));
    }
    pad.show(); pad.focus();
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
    win = new BrowserWindow({ width: 900, height: 300, show: false, frame: false, transparent: true, hasShadow: false, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, focusable: false, fullscreenable: false, backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, backgroundThrottling: false } });
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: !!ctx.mod('dock').fullscreen }); module.exports._fs = !!ctx.mod('dock').fullscreen;
    win.setAlwaysOnTop(true, 'floating');
    win.setIgnoreMouseEvents(true, { forward: true });
    win.loadFile(path.join(__dirname, '..', 'dock.html'));
    win.webContents.on('did-finish-load', () => { win.webContents.send('settings:update', ctx.settings); module.exports._place(ctx); win.showInactive(); module.exports._tick(ctx); });
    win.on('closed', () => (win = null));
    poll = setInterval(() => module.exports._tick(ctx), 2000);
    try { ctx.globalShortcut.register('CommandOrControl+Shift+D', () => module.exports._toggle(ctx)); ctx.globalShortcut.register('CommandOrControl+Shift+L', () => module.exports._launchpad(ctx)); } catch {}
    if (!module.exports._dispHooked) { module.exports._dispHooked = true; screen.on('display-metrics-changed', () => module.exports._place(ctx)); }
    if (!IS_WIN && ctx.mod('dock').hideMacDock && !macDockHidden) module.exports._confirmMacDock(ctx).then(ok => ok && module.exports._macDock(true, ctx));
    edgePoll = setInterval(() => module.exports._edgeTick(ctx), 25);
  },
  onSettings(ctx) { if (win && !win.isDestroyed() && module.exports._fs !== !!ctx.mod('dock').fullscreen) { module.exports._fs = !!ctx.mod('dock').fullscreen; win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: module.exports._fs }); } module.exports._place(ctx); const h = !IS_WIN && !!ctx.mod('dock').hideMacDock; if (h && !macDockHidden) module.exports._confirmMacDock(ctx).then(ok => ok && module.exports._macDock(true, ctx)); else if (!h && macDockHidden) module.exports._macDock(false, ctx); else if (h && macDockHidden && module.exports._dockEdge !== (ctx.mod('dock').edge || 'bottom')) module.exports._macDock(true, ctx); if (win && !win.isDestroyed()) win.webContents.send('settings:update', ctx.settings); },
  stop(ctx) { clearInterval(poll); clearInterval(edgePoll); clearInterval(animT); clearTimeout(hideT); if (macDockHidden) module.exports._macDock(false, ctx); try { ctx.globalShortcut.unregister('CommandOrControl+Shift+D'); ctx.globalShortcut.unregister('CommandOrControl+Shift+L'); } catch {} if (pad && !pad.isDestroyed()) pad.destroy(); pad = null; if (win && !win.isDestroyed()) win.destroy(); win = null; },
};
