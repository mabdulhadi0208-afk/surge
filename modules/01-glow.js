// Charge Glow — the original. Edge aurora on plug / unplug / low / full.
let timer = null, lowAlerted = false, fullAlerted = false, busy = false, pace = 8000;
module.exports = {
  id: 'glow', name: 'Charge Glow', icon: 'bolt', group: 'Glow', defaultEnabled: true,
  desc: 'Edge aurora when you plug in, warm sweep on unplug, red pulse on low battery, gold at 100%.',
  defaults: { theme: 'aurora', color: '#00FF85', batteryColor: false, intensity: 0.9, thickness: 150, duration: 3.6, speed: 1, showCapsule: true, unplugGlow: true, lowAlert: 20, fullGlow: true, sound: false, trayStyle: 'mark', trayMono: false, trayAnim: true },
  schema: [
    { k: 'theme', t: 'chips', label: 'Theme', opts: [['aurora','Aurora','#00FF85'],['solid','Solid','#FF2E8A'],['ember','Ember','#FF9500'],['ice','Ice','#7DF9FF']] },
    { k: 'color', t: 'color', label: 'Accent (Solid)', opts: ['#FF2E8A','#7B3DFF','#00C2FF','#FFA514','#00FF85','#FF4060','#FFFFFF'] },
    { k: 'batteryColor', t: 'toggle', label: 'Tint by battery level', hint: 'Red when low, green when full' },
    { k: 'intensity', t: 'range', label: 'Intensity', min: .15, max: 1, step: .01, fmt: 'pct' },
    { k: 'thickness', t: 'range', label: 'Thickness', min: 40, max: 400, step: 5, fmt: 'px' },
    { k: 'duration', t: 'range', label: 'Duration', min: 1.5, max: 8, step: .1, fmt: 's' },
    { k: 'speed', t: 'range', label: 'Flow speed', min: .3, max: 2.5, step: .05, fmt: 'x' },
    { k: 'showCapsule', t: 'toggle', label: 'Charge capsule', hint: 'Percent + state, bottom centre' },
    { k: 'unplugGlow', t: 'toggle', label: 'Glow on unplug' },
    { k: 'fullGlow', t: 'toggle', label: 'Gold glow at 100%' },
    { k: 'lowAlert', t: 'seg', label: 'Low battery pulse', opts: [[0,'Off'],[10,'10%'],[20,'20%'],[30,'30%']] },
    { k: 'sound', t: 'toggle', label: 'Chimes', hint: 'Soft glassy chimes on each event' },
    { k: 'trayStyle', t: 'seg', label: 'Menu bar', opts: process.platform === 'darwin' ? [['mark','Surge mark'],['chip','Charge chip'],['icon','Battery'],['both','Battery and %'],['pct','Mark and %']] : [['mark','Surge'],['icon','Battery'],['both','Battery and %'],['pct','Surge and %']] },
    { k: 'trayAnim', t: 'toggle', label: 'Animated battery', hint: 'The fill flows like liquid while charging, and flows once when the level changes. It never runs while the screen is locked or the Mac is idle.' },
    { k: 'trayMono', t: 'toggle', label: 'Monochrome icon', hint: process.platform === 'darwin' ? 'A plain black and white icon that macOS tints like its own, instead of Surge colours' : 'A plain icon instead of Surge colours' },
    { t: 'actions', label: 'Preview', opts: [['preview','Plug in'],['unplug','Unplug'],['low','Low'],['full','Full']] },
  ],
  onSettings(ctx) { const b = ctx.battery; if (!b) ctx.setTrayBattery?.(null, 'mark'); if (b) { const ts = ctx.mod('glow').trayStyle || 'mark'; ctx.setTrayBattery?.(b, ts); ctx.setTray('glow', { title: ts === 'both' || ts === 'pct' ? `${b.level}%` : '', menu: [{ label: 'Preview glow', click: () => ctx.fireGlow('preview') }] }); } },
  actions: { preview: (ctx, kind) => ctx.fireGlow(kind, kind === 'low' ? { level: 12 } : kind === 'full' ? { level: 100 } : {}) },
  start(ctx) {
    const s = () => ctx.mod('glow');
    const chime = n => s().sound && ctx.sysSound(n);
    const tick = () => { if (busy) return; busy = true; ctx.readBattery(b => { busy = false; if (!b) { if (timer && pace !== 60000) { pace = 60000; clearInterval(timer); timer = setInterval(tick, pace); } return; }
      const prev = ctx.battery; ctx.battery = b;
      if (prev && b.charging !== prev.charging) {
        if (b.charging) { lowAlerted = fullAlerted = false; ctx.fireGlow('plug'); chime('Glass'); }
        else if (s().unplugGlow) { ctx.fireGlow('unplug'); chime('Pop'); }
      } else if (prev && s().fullGlow && b.charging && b.level >= 100 && prev.level < 100 && !fullAlerted) { fullAlerted = true; ctx.fireGlow('full', { level: 100 }); chime('Hero'); }
      if (s().lowAlert > 0 && !b.charging && b.level <= s().lowAlert && !lowAlerted) { lowAlerted = true; ctx.fireGlow('low'); chime('Basso'); }
      if (b.level > s().lowAlert + 5) lowAlerted = false;
      const status = b.charged ? 'Fully charged' : b.holding ? 'Plugged in · charging on hold' : b.charging ? `Charging${b.remaining ? ' · ' + b.remaining + ' to full' : ''}` : `On battery${b.remaining ? ' · ' + b.remaining + ' left' : ''}`;
      const ts = s().trayStyle || 'mark'; ctx.setTrayBattery?.(b, ts);
      ctx.setTray('glow', { title: ts === 'both' || ts === 'pct' ? `${b.level}%` : '', menu: [{ label: status, enabled: false }, { label: 'Preview glow', click: () => ctx.fireGlow('preview') }] });
      // the pace follows what can change: plugging in and out arrive at once as power events, so the poll only tracks the level.
      // 8 s while charging or near the low-battery alert, 20 s on battery, 45 s when full on power.
      const next = b.charging && !b.charged ? 8000 : !b.charging && b.level <= s().lowAlert + 6 ? 8000 : !b.charging ? 20000 : 45000;
      if (timer && next !== pace) { pace = next; clearInterval(timer); timer = setInterval(tick, pace); }
    }); };
    tick(); pace = 8000; timer = setInterval(tick, pace);
    if (!module.exports._pm) { module.exports._pm = true; try { const { powerMonitor } = require('electron'); powerMonitor.on('resume', () => setTimeout(() => timer && tick(), 1500)); powerMonitor.on('on-ac', () => setTimeout(() => timer && tick(), 200)); powerMonitor.on('on-battery', () => setTimeout(() => timer && tick(), 200)); } catch {} }
  },
  stop(ctx) { clearInterval(timer); timer = null; ctx.setTrayBattery?.(null, 'mark'); },
};
