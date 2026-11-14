// Charge Glow — the original. Edge aurora on plug / unplug / low / full.
let timer = null, lowAlerted = false, fullAlerted = false, busy = false;
module.exports = {
  id: 'glow', name: 'Charge Glow', icon: 'bolt', group: 'Glow', defaultEnabled: true,
  desc: 'Edge aurora when you plug in, warm sweep on unplug, red pulse on low battery, gold at 100%.',
  defaults: { theme: 'aurora', color: '#00FF85', batteryColor: false, intensity: 0.9, thickness: 150, duration: 3.6, speed: 1, showCapsule: true, unplugGlow: true, lowAlert: 20, fullGlow: true, sound: true, trayStyle: 'chip' },
  schema: [
    { k: 'theme', t: 'chips', label: 'Theme', opts: [['aurora','Aurora','#00FF85'],['solid','Solid','#00D4FF'],['ember','Ember','#FF9500'],['ice','Ice','#7DF9FF']] },
    { k: 'color', t: 'color', label: 'Accent (Solid)', opts: ['#00FF85','#00D4FF','#7A5CFF','#FF3DF0','#FFD60A','#FF1744','#FFFFFF'] },
    { k: 'batteryColor', t: 'toggle', label: 'Tint by battery level', hint: 'Red when low, green when full' },
    { k: 'intensity', t: 'range', label: 'Intensity', min: .15, max: 1, step: .01, fmt: 'pct' },
    { k: 'thickness', t: 'range', label: 'Thickness', min: 40, max: 400, step: 5, fmt: 'px' },
    { k: 'duration', t: 'range', label: 'Duration', min: 1.5, max: 8, step: .1, fmt: 's' },
    { k: 'speed', t: 'range', label: 'Flow speed', min: .3, max: 2.5, step: .05, fmt: 'x' },
    { k: 'showCapsule', t: 'toggle', label: 'Charge capsule', hint: 'Percent + state, bottom centre' },
    { k: 'unplugGlow', t: 'toggle', label: 'Glow on unplug' },
    { k: 'fullGlow', t: 'toggle', label: 'Gold glow at 100%' },
    { k: 'lowAlert', t: 'seg', label: 'Low battery pulse', opts: [[0,'Off'],[10,'10%'],[20,'20%'],[30,'30%']] },
    { k: 'sound', t: 'toggle', label: 'Chimes', hint: 'Soft system sounds on each event' },
    { k: 'trayStyle', t: 'seg', label: 'Menu bar', opts: process.platform === 'darwin' ? [['chip','Charge chip'],['both','Battery + %'],['icon','Battery'],['pct','% only'],['bolt','Bolt']] : [['both','Battery + %'],['icon','Battery'],['pct','% only'],['bolt','Bolt']] },
    { t: 'actions', label: 'Preview', opts: [['preview','Plug in'],['unplug','Unplug'],['low','Low'],['full','Full']] },
  ],
  onSettings(ctx) { const b = ctx.battery; if (b) { const ts = ctx.mod('glow').trayStyle || 'chip'; ctx.setTrayBattery?.(ts === 'pct' || ts === 'bolt' ? null : b, ts); ctx.setTray('glow', { title: ts === 'icon' || ts === 'bolt' || (ts === 'chip' && process.platform === 'darwin') ? '' : `${b.level}%`, menu: [{ label: 'Preview glow', click: () => ctx.fireGlow('preview') }] }); } },
  actions: { preview: (ctx, kind) => ctx.fireGlow(kind, kind === 'low' ? { level: 12 } : kind === 'full' ? { level: 100 } : {}) },
  start(ctx) {
    const s = () => ctx.mod('glow');
    const chime = n => s().sound && ctx.sysSound(n);
    const tick = () => { if (busy) return; busy = true; ctx.readBattery(b => { busy = false; if (!b) return;
      const prev = ctx.battery; ctx.battery = b;
      if (prev && b.charging !== prev.charging) {
        if (b.charging) { lowAlerted = fullAlerted = false; ctx.fireGlow('plug'); chime('Glass'); }
        else if (s().unplugGlow) { ctx.fireGlow('unplug'); chime('Pop'); }
      } else if (prev && s().fullGlow && b.charging && b.level >= 100 && prev.level < 100 && !fullAlerted) { fullAlerted = true; ctx.fireGlow('full', { level: 100 }); chime('Hero'); }
      if (s().lowAlert > 0 && !b.charging && b.level <= s().lowAlert && !lowAlerted) { lowAlerted = true; ctx.fireGlow('low'); chime('Basso'); }
      if (b.level > s().lowAlert + 5) lowAlerted = false;
      const status = b.charged ? 'Fully charged' : b.holding ? 'Plugged in · charging on hold' : b.charging ? `Charging${b.remaining ? ' · ' + b.remaining + ' to full' : ''}` : `On battery${b.remaining ? ' · ' + b.remaining + ' left' : ''}`;
      const ts = s().trayStyle || 'chip'; ctx.setTrayBattery?.(ts === 'pct' || ts === 'bolt' ? null : b, ts);
      ctx.setTray('glow', { title: ts === 'icon' || ts === 'bolt' || (ts === 'chip' && process.platform === 'darwin') ? '' : `${b.level}%`, menu: [{ label: status, enabled: false }, { label: 'Preview glow', click: () => ctx.fireGlow('preview') }] });
    }); };
    tick(); timer = setInterval(tick, 1200);
    if (!module.exports._pm) { module.exports._pm = true; try { const { powerMonitor } = require('electron'); powerMonitor.on('resume', () => setTimeout(() => timer && tick(), 1500)); powerMonitor.on('on-ac', () => setTimeout(() => timer && tick(), 200)); powerMonitor.on('on-battery', () => setTimeout(() => timer && tick(), 200)); } catch {} }
  },
  stop(ctx) { clearInterval(timer); timer = null; ctx.setTrayBattery?.(null); },
};
