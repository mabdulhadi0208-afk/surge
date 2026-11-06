// Clipboard History — last 25 copies, one click to re-copy.
let timer = null, last = '', items = [];
module.exports = {
  id: 'clip', name: 'Clipboard History', icon: 'clip', group: 'Productivity',
  desc: 'Remembers your last 25 copies. Pick any from the menu bar to copy it again.',
  defaults: { max: 25 },
  schema: [{ k: 'max', t: 'seg', label: 'Keep', opts: [[10,'10'],[25,'25'],[50,'50']] }, { t: 'actions', label: 'History', opts: [['clear','Clear']] }],
  actions: { clear: (ctx) => { items = []; module.exports._tray(ctx); } },
  _tray(ctx) {
    ctx.setTray('clip', { menu: [{ label: `Clipboard (${items.length})`, submenu: items.length ? items.map(t => ({ label: t.replace(/\s+/g, ' ').slice(0, 60), click: () => ctx.clipboard.writeText(t) })) : [{ label: 'Nothing yet', enabled: false }] }] });
  },
  start(ctx) {
    last = ctx.clipboard.readText();
    timer = setInterval(() => { const t = ctx.clipboard.readText(); if (t && t !== last) { last = t; items = [t, ...items.filter(x => x !== t)].slice(0, ctx.mod('clip').max); module.exports._tray(ctx); } }, 800);
    module.exports._tray(ctx);
  },
  stop() { clearInterval(timer); },
};
