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
