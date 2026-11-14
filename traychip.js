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
function chipRGBA(b, opts = {}) {
  const W = 40, H = 18, R = 9, s = opts.scale || 2, SS = 3, pw = W * s, ph = H * s;
  const lvl = Math.max(0, Math.min(100, Math.round(b.level)));
  const col = hex(b.charged || lvl >= 100 ? '#FFD60A' : b.charging ? (opts.accent && /^#[0-9a-f]{6}$/i.test(opts.accent) ? opts.accent : '#00FF85') : lvl <= 20 ? '#FF5C5C' : '#6FA8FF');
  const fw = Math.max(3, (W * lvl) / 100), str = String(lvl), gw = 5.2, gap = 1.5, tw = str.length * gw + (str.length - 1) * gap;
  const hasBolt = !!b.charging, boltW = 7.4, pad = hasBolt ? 3.2 : 0, x0 = (W - ((hasBolt ? boltW + pad : 0) + tw)) / 2;
  const bolt = hasBolt ? BP.map(p => [x0 - 1.4 + p[0] * .47, 3.9 + p[1] * .47]) : null;
  const G = []; let gx = x0 + (hasBolt ? boltW + pad : 0);
  for (const ch of str) { for (const q of segs(DIG[ch])) G.push([gx + q[0] * .88, 4 + q[1], gx + q[2] * .88, 4 + q[3]]); gx += gw + gap; }
  const gx0 = Math.min(...G.map(q => Math.min(q[0], q[2]))) - 2, gx1 = Math.max(...G.map(q => Math.max(q[0], q[2]))) + 2;
  const out = Buffer.alloc(pw * ph * 4);
  for (let py = 0; py < ph; py++) for (let px = 0; px < pw; px++) {
    let r = 0, g = 0, bl = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + .5) / SS) / s, y = (py + (sy + .5) / SS) / s;
      const qx = Math.abs(x - W / 2) - (W / 2 - R), qy = Math.abs(y - H / 2) - (H / 2 - R), sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
      if (sd > 0) continue;
      let c = [16, 20, 29], al = .94;
      const over = (k, o) => { c = [c[0] + (k[0] - c[0]) * o, c[1] + (k[1] - c[1]) * o, c[2] + (k[2] - c[2]) * o]; al = al + (1 - al) * o; };
      const edge = lvl >= 100 ? W + 1 : fw + 1.1 * Math.sin((y / H) * Math.PI * 2);            // meniscus
      if (x < edge) over(col, .55 + .4 * Math.min(1, x / Math.max(1, fw)));
      if (y < H / 2) over([255, 255, 255], .07);
      if (sd > -1) over([255, 255, 255], .22);
      if (bolt && inPoly(x, y, bolt)) over([255, 255, 255], 1);
      if (x > gx0 && x < gx1) { let d = 9; for (const q of G) { const k = dseg(x, y, q); if (k < d) d = k; } if (d < 1.3) over([0, 0, 0], .35); if (d < .75) over([255, 255, 255], 1); }
      r += c[0] * al; g += c[1] * al; bl += c[2] * al; a += al;
    }
    const n = SS * SS, i = (py * pw + px) * 4, A = a / n;
    if (A > 0) { out[i] = Math.round(r / a); out[i + 1] = Math.round(g / a); out[i + 2] = Math.round(bl / a); out[i + 3] = Math.round(A * 255); }
  }
  return { data: out, width: pw, height: ph };
}
let CRC = null;
function crc(buf) { if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } } let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function png({ data, width, height }) {
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const td = Buffer.concat([Buffer.from(type), body]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height); for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function chipPNG(b, opts) { return png(chipRGBA(b, opts)); }
module.exports.chipPNG = chipPNG; module.exports.chipRGBA = chipRGBA;
