// 3.1: the flow hover, checked like Lumen's test/flow451. On every Surge page, every element with the flow hover is put
// into :hover (DevTools forcePseudoState), the circle is allowed to finish growing, and then its label, icons, key caps
// and SVG strokes must contrast with the colour that flowed in: at least 3:1, in light and in dark. The circle must stay
// under the label (z-index), so it can never cover the text. Also checks the 3.1 Settings additions: the shortcut sheet
// opens with ?, export and import round-trip, reset can be undone, and Settings remembers where it was.
// Run: xvfb-run -a npx electron test/flow31.js --no-sandbox   (PASS/FAIL lines also in /tmp/surge-flow31.log)
const fs = require('fs'), path = require('path'), os = require('os');
const LOGF = '/tmp/surge-flow31.log'; try { fs.unlinkSync(LOGF); } catch {}
const EXP = path.join(os.tmpdir(), 'surge-flow31-export.json'); try { fs.unlinkSync(EXP); } catch {}
process.env.SURGE_TEST_EXPORT = EXP; process.env.SURGE_TEST_IMPORT = EXP;
process.env.SURGE_TEST_MODULES = JSON.stringify({ keys: { enabled: true }, clip: { enabled: true }, caffeine: { enabled: true }, focus: { enabled: true } });
const T = require('./_boot.js'); const { app, BrowserWindow, wait, find, tray, DIR } = T;
const { ipcMain, nativeTheme } = require('electron');
let fails = 0; const log = m => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
const ok = (c, m) => { log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
setTimeout(() => { log('TIMEOUT'); app.exit(1); }, 240000);
const SEL = '.btn,.chip,.seg button:not(.on),.mi:not(.st),.m,.q,nav button:not(.on),.pr,.sp .tab,.wc button,.x,.w.wb,.w.fl,#ctx .it,.media .c button,#dtoast button,.lnk.fl,.it.fl';
// in-page helpers: parse a CSS colour (rgb/rgba/color(srgb ...)), blend over a backdrop, WCAG contrast
const HELP = `(() => { if (window.__fl) return; const P = c => { const m = String(c).match(/[\\d.]+/g) || [0, 0, 0]; let [r, g, b, a] = m.map(Number); if (/^color\\(/.test(c)) { r *= 255; g *= 255; b *= 255; } return { r, g, b, a: a === undefined ? 1 : a }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const CR = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  window.__fl = { P, over, CR }; })()`;
async function checkPage(w, label, theme) {
  if (!w || w.isDestroyed()) return ok(false, `${theme} ${label}: window missing`);
  const wc = w.webContents; await wc.executeJavaScript(HELP);
  const dbg = wc.debugger; try { dbg.attach('1.3'); } catch {}
  await dbg.sendCommand('DOM.enable'); await dbg.sendCommand('CSS.enable');
  const doc = await dbg.sendCommand('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await dbg.sendCommand('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: SEL });
  let n = 0, bad = [];
  for (const id of nodeIds.slice(0, 40)) {
    let tag; try { tag = await dbg.sendCommand('DOM.resolveNode', { nodeId: id }); } catch { continue; }
    const visible = await dbg.sendCommand('Runtime.callFunctionOn', { objectId: tag.object.objectId, functionDeclaration: 'function(){ const r=this.getBoundingClientRect(); const s=getComputedStyle(this); return r.width>4&&r.height>4&&s.visibility!=="hidden"&&s.display!=="none"&&!!this.offsetParent&&!this.disabled; }', returnByValue: true });
    if (!visible.result.value) continue;
    await dbg.sendCommand('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: ['hover'] });
    await new Promise(r => setTimeout(r, 650));
    const res = await dbg.sendCommand('Runtime.callFunctionOn', { objectId: tag.object.objectId, returnByValue: true, functionDeclaration: `function(){ const F=window.__fl, cs=getComputedStyle(this), bs=getComputedStyle(this,'::before');
      if (bs.content==='none'||bs.content==='normal') return { skip:'no circle' };
      const m=new DOMMatrix(bs.transform==='none'?undefined:bs.transform); const grown=m.a>.95;
      const fill=F.P(bs.backgroundColor); const base=F.over(fill,{r:128,g:128,b:128,a:1});
      const zi=bs.zIndex; const parts=[this,...this.querySelectorAll('*')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&(e===this?!!this.innerText.trim():(e.tagName==='svg'||e.tagName==='KBD'||(e.childNodes.length&&[...e.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())))); });
      let worst=99, what=''; for(const e of parts){ const s=getComputedStyle(e); const col=e.tagName==='svg'?(s.stroke&&s.stroke!=='none'?s.stroke:s.fill||s.color):s.color; const c=F.over(F.P(col),base); const r=F.CR(c,base); if(r<worst){ worst=r; what=(e.className&&String(e.className.baseVal??e.className))||e.tagName; } }
      return { grown, worst:+worst.toFixed(2), what, zi, label:(this.innerText||this.title||this.id||this.className).trim().slice(0,28) }; }` });
    await dbg.sendCommand('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: [] });
    const v = res.result.value; if (!v || v.skip) continue; n++;
    if (!v.grown || v.worst < 3 || !(v.zi === '-1' || v.zi === '0')) bad.push(`${v.label} (${v.worst}:1 ${v.what}${v.grown ? '' : ', circle did not grow'}${v.zi === '-1' || v.zi === '0' ? '' : ', circle above the label z ' + v.zi})`);
  }
  try { dbg.detach(); } catch {}
  ok(n > 0 && bad.length === 0, `${theme} ${label}: ${n} flow-hover elements, every label flips to at least 3:1 under the circle${bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''}`);
}
function fakeWin(file, env) { Object.assign(process.env, env || {}); const w = new BrowserWindow({ width: 1320, height: 520, show: true, webPreferences: { preload: path.join(__dirname, '_fakeapi.js'), contextIsolation: true } }); return w.loadFile(path.join(__dirname, '..', file)).then(() => w); }
app.whenReady().then(async () => {
  await wait(4500);
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme; await wait(400);
    ipcMain.emit('open:settings', {}); await wait(2500); const s = find(/settings\.html/);
    for (const p of ['all', 'about', 'keys']) { await s.webContents.executeJavaScript(`go(${JSON.stringify(p)}); 1`); await wait(900); await checkPage(s, 'Settings ' + p, theme); }
    tray('click').fn(); await wait(1500); const pop = find(/popover\.html/); pop.removeAllListeners('blur'); await checkPage(pop, 'menu-bar popover', theme); pop.hide();
    const rc = tray('right-click'); if (rc) { rc.fn(); await wait(1200); await checkPage(find(/menu\.html/), 'right-click menu', theme); find(/menu\.html/)?.hide(); }
    for (const st of ['available', 'ready', 'error']) { const w = await fakeWin('update.html', { FAKE_UPDATER: JSON.stringify({ status: st, current: '3.0.6', latest: '3.1.0', whatsNew: ['One', 'Two'], error: 'GitHub did not answer' }) }); await wait(900); await checkPage(w, 'update card ' + st, theme); w.destroy(); }
    const d = await fakeWin('dock.html'); await wait(1500); d.webContents.send('fake:emit', 'dock:data', { battery: { level: 70 }, volume: 40, focus: { phase: 'idle' }, caffeine: { on: false } }); await wait(400); await checkPage(d, 'Surge Dock', theme); d.destroy();
  }
  // 3.1 Settings additions
  const s = find(/settings\.html/), js = c => s.webContents.executeJavaScript(c);
  await js(`go('about'); document.activeElement && document.activeElement.blur(); 1`); await wait(600);
  s.webContents.sendInputEvent({ type: 'keyDown', keyCode: '/', modifiers: ['shift'] }); s.webContents.sendInputEvent({ type: 'keyUp', keyCode: '/', modifiers: ['shift'] }); await wait(700);
  const sh = await js(`({ on: document.getElementById('sheet').classList.contains('show'), rows: document.querySelectorAll('#sheet .sk').length, text: document.getElementById('sheet').innerText })`);
  ok(sh.on && sh.rows >= 15 && /Show or hide Surge Dock/.test(sh.text), `? opens the shortcut sheet (${sh.rows} shortcuts)`);
  s.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await wait(400);
  ok(!(await js(`document.getElementById('sheet').classList.contains('show')`)), 'Esc closes the shortcut sheet');
  await js(`document.getElementById('expBtn').click(); 1`); await wait(800);
  const exp = fs.existsSync(EXP) ? JSON.parse(fs.readFileSync(EXP, 'utf8')) : null;
  ok(!!exp && exp.settings && exp.settings.modules && exp.settings.modules.keys && !('settingsBounds' in exp.settings) && !('whatsNewSeen' in exp.settings), 'Export writes every module setting, without this Mac\'s window spots or one-time flags');
  ok(/Saved/.test(await js(`document.getElementById('utMsg').textContent`)), 'Export says where it saved');
  const S = global.__surge; S.applyPatch({ modules: { caffeine: { enabled: false } } }); await wait(300);
  await js(`document.getElementById('impBtn').click(); 1`); await wait(900);
  const cur = () => JSON.parse(fs.readFileSync(path.join(DIR, 'settings.json'), 'utf8'));
  ok(cur().modules.caffeine.enabled === true, 'Import brings the exported settings back');
  ok(/Imported/.test(await js(`document.getElementById('utMsg').textContent`)) && await js(`getComputedStyle(document.getElementById('utBtn')).display!=='none'`), 'Import says how many modules came back and offers Undo');
  await js(`document.getElementById('utBtn').click(); 1`); await wait(900);
  ok(cur().modules.caffeine.enabled === false, 'Undo puts the settings back as they were before the import');
  fs.writeFileSync(EXP, '{"hello": 1}'); await js(`document.getElementById('impBtn').click(); 1`); await wait(700);
  ok(/not a Surge settings file/.test(await js(`document.getElementById('utMsg').textContent`)), 'a file that is not Surge settings is refused with a plain message');
  await js(`document.getElementById('reset').click(); 1`); await wait(900);
  ok(cur().modules.keys.enabled !== true || cur().modules.caffeine.enabled !== false, 'Reset puts everything back to defaults');
  await js(`document.getElementById('utBtn').click(); 1`); await wait(900);
  ok(cur().modules.keys.enabled === true && cur().modules.clip.enabled === true, 'Undo after Reset restores the settings');
  // Settings remembers where it was
  s.setBounds({ x: 120, y: 90, width: 960, height: 640 }); await wait(900); s.close(); await wait(800);
  const b = cur().settingsBounds; ok(b && b.width === 960 && b.height === 640, `Settings saved its size (${b && b.width}x${b && b.height})`);
  ipcMain.emit('open:settings', {}); await wait(2000); const s2 = find(/settings\.html/); const nb = s2.getBounds();
  ok(nb.width === 960 && nb.height === 640, `Settings reopens at the same size (${nb.width}x${nb.height} at ${nb.x},${nb.y})`);
  // clipboard history: Clear can be undone, and Esc clears the search before it closes the picker
  try { const C = T.mod('09-clipboard.js'), cx = { ...require('./_ctx.js')(), mod: () => ({ max: 25, autoPaste: false }) };
    for (const t of ['first copy', 'second copy', 'third copy']) C.actions.paste(cx, t);
    await C._picker(require('./_ctx.js')()); await wait(900); const cw = find(/clip\.html/), cj = c => cw.webContents.executeJavaScript(c);
    await cj(`document.getElementById('clear').click(); 1`); await wait(500);
    const a1 = await cj(`({ n: document.querySelectorAll('#list .it').length, t: document.getElementById('clear').textContent })`);
    ok(a1.n === 0 && a1.t === 'Undo clear', `Clear history empties the list and offers Undo (${a1.n} left, "${a1.t}")`);
    await cj(`document.getElementById('clear').click(); 1`); await wait(500);
    const a2 = await cj(`document.querySelectorAll('#list .it').length`); ok(a2 === 3 && C.actions.list().length === 3, `Undo clear brings all ${a2} copies back`);
    await cj(`const q=document.getElementById('q'); q.value='second'; q.dispatchEvent(new Event('input')); 1`); await wait(200);
    cw.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await wait(300);
    const a3 = await cj(`({ q: document.getElementById('q').value, n: document.querySelectorAll('#list .it').length })`);
    ok(a3.q === '' && a3.n === 3 && cw.isVisible(), 'Esc clears the search first and keeps the picker open');
  } catch (e) { ok(false, 'clipboard checks: ' + e.message); }
  log(fails ? `FAILED ${fails}` : 'ALL PASS'); app.exit(fails ? 1 : 0);
});
