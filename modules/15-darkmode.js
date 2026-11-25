// Auto Dark Mode — flip macOS appearance on a schedule.
let timer = null;
const { execFile } = require('child_process');
// Windows: the two registry values the Settings app flips for apps + system theme
function setWin(dark) { for (const k of ['AppsUseLightTheme', 'SystemUsesLightTheme']) execFile('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', k, '/t', 'REG_DWORD', '/d', dark ? '0' : '1', '/f'], { windowsHide: true }, () => {}); }
module.exports = {
  id: 'dark', name: 'Auto Dark Mode', icon: 'contrast', group: 'System',
  desc: process.platform === 'win32' ? 'Switch Windows to dark mode in the evening and back to light in the morning.' : 'Switch macOS to dark mode in the evening and back to light in the morning (asks for Automation permission once).',
  defaults: { from: 19, to: 7 },
  schema: [{ k: 'from', t: 'seg', label: 'Dark from', opts: [[17,'17:00'],[18,'18:00'],[19,'19:00'],[20,'20:00'],[21,'21:00']] }, { k: 'to', t: 'seg', label: 'Light at', opts: [[5,'05:00'],[6,'06:00'],[7,'07:00'],[8,'08:00']] }, { t: 'actions', label: 'Now', opts: [['toggle','Toggle dark mode']] }],
  actions: { toggle: () => { if (process.platform === 'win32') { const { nativeTheme } = require('electron'); setWin(!nativeTheme.shouldUseDarkColors); } else execFile('osascript', ['-e', 'tell application "System Events" to tell appearance preferences to set dark mode to not dark mode'], () => {}); } },
  // 3.0.2: Surge only changes the appearance at the moment the schedule crosses a boundary ("Dark from" or "Light at") while
  // it is running, or once when you switch the module on or change its times. It never re-applies the schedule on launch, after
  // an update, on wake or when Settings opens (that is what kept turning Macs light by itself). What it last did is saved in
  // settings, and if you change the appearance by hand Surge leaves it alone until the next boundary.
  _now: () => new Date(),
  _want(s, d) { const h = d.getHours(); return s.from > s.to ? (h >= s.from || h < s.to) : (h >= s.from && h < s.to); },
  // the most recent boundary before d (the last "Dark from" or "Light at" time that passed)
  _lastBoundary(s, d) { let best = 0; for (const hr of [s.from, s.to]) { const b = new Date(d); b.setHours(hr, 0, 0, 0); if (b > d) b.setDate(b.getDate() - 1); best = Math.max(best, +b); } return best; },
  _sysDark(ctx) { try { return !!ctx.nativeTheme.shouldUseDarkColors; } catch { return null; } },
  _set(ctx, want, why) {
    const s = ctx.mod('dark'); s._set = want; s._setAt = +module.exports._now(); ctx.save?.();
    if (module.exports._sysDark(ctx) === want) return;            // already there: nothing to change
    ctx.log?.(`auto dark mode: ${want ? 'dark' : 'light'} (${why})`);
    if (process.platform === 'win32') return setWin(want);
    execFile('osascript', ['-e', `tell application "System Events" to tell appearance preferences to set dark mode to ${want}`], (e) => { if (e && !module.exports._warned) { module.exports._warned = true; ctx.fireGlow('hud', { hud: { text: 'Auto Dark Mode needs Automation → System Events', color: '#FFA514' } }); } });
  },
  _tick(ctx) {
    const s = ctx.mod('dark'), d = module.exports._now(), want = module.exports._want(s, d);
    if (s._seen === want) return;
    s._seen = want; ctx.save?.();
    // a boundary passed while Surge was running (checked every minute): apply it. One that passed while the Mac slept or Surge
    // was not running is only noted, so waking up or launching never flips the appearance.
    if (+d - module.exports._lastBoundary(s, d) <= 3 * 60000) module.exports._set(ctx, want, 'schedule');
  },
  start(ctx) {
    const s = ctx.mod('dark'), want = module.exports._want(s, module.exports._now()), times = `${s.from}-${s.to}`;
    const justTurnedOn = !ctx.booting;                            // at launch the module is just resuming; later, you switched it on
    s._seen = want; s._times = times; ctx.save?.();
    if (justTurnedOn) module.exports._set(ctx, want, 'switched on');
    clearInterval(timer); timer = setInterval(() => module.exports._tick(ctx), 60000);
  },
  onSettings(ctx) {
    const s = ctx.mod('dark'), times = `${s.from}-${s.to}`; if (s._times === times) return;   // any other setting: nothing to do
    s._times = times; s._seen = module.exports._want(s, module.exports._now()); ctx.save?.();
    module.exports._set(ctx, s._seen, 'times changed');
  },
  stop() { clearInterval(timer); timer = null; },
};
