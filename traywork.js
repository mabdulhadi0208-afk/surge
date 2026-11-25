// Paints the colour menu-bar icon frames OFF the main thread (a worker thread), so Surge's main process never stalls while a
// new level or state is drawn. In: { id, kind, b, dark, frames, scales }. Out: { id, frames: [[png@1x, png@2x, ...], ...] }.
const { parentPort } = require('worker_threads');
const T = require('./traychip.js');
parentPort.on('message', ({ id, kind, b, dark, frames, scales }) => {
  try {
    const out = [];
    for (let f = 0; f < frames; f++) out.push(scales.map(s => T.colorPNG(kind, b, s, dark, frames > 1 ? f / frames : 0).png));
    parentPort.postMessage({ id, frames: out, size: T.colorSize(kind, b) });
  } catch (e) { parentPort.postMessage({ id, error: String(e && e.message || e) }); }
});
