// Auto Dark Mode must never fight the user: no appearance change on launch, after an update or on wake, exactly one change when
// the schedule crosses a boundary while Surge runs, and a manual change is left alone until the next boundary.
// Run: node test/darkmode.js   (or under electron). Writes /tmp/surge-darkmode.log.
const fs = require('fs'), path = require('path'), Module = require('module');
const LOGF = '/tmp/surge-darkmode.log'; try { fs.unlinkSync(LOGF); } catch {}
let fails = 0; const out = m => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); }; const ok = (c, m) => { if (!c) fails++; out((c ? 'PASS ' : 'FAIL ') + m); };
// every osascript / reg call the module makes is recorded instead of run
const calls = []; const orig = Module._load;
Module._load = function (r, ...a) { if (r === 'child_process') return { execFile: (cmd, args, ...rest) => { calls.push([cmd, ...(args || [])].join(' ')); const cb = rest.find(x => typeof x === 'function'); cb && cb(null, ''); } }; return orig.call(this, r, ...a); };
const appearanceCalls = () => calls.filter(c => /dark mode to|Personalize/.test(c)).length;
const D = require(path.join(__dirname, '..', 'modules', '15-darkmode.js'));
let clock = new Date(2026, 10, 25, 14, 0, 0); D._now = () => new Date(clock);
// a fresh Surge launch: settings as stored on disk, the system appearance as the user left it
function launch(stored, sysDark) {
  const st = { enabled: true, from: 19, to: 7, ...stored };
  const ctx = { booting: true, mod: () => st, save() {}, log() {}, fireGlow() {}, nativeTheme: { get shouldUseDarkColors() { return sys.dark; } } };
  sys.dark = sysDark; D.stop(); D.start(ctx); ctx.booting = false; return { ctx, st };
}
const sys = { dark: false };
const tick = (ctx, at) => { clock = at; D._tick(ctx); };
const t = (h, m) => new Date(2026, 10, 25, h, m, 0);

// 1. launches (fresh install of the module state, an upgrade from 3.0.1, an update relaunch) at 14:00 with the Mac in dark: nothing
calls.length = 0;
let { ctx, st } = launch({}, true); ok(appearanceCalls() === 0 && sys.dark, 'launch at 14:00 with the Mac in dark (upgrade from 3.0.1, no saved state): no appearance change');
({ ctx, st } = launch({ _seen: false, _times: '19-7' }, true)); ok(appearanceCalls() === 0, 'relaunch after an update at 14:00 with the Mac in dark: no appearance change');
D.onSettings(ctx); D.onSettings(ctx); ok(appearanceCalls() === 0, 'saving other settings / opening Settings: no appearance change');
for (let m = 1; m < 300; m++) tick(ctx, new Date(+t(14, 0) + m * 60000)); ok(appearanceCalls() === 0, 'five hours of minute ticks before the boundary: no appearance change');
// 2. crossing 18:59 -> 19:00 while running: exactly one change (to dark). The Mac is light now (the user went light by hand).
sys.dark = false; calls.length = 0;
tick(ctx, t(18, 58)); tick(ctx, t(18, 59)); tick(ctx, t(19, 0)); tick(ctx, t(19, 1)); tick(ctx, t(19, 2));
ok(appearanceCalls() === 1 && /dark mode to true/.test(calls[0]), `boundary 18:59 -> 19:00: exactly one change to dark (${appearanceCalls()} calls: ${calls.join(' | ')})`);
sys.dark = true;
// 3. the user goes light by hand at 20:00: Surge leaves it until the next boundary
calls.length = 0; sys.dark = false;
for (let m = 0; m < 10 * 60; m += 1) tick(ctx, new Date(+t(20, 0) + m * 60000));
ok(appearanceCalls() === 0, 'manual change to light at 20:00 is respected all evening and night');
// next boundary 07:00: want light, the Mac is already light -> nothing to do
calls.length = 0; tick(ctx, new Date(2026, 10, 26, 6, 59)); tick(ctx, new Date(2026, 10, 26, 7, 0)); ok(appearanceCalls() === 0, '07:00 boundary with the Mac already light: no call');
// 4. a boundary that passed while the Mac slept (18:30 -> 21:00): waking does not flip it
({ ctx, st } = launch({}, false)); calls.length = 0; tick(ctx, t(18, 30)); tick(ctx, t(21, 0)); tick(ctx, t(21, 1));
ok(appearanceCalls() === 0, 'waking at 21:00 after sleeping through 19:00: no appearance change');
// 5. switching the module on (not at launch) or changing its times applies the schedule once
calls.length = 0; clock = t(21, 30); sys.dark = false; const st2 = { enabled: true, from: 19, to: 7 }; const c2 = { booting: false, mod: () => st2, save() {}, log() {}, fireGlow() {}, nativeTheme: { get shouldUseDarkColors() { return sys.dark; } } };
D.stop(); D.start(c2); ok(appearanceCalls() === 1, 'switching Auto Dark Mode on at 21:30 applies dark once');
sys.dark = true; calls.length = 0; clock = t(18, 0); st2.from = 17; D.onSettings(c2); D.onSettings(c2); ok(appearanceCalls() === 0 && st2._seen === true, 'changing "Dark from" to 17:00 at 18:00 with the Mac already dark: applies once (already dark, no call)');
sys.dark = true; calls.length = 0; st2.from = 20; D.onSettings(c2); ok(appearanceCalls() === 1 && /dark mode to false/.test(calls[0]), 'changing "Dark from" to 20:00 at 18:00: one change to light');
// 6. Auto Dark Mode is off by default
ok(!D.defaultEnabled, 'Auto Dark Mode is off by default');
D.stop();
out(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
