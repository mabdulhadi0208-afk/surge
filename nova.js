// Surge 3.0 Nova, the renderer half: the line icons, each module's colour, short names, and the one-shot entrance helper.
// No timers, no loops, no pointer tracking: everything here runs once when it is called.
(() => {
  const ICONS = {
    snap: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M12 4v16M12 12h9"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
    mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v3"/>',
    ripple: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.2"/><path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5M2.5 12A9.5 9.5 0 0 0 12 21.5"/>',
    spot: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    moon: '<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.6 6.6 0 0 0 10 10z"/>',
    caps: '<path d="M12 4 4.5 12h4.5v4.5h6V12h4.5z"/><path d="M9 20h6"/>',
    coffee: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5V6M12 3.5V6"/>',
    clip: '<rect x="6" y="4" width="12" height="17" rx="2.5"/><path d="M9.5 4V2.6h5V4M9 10h6M9 14h4"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
    wifi: '<path d="M2 9a16 16 0 0 1 20 0M5 12.8a11 11 0 0 1 14 0M8.5 16.4a6 6 0 0 1 7 0"/><circle cx="12" cy="20" r=".8"/>',
    contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>',
    wpm: '<path d="M3 17l4-9 4 9 4-9 4 9"/>',
    keys: '<path d="M15 7a4 4 0 1 1-2.8 6.8L7 19H4v-3l5.2-5.2A4 4 0 0 1 15 7z"/><path d="M15.5 9.5h.01"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    dock: '<rect x="2" y="14.5" width="20" height="6.5" rx="3.2"/><path d="M6 17.8h.01M10 17.8h.01M14 17.8h.01M18 17.8h.01M7 3.5h10M5 8h14"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4z"/>',
    notes: '<path d="M6 3.5h9l3 3v14H6z"/><path d="M14.5 3.5V7H18M9 11h6M9 14.5h6M9 18h3.5"/>',
    speaker: '<path d="M11 5 6 9H2.5v6H6l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.8 5.2a9.5 9.5 0 0 1 0 13.6"/>',
    mute: '<path d="M11 5 6 9H2.5v6H6l5 4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
    alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.3h.01"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    down: '<path d="M12 4v12M6.5 10.5 12 16l5.5-5.5M5 20h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    star: '<path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
    spark: '<path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5z"/><path d="M19 15.5c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3z"/>',
    power: '<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
    rocket: '<path d="M5 15c-1.5 1.5-2 4.5-2 6 1.5 0 4.5-.5 6-2"/><path d="M14.5 4.5C17.5 1.5 21 2 21.5 2.5S22.5 6.5 19.5 9.5L12 17l-5-5z"/><path d="M12 7H7.5L5 9.5l2.5 2.5M17 12v4.5L14.5 19 12 16.5"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    apps: '<rect x="3" y="3" width="7.5" height="7.5" rx="2.2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2"/><circle cx="17.25" cy="17.25" r="3.75"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/>',
    pin: '<path d="M12 17v5M8 3h8l-1 6 3 3H6l3-3z"/>',
    plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
    heart: '<path d="M12 20.5s-8-4.6-8-10.5a4.5 4.5 0 0 1 8-2.8 4.5 4.5 0 0 1 8 2.8c0 5.9-8 10.5-8 10.5z"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  };
  // every module wears its own section hue, from Lumen's SEC_HUE family
  const HUE = { updater: 'green', glow: 'pink', net: 'cyan', keys: 'violet', mouse: 'indigo', chime: 'amber', ripple: 'cyan', spotlight: 'orange', tint: 'amber', caps: 'lime', dock: 'blue', snap: 'indigo', caffeine: 'orange', clip: 'cyan', focus: 'pink', breaks: 'green', typing: 'violet', stats: 'blue', dark: 'indigo', hotkeys: 'violet' };
  const SHORT = { 'Keyboard Sounds': 'Keyboard', 'Mouse Sounds': 'Mouse', 'Cursor Spotlight': 'Spotlight', 'Clipboard History': 'Clipboard', 'Break Reminder': 'Breaks', 'Auto Dark Mode': 'Dark Mode', 'Typing Stats': 'Typing', 'Caps Lock HUD': 'Caps Lock', 'Hourly Chime': 'Chime', 'Charge Glow': 'Glow', 'Network Glow': 'Network', 'Click Ripple': 'Ripple', 'System Stats': 'Stats', 'Focus Timer': 'Focus', 'Surge Dock': 'Dock', 'Auto Update': 'Updates', 'Window Snap': 'Snap' };
  const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS.bolt}</svg>`;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // one entrance: number the children and replay the staggered spring (called on open, never on a timer)
  function stage(el, sel) { if (!el) return; const kids = sel ? el.querySelectorAll(sel) : el.children; let i = 0; for (const k of kids) k.style.setProperty('--i', i++); el.classList.remove('stage'); void el.offsetWidth; el.classList.add('stage'); }
  // ---- Lumen's hero backdrop (pages/app.js heroBack + heroDots): four light pools, seeded drifting dots, a faint
  // constellation, a rim glint, and the giant glyph in three layers (glow, deep shadow, crisp outline)
  const DOTS = new Map();
  function heroDots(seed) {
    let h = 2166136261; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
    // the fine dots are painted ONCE into a small tile image (a canvas), so showing a hero costs one image fill instead of
    // fifteen gradient layers; the tile is tinted white and the layer's colour comes from a soft overlay mix
    // The PNG encode of that tile is the slow part of building a hero, so each finished tile is kept (in memory and in
    // localStorage, keyed by the seed and the screen scale): the same seed always paints the same dots, so the picture is identical.
    const dotsLayer = sets => { const W = 300, H = 240, d = Math.min(2, window.devicePixelRatio || 1), pts = [];
      for (const [n, , r, alpha] of sets) for (let i = 0; i < n * 2; i++) pts.push([rnd() * W, rnd() * H, r, alpha]);
      const key = `surge-dots-1|${seed}|${d}|${JSON.stringify(sets)}`; let url = DOTS.get(key); if (!url) { try { url = localStorage.getItem(key); } catch {} }
      if (!url) { const c = document.createElement('canvas'); c.width = W * d; c.height = H * d; const x = c.getContext('2d'); x.scale(d, d);
        for (const [cx, cy, r, alpha] of pts) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r + 1.2); g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(r / (r + 1.2), `rgba(255,255,255,${alpha})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r + 1.2, 0, Math.PI * 2); x.fill(); }
        url = c.toDataURL(); try { localStorage.setItem(key, url); } catch {} }
      DOTS.set(key, url);
      return `background-image:url(${url});background-size:${W}px ${H}px;background-position:${Math.round(rnd() * W)}px ${Math.round(rnd() * H)}px`; };
    const svg = x => `url('data:image/svg+xml,${encodeURIComponent(x)}')`;
    const star = (x, y, r) => `M${x} ${(y - r).toFixed(1)}Q${x} ${y} ${(x + r).toFixed(1)} ${y}Q${x} ${y} ${x} ${(y + r).toFixed(1)}Q${x} ${y} ${(x - r).toFixed(1)} ${y}Q${x} ${y} ${x} ${(y - r).toFixed(1)}Z`;
    let sp = '', specks = '';
    for (let i = 0; i < 3; i++) sp += star(Math.round(20 + rnd() * 340), Math.round(20 + rnd() * 260), 3.5 + rnd() * 4);
    for (let i = 0; i < 4; i++) { const x = Math.round(10 + rnd() * 360), y = Math.round(10 + rnd() * 280); specks += `<circle cx="${x}" cy="${y}" r="5" fill="white" fill-opacity=".12"/><circle cx="${x}" cy="${y}" r="1.7" fill="white"/>`; }
    const bright = `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="300">${specks}<path d="${sp}" fill="white"/></svg>`;
    const pts = []; for (let i = 0; i < 6; i++) pts.push([Math.round(480 + rnd() * 470), Math.round(40 + rnd() * 240)]); pts.sort((a, b) => a[0] - b[0]);
    const cons = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 320" preserveAspectRatio="xMidYMid slice"><path d="M${pts.map(q => q.join(' ')).join('L')}" fill="none" stroke="white" stroke-opacity=".24" stroke-width=".9" stroke-dasharray="2 4"/>${pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1.5 : 2.4}" fill="white" fill-opacity="${i % 3 ? .5 : .85}"/>`).join('')}</svg>`;
    return `<i class="hero-dots" aria-hidden="true"><b class="hd-cons" style="background-image:${svg(cons)}"></b><i class="hd1" style="${dotsLayer([[9, 0, 1, .85], [6, 0, 1.4, .7]])}"></i><i class="hd3" style="background-image:${svg(bright)};background-size:380px 300px;background-position:${Math.round(rnd() * 380)}px ${Math.round(rnd() * 300)}px"></i></i><i class="hero-glint" aria-hidden="true"></i>`;
  }
  const heroBack = (glyph, seed, dots = true) => { const g = ic(glyph); return `${dots ? heroDots(seed || glyph) : ''}<span class="hero-art glow" aria-hidden="true">${g}</span><span class="hero-art depth" aria-hidden="true">${g}</span><span class="hero-art" aria-hidden="true">${g}</span>`; };
  // the dots stop when a hero is off screen, the window is hidden, or the window is not focused
  const dotsIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('dots-off', !e.isIntersecting))) : null;
  const R = document.documentElement;
  document.addEventListener('visibilitychange', () => R.classList.toggle('lm-hidden', document.hidden));
  addEventListener('blur', () => R.classList.add('lm-blur')); addEventListener('focus', () => R.classList.remove('lm-blur'));
  if (!document.hasFocus()) R.classList.add('lm-blur');
  // ...and settle 20 s after you last moved the pointer, scrolled or typed in the window (they wake on the next touch)
  let stillT = 0, lastPoke = 0; const poke = () => { const n = Date.now(); if (n - lastPoke < 2000) return; lastPoke = n; R.classList.remove('lm-still'); clearTimeout(stillT); stillT = setTimeout(() => R.classList.add('lm-still'), 20000); };
  for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'focus']) addEventListener(ev, poke, { passive: true, capture: true }); poke();
  // turn every <div class="hero"> holding a <div class="wm" data-g="glyph"> into a full Lumen hero, and play its entrance
  function hero(el, glyph, seed, opts = {}) { if (!el) return; el.querySelectorAll(':scope > .hero-orb, :scope > .hero-dots, :scope > .hero-glint, :scope > .hero-art, :scope > .wm').forEach(n => n.remove());
    el.insertAdjacentHTML('afterbegin', heroBack(glyph, seed, opts.dots !== false && !el.classList.contains('mini'))); dotsIO?.observe(el); replay(el); }
  function replay(el) { if (!el) return; el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
  function upgrade(root = document) { root.querySelectorAll('.hero').forEach(el => { const wm = el.querySelector(':scope > .wm'); const g = el.dataset.glyph || wm?.dataset.g; if (g && !el.querySelector(':scope > .hero-art')) hero(el, g, el.dataset.seed || g); }); }
  window.Nova = { ICONS, HUE, SHORT, ic, esc, stage, hero, heroBack, upgrade, replay, hue: id => 'h-' + (HUE[id] || 'blue'), short: n => SHORT[n] || n };
})();
