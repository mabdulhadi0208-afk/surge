// Caps Lock HUD — a pill that shows when Caps Lock flips.
let off = [];
module.exports = {
  id: 'caps', name: 'Caps Lock HUD', icon: 'caps', group: 'Screen', needsHook: true,
  desc: 'Never type a whole sentence in caps again — a pill appears when Caps Lock changes.',
  defaults: { sound: true },
  schema: [{ k: 'sound', t: 'toggle', label: 'Sound on toggle' }],
  start(ctx) {
    let caps = false;
    ctx.setOverlayPersistent('caps', false);
    off.push(ctx.onInput('keydown', e => { if (e.keycode !== 58) return; caps = !caps; ctx.fireGlow('hud', { hud: { text: caps ? 'CAPS LOCK ON' : 'Caps Lock off', color: caps ? '#FFB300' : '#8E8E9C' } }); if (ctx.mod('caps').sound) ctx.play(caps ? 'capsOn' : 'capsOff', { volume: .5 }); }));
  },
  stop() { off.forEach(f => f()); off = []; },
};
