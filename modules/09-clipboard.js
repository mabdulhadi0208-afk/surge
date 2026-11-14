// Clipboard History — your last copies, one hotkey away. ⌘⇧V opens a searchable picker; Enter pastes straight into the app you were in.
// History lives in memory only (never written to disk) so copied passwords don't outlive the session.
const { BrowserWindow, screen } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const IS_MAC = process.platform === 'darwin', IS_WIN = process.platform === 'win32';
let timer = null, last = '', items = [], pick = null, prevApp = null, warned = false;
const HOTKEY = 'CommandOrControl+Shift+V';
module.exports = {
  id: 'clip', name: 'Clipboard History', icon: 'clip', group: 'Productivity',
  desc: `Remembers your last copies. Press ${IS_MAC ? '⌘⇧V' : 'Ctrl+Shift+V'} to search them and paste any one back. Kept in memory only.`,
  defaults: { max: 25, autoPaste: true },
  schema: [
    { k: 'max', t: 'seg', label: 'Keep', opts: [[10, '10'], [25, '25'], [50, '50']] },
    { k: 'autoPaste', t: 'toggle', label: 'Paste right away', hint: 'Off: the pick is only copied, you paste it yourself' },
    { t: 'actions', label: 'History', opts: [['open', 'Open picker'], ['clear', 'Clear']] },
  ],
  actions: {
    clear: (ctx) => { items = []; module.exports._tray(ctx); return 'History cleared'; },
    last: () => items[0] || '',
    list: () => items,
    open: (ctx) => { module.exports._picker(ctx); return 'Opened'; },
    remove: (ctx, text) => { items = items.filter(x => x !== text); module.exports._tray(ctx); return items; },
    paste: (ctx, text) => {
      if (typeof text !== 'string' || !text) return false;
      ctx.clipboard.writeText(text); last = text; items = [text, ...items.filter(x => x !== text)].slice(0, ctx.mod('clip').max); module.exports._tray(ctx);
      if (pick && !pick.isDestroyed()) pick.hide();
      if (!ctx.mod('clip').autoPaste) { ctx.fireGlow('hud', { hud: { text: 'Copied', color: '#00FF85' } }); return true; }
      const target = prevApp; prevApp = null; if (target) ctx.activateApp(target);
      setTimeout(() => {
        const done = (err) => { if (err) { ctx.fireGlow('hud', { hud: { text: `Copied — press ${IS_MAC ? '⌘V' : 'Ctrl+V'} to paste`, color: '#FFD60A' } }); if (!warned) { warned = true; console.error('clipboard paste keystroke failed:', err.message); } } };
        if (IS_MAC) execFile('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'], { timeout: 4000 }, done);
        else if (IS_WIN) execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', "(New-Object -ComObject WScript.Shell).SendKeys('^v')"], { timeout: 5000, windowsHide: true }, done);
      }, 280);
      return true;
    },
  },
  _tray(ctx) {
    ctx.setTray('clip', { menu: [{ label: `Clipboard (${items.length})`, submenu: items.length ? [{ label: `Open picker  ${IS_MAC ? '⌘⇧V' : 'Ctrl+Shift+V'}`, click: () => module.exports._picker(ctx) }, { type: 'separator' }, ...items.slice(0, 15).map(t => ({ label: t.replace(/\s+/g, ' ').slice(0, 60), click: () => ctx.clipboard.writeText(t) }))] : [{ label: 'Nothing yet', enabled: false }] }] });
  },
  async _picker(ctx) {
    if (pick && !pick.isDestroyed() && pick.isVisible()) { pick.hide(); return; }
    try { prevApp = await ctx.frontApp(); } catch { prevApp = null; }          // remember where the user was, so the paste lands there
    if (!pick || pick.isDestroyed()) {
      pick = new BrowserWindow({ width: 520, height: 440, show: false, frame: false, transparent: true, hasShadow: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, backgroundColor: '#00000000',
        webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true } });
      pick.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); pick.setAlwaysOnTop(true, 'pop-up-menu');
      pick.loadFile(path.join(__dirname, '..', 'clip.html'));
      pick.on('blur', () => { if (pick && !pick.isDestroyed()) pick.hide(); });
      pick.on('closed', () => (pick = null));
    }
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()), wa = d.workArea;
    pick.setPosition(Math.round(wa.x + wa.width / 2 - 260), Math.round(wa.y + wa.height * .22), false);
    pick.show(); pick.focus(); try { pick.webContents.send('clip:show'); } catch {}
  },
  start(ctx) {
    last = ctx.clipboard.readText();
    timer = setInterval(() => { const t = ctx.clipboard.readText(); if (t && t !== last) { last = t; if (t.length <= 20000) { items = [t, ...items.filter(x => x !== t)].slice(0, ctx.mod('clip').max); module.exports._tray(ctx); } } }, 700);
    try { ctx.globalShortcut.register(HOTKEY, () => module.exports._picker(ctx)); } catch {}
    module.exports._tray(ctx);
  },
  onSettings(ctx) { items = items.slice(0, ctx.mod('clip').max); },
  stop(ctx) { clearInterval(timer); try { ctx.globalShortcut.unregister(HOTKEY); } catch {} if (pick && !pick.isDestroyed()) pick.destroy(); pick = null; },
};
