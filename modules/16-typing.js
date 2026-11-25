// Typing Stats — keys per day + live WPM in the menu bar.
let off = [], keys = 0, day = '', recent = [];
module.exports = {
  id: 'typing', name: 'Typing Stats', icon: 'wpm', group: 'Productivity', needsHook: true,
  desc: 'Live words-per-minute and total keystrokes today in the menu bar.',
  defaults: { showWpm: true },
  schema: [{ k: 'showWpm', t: 'toggle', label: 'WPM in menu bar' }],
  start(ctx) {
    day = new Date().toDateString();
    // the 3 s clean-up tick only runs while you are typing, and stops once the last 10 s are empty
    let t = null;
    off.push(ctx.onInput('keydown', () => { const d = new Date().toDateString(); if (d !== day) { day = d; keys = 0; } keys++; const n = Date.now(); recent.push(n); recent = recent.filter(x => n - x < 10000); const wpm = Math.round(recent.length / 5 * 6); ctx.setTray('typing', { title: ctx.mod('typing').showWpm && recent.length > 5 ? `${wpm} wpm` : '', menu: [{ label: `Typing: ${keys} keys today, ${wpm} wpm`, enabled: false }] });
      if (!t) t = setInterval(() => { recent = recent.filter(x => Date.now() - x < 10000); if (!recent.length) { clearInterval(t); t = null; ctx.setTray('typing', { title: '', menu: [{ label: `Typing: ${keys} keys today`, enabled: false }] }); } }, 3000); }));
    off.push(() => { clearInterval(t); t = null; });
  },
  stop() { off.forEach(f => f()); off = []; },
};
