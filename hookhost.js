// Runs the native keyboard/mouse hook in its OWN process. The native start() call can deadlock (it did, right after updates) —
// in here that can only freeze this helper, never Surge itself; the main process times it out and starts a fresh one.
const port = process.parentPort; const send = m => { try { port.postMessage(m); } catch {} };
try {
  const { uIOhook } = require('uiohook-napi'); let lastMove = 0;
  for (const ev of ['keydown', 'keyup', 'mousedown', 'mouseup', 'wheel', 'mousemove']) uIOhook.on(ev, e => {
    if (ev === 'mousemove') { const n = Date.now(); if (n - lastMove < 33) return; lastMove = n; }
    send({ ev, e: { keycode: e.keycode, button: e.button, x: e.x, y: e.y, rotation: e.rotation, clicks: e.clicks, direction: e.direction, amount: e.amount } }); });
  send({ loaded: true });
  uIOhook.start();
  send({ started: true });
} catch (e) { send({ error: String((e && e.message) || e) }); setTimeout(() => process.exit(1), 200); }
