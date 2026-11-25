// Caffeine — keep the Mac awake.
let id = null, until = 0, timer = null;
module.exports = {
  id: 'caffeine', name: 'Caffeine', icon: 'coffee', group: 'Productivity',
  desc: 'Keep your Mac and display awake — indefinitely or for a set time. Shows “Awake” in the menu bar while it is on.',
  defaults: { minutes: 0 },
  schema: [
    { k: 'minutes', t: 'seg', label: 'Default duration', opts: [[0,'Until off'],[30,'30m'],[60,'1h'],[120,'2h'],[240,'4h']] },
    { t: 'actions', label: 'Control', opts: [['toggle','Toggle awake']] },
  ],
  actions: { toggle: (ctx) => module.exports._toggle(ctx), state: () => ({ on: id != null, left: until ? Math.max(0, Math.round((until - Date.now()) / 60000)) : null }) },
  // the 30 s tick only runs while Caffeine is on
  _on(ctx, minutes) { if (id == null) id = ctx.powerSaveBlocker.start('prevent-display-sleep'); until = minutes ? Date.now() + minutes * 60000 : 0; module.exports._tray(ctx);
    clearInterval(timer); timer = setInterval(() => { if (until && Date.now() > until) module.exports._off(ctx); else module.exports._tray(ctx); }, 30000); },
  _off(ctx) { clearInterval(timer); timer = null; if (id != null) { ctx.powerSaveBlocker.stop(id); id = null; } until = 0; module.exports._tray(ctx); },
  _toggle(ctx) { id == null ? module.exports._on(ctx, ctx.mod('caffeine').minutes) : module.exports._off(ctx); },
  _tray(ctx) {
    const left = until ? Math.max(0, Math.round((until - Date.now()) / 60000)) : null;
    ctx.setTray('caffeine', { title: id != null ? (left != null ? `Awake ${left}m` : 'Awake') : '', menu: [
      { label: id != null ? `Caffeine: awake${left != null ? ' · ' + left + ' min left' : ''}` : 'Caffeine: off', enabled: false },
      { label: id != null ? 'Let it sleep' : 'Keep awake', click: () => module.exports._toggle(ctx) },
      { label: 'Keep awake 1h', click: () => module.exports._on(ctx, 60) },
    ] });
  },
  start(ctx) { module.exports._tray(ctx); },
  stop(ctx) { clearInterval(timer); module.exports._off(ctx); },
};
