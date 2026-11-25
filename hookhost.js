// Runs the native keyboard/mouse hook in its OWN process. The native start() call can deadlock (it did, right after updates) —
// in here that can only freeze this helper, never Surge itself; the main process times it out and starts a fresh one.
// Same zero-lag rule as hookworker.js: mouse moves stay in here unless Surge asks for them with {move:true}.
const port = process.parentPort; const send = m => { try { port.postMessage(m); } catch {} };
let wantMove = false, lastMove = 0, lastAlive = 0;
port.on('message', ev => { const m = ev && ev.data; if (m && 'move' in m) wantMove = !!m.move; });
try {
  const { uIOhook } = require('uiohook-napi');
  for (const ev of ['keydown', 'keyup', 'mousedown', 'mouseup', 'wheel']) uIOhook.on(ev, e => send({ ev, e: { keycode: e.keycode, button: e.button, x: e.x, y: e.y, rotation: e.rotation, clicks: e.clicks, direction: e.direction, amount: e.amount } }));
  uIOhook.on('mousemove', e => { const n = Date.now();
    if (wantMove) { if (n - lastMove < 33) return; lastMove = n; send({ ev: 'mousemove', e: { x: e.x, y: e.y } }); return; }
    if (n - lastAlive > 2000) { lastAlive = n; send({ alive: 1 }); } });
  send({ loaded: true });
  uIOhook.start();
  send({ started: true });
} catch (e) { send({ error: String((e && e.message) || e) }); setTimeout(() => process.exit(1), 200); }
