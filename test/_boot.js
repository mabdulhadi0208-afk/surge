// Test boot: runs the real Surge main process (../main.js) under a throwaway profile, so tests can drive its windows.
// Off macOS Surge still starts (Linux under xvfb-run); macOS-only bits (pmset, the Dock, haptics) just stay quiet.
const fs = require('fs'), path = require('path'), os = require('os');
const { app, Tray, BrowserWindow, webContents } = require('electron');
process.env.SURGE_TEST = '1';
const DIR = process.env.SURGE_TEST_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'surge-test-'));
const extra = process.env.SURGE_TEST_MODULES ? JSON.parse(process.env.SURGE_TEST_MODULES) : {};
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, 'settings.json'), JSON.stringify({ launchAtLogin: false, welcomed: true, soundFix: 1, chipFix: 1, modules: extra }));
app.setPath('userData', DIR); app.setPath('logs', path.join(DIR, 'logs'));
try { app.setVersion(require('../package.json').version); } catch {}
const trays = []; const oOn = Tray.prototype.on;
Tray.prototype.on = function (ev, fn) { trays.push({ ev, fn, tray: this }); return oOn.call(this, ev, fn); };
require('../main.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
const find = re => BrowserWindow.getAllWindows().find(b => !b.isDestroyed() && re.test(b.webContents.getURL()));
const tray = ev => trays.find(t => t.ev === ev);
const mod = f => require(path.join(__dirname, '..', 'modules', f));
module.exports = { app, BrowserWindow, webContents, DIR, wait, find, tray, trays, mod };
