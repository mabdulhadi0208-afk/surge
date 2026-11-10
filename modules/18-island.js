// Island — a live pill at the top-centre of the screen. Hugs the notch on notched Macs, floats on other Macs and on Windows.
// Collapsed: battery + live status (focus timer / caffeine / clock). Hover: expands to quick controls. Alerts (Caps Lock, charging, focus…) pop out of it.
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const IS_MAC = process.platform === 'darwin';
let win = null, poll = null, ready = false;
const W = 460, H = 190;
const DEFAULT_TEXT = { plug: 'Charging', preview: 'Charging', unplug: 'On battery', low: 'Low battery', full: 'Fully charged' };
const DEFAULT_COLOR = { plug: '#00FF85', preview: '#00FF85', unplug: '#FFB300', low: '#FF5C5C', full: '#FFD60A', info: '#7DF9FF', warn: '#FFB300' };
module.exports = {
  id: 'island', name: 'Island', icon: 'island', group: 'Screen', defaultEnabled: true,
  desc: 'A live pill at the top of your screen: battery and timers at a glance, quick controls on hover, and alerts that pop out of it.',
  defaults: { events: true, expand: true, clock: true },
  schema: [
    { k: 'events', t: 'toggle', label: 'Show alerts in the Island', hint: 'Charging, Caps Lock, focus timer, network, updates' },
    { k: 'expand', t: 'toggle', label: 'Expand on hover', hint: 'Quick controls: glow, mute, caffeine, focus, notes, settings' },
    { k: 'clock', t: 'toggle', label: 'Show the time when nothing is live' },
    { t: 'actions', label: 'Test', opts: [['test', 'Show an alert']] },
  ],
  actions: {
    hover: (_ctx, over) => { if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!over, { forward: true }); },
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
    if (!module.exports._hooked) { module.exports._hooked = true; const re = () => setTimeout(() => module.exports._place(), 700); screen.on('display-metrics-changed', re); screen.on('display-added', re); screen.on('display-removed', re); }
  },
  onSettings(ctx) { module.exports._tick(ctx); },
  stop() { clearInterval(poll); poll = null; if (win && !win.isDestroyed()) win.destroy(); win = null; ready = false; },
};
