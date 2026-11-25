// a minimal module context for driving a module directly in tests
module.exports = () => { const e = require('electron'); return { app: e.app, screen: e.screen, clipboard: e.clipboard, globalShortcut: e.globalShortcut, mod: (id) => ({ max: 25, autoPaste: true }), setTray() {}, fireGlow() {}, frontApp: async () => null, activateApp() {}, log() {} }; };
