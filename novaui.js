// Surge 3.0: the right-click menu on the menu-bar icon and Surge's questions ("Move to Applications?", "Replace the Dock?"),
// drawn by Surge in Nova instead of the plain system menu and alert. Both are small windows sized to their content,
// made on first use, hidden (not kept on screen) the moment they close. Both fall back to the native menu and alert if
// the window cannot open.
//   popupMenu(template, anchorBounds) -> true if shown      (same template shape as Menu.buildFromTemplate)
//   dialog({ type, message, detail, buttons, defaultId, cancelId }) -> Promise<{ response }>   (same as dialog.showMessageBox)
const path = require('path');
const { BrowserWindow, screen, dialog: native } = require('electron');
const MAC = process.platform === 'darwin', W = 290;
let menu = null, fns = new Map(), anchor = null, shownAt = 0;
const PRE = path.join(__dirname, 'nova-preload.js');
function acc(a) {
  if (!a) return '';
  const p = String(a).split('+');
  if (!MAC) return p.map(k => /^(CommandOrControl|CmdOrCtrl|Cmd|Command)$/i.test(k) ? 'Ctrl' : k).join('+');
  const S = { CommandOrControl: '⌘', CmdOrCtrl: '⌘', Cmd: '⌘', Command: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧' };
  return p.map(k => S[k] || k).join(' ');
}
function serialize(tpl, out = []) {
  for (const it of tpl || []) {
    if (!it || it.visible === false) continue;
    if (it.type === 'separator') { if (out.length && out[out.length - 1].type !== 'separator') out.push({ type: 'separator' }); continue; }
    const id = 'm' + fns.size; fns.set(id, it);
    const sub = Array.isArray(it.submenu) ? serialize(it.submenu, []) : null;
    out.push({ id, label: String(it.label || ''), type: it.type === 'checkbox' ? 'checkbox' : sub ? 'submenu' : 'normal', checked: !!it.checked, enabled: it.enabled !== false, acc: acc(it.accelerator), sub });
  }
  while (out.length && out[out.length - 1].type === 'separator') out.pop();
  return out;
}
function place(h) {
  if (!menu || menu.isDestroyed()) return;
  const pt = screen.getCursorScreenPoint(); let a = anchor; if (!a || !(a.width > 0)) a = { x: pt.x, y: pt.y, width: 0, height: 0 };
  const wa = screen.getDisplayNearestPoint({ x: Math.round(a.x + a.width / 2), y: Math.round(a.y + a.height / 2) }).workArea;
  const H = Math.max(80, Math.min(Math.ceil(h), wa.height - 16));
  let x = Math.round(a.x + a.width / 2 - W / 2); x = Math.max(wa.x + 6, Math.min(x, wa.x + wa.width - W - 6));
  const below = a.y + a.height / 2 < wa.y + wa.height / 2;
  let y = below ? Math.round(a.y + a.height + 2) : Math.round(a.y - H - 2); y = Math.max(wa.y + 4, Math.min(y, wa.y + wa.height - H - 4));
  menu.setBounds({ x, y, width: W, height: H }, false);
}
function hideMenu() { if (menu && !menu.isDestroyed() && menu.isVisible()) menu.hide(); }
function ensureMenu() {
  if (menu && !menu.isDestroyed()) return menu;
  menu = new BrowserWindow({ width: W, height: 300, show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, title: 'Surge',
    webPreferences: { preload: PRE, contextIsolation: true } });
  menu.setAlwaysOnTop(true, 'pop-up-menu'); try { menu.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
  menu.on('blur', () => { if (Date.now() - shownAt > 150) hideMenu(); });
  menu.on('closed', () => { menu = null; });
  menu.webContents.on('ipc-message', (_e, ch, a, b) => {
    if (ch === 'nova:size') { place(+a || 300); if (!menu.isVisible()) { shownAt = Date.now(); menu.show(); menu.focus(); } }
    else if (ch === 'nova:close') hideMenu();
    else if (ch === 'nova:pick') { const it = fns.get(String(a)); hideMenu(); if (!it || typeof it.click !== 'function' || it.enabled === false) return;
      const item = { ...it, checked: it.type === 'checkbox' ? !!b : it.checked }; setTimeout(() => { try { it.click(item, null, {}); } catch (e) { console.error('[menu]', e); } }, 30); }
  });
  menu.loadFile(path.join(__dirname, 'menu.html'));
  return menu;
}
function popupMenu(template, bounds) {
  try {
    fns = new Map(); anchor = bounds || null;
    const items = serialize(template), w = ensureMenu();
    const send = () => { try { w.webContents.send('nova:menu', { items, mac: MAC }); } catch {} };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
    return true;
  } catch (e) { console.error('[nova menu]', e); return false; }
}
function dialog(o = {}) {
  const buttons = (o.buttons && o.buttons.length ? o.buttons : ['OK']).map(String);
  const cancelId = o.cancelId != null ? o.cancelId : buttons.length - 1, defaultId = o.defaultId != null ? o.defaultId : 0;
  return new Promise(resolve => {
    let done = false, w = null, shown = false;
    const finish = i => { if (done) return; done = true; resolve({ response: i, checkboxChecked: false }); setTimeout(() => { try { if (w && !w.isDestroyed()) w.destroy(); } catch {} }, 220); };
    try {
      let wa = { x: 0, y: 0, width: 1280, height: 800 }; try { wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea; } catch {}
      const DW = 470, DH = 300;
      w = new BrowserWindow({ width: DW, height: DH, x: Math.round(wa.x + (wa.width - DW) / 2), y: Math.round(wa.y + wa.height * .22), show: false, frame: false, transparent: true,
        backgroundColor: '#00000000', hasShadow: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, title: 'Surge',
        webPreferences: { preload: PRE, contextIsolation: true } });
      w.webContents.on('ipc-message', (_e, ch, v) => {
        if (ch === 'nova:answer') finish(+v || 0);
        else if (ch === 'nova:dsize') { try { w.setContentSize(DW, Math.max(180, Math.min(640, Math.ceil(+v || DH)))); if (!shown) { shown = true; w.show(); w.focus(); } } catch {} }
      });
      w.on('closed', () => finish(cancelId));
      w.webContents.on('render-process-gone', () => fallback());
      w.loadFile(path.join(__dirname, 'dialog.html'), { hash: encodeURIComponent(JSON.stringify({ type: o.type || 'info', message: String(o.message || ''), detail: String(o.detail || ''), buttons, defaultId, cancelId })) }).catch(fallback);
      setTimeout(() => { if (!shown && !done) fallback(); }, 4000);
    } catch (e) { fallback(); }
    function fallback() { if (done) return; try { if (w && !w.isDestroyed()) w.destroy(); } catch {} done = true; native.showMessageBox({ type: o.type || 'info', message: o.message, detail: o.detail, buttons, defaultId, cancelId }).then(resolve, () => resolve({ response: cancelId })); }
  });
}
module.exports = { popupMenu, hideMenu, dialog, _acc: acc };
