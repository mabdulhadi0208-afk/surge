// Trackpad haptics (macOS, Force Touch trackpads). One small long-lived helper keeps the system haptic engine ready, so a tap costs a single byte
// down a pipe — no process is started per tick. Does nothing on Windows or on Macs without a haptic trackpad.
const { spawn } = require('child_process');
const JXA = `ObjC.import('AppKit');ObjC.import('Foundation');
var h=$.NSHapticFeedbackManager.defaultPerformer,inp=$.NSFileHandle.fileHandleWithStandardInput;
console.log('haptics-ready');
while(true){var d=inp.availableData;if(!d||d.length==0)break;var s=$.NSString.alloc.initWithDataEncoding(d,4).js;var c=s.charAt(s.length-1);
if(c>='0'&&c<='2')h.performFeedbackPatternPerformanceTime(parseInt(c),1);}`;
let proc = null, ready = false, fails = 0, last = 0, wanted = false, onReady = null;
function start(cb) {
  if (process.platform !== 'darwin') return false; wanted = true; if (cb) onReady = cb; if (proc) return true; if (fails >= 3) return false;
  try {
    const p = spawn('/usr/bin/osascript', ['-l', 'JavaScript', '-e', JXA], { stdio: ['pipe', 'ignore', 'pipe'] }); proc = p; ready = false;
    p.stderr.on('data', d => { if (!ready && /haptics-ready/.test(String(d))) { ready = true; fails = 0; try { onReady && onReady(); } catch {} onReady = null; } });
    p.stdin.on('error', () => {});
    p.on('error', () => { if (proc === p) { proc = null; ready = false; fails++; } });
    p.on('exit', () => { if (proc === p) { proc = null; ready = false; if (wanted && ++fails < 3) setTimeout(() => wanted && start(), 1500); } });
  } catch { proc = null; fails++; return false; }
  return true;
}
// strength: 0 light (alignment), 1 medium (generic), 2 firm (level change)
const PATTERN = [1, 0, 2];
function tap(strength = 1, minGap = 40) {
  if (!proc || !ready) return false; const n = Date.now(); if (n - last < minGap) return false; last = n;
  try { proc.stdin.write(String(PATTERN[strength] ?? 0)); return true; } catch { return false; }
}
function stop() { wanted = false; onReady = null; const p = proc; proc = null; ready = false; if (p) { try { p.stdin.end(); } catch {} try { p.kill(); } catch {} } }
process.on('exit', () => { try { proc && proc.kill(); } catch {} });
module.exports = { start, tap, stop, isReady: () => ready };
