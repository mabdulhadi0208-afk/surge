// Quick Shortcuts — global hotkeys for Surge things.
const reg = [];
module.exports = {
  id: 'hotkeys', name: 'Hotkeys', icon: 'keys', group: 'System', defaultEnabled: true,
  desc: '⌘⇧G preview glow · ⌘⇧N quick notes · ⌘⇧S spotlight · ⌘⇧K keyboard sounds · ⌘⇧M mute all · ⌘⇧C caffeine · ⌘⇧D dock.',
  defaults: {},
  schema: [],
  start(ctx) {
    const add = (acc, fn) => { try { if (ctx.globalShortcut.register(acc, fn)) reg.push(acc); } catch {} };
    add('CommandOrControl+Shift+G', () => ctx.fireGlow('preview'));
    add('CommandOrControl+Shift+K', () => { const on = !ctx.mod('keys').enabled; ctx.applyPatch({ modules: { keys: { enabled: on } } }); ctx.fireGlow('hud', { hud: { text: on ? 'Keyboard sounds on' : 'Keyboard sounds off', color: on ? '#00FF85' : '#8E8E9C' } }); });
    add('CommandOrControl+Shift+M', () => { const on = !ctx.settings.muted; ctx.applyPatch({ muted: on }); ctx.fireGlow('hud', { hud: { text: on ? 'Muted' : 'Sounds on', color: on ? '#8E8E9C' : '#00FF85' } }); });
    add('CommandOrControl+Shift+C', () => { const m = require('./08-caffeine.js'); m._toggle(ctx); ctx.fireGlow('hud', { hud: { text: 'Caffeine toggled', color: '#FFB300' } }); });
  },
  stop(ctx) { reg.forEach(a => { try { ctx.globalShortcut.unregister(a); } catch {} }); reg.length = 0; },
};
