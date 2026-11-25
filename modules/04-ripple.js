// Click Ripple — a burst where you click (four styles), plus an optional comet trail behind the cursor.
let off = [], trailOff = null;
module.exports = {
  id: 'ripple', name: 'Click Ripple', icon: 'ripple', group: 'Screen', needsHook: true,
  desc: 'A burst blooms under every click: ring, shockwave, sparks or a liquid drop. Optional comet trail behind the cursor. Great for screen recordings and presentations.',
  defaults: { style: 'sparks', color: '#FF2E8A', size: 60, rightColor: '#00C2FF', trail: false, trailSize: 7 },
  schema: [
    { k: 'style', t: 'seg', label: 'Style', opts: [['ring', 'Ring'], ['shock', 'Shockwave'], ['sparks', 'Sparks'], ['drop', 'Liquid drop']] },
    { k: 'color', t: 'color', label: 'Left click', opts: ['#FF2E8A','#7B3DFF','#00C2FF','#FFA514','#00FF85','#FFFFFF'] },
    { k: 'rightColor', t: 'color', label: 'Right click', opts: ['#00C2FF','#FF2E8A','#7B3DFF','#FFA514','#FFFFFF'] },
    { k: 'size', t: 'range', label: 'Size', min: 20, max: 160, step: 2, fmt: 'px' },
    { k: 'trail', t: 'toggle', label: 'Comet trail', hint: 'A glowing ribbon follows the cursor while it moves. Uses a little more power while you move the mouse.' },
    { k: 'trailSize', t: 'range', label: 'Trail thickness', min: 3, max: 16, step: 1, fmt: 'px' },
  ],
  // Zero lag: a click shows a small window just big enough for its burst and hides it after. Only the comet trail (off by
  // default) keeps the full-screen overlay up and asks the hook for mouse moves, and only while it is switched on.
  start(ctx) {
    off.push(ctx.onInput('mousedown', e => { const s = ctx.mod('ripple'); ctx.ripple({ x: e.x, y: e.y, color: e.button === 2 ? s.rightColor : s.color, size: s.size, style: s.style || 'ring' }); }));
    module.exports._trail(ctx);
  },
  _trail(ctx) {
    const on = !!ctx.mod('ripple').trail; if (on === !!trailOff) return;
    if (on) { trailOff = ctx.onInput('mousemove', e => { const s = ctx.mod('ripple'); ctx.overlaySend('trail', { x: e.x, y: e.y, color: s.color, size: s.trailSize }); }); ctx.setOverlayPersistent('ripple', true); }
    else { trailOff(); trailOff = null; ctx.setOverlayPersistent('ripple', false); }
  },
  onSettings(ctx) { module.exports._trail(ctx); },
  stop(ctx) { off.forEach(f => f()); off = []; if (trailOff) { trailOff(); trailOff = null; } ctx.setOverlayPersistent('ripple', false); },
};
