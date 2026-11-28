// 3.1: Surge Dock feel and speed. Loads dock.html with sample apps (test/_fakeapi.js), sweeps the pointer across the
// icons like a person would and measures frames plus Chromium's own layout and style counters. 3.1 magnifies with
// transform only, so the icons' layout boxes must never change while they swell, and everything settles and stops.
// Run: xvfb-run -a npx electron test/dockfeel31.js --no-sandbox   (DOCK_HTML=<file> measures another copy, DOCK_LOOSE=1 skips the 3.1-only checks)
// Writes PASS/FAIL lines to /tmp/surge-dockfeel31.log and shots to $SHOTS (default /tmp/surge-dockfeel31).
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('fs'), path = require('path');
const LOGF = '/tmp/surge-dockfeel31.log'; try { fs.unlinkSync(LOGF); } catch {}
const OUT = process.env.SHOTS || '/tmp/surge-dockfeel31'; fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const log = m => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
const ok = (c, m) => { log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const LOOSE = !!process.env.DOCK_LOOSE, FILE = process.env.DOCK_HTML || path.join(__dirname, '..', 'dock.html');
setTimeout(() => { log('TIMEOUT'); app.exit(1); }, 120000);
app.on('window-all-closed', () => {});
async function run(theme) {
  nativeTheme.themeSource = theme;
  const w = new BrowserWindow({ width: 1320, height: 240, show: true, frame: false, transparent: false, backgroundColor: theme === 'dark' ? '#2a2a2e' : '#c9c4ba',
    webPreferences: { preload: path.join(__dirname, '_fakeapi.js'), contextIsolation: true, backgroundThrottling: false } });
  const errs = []; w.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 3) errs.push(msg); });
  await w.loadFile(FILE); await wait(1200);
  w.webContents.send('fake:emit', 'dock:data', { battery: { level: 78, charging: true, remaining: '0:42' }, volume: 55, focus: { phase: 'idle' }, caffeine: { on: true, left: 25 } }); await wait(1000);
  const js = c => w.webContents.executeJavaScript(c);
  const n = await js(`document.querySelectorAll('.ap').length`); ok(n >= 8, `${theme}: dock shows the sample apps (${n})`);
  const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(OUT, `dock-${theme}.png`), img.toPNG());
  const icons = await js(`[...document.querySelectorAll('.ap')].map(a=>{const r=a.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,a.offsetWidth]})`);
  const dbg = w.webContents.debugger; dbg.attach('1.3'); await dbg.sendCommand('Performance.enable');
  const metrics = async () => Object.fromEntries((await dbg.sendCommand('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const m0 = await metrics();
  await js(`window.__fd=[];(()=>{let l=0;const f=t=>{if(l)window.__fd.push(t-l);l=t;if(!window.__stop)requestAnimationFrame(f)};requestAnimationFrame(f)})()`);
  const y = Math.round(icons[0][1]); const x0 = Math.round(icons[0][0] - 40), x1 = Math.round(icons[icons.length - 1][0] + 40);
  let widthsChanged = false;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i <= 60; i++) {
    const x = Math.round(pass ? x1 - (x1 - x0) * i / 60 : x0 + (x1 - x0) * i / 60);
    w.webContents.sendInputEvent({ type: 'mouseMove', x, y }); await wait(16);
    if (i === 30) { const ws = await js(`[...document.querySelectorAll('.ap')].map(a=>a.offsetWidth)`); if (ws.some((v, k) => v !== icons[k][2])) widthsChanged = true;
      if (pass === 0) { const im = await w.webContents.capturePage(); fs.writeFileSync(path.join(OUT, `dock-${theme}-magnified.png`), im.toPNG()); } }
  }
  const mid = await js(`Math.max(...[...document.querySelectorAll('.ap')].map(a=>+(a.dataset.s||1)))`);
  const m1 = await metrics();
  const fd = await js(`window.__stop=1; window.__fd`);
  const dropped = fd.filter(d => d > 25).length, worst = Math.max(...fd), avg = fd.reduce((a, b) => a + b, 0) / fd.length;
  const layouts = m1.LayoutCount - m0.LayoutCount, styles = m1.RecalcStyleCount - m0.RecalcStyleCount, layoutMs = (m1.LayoutDuration - m0.LayoutDuration) * 1000, styleMs = (m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000, scriptMs = (m1.ScriptDuration - m0.ScriptDuration) * 1000;
  log(`perf ${theme}: ${fd.length} frames, dropped ${dropped}, worst ${worst.toFixed(1)} ms, avg ${avg.toFixed(1)} ms; layouts ${layouts} (${layoutMs.toFixed(1)} ms), style recalcs ${styles} (${styleMs.toFixed(1)} ms), script ${scriptMs.toFixed(1)} ms`);
  ok(mid > 1.2, `${theme}: icons magnify under the pointer (peak scale ${mid.toFixed(2)})`);
  if (!LOOSE) {
    ok(!widthsChanged, `${theme}: magnification is transform only, the icons' layout boxes never change`);
    ok(mid < 1.75, `${theme}: magnification stays tasteful (peak ${mid.toFixed(2)} < 1.75)`);
    ok(layoutMs < 40, `${theme}: under 40 ms of layout for the whole sweep (${layoutMs.toFixed(1)} ms)`);
  }
  w.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 }); await wait(1400);
  const rest = await js(`[...document.querySelectorAll('.ap')].every(a=>Math.abs(+(a.dataset.s||1)-1)<.001)`);
  ok(rest, `${theme}: every icon settles back to rest after the pointer leaves`);
  if (!LOOSE) {
    const idle = await js(`new Promise(r=>{let c=0;const t0=performance.now();const o=new MutationObserver(()=>c++);o.observe(document.getElementById('apps'),{attributes:true,subtree:true,attributeFilter:['style','class']});setTimeout(()=>{o.disconnect();r(c)},1500)})`);
    ok(idle === 0, `${theme}: nothing on the apps changes once settled (${idle} style writes in 1.5 s)`);
    // the tooltip follows the hovered icon with no timer
    w.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(icons[2][0]), y }); await wait(500);
    const tip = await js(`(()=>{const t=document.getElementById('tip');const s=getComputedStyle(t);return {on:t.classList.contains('on'),text:t.textContent,op:+s.opacity}})()`);
    ok(tip.on && /Messages/.test(tip.text), `${theme}: the name shows above the hovered icon (${tip.text})`);
    const im = await w.webContents.capturePage(); fs.writeFileSync(path.join(OUT, `dock-${theme}-tip.png`), im.toPNG());
    // right-click menu
    w.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(icons[1][0]), y, button: 'right', clickCount: 1 }); w.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(icons[1][0]), y, button: 'right', clickCount: 1 });
    w.webContents.sendInputEvent({ type: 'contextMenu', x: Math.round(icons[1][0]), y });
    await wait(700); const ctx = await js(`getComputedStyle(document.getElementById('ctx')).display`);
    ok(ctx === 'block', `${theme}: right-click opens the app menu`);
    const im2 = await w.webContents.capturePage(); fs.writeFileSync(path.join(OUT, `dock-${theme}-menu.png`), im2.toPNG());
    // removing an app from the Dock can be undone
    const label = await js(`document.querySelectorAll('#ctx .it')[1].textContent`); ok(label === 'Remove from Dock', `the menu offers Remove from Dock (${label})`);
    await js(`__fake.reset(); document.querySelectorAll('#ctx .it')[1].click()`); await wait(500);
    const t1 = await js(`({on:document.getElementById('dtoast').classList.contains('on'),msg:document.getElementById('dtMsg').textContent,acts:JSON.stringify(__fake.acts())})`);
    ok(t1.on && /Removed Safari/.test(t1.msg) && /"pin"/.test(t1.acts), `an Undo toast appears after removing an app (${t1.msg})`);
    const im3 = await w.webContents.capturePage(); fs.writeFileSync(path.join(OUT, `dock-${theme}-undo.png`), im3.toPNG());
    await js(`document.getElementById('dtUndo').click()`); await wait(300);
    const t2 = await js(`({on:document.getElementById('dtoast').classList.contains('on'),n:__fake.acts().filter(a=>a[1]==='pin').length})`);
    ok(!t2.on && t2.n === 2, `Undo puts the app back and the toast leaves (${t2.n} pin actions)`);
  }
  ok(errs.length === 0, `${theme}: no console errors ${errs.slice(0, 2).join(' | ')}`);
  dbg.detach(); w.destroy();
}
app.whenReady().then(async () => { for (const t of ['dark', 'light']) await run(t); log(fails ? `FAILED ${fails}` : 'ALL PASS'); app.exit(fails ? 1 : 0); });
