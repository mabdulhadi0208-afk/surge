// Renders the flowing-battery frames (the same ones traywork.js paints) for test/tray-flow.py: /tmp/surge-flow/<name>-<dark|light>-<frame>.png
const fs = require('fs'); const T = require('../traychip.js'); const D = '/tmp/surge-flow'; fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D);
const N = 10, items = { 'bat-charging': ['battery', { level: 62, charging: true }], 'chip-charging': ['chip', { level: 78, charging: true }], 'mark-charging': ['mark', { level: 100, charging: true }], 'bat-onbattery': ['battery', { level: 48 }], 'bat-low': ['battery', { level: 14 }] };
for (const [name, [kind, b]] of Object.entries(items)) for (const dark of [true, false]) for (let f = 0; f < N; f++) fs.writeFileSync(`${D}/${name}-${dark ? 'dark' : 'light'}-${f}.png`, T.colorPNG(kind, b, 2, dark, f / N).png);
console.log('ok');
