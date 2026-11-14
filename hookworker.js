// The native keyboard/mouse hook on a background THREAD of Surge itself.
// Same process as the app → macOS applies Surge's own Accessibility permission (a separate helper process was not trusted on real Macs).
// Off the main thread → the native start() call can never freeze the app (that was the "frozen after update" bug).
const { parentPort } = require('worker_threads');
const send = m => { try { parentPort.postMessage(m); } catch {} };
try {
  const { uIOhook } = require('uiohook-napi'); let lastMove = 0;
  for (const ev of ['keydown', 'keyup', 'mousedown', 'mouseup', 'wheel', 'mousemove']) uIOhook.on(ev, e => {
    if (ev === 'mousemove') { const n = Date.now(); if (n - lastMove < 33) return; lastMove = n; }
    send({ ev, e: { keycode: e.keycode, button: e.button, x: e.x, y: e.y, rotation: e.rotation, clicks: e.clicks, direction: e.direction, amount: e.amount } }); });
  send({ loaded: true });
  uIOhook.start();
  send({ started: true });
} catch (e) { send({ error: String((e && e.message) || e) }); }
