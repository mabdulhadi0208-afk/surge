// Island — a live pill at the top-centre of the screen. Hugs the notch on notched Macs, floats on other Macs and on Windows.
// Collapsed: battery + live status (focus timer / caffeine / clock). Hover: expands to quick controls. Alerts (Caps Lock, charging, focus…) pop out of it.
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const IS_MAC = process.platform === 'darwin';
let win = null, poll = null, ready = false, prevCpu = null, media = null, mediaBusy = false, n = 0;
const { execFile } = require('child_process');
function osa(script) { return new Promise(res => execFile('osascript', ['-e', script], { timeout: 2500 }, (e, out) => res(e ? null : out.trim()))); }
function cpu(os) { const c = os.cpus(); let idle = 0, total = 0; for (const k of c) { for (const t in k.times) total += k.times[t]; idle += k.times.idle; } const r = prevCpu ? 1 - (idle - prevCpu.idle) / Math.max(1, total - prevCpu.total) : 0; prevCpu = { idle, total }; return Math.max(0, Math.min(1, r)); }
const W = 660, H = 400;
let pill = null, hitT = null, inside = false, vol = null;
const DEFAULT_TEXT = { plug: 'Charging', preview: 'Charging', unplug: 'On battery', low: 'Low battery', full: 'Fully charged' };
const DEFAULT_COLOR = { plug: '#00FF85', preview: '#00FF85', unplug: '#FFB300', low: '#FF5C5C', full: '#FFD60A', info: '#7DF9FF', warn: '#FFB300' };
module.exports = {
  id: 'island', name: 'Island', icon: 'island', group: 'Screen', defaultEnabled: true,
  desc: 'A live pill at the top of your screen: battery and timers at a glance, quick controls on hover, and alerts that pop out of it.',
  defaults: { events: true, expand: true, clock: true, style: 'black', accent: '#00FF85', size: 1, offset: 6, left: 'battery', right: 'auto', trigger: 'hover', hold: 2.8, media: true, glowRing: true, shelf: [] },
  schema: [
    { k: 'style', t: 'chips', label: 'Look', opts: [['black', 'Black', '#111111'], ['glass', 'Glass', '#8E8E9C'], ['tint', 'Tinted', '#00FF85'], ['light', 'Light', '#FFFFFF']] },
    { k: 'accent', t: 'color', label: 'Accent', opts: ['#00FF85', '#00D4FF', '#7A5CFF', '#FF3DF0', '#FFD60A', '#FF9500', '#FF1744', '#FFFFFF'] },
    { k: 'size', t: 'range', label: 'Size', min: .8, max: 1.5, step: .05, fmt: 'x' },
    { k: 'offset', t: 'range', label: 'Distance from the top', min: 0, max: 60, step: 1, fmt: 'px' },
    { k: 'left', t: 'seg', label: 'Left side shows', opts: [['auto','Live'],['battery','Battery'],['clock','Clock'],['date','Date'],['cpu','CPU'],['none','Nothing']] },
    { k: 'right', t: 'seg', label: 'Right side shows', opts: [['auto','Live'],['battery','Battery'],['clock','Clock'],['date','Date'],['cpu','CPU'],['none','Nothing']] },
    { k: 'trigger', t: 'seg', label: 'Open with', opts: [['hover', 'Hover'], ['click', 'Click']] },
    { k: 'glowRing', t: 'toggle', label: 'Glowing edge on alerts' },
    { k: 'hold', t: 'seg', label: 'Alerts stay for', opts: [[2, '2 s'], [2.8, '3 s'], [5, '5 s'], [8, '8 s']] },
    { k: 'events', t: 'toggle', label: 'Show alerts in the Island', hint: 'Charging, Caps Lock, focus timer, network, updates' },
    { k: 'expand', t: 'toggle', label: 'Expand', hint: 'Player, volume and the file shelf. Dragging a file onto the Island always opens it.' },
    { k: 'clock', t: 'toggle', label: 'Live side falls back to the time' },
    ...(IS_MAC ? [{ k: 'media', t: 'toggle', label: 'Now playing', hint: 'Spotify / Music: track in the Island, play-pause and skip when expanded' }] : []),
    { t: 'actions', label: 'Test', opts: [['test', 'Show an alert']] },
  ],
  actions: {
    rect: (_ctx, r) => { if (r && isFinite(r.l + r.t + r.w + r.h)) pill = r; },
    settings: (ctx) => ctx.openSettings('island'),
    volume: async (_ctx, v) => { if (IS_MAC) { await osa(`set volume output volume ${Math.round(Math.max(0, Math.min(100, +v || 0)))}`); vol = Math.round(+v || 0); } return true; },
    shelfAdd: (ctx, paths) => { const cur = ctx.mod('island').shelf || []; const add = (Array.isArray(paths) ? paths : []).filter(p => typeof p === 'string' && p && !cur.includes(p)); ctx.applyPatch({ modules: { island: { shelf: [...cur, ...add].slice(-12) } } }); },
    shelfRemove: (ctx, p) => ctx.applyPatch({ modules: { island: { shelf: (ctx.mod('island').shelf || []).filter(x => x !== p) } } }),
    shelfOpen: (ctx, p) => { if ((ctx.mod('island').shelf || []).includes(p)) require('electron').shell.openPath(p); },
    test: (ctx) => module.exports._event(ctx, 'info', { hud: { text: 'Hello from the Island', color: '#7DF9FF' } }),
  },
  _layout() {
    const d = screen.getPrimaryDisplay(), b = d.bounds, wa = d.workArea; const menuH = Math.max(0, wa.y - b.y);
    const notch = IS_MAC && d.internal !== false && menuH >= 32;           // notched MacBooks have a taller menu bar (37–38 pt vs 24–25)
    return { x: Math.round(b.x + b.width / 2 - W / 2), y: notch ? b.y : wa.y, notch, menuH };
  },
  _place() { if (!win || win.isDestroyed()) return; const l = module.exports._layout(); win.setBounds({ x: l.x, y: l.y, width: W, height: H }, false); if (ready) win.webContents.send('island:layout', { notch: l.notch, menuH: l.menuH, mac: IS_MAC }); },
  _event(ctx, kind, extra = {}) {
    if (!win || win.isDestroyed() || !ready || !ctx.mod('island').events) return;
    const text = extra.hud?.text || DEFAULT_TEXT[kind]; if (!text) return;
    const b = ctx.battery; const sub = !extra.hud && b && ['plug', 'preview', 'unplug', 'low', 'full'].includes(kind) ? `${extra.level ?? b.level}%` : '';
    try { win.webContents.send('island:event', { kind, text, sub, color: extra.hud?.color || DEFAULT_COLOR[kind] || '#00FF85' }); } catch {}
  },
  _tick(ctx) {
    if (!win || win.isDestroyed() || !ready) return; const data = { battery: ctx.battery, muted: !!ctx.settings.muted, s: ctx.mod('island') };
    try { data.focus = ctx.mod('focus').enabled ? require('./10-focus.js').actions.state() : null; } catch {}
    try { data.caffeine = ctx.mod('caffeine').enabled ? require('./08-caffeine.js').actions.state() : null; } catch {}
    if (n++ % 2 === 0) data.cpu = module.exports._cpu = cpu(ctx.os); else data.cpu = module.exports._cpu || 0;
    if (IS_MAC && data.s.media && !mediaBusy && n % 2 === 0) { mediaBusy = true; (async () => { let m = null; for (const app of ['Spotify', 'Music']) { if (await osa(`application "${app}" is running`) === 'true') { const info = await osa(`tell application "${app}" to if player state is playing then return (name of current track) & "|" & (artist of current track) & "|playing" else return (name of current track) & "|" & (artist of current track) & "|paused"`); if (info) { const [name, artist, st] = info.split('|'); m = { app, name, artist, playing: st === 'playing' }; break; } } } media = m; mediaBusy = false; })(); }
    data.media = data.s.media ? media : null;
    if (IS_MAC && n % 2 === 1) osa('output volume of (get volume settings)').then(v => { if (v != null && v !== '') vol = +v; }); data.volume = vol;
    try { win.webContents.send('island:data', data); } catch {}
  },
  start(ctx) {
    ready = false; const l = module.exports._layout();
    win = new BrowserWindow({ x: l.x, y: l.y, width: W, height: H, show: false, frame: false, transparent: true, hasShadow: false, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, focusable: false, fullscreenable: false, roundedCorners: false, enableLargerThanScreen: true, backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, backgroundThrottling: false } });
    win.setAlwaysOnTop(true, 'screen-saver'); win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.loadFile(path.join(__dirname, '..', 'island.html'));
    win.webContents.on('did-finish-load', () => { ready = true; module.exports._place(); win.showInactive(); module.exports._tick(ctx); });
    win.on('closed', () => { win = null; ready = false; });
    poll = setInterval(() => module.exports._tick(ctx), 1000);
    // only the pill itself takes clicks/drops; polled from here (not from mouse events) so it also works while a file is being dragged
    hitT = setInterval(() => { if (!win || win.isDestroyed() || !pill) return; const c = screen.getCursorScreenPoint(), [wx, wy] = win.getPosition();
      const now = c.x >= wx + pill.l - 2 && c.x <= wx + pill.l + pill.w + 2 && c.y >= wy + pill.t - 2 && c.y <= wy + pill.t + pill.h + 2;
      if (now !== inside) { inside = now; try { win.setIgnoreMouseEvents(!now, { forward: true }); } catch {} } }, 45);
    if (!module.exports._hooked) { module.exports._hooked = true; const re = () => setTimeout(() => module.exports._place(), 700); screen.on('display-metrics-changed', re); screen.on('display-added', re); screen.on('display-removed', re); }
  },
  onSettings(ctx) { module.exports._tick(ctx); },
  stop() { clearInterval(poll); poll = null; clearInterval(hitT); hitT = null; inside = false; pill = null; if (win && !win.isDestroyed()) win.destroy(); win = null; ready = false; },
};
