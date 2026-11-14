// Click Ripple — a burst where you click (four styles), plus an optional comet trail behind the cursor.
let off = [];
module.exports = {
  id: 'ripple', name: 'Click Ripple', icon: 'ripple', group: 'Screen', needsHook: true,
  desc: 'A burst blooms under every click: ring, shockwave, sparks or a liquid drop. Optional comet trail behind the cursor. Great for screen recordings and presentations.',
  defaults: { style: 'sparks', color: '#00FF85', size: 60, rightColor: '#FF3DF0', trail: false, trailSize: 7 },
  schema: [
    { k: 'style', t: 'seg', label: 'Style', opts: [['ring', 'Ring'], ['shock', 'Shockwave'], ['sparks', 'Sparks'], ['drop', 'Liquid drop']] },
    { k: 'color', t: 'color', label: 'Left click', opts: ['#00FF85','#00D4FF','#7A5CFF','#FF3DF0','#FFD60A','#FFFFFF'] },
    { k: 'rightColor', t: 'color', label: 'Right click', opts: ['#FF3DF0','#FF1744','#FFB300','#00D4FF','#FFFFFF'] },
    { k: 'size', t: 'range', label: 'Size', min: 20, max: 160, step: 2, fmt: 'px' },
    { k: 'trail', t: 'toggle', label: 'Comet trail', hint: 'A glowing ribbon follows the cursor while it moves. Uses a little more power while you move the mouse.' },
    { k: 'trailSize', t: 'range', label: 'Trail thickness', min: 3, max: 16, step: 1, fmt: 'px' },
  ],
  start(ctx) {
    ctx.setOverlayPersistent('ripple', true);
    off.push(ctx.onInput('mousedown', e => { const s = ctx.mod('ripple'); ctx.overlaySend('ripple', { x: e.x, y: e.y, color: e.button === 2 ? s.rightColor : s.color, size: s.size, style: s.style || 'ring' }); }));
    off.push(ctx.onInput('mousemove', e => { const s = ctx.mod('ripple'); if (!s.trail) return; ctx.overlaySend('trail', { x: e.x, y: e.y, color: s.color, size: s.trailSize }); }));
  },
  stop(ctx) { off.forEach(f => f()); off = []; ctx.setOverlayPersistent('ripple', false); },
};
