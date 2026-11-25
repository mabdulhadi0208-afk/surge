// Surge 3.0 menu-bar icons. Every one is a macOS TEMPLATE image: pure black plus alpha, so macOS tints it for a light or dark
// menu bar, the selected state and every accent, exactly like Apple's own icons. 16pt tall, painted at 1x and 2x.
// Pure JS rasteriser (4x4 supersampled) → PNG, so the icons look the same on every Mac (no SVG decoder, no font file).
//   mark(): the Surge mark, a bold squircle with the bolt cut out of it (the default)
//   chip(b): a charge capsule, the level filled in, the percent knocked out of the fill (digits stay readable either side)
//   battery(b): a slim battery with the level, a bolt cut out while charging
const zlib = require('zlib');
function segs(d) {            // the digit paths only use M/H/V/Z and implicit line-tos
  const out = []; let x = 0, y = 0, sx = 0, sy = 0; const t = d.match(/[MHVZ]|-?[\d.]+/g); let i = 0, cmd = 'M', first = true;
  while (i < t.length) { const k = t[i];
    if (/[MHVZ]/.test(k)) { cmd = k; i++; if (k === 'Z') { out.push([x, y, sx, sy]); x = sx; y = sy; } else if (k === 'M') first = true; continue; }
    if (cmd === 'M') { const nx = +t[i], ny = +t[i + 1]; i += 2; if (first) { sx = nx; sy = ny; first = false; } else out.push([x, y, nx, ny]); x = nx; y = ny; }
    else if (cmd === 'H') { const nx = +t[i++]; out.push([x, y, nx, y]); x = nx; }
    else if (cmd === 'V') { const ny = +t[i++]; out.push([x, y, x, ny]); y = ny; } }
  return out;
}
function dseg(px, py, s) { const vx = s[2] - s[0], vy = s[3] - s[1], l = vx * vx + vy * vy; let t = l ? ((px - s[0]) * vx + (py - s[1]) * vy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - s[0] - vx * t, py - s[1] - vy * t); }
const BP = [[13, 2], [4, 14], [11, 14], [10, 22], [19, 10], [12, 10]];
function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
/* digits: a soft rounded face drawn from arcs (own outlines → looks the same on every Mac, no font file needed) */
function arc(cx, cy, r, a0, a1) { const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 18)), p = []; for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * Math.PI / 180; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; }
const GLY = {
  0: [[...arc(2.5, 2.3, 2.3, 180, 360), ...arc(2.5, 5.7, 2.3, 0, 180), [0.2, 2.3]]],
  1: [[[0.9, 1.9], [2.9, 0], [2.9, 8]]],
  2: [[...arc(2.5, 2.3, 2.2, 180, 400), [0.3, 8], [4.8, 8]]],
  3: [[...arc(2.4, 1.98, 1.98, 200, 450), ...arc(2.4, 5.95, 2.05, 270, 520)]],
  4: [[[3.7, 8], [3.7, 0], [0.2, 5.7], [4.9, 5.7]]],
  5: [[[4.4, 0], [1.0, 0], [0.63, 3.73], ...arc(2.4, 5.5, 2.5, 225, 500)]],
  6: [[[3.9, 0], [2.2, 1.6], [0.9, 3.3], [0.25, 4.7]], arc(2.5, 5.5, 2.4, 0, 360)],
  7: [[[0.3, 0], [4.7, 0], [1.9, 8]]],
  8: [arc(2.5, 2.0, 1.95, 0, 360), arc(2.5, 5.75, 2.25, 0, 360)],
  9: [arc(2.5, 2.5, 2.4, 0, 360), [[4.76, 3.32], [4.1, 4.7], [2.8, 6.4], [1.1, 8]]],
};

// superellipse squircle, |x|^n + |y|^n <= 1
function inSquircle(x, y, cx, cy, r, n = 4.2) { return Math.pow(Math.abs((x - cx) / r), n) + Math.pow(Math.abs((y - cy) / r), n) <= 1; }
function inRRect(x, y, x0, y0, w, h, r) { if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false; const dx = Math.max(x0 + r - x, 0, x - (x0 + w - r)), dy = Math.max(y0 + r - y, 0, y - (y0 + h - r)); return dx * dx + dy * dy <= r * r; }
const BOLT = (ox, oy, k) => BP.map(p => [ox + (p[0] - 11.5) * k, oy + (p[1] - 12) * k]);
// paint: scene(x, y) → covered? in POINT coordinates; returns RGBA black with alpha coverage
function paint(Wpt, Hpt, scale, scene) {
  const w = Math.round(Wpt * scale), h = Math.round(Hpt * scale), data = Buffer.alloc(w * h * 4), SS = 4;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    let cov = 0; for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) cov += scene((px + (sx + .5) / SS) / scale, (py + (sy + .5) / SS) / scale) ? 1 : 0;
    data[(py * w + px) * 4 + 3] = Math.round(cov / (SS * SS) * 255);
  }
  return { data, width: w, height: h };
}
function digitsAt(str, x0, y0, sc) { const out = []; let x = x0; for (const ch of str) { for (const poly of GLY[ch]) for (let i = 1; i < poly.length; i++) out.push([x + poly[i - 1][0] * sc, y0 + poly[i - 1][1] * sc, x + poly[i][0] * sc, y0 + poly[i][1] * sc]); x += 5.6 * sc; } return out; }
const near = (x, y, S, w) => S.some(s => dseg(x, y, s) <= w);

function markRGBA(scale = 2) {                 // 16 x 16 pt
  const bolt = BOLT(8, 8.1, .5);
  return paint(16, 16, scale, (x, y) => inSquircle(x, y, 8, 8, 7.4) && !inPoly(x, y, bolt));
}
function chipRGBA(b, scale = 2) {              // 34 x 16 pt capsule
  const W = 34, H = 16, lvl = Math.max(0, Math.min(100, Math.round(b.level))), str = String(lvl), sc = .78;
  const tw = str.length * 5.6 * sc - .6 * sc, bw = b.charging ? 5.6 : 0, x0 = (W - tw - bw) / 2 + bw, D = digitsAt(str, x0, (H - 8 * sc) / 2, sc);
  const bp = b.charging ? BOLT(x0 - 3.3, 8, .33) : null, fillW = 2.6 + (W - 5.2) * lvl / 100;
  return paint(W, H, scale, (x, y) => {
    if (!inRRect(x, y, .5, 1.5, W - 1, H - 3, 6.5)) return false;
    if (!inRRect(x, y, 1.8, 2.8, W - 3.6, H - 5.6, 5.2)) return true;          // the rim
    const glyph = near(x, y, D, .68) || (bp && inPoly(x, y, bp));
    const filled = x <= fillW && inRRect(x, y, 3, 4, W - 6, H - 8, 4);
    return filled ? !glyph : glyph;           // knocked out of the fill, solid over the empty part
  });
}
function batteryRGBA(b, scale = 2) {           // 26 x 16 pt
  const lvl = Math.max(0, Math.min(100, b.level)), fw = 17.2 * Math.max(.06, lvl / 100), bolt = b.charging ? BOLT(12, 8, .4) : null;
  return paint(26, 16, scale, (x, y) => {
    if (x >= 23 && x <= 24.6 && y >= 6.2 && y <= 9.8) return true;                     // the nub
    if (!inRRect(x, y, 1, 3, 22, 10, 3.4)) return false;
    if (!inRRect(x, y, 2.3, 4.3, 19.4, 7.4, 2.3)) return true;                         // the shell
    const filled = x <= 3.4 + fw && inRRect(x, y, 3.4, 5.4, 17.2, 5.2, 1.4), inB = bolt && inPoly(x, y, bolt);
    return filled ? !inB : !!inB;
  });
}
let CRC = null;
function crc(buf) { if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } } let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function png({ data, width, height }) {
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const td = Buffer.concat([Buffer.from(type), body]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height); for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = {
  markPNG: (scale = 2) => png(markRGBA(scale)),
  chipPNG: (b, scale = 2) => png(chipRGBA(b, scale)),
  batteryPNG: (b, scale = 2) => png(batteryRGBA(b, scale)),
  markRGBA, chipRGBA, batteryRGBA, png, SIZES: { mark: [16, 16], chip: [34, 16], battery: [26, 16] },
};
