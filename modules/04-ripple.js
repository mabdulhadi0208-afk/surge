// Click Ripple — a soft ring where you click.
let off = [];
module.exports = {
  id: 'ripple', name: 'Click Ripple', icon: 'ripple', group: 'Screen', needsHook: true,
  desc: 'A glowing ring blooms under every click. Great for screen recordings and presentations.',
  defaults: { color: '#00FF85', size: 60, rightColor: '#FF3DF0' },
  schema: [
    { k: 'color', t: 'color', label: 'Left click', opts: ['#00FF85','#00D4FF','#7A5CFF','#FF3DF0','#FFD60A','#FFFFFF'] },
    { k: 'rightColor', t: 'color', label: 'Right click', opts: ['#FF3DF0','#FF1744','#FFB300','#00D4FF','#FFFFFF'] },
    { k: 'size', t: 'range', label: 'Size', min: 20, max: 160, step: 2, fmt: 'px' },
  ],
  start(ctx) {
    ctx.setOverlayPersistent('ripple', true);
    off.push(ctx.onInput('mousedown', e => { const s = ctx.mod('ripple'); ctx.overlaySend('ripple', { x: e.x, y: e.y, color: e.button === 2 ? s.rightColor : s.color, size: s.size }); }));
  },
  stop(ctx) { off.forEach(f => f()); off = []; ctx.setOverlayPersistent('ripple', false); },
};
