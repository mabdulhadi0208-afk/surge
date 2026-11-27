// Surge Dock's native parts on macOS (3.0.5): the window add-on (native/dockwin.mm) and the helper (native/surge-dock.swift).
// Everything here is optional: if a part is missing or fails, Surge Dock keeps working as before and nothing throws.
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const MAC = process.platform === 'darwin';

function nativeDir() {   // packaged: Surge.app/Contents/Resources/native ; from source: native/bin
  const packaged = process.resourcesPath ? path.join(process.resourcesPath, 'native') : null;
  return packaged && fs.existsSync(packaged) ? packaged : path.join(__dirname, 'native', 'bin');
}
function helperPath() {  // packaged: next to the Surge binary (Contents/MacOS/surge-dock)
  const next = path.join(path.dirname(process.execPath), 'surge-dock');
  return fs.existsSync(next) ? next : path.join(__dirname, 'native', 'bin', 'surge-dock');
}

let addon, addonTried = false;
function loadAddon() {
  if (addonTried) return addon; addonTried = true;
  if (!MAC) return (addon = null);
  try { addon = require(path.join(nativeDir(), 'surge-dockwin.node')); } catch { addon = null; }
  return addon;
}
// stationary in Mission Control, on every desktop (and in fullscreen Spaces when asked), skipped by Cmd+`, at the Dock's level
function makeDock(win, fullscreen) {
  const a = loadAddon(); if (!a || !win || win.isDestroyed()) return false;
  try { return a.makeDock(win.getNativeWindowHandle(), !!fullscreen) === true; } catch { return false; }
}

// the helper: keeps windows clear of Surge Dock, and says when the app in front is fullscreen
function Helper({ onEvent = () => {}, log = () => {}, spawnFn = spawn, bin = helperPath() } = {}) {
  let proc = null, buf = '', restarts = 0, stopped = false, last = {};
  const send = (o) => { last[o.cmd] = o; try { if (proc && proc.stdin.writable) proc.stdin.write(JSON.stringify(o) + '\n'); } catch {} };
  function start() {
    if (stopped || proc || !MAC && spawnFn === spawn) return false;
    if (spawnFn === spawn && !fs.existsSync(bin)) { log('dock helper missing: ' + bin); return false; }
    try { proc = spawnFn(bin, [], { stdio: ['pipe', 'pipe', 'ignore'] }); } catch (e) { log('dock helper failed to start: ' + e.message); proc = null; return false; }
    buf = '';
    proc.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { onEvent(JSON.parse(line)); } catch {} } });
    proc.on('error', () => {});
    proc.on('exit', (code) => { proc = null; if (stopped) return; log('dock helper exited ' + code);
      if (restarts++ < 3) setTimeout(() => { if (start()) for (const k of ['zone', 'keepclear']) if (last[k]) send(last[k]); }, 1000 * restarts); });
    proc.stdin.on('error', () => {});
    return true;
  }
  function stop() { stopped = true; try { proc && proc.stdin.end(); } catch {} try { proc && proc.kill(); } catch {} proc = null; }
  return { start, stop, send, get running() { return !!proc; } };
}

// The band Surge Dock covers, in global top-left coordinates, as the helper wants it: from the top of the dock
// itself (pill) to the screen edge it sits on.
function zoneFor({ edge = 'bottom', winX, winY, winW, winH, pill, screen }) {
  const r = pill || { l: 0, t: edge === 'top' ? 0 : winH - 110, w: winW, h: 110 };
  const left = Math.round(winX + r.l), width = Math.round(r.w);
  if (edge === 'top') { const bottom = Math.round(winY + r.t + r.h); return { x: left, y: screen.y, w: width, h: bottom - screen.y, edge, sx: screen.x, sy: screen.y, sw: screen.width, sh: screen.height }; }
  const top = Math.round(winY + r.t); return { x: left, y: top, w: width, h: screen.y + screen.height - top, edge, sx: screen.x, sy: screen.y, sw: screen.width, sh: screen.height };
}

module.exports = { makeDock, Helper, zoneFor, nativeDir, helperPath };
