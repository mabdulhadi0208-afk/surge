// Window Snap — halves, quarters, full and centre for the front window, from the keyboard (and optionally by dragging to a screen edge).
// macOS only: Windows already has this built in (Win + arrows).
const { screen } = require('electron');
const { execFile } = require('child_process');
let off = [], downAt = null, warned = false;
const K = { left: 'Control+Alt+Left', right: 'Control+Alt+Right', full: 'Control+Alt+Up', center: 'Control+Alt+Down', tl: 'Control+Alt+1', tr: 'Control+Alt+2', bl: 'Control+Alt+3', br: 'Control+Alt+4' };
const NAME = { left: 'Left half', right: 'Right half', full: 'Full screen area', center: 'Centred', tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' };
function rect(where, wa, gap) {
  const g = gap, hw = Math.floor((wa.width - g * 3) / 2), hh = Math.floor((wa.height - g * 3) / 2), x0 = wa.x + g, y0 = wa.y + g, x1 = wa.x + g * 2 + hw, y1 = wa.y + g * 2 + hh, fh = wa.height - g * 2, fw = wa.width - g * 2;
  switch (where) {
    case 'left': return [x0, y0, hw, fh]; case 'right': return [x1, y0, hw, fh]; case 'full': return [x0, y0, fw, fh];
    case 'center': { const w = Math.round(wa.width * .7), h = Math.round(wa.height * .8); return [Math.round(wa.x + (wa.width - w) / 2), Math.round(wa.y + (wa.height - h) / 2), w, h]; }
    case 'tl': return [x0, y0, hw, hh]; case 'tr': return [x1, y0, hw, hh]; case 'bl': return [x0, y1, hw, hh]; case 'br': return [x1, y1, hw, hh];
  } return null;
}
module.exports = {
  id: 'snap', name: 'Window Snap', icon: 'snap', group: 'Screen', platforms: ['darwin'],
  desc: 'Snap the front window to halves, quarters, full or centre: ⌃⌥ ← → ↑ ↓ and ⌃⌥ 1-4. Optionally by dragging a window to a screen edge.',
  defaults: { gap: 8, dragEdges: false, hud: true },
  schema: [
    { k: 'gap', t: 'range', label: 'Gap around windows', min: 0, max: 24, step: 1, fmt: 'px' },
    { k: 'dragEdges', t: 'toggle', label: 'Snap by dragging to an edge', hint: 'Drag a window to the left, right or top edge of the screen and let go' },
    { k: 'hud', t: 'toggle', label: 'Show what it snapped to' },
    { t: 'actions', label: 'Try it', opts: [['left', 'Left'], ['right', 'Right'], ['full', 'Full'], ['center', 'Centre']] },
  ],
  actions: Object.fromEntries(Object.keys(K).map(k => [k, (ctx) => module.exports._snap(ctx, k)])),
  _snap(ctx, where, skipSelf) {
    const s = ctx.mod('snap'), wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, r = rect(where, wa, s.gap || 0); if (!r) return;
    // the front app's main window; position first, then size, then position again (some apps clamp the first move)
    const script = `tell application "System Events"
  set p to first application process whose frontmost is true
  tell p
    if (count of windows) is 0 then return "nowindow"
    set w to window 1
    try
      set w to (first window whose value of attribute "AXMain" is true)
    end try
    set position of w to {${r[0]}, ${r[1]}}
    set size of w to {${r[2]}, ${r[3]}}
    set position of w to {${r[0]}, ${r[1]}}
    return name of p
  end tell
end tell`;
    execFile('osascript', ['-e', script], { timeout: 4000 }, (err, out) => {
      if (err) { if (!warned) { warned = true; console.error('snap failed:', (err.message || '').slice(0, 300)); ctx.fireGlow('warn', { hud: { text: 'Window Snap needs permission to control System Events', color: '#FFD60A' } }); } return; }
      if ((out || '').trim() === 'nowindow') return;
      if (s.hud) ctx.fireGlow('hud', { hud: { text: NAME[where], color: '#00D4FF' } });
    });
    return NAME[where];
  },
  _wire(ctx) {
    off.forEach(f => f()); off = [];
    if (!ctx.mod('snap').dragEdges) return;
    off.push(ctx.onInput('mousedown', e => { downAt = e.button === 1 ? { x: e.x, y: e.y, t: Date.now() } : null; }));
    off.push(ctx.onInput('mouseup', e => { const d = downAt; downAt = null; if (!d || e.button !== 1) return; if (Math.hypot(e.x - d.x, e.y - d.y) < 120 || Date.now() - d.t < 250) return;
      const p = screen.getCursorScreenPoint(), b = screen.getDisplayNearestPoint(p).bounds; const where = p.x <= b.x + 2 ? 'left' : p.x >= b.x + b.width - 3 ? 'right' : p.y <= b.y + 2 ? 'full' : null;
      if (where) setTimeout(() => module.exports._snap(ctx, where), 60); }));
  },
  start(ctx) { module.exports._keys = !!ctx.mod('snap').dragEdges; for (const [k, acc] of Object.entries(K)) { try { ctx.globalShortcut.register(acc, () => module.exports._snap(ctx, k)); } catch {} } module.exports._wire(ctx); },
  onSettings(ctx) { if (module.exports._keys !== !!ctx.mod('snap').dragEdges) { module.exports._keys = !!ctx.mod('snap').dragEdges; module.exports._wire(ctx); } },
  stop(ctx) { for (const acc of Object.values(K)) { try { ctx.globalShortcut.unregister(acc); } catch {} } off.forEach(f => f()); off = []; },
};
