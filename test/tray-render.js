// Renders every menu-bar icon (colour light/dark, monochrome, and the 2.20 chip if a path to the old traychip.js is given)
// to /tmp/surge-tray/*.png for test/tray-sheet.py.
const fs = require('fs'); const N = require('../traychip.js'); const D = '/tmp/surge-tray'; fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D);
const states = { mark: null, chip78c: { level: 78, charging: true }, chip100: { level: 100 }, chip46: { level: 46 }, chip12: { level: 12 }, bat55: { level: 55 }, bat80c: { level: 80, charging: true }, bat14: { level: 14 }, bat100: { level: 100 } };
for (const [k, b] of Object.entries(states)) {
  const kind = k === 'mark' ? 'mark' : k.startsWith('chip') ? 'chip' : 'battery';
  for (const dark of [false, true]) for (const sc of [1, 2, 3]) fs.writeFileSync(`${D}/new-${dark ? 'dark' : 'light'}-${k}@${sc}x.png`, N.colorPNG(kind, b, sc, dark).png);
  const mono = kind === 'mark' ? N.markPNG(2) : kind === 'chip' ? N.chipPNG(b, 2) : N.batteryPNG(b, 2); fs.writeFileSync(`${D}/mono-${k}@2x.png`, mono);
}
if (process.argv[2]) { const O = require(process.argv[2]); for (const [k, b] of [['chip78c', { level: 78, charging: true }], ['chip100', { level: 100, charged: true }], ['chip12', { level: 12 }]]) fs.writeFileSync(`${D}/old-${k}@2x.png`, O.chipPNG(b, { scale: 2 })); }
console.log('rendered');
