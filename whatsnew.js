// Surge's "What's new" film: a short cinematic window that plays ONCE after Surge updates to a new version (and again from
// Settings, About, What's new, or the Surge menu). Lumen's ui/intro.js is the model: one WHATS_NEW constant holding ONLY this
// version's changes, and wantsWhatsNew(version, seen) deciding when it plays.
// Standing rule (CLAUDE.md): every Surge update rewrites WHATS_NEW with only that version's changes, and makes the film a bit
// more cinematic than the last one.
const path = require('path');

const WHATS_NEW = {
  version: '3.0.5',
  items: [
    { icon: 'dock', text: 'In fullscreen apps, Surge Dock slides up when you touch the screen edge' },
    { icon: 'apps', text: 'Zoomed and new windows stop just above Surge Dock, like Apple\'s Dock' },
    { icon: 'snap', text: 'Surge Dock stays put in Mission Control and skips Cmd and the backtick key' },
  ],
};

// Plays when Surge runs the version WHATS_NEW describes (3.0.5, or a 3.0.5.x build) and that version has not been seen yet.
function wantsWhatsNew(version, seen) {
  const v = String(version || ''), f = String(WHATS_NEW.version || ''), norm = x => x.replace(/(\.0)+$/, '');
  if (!v || !f || seen === v) return false;
  return norm(v) === norm(f) || v.startsWith(f + '.');
}

// The film itself. deps: { app, settings(), save(), log, preload }.
let win = null, lastHow = null;
function play(deps, why = 'replay') {
  const { BrowserWindow, screen } = require('electron');
  if (win && !win.isDestroyed()) { win.show(); win.focus(); win.webContents.send('whatsnew:replay'); return win; }
  const s = deps.settings(); s.whatsNewSeen = deps.app.getVersion(); deps.save();      // marked as it starts: a crash can never make it loop
  const d = screen.getPrimaryDisplay().workArea, w = 820, h = 520;
  win = new BrowserWindow({ width: w, height: h, x: Math.round(d.x + d.width / 2 - w / 2), y: Math.round(d.y + d.height / 2 - h / 2 - d.height * .04),
    frame: false, transparent: true, hasShadow: false, resizable: false, movable: false, alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: deps.preload, contextIsolation: true } });
  try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); win.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  win.loadFile(path.join(__dirname, 'whatsnew.html'), { query: { why } });
  win.once('ready-to-show', () => { if (!win || win.isDestroyed()) return; win.show(); win.focus(); });
  win.webContents.on('console-message', (_e, lvl, msg) => lvl >= 2 && deps.log('whatsnew', msg));
  // the film can never be left on screen: if the page does not finish on its own, the window goes after 20 s
  const guard = setTimeout(() => { if (win && !win.isDestroyed()) { deps.log('whatsnew: guard closed the film'); win.destroy(); } }, 20000);
  win.on('closed', () => { clearTimeout(guard); win = null; });
  deps.log('whatsnew: playing', deps.app.getVersion(), why);
  return win;
}
function done(how) { lastHow = String(how || 'end'); if (win && !win.isDestroyed()) win.destroy(); win = null; }
function data(app) { return { version: app.getVersion(), items: WHATS_NEW.items.map(i => ({ text: i.text, icon: i.icon })), forVersion: WHATS_NEW.version }; }

module.exports = { WHATS_NEW, wantsWhatsNew, play, done, data, get window() { return win && !win.isDestroyed() ? win : null; }, get lastHow() { return lastHow; } };
