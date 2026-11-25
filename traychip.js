// Surge 3.0 menu-bar icons, two families, 16pt tall, painted at 1x, 2x and 3x:
//   COLOUR (default): Surge's palette (deep pink into violet, cyan and amber accents), a glossy top highlight and a rim
//     of light, with a light-menu-bar and a dark-menu-bar variant (main.js switches them live with the appearance).
//   MONOCHROME (Settings, Monochrome icon): macOS TEMPLATE images, pure black plus alpha, tinted by macOS like its own.
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

/* ═══════════════════════════════ colour icons ═══════════════════════════════ */
const hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL = { pink: hx('#ff2e8a'), pinkL: hx('#ff5fa8'), violet: hx('#7b3dff'), violetD: hx('#5a22e0'), cyan: hx('#00c2ff'), mint: hx('#19d69a'), amber: hx('#ffa514'), orange: hx('#ff5e1a'), ink: hx('#231a44'), inkD: hx('#120c26'), white: [255, 255, 255] };
const mixc = (a, b, t) => [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * Math.max(0, Math.min(1, t)));
// straight-alpha "over"
function over(d, c, a) { if (a <= 0) return; const oa = a + d[3] * (1 - a); if (oa <= 0) return; for (let i = 0; i < 3; i++) d[i] = (c[i] * a + d[i] * d[3] * (1 - a)) / oa; d[3] = oa; }
function paintRGBA(Wpt, Hpt, scale, scene) {
  const w = Math.round(Wpt * scale), h = Math.round(Hpt * scale), data = Buffer.alloc(w * h * 4), SS = scale >= 3 ? 3 : 4, px = [0, 0, 0, 0];
  for (let py = 0; py < h; py++) for (let qx = 0; qx < w; qx++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) { px[0] = px[1] = px[2] = px[3] = 0; scene((qx + (sx + .5) / SS) / scale, (py + (sy + .5) / SS) / scale, px); r += px[0] * px[3]; g += px[1] * px[3]; b += px[2] * px[3]; a += px[3]; }
    const n = SS * SS, o = (py * w + qx) * 4;
    if (a > 0) { data[o] = Math.round(r / a); data[o + 1] = Math.round(g / a); data[o + 2] = Math.round(b / a); }
    data[o + 3] = Math.round(a / n * 255);
  }
  return { data, width: w, height: h };
}
// distance from a point to the edge of a rounded rect (negative inside)
function sdRRect(x, y, x0, y0, w, h, r) { const cx = x0 + w / 2, cy = y0 + h / 2, qx = Math.abs(x - cx) - w / 2 + r, qy = Math.abs(y - cy) - h / 2 + r; return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r; }
function sdSquircle(x, y, cx, cy, rr, n = 4.4) { const v = Math.pow(Math.pow(Math.abs(x - cx) / rr, n) + Math.pow(Math.abs(y - cy) / rr, n), 1 / n); return (v - 1) * rr; }
function sdPoly(x, y, P) { let d = Infinity; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; d = Math.min(d, dseg(x, y, [a[0], a[1], b[0], b[1]])); } return inPoly(x, y, P) ? -d : d; }
// fill colours by battery state: pink/violet normally, amber when low, cyan to mint while charging or full
function stateColors(b) { const lvl = b.level; if (b.charging || lvl >= 100) return [PAL.cyan, PAL.mint]; if (lvl <= 20) return [PAL.orange, PAL.amber]; return [PAL.violet, PAL.pink]; }
// the white bolt with a soft dark halo, so it reads on any fill
function drawBolt(x, y, P, px, haloA = .45) { const d = sdPoly(x, y, P); if (d < 1.0 && d > 0) over(px, PAL.inkD, haloA * (1 - d)); if (d <= 0) over(px, PAL.white, 1); }

function markColor(_b, scale, dark) {               // 16 x 16 pt: the Surge squircle, pink into violet, a white bolt with an amber foot
  const bolt = BOLT(8, 8.15, .54);
  return paintRGBA(16, 16, scale, (x, y, px) => {
    const d = sdSquircle(x, y, 8, 8, 7.35);
    if (!dark && d > 0 && d < .7) over(px, PAL.violetD, .35 * (1 - d / .7));          // a crisp edge on a light menu bar
    if (d > 0) return;
    const t = ((x - 1) + (y - 1)) / 26;                                                // diagonal: pink top-left into violet bottom-right
    let c = mixc(PAL.pinkL, PAL.violet, t * 1.25); over(px, c, 1);
    if (y > 9) over(px, PAL.inkD, (y - 9) / 7 * .28);                                   // depth at the foot
    const hl = sdSquircle(x, y, 8, 5.6, 5.6, 3.2); if (hl < 0 && y < 8) over(px, PAL.white, .34 * Math.min(1, -hl / 2.2) * (1 - y / 8));   // glossy top
    if (d > -.75 && y < 9) over(px, PAL.white, .45 * (1 - (y - 1) / 8));                // rim of light
    if (dark && d > -.6) over(px, PAL.white, .12);
    if (x < 3.5 || x > 12.5) return;
    const sh = sdPoly(x, y - .55, bolt); if (sh < .6 && sh > -10) over(px, hx('#3a0f6e'), .38 * Math.min(1, (.6 - sh) / .6));   // bolt shadow
    const bd = sdPoly(x, y, bolt); if (bd <= 0) over(px, mixc(PAL.white, hx('#ffd27a'), (y - 4.5) / 8), 1); else if (bd < .45) over(px, PAL.white, .9 * (1 - bd / .45));
  });
}
const DW = ch => ch === '1' ? 3.3 : 5.0;
function digitSegs(str, x0, y0, sc) { const out = []; let x = x0; for (const ch of str) { const off = ch === '1' ? -.6 : 0; for (const poly of GLY[ch]) for (let i = 1; i < poly.length; i++) out.push([x + (poly[i - 1][0] + off) * sc, y0 + poly[i - 1][1] * sc, x + (poly[i][0] + off) * sc, y0 + poly[i][1] * sc]); x += (DW(ch) + 1.9) * sc; } return out; }
const digitsWidth = (str, sc) => [...str].reduce((w, ch) => w + DW(ch) * sc, 0) + (str.length - 1) * 1.9 * sc;
function chipLayoutC(b) {
  const lvl = Math.max(0, Math.min(100, Math.round(b.level))), str = String(lvl), sc = .9, tw = digitsWidth(str, sc), bw = b.charging ? 6.2 : 0;
  const W = Math.max(30, Math.ceil(tw + bw + 17)); return { lvl, str, sc, tw, bw, W };   // room either side of the number, so the fill level reads at a glance
}
function chipColor(b, scale, dark) {           // a glass capsule, the level as a gradient fill, the number in bold white, a bolt while charging
  const L = chipLayoutC(b), W = L.W, H = 16, [c0, c1] = stateColors(b);
  const x0 = (W - L.tw - L.bw) / 2 + L.bw, D = digitSegs(L.str, x0, (H - 8 * L.sc) / 2, L.sc), bolt = b.charging ? BOLT(x0 - 3.5, 8, .35) : null;
  const fillR = 2.2 + (W - 4.4) * Math.max(.06, L.lvl / 100);
  // only points near the digits or the bolt pay for the distance maths (keeps a chip under ~40 ms for all three scales)
  const gx0 = x0 - 1.6, gx1 = x0 + L.tw + 1.6, gy0 = (H - 8 * L.sc) / 2 - 1.6, gy1 = gy0 + 8 * L.sc + 3.2;
  return paintRGBA(W, H, scale, (x, y, px) => {
    const d = sdRRect(x, y, .5, 1, W - 1, 14, 7);                                       // whole points top and bottom: crisp at 1x
    if (!dark && d > 0 && d < .7) over(px, PAL.violetD, .3 * (1 - d / .7));
    if (d > 0) return;
    over(px, mixc(hx('#1c1538'), hx('#0b0718'), (y - 1) / 14), .96);                    // the empty glass, deep and dark so the fill edge reads
    const fd = sdRRect(x, y, 2.2, 2.2, W - 4.4, 11.6, 5.8);
    if (fd <= 0 && x <= fillR) { over(px, mixc(c0, c1, (x - 2.2) / Math.max(6, W - 4.4)), 1); if (y < 7.5) over(px, PAL.white, .3 * (1 - (y - 2.2) / 5.3)); if (x > fillR - .9) over(px, PAL.white, .4); }
    if (d > -.8) over(px, dark ? PAL.white : PAL.pinkL, (dark ? .4 : .5) * (y < 8 ? 1 : .45));   // the rim of light
    if (bolt && x > x0 - 8 && x < x0 && y > 3 && y < 13) drawBolt(x, y, bolt, px);
    if (x < gx0 || x > gx1 || y < gy0 || y > gy1) return;
    let g = 9; for (let i = 0; i < D.length; i++) { const v = dseg(x, y, D[i]); if (v < g) g = v; }
    if (g < 1.5) over(px, hx('#0b0718'), .55 * Math.min(1, (1.5 - g) / .6));            // halo keeps the digits legible on the fill and the glass
    if (g < .82) over(px, PAL.white, Math.min(1, (.82 - g) / .3));
  });
}
function batteryColor(b, scale, dark) {        // 27 x 16 pt: a slim battery, the level filled in the state colour, a bolt while charging
  const lvl = Math.max(0, Math.min(100, b.level)), [c0, c1] = stateColors(b), shell = dark ? hx('#f1ecff') : hx('#2c2545'), fw = 18.2 * Math.max(.07, lvl / 100);
  const bolt = b.charging ? BOLT(12.2, 8, .43) : null;
  return paintRGBA(27, 16, scale, (x, y, px) => {
    if (sdRRect(x, y, 23.6, 6, 1.9, 4, .9) <= 0) { over(px, shell, .75); return; }
    const d = sdRRect(x, y, 1, 3, 22, 10, 3.2); if (d > 0) return;
    if (d > -1.15) { over(px, shell, .92); return; }                                     // the shell
    over(px, dark ? PAL.inkD : hx('#e9e4f7'), dark ? .55 : .7);
    const fd = sdRRect(x, y, 2.6, 4.6, 18.8, 6.8, 1.8);
    if (fd <= 0 && x <= 2.6 + fw) { over(px, mixc(c0, c1, (x - 2.6) / Math.max(3, fw)), 1); if (y < 8) over(px, PAL.white, .32 * (1 - (y - 4.6) / 3.4)); }
    if (bolt && x > 8 && x < 17) drawBolt(x, y, bolt, px, .5);
  });
}
const COLOR = { mark: markColor, chip: chipColor, battery: batteryColor };
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
  // colour: kind = mark | chip | battery; dark = for a dark menu bar. Returns { png, width, height } in points.
  colorPNG: (kind, b, scale = 2, dark = true) => { const im = COLOR[kind](b || { level: 100 }, scale, dark); return { png: png(im), width: Math.round(im.width / scale), height: 16 }; },
  colorSize: (kind, b) => kind === 'mark' ? [16, 16] : kind === 'battery' ? [27, 16] : [chipLayoutC(b).W, 16],
};
