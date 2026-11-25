// The native keyboard/mouse hook on a background THREAD of Surge itself.
// Same process as the app → macOS applies Surge's own Accessibility permission (a separate helper process was not trusted on real Macs).
// Off the main thread → the native start() call can never freeze the app (that was the "frozen after update" bug).
// Zero lag: mouse MOVES are never forwarded unless a feature that draws on them (the comet trail) asks for them with {move:true}.
// Otherwise a move only bumps a counter here, and at most every 2 s a tiny {alive} ping (no coordinates) tells Surge the hook still hears.
const { parentPort } = require('worker_threads');
const send = m => { try { parentPort.postMessage(m); } catch {} };
let wantMove = false, lastMove = 0, lastAlive = 0;
parentPort.on('message', m => { if (m && 'move' in m) wantMove = !!m.move; });
try {
  const { uIOhook } = require('uiohook-napi');
  for (const ev of ['keydown', 'keyup', 'mousedown', 'mouseup', 'wheel']) uIOhook.on(ev, e => send({ ev, e: { keycode: e.keycode, button: e.button, x: e.x, y: e.y, rotation: e.rotation, clicks: e.clicks, direction: e.direction, amount: e.amount } }));
  uIOhook.on('mousemove', e => { const n = Date.now();
    if (wantMove) { if (n - lastMove < 33) return; lastMove = n; send({ ev: 'mousemove', e: { x: e.x, y: e.y } }); return; }
    if (n - lastAlive > 2000) { lastAlive = n; send({ alive: 1 }); } });
  send({ loaded: true });
  uIOhook.start();
  send({ started: true });
} catch (e) { send({ error: String((e && e.message) || e) }); }
