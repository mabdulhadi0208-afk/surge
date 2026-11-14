// Menu-bar charge chip (macOS): a tiny tank. Liquid level = battery, colour = state, bolt while charging, own digits (no font dependency).
// Pure function → SVG string, so it can be previewed and tested outside Electron.
const DIG = { 0: 'M1 1H5V9H1Z', 1: 'M1.6 2.6 3.4 1V9', 2: 'M1 1H5V5H1V9H5', 3: 'M1 1H5V9H1M2 5H5', 4: 'M1 1V5H5M5 1V9', 5: 'M5 1H1V5H5V9H1', 6: 'M5 1H1V9H5V5H1', 7: 'M1 1H5V9', 8: 'M1 1H5V9H1ZM1 5H5', 9: 'M5 5H1V1H5V9H1' };
const BOLT = 'M13 2 4 14h7l-1 8 9-12h-7z';
function chipSVG(b, opts = {}) {
  const W = 40, H = 18, R = 9, s = opts.scale || 2;
  const lvl = Math.max(0, Math.min(100, Math.round(b.level)));
  const col = b.charged || lvl >= 100 ? '#FFD60A' : b.charging ? (opts.accent || '#00FF85') : lvl <= 20 ? '#FF5C5C' : '#6FA8FF';
  const fw = Math.max(3, (W * lvl) / 100), wob = 1.6;                           // liquid edge bulges like a meniscus
  const liquid = lvl >= 100 ? `<rect width="${W}" height="${H}" fill="url(#g)"/>` : `<path d="M0 0H${fw}Q${fw + wob} ${H * .25} ${fw} ${H * .5}T${fw} ${H}H0Z" fill="url(#g)"/>`;
  const str = String(lvl), gw = 5.2, gap = 1.5, tw = str.length * gw + (str.length - 1) * gap;
  const hasBolt = !!b.charging, boltW = 7.4, pad = hasBolt ? 2.2 : 0, total = (hasBolt ? boltW + pad : 0) + tw, x0 = (W - total) / 2;
  const bolt = hasBolt ? `<path transform="translate(${x0 - 1.4},3.9) scale(.47)" d="${BOLT}" fill="#fff"/>` : '';
  let x = x0 + (hasBolt ? boltW + pad : 0), digits = '';
  for (const ch of str) { digits += `<path transform="translate(${x.toFixed(2)},4) scale(.88,1)" d="${DIG[ch]}"/>`; x += gw + gap; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * s}" height="${H * s}" viewBox="0 0 ${W} ${H}">
<defs><clipPath id="c"><rect width="${W}" height="${H}" rx="${R}"/></clipPath><linearGradient id="g" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${col}" stop-opacity=".55"/><stop offset="1" stop-color="${col}" stop-opacity=".95"/></linearGradient></defs>
<g clip-path="url(#c)"><rect width="${W}" height="${H}" fill="#10141d" fill-opacity=".94"/>${liquid}<rect width="${W}" height="${H * .5}" fill="#fff" fill-opacity=".07"/></g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${R - .5}" fill="none" stroke="#fff" stroke-opacity=".22"/>
${bolt}<g fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${digits}</g><g fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${digits}</g></svg>`;
}
module.exports = { chipSVG, W: 40, H: 18 };

/* ---- raster version: macOS' image loader will not take an SVG here, so the chip is painted pixel by pixel and handed over as a PNG ---- */
const zlib = require('zlib');
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
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
const FRAMES = 12;
function chipLayout(b, opts = {}) {
  const W = 40, H = 18, R = 9, s = opts.scale || 2, pw = W * s, ph = H * s, SS = 3;
  const lvl = Math.max(0, Math.min(100, Math.round(b.level)));
  const col = hex(b.charged || lvl >= 100 ? '#FFD60A' : b.charging ? (opts.accent && /^#[0-9a-f]{6}$/i.test(opts.accent) ? opts.accent : '#00FF85') : lvl <= 20 ? '#FF5C5C' : '#6FA8FF');
  const fw = Math.max(3, (W * lvl) / 100), str = String(lvl), gw = 5, gap = 1.8, tw = str.length * gw + (str.length - 1) * gap;
  const hasBolt = !!b.charging, boltW = 7.4, pad = hasBolt ? 3 : 0, x0 = (W - ((hasBolt ? boltW + pad : 0) + tw)) / 2;
  const bolt = hasBolt ? BP.map(p => [x0 - 1.4 + p[0] * .47, 3.9 + p[1] * .47]) : null;
  const G = []; let gx = x0 + (hasBolt ? boltW + pad : 0);
  for (const ch of str) { for (const line of GLY[ch]) for (let k = 0; k < line.length - 1; k++) G.push([gx + line[k][0], 5 + line[k][1], gx + line[k + 1][0], 5 + line[k + 1][1]]); gx += gw + gap; }
  // the label never moves → paint its coverage once, reuse it on every frame
  const ink = new Float32Array(pw * ph), shade = new Float32Array(pw * ph);
  const gx0 = Math.floor((x0 - 3) * s), gx1 = Math.ceil((gx + 2) * s);
  for (let py = 2 * s; py < ph - 2 * s; py++) for (let px = Math.max(0, gx0); px < Math.min(pw, gx1); px++) {
    let a = 0, sh = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) { const x = (px + (sx + .5) / SS) / s, y = (py + (sy + .5) / SS) / s;
      if (bolt && inPoly(x, y, bolt)) { a++; sh++; continue; }
      let d = 9; for (const q of G) { if (x < Math.min(q[0], q[2]) - 1.5 || x > Math.max(q[0], q[2]) + 1.5) continue; const k = dseg(x, y, q); if (k < d) d = k; }
      if (d < .82) a++; if (d < 1.45) sh++; }
    ink[py * pw + px] = a / 9; shade[py * pw + px] = sh / 9;
  }
  return { W, H, R, s, pw, ph, lvl, col, fw, ink, shade, charging: hasBolt };
}
function chipFrame(L, f = 0) {
  const { W, H, R, s, pw, ph, lvl, col, fw, ink, shade } = L, SS = 3, ph2 = (f / FRAMES) * Math.PI * 2;
  const shimmer = L.charging || lvl >= 100, sx0 = -6 + (f / FRAMES) * (Math.min(W, fw) + 12);      // a band of light that travels through the liquid
  const out = Buffer.alloc(pw * ph * 4);
  for (let py = 0; py < ph; py++) for (let px = 0; px < pw; px++) {
    let r = 0, g = 0, bl = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + .5) / SS) / s, y = (py + (sy + .5) / SS) / s;
      const qx = Math.abs(x - W / 2) - (W / 2 - R), qy = Math.abs(y - H / 2) - (H / 2 - R), sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
      if (sd > 0) continue;
      let c0 = 16, c1 = 20, c2 = 29, al = .94;
      const edge = lvl >= 100 ? W + 1 : fw + 1.25 * Math.sin((y / H) * Math.PI * 2 - ph2) + .5 * Math.sin((y / H) * Math.PI * 4 + ph2);   // the surface rolls
      if (x < edge) { let o = .55 + .4 * Math.min(1, x / Math.max(1, fw)); c0 += (col[0] - c0) * o; c1 += (col[1] - c1) * o; c2 += (col[2] - c2) * o; al += (1 - al) * o;
        if (shimmer) { const d = Math.abs(x - y * .35 - sx0); if (d < 3.2) { o = .3 * (1 - d / 3.2); c0 += (255 - c0) * o; c1 += (255 - c1) * o; c2 += (255 - c2) * o; } } }
      if (y < H / 2) { c0 += (255 - c0) * .07; c1 += (255 - c1) * .07; c2 += (255 - c2) * .07; }
      if (sd > -1) { c0 += (255 - c0) * .22; c1 += (255 - c1) * .22; c2 += (255 - c2) * .22; al += (1 - al) * .22; }
      r += c0 * al; g += c1 * al; bl += c2 * al; a += al;
    }
    const i = (py * pw + px) * 4, A = a / 9;
    if (A > 0) { let R0 = r / a, G0 = g / a, B0 = bl / a; const sh = shade[py * pw + px] * .4, k = ink[py * pw + px];
      R0 *= 1 - sh; G0 *= 1 - sh; B0 *= 1 - sh; R0 += (255 - R0) * k; G0 += (255 - G0) * k; B0 += (255 - B0) * k;
      out[i] = Math.round(R0); out[i + 1] = Math.round(G0); out[i + 2] = Math.round(B0); out[i + 3] = Math.round(Math.min(1, A + (1 - A) * k) * 255); }
  }
  return { data: out, width: pw, height: ph };
}
function chipRGBA(b, opts = {}) { return chipFrame(chipLayout(b, opts), opts.frame || 0); }
let CRC = null;
function crc(buf) { if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } } let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function png({ data, width, height }) {
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const td = Buffer.concat([Buffer.from(type), body]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height); for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function chipPNG(b, opts) { return png(chipRGBA(b, opts)); }
module.exports.chipPNG = chipPNG; module.exports.chipRGBA = chipRGBA; module.exports.chipLayout = chipLayout; module.exports.chipFramePNG = (L, f) => png(chipFrame(L, f)); module.exports.FRAMES = FRAMES;
