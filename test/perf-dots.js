// CPU of all Surge processes for 30 s with Settings open on a hero (the drifting dots running), then with Settings
// unfocused (the dots pause). Writes /tmp/surge-perf-dots.log
const fs = require('fs'); const LOGF = '/tmp/surge-perf-dots.log'; try { fs.unlinkSync(LOGF); } catch {}
const LOG = m => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
const T = require('./_boot.js'); const { app, wait, find, BrowserWindow } = T;
async function cpu(label) { app.getAppMetrics(); await wait(30000); const m = app.getAppMetrics(); LOG(`${label.padEnd(44)} ${m.reduce((a, p) => a + p.cpu.percentCPUUsage, 0).toFixed(2)}% CPU, all Surge processes, 30 s`); }
app.whenReady().then(async () => {
  await wait(4000); require('electron').ipcMain.emit('open:settings', {}); await wait(3000); const s = find(/settings\.html/); s.show(); s.focus(); if (process.env.PROBE_CSS) await s.webContents.insertCSS(process.env.PROBE_CSS); await wait(3000);
  const st = await s.webContents.executeJavaScript(`({ blur: document.documentElement.classList.contains('lm-blur'), hidden: document.hidden })`); LOG('settings state ' + JSON.stringify(st));
  await s.webContents.executeJavaScript(`dispatchEvent(new PointerEvent('pointermove')); 1`);
  app.getAppMetrics(); await wait(15000); { const m = app.getAppMetrics(); LOG(`${'Settings focused, in use (dots drifting)'.padEnd(44)} ${m.reduce((a, p) => a + p.cpu.percentCPUUsage, 0).toFixed(2)}% CPU, all Surge processes, 15 s`); }
  await wait(8000); await cpu('Settings focused, untouched for 20 s (dots settle)');
  await s.webContents.executeJavaScript(`document.documentElement.classList.add('lm-blur'); 1`);   // what a blur event does (xvfb has no window manager to take focus away)
  await cpu('Settings open, not focused (dots paused)');
  s.hide(); await wait(1000); await cpu('Settings hidden');
  app.exit(0);
});
