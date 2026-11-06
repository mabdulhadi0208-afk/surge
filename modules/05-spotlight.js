// Cursor Spotlight — dims everything except a circle around the cursor. Toggle with ⌘⇧S.
let timer = null, on = false;
module.exports = {
  id: 'spotlight', name: 'Cursor Spotlight', icon: 'spot', group: 'Screen',
  desc: 'Dim the screen around your cursor for demos and focus. Toggle with ⌘⇧S.',
  defaults: { radius: 180, dim: 0.75, softness: 0.5 },
  schema: [
    { k: 'radius', t: 'range', label: 'Radius', min: 60, max: 500, step: 5, fmt: 'px' },
    { k: 'dim', t: 'range', label: 'Darkness', min: .2, max: .95, step: .01, fmt: 'pct' },
    { k: 'softness', t: 'range', label: 'Edge softness', min: 0, max: 1, step: .01, fmt: 'pct' },
    { t: 'actions', label: 'Toggle', opts: [['toggle','Toggle spotlight']] },
  ],
  actions: { toggle: (ctx) => module.exports._toggle(ctx) },
  _toggle(ctx) { on = !on; ctx.setOverlayPersistent('spotlight', on); ctx.overlaySend('spotlight', on ? { ...ctx.mod('spotlight'), on: true } : { on: false }); ctx.setTray('spotlight', { title: on ? '◎' : '' }); },
  start(ctx) {
    try { ctx.globalShortcut.register('CommandOrControl+Shift+S', () => module.exports._toggle(ctx)); } catch {}
    timer = setInterval(() => { if (!on) return; const p = ctx.screen.getCursorScreenPoint(); ctx.overlaySend('cursor', p); }, 16);
  },
  onSettings(ctx) { if (on) ctx.overlaySend('spotlight', { ...ctx.mod('spotlight'), on: true }); },
  stop(ctx) { clearInterval(timer); if (on) module.exports._toggle(ctx); try { ctx.globalShortcut.unregister('CommandOrControl+Shift+S'); } catch {} },
};
