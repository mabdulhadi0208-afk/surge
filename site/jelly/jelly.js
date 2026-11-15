/* ================= JELLY: underdamped spring physics for the whole page =================
   One shared loop, real damped springs (semi-implicit Euler, 240 Hz sub-steps). Everything overshoots and wobbles before it rests. */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.documentElement, FINE = matchMedia('(hover:hover) and (pointer:fine)').matches;
  root.classList.add('jl');
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---- engine ---- */
  class Sp { constructor(x = 0, k = 200, z = .15, e = .0008) { this.x = x; this.v = 0; this.t = x; this.k = k; this.c = 2 * z * Math.sqrt(k); this.e = e; }
    step(dt) { const n = Math.ceil(dt * 240), h = dt / n; for (let i = 0; i < n; i++) { this.v += (-this.k * (this.x - this.t) - this.c * this.v) * h; this.x += this.v * h; } }
    get rest() { return Math.abs(this.x - this.t) < this.e && Math.abs(this.v) < this.e * 6; }
    snap() { this.x = this.t; this.v = 0; } }
  const tickers = new Set(); let raf = 0, last = 0;
  const frame = now => { raf = 0; const dt = Math.min(.034, (now - last) / 1000 || .016); last = now; for (const t of [...tickers]) { let on = false; try { on = t(dt); } catch (e) { console.error(e); } if (!on) tickers.delete(t); } if (tickers.size) raf = requestAnimationFrame(frame); };
  const run = t => { tickers.add(t); if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  /* ---- jelly bodies: buttons, chips, links, cards ---- */
  const BTN = '.btn,.chip,nav a.l,nav .logo,.sw b,.pr,.tab', CARD = '.mcard,.mini';
  const CFG = [
    ['.sw b', { hover: 1.5, press: .6, pull: .35, squash: .4, kick: 3 }],
    ['.pr', { hover: 1.1, press: .6, pull: .25, squash: .3, kick: 2 }],
    ['.tab', { hover: 1.18, press: .6, pull: .3, squash: .35, kick: 2.2 }],
    ['nav a.l,nav .logo', { hover: 1.28, press: .6, pull: .5, squash: .38, kick: 1.5 }],
    [BTN, { hover: 1.3, press: .6, pull: .5, squash: .38, kick: 1.5 }],
    [CARD, { hover: 1.07, press: .95, pull: 0, squash: .1, kick: 1.1, tilt: 25 }]];
  const bodies = new WeakMap();
  function body(el) {
    let b = bodies.get(el); if (b) return b;
    const o = Object.assign({ tilt: 0 }, (CFG.find(([s]) => el.matches(s)) || CFG[4])[1]);
    const S = new Sp(1, o.tilt ? 150 : 260, o.tilt ? .17 : .13), Q = new Sp(0, 320, .12), X = new Sp(0, 170, .2, .04), Y = new Sp(0, 170, .2, .04), RX = new Sp(0, 130, .15, .01), RY = new Sp(0, 130, .15, .01);
    b = { el, o, S, Q, X, Y, RX, RY, hov: false, down: false, cx: 0, cy: 0, w: 0, h: 0, on: false };
    const apply = () => { const s = S.x; el.style.scale = `${(s * (1 + Q.x)).toFixed(4)} ${(s * (1 - Q.x * .9)).toFixed(4)}`;
      if (o.pull) el.style.translate = `${X.x.toFixed(2)}px ${Y.x.toFixed(2)}px`;
      if (o.tilt) el.style.transform = `perspective(900px) rotateX(${RX.x.toFixed(2)}deg) rotateY(${RY.x.toFixed(2)}deg)`; };
    const sps = [S, Q, X, Y, RX, RY];
    b.tick = dt => { for (const s of sps) s.step(dt); apply();
      if (sps.every(s => s.rest)) { for (const s of sps) s.snap(); if (!b.hov && !b.down && S.t === 1) { el.style.scale = ''; el.style.translate = ''; el.style.transform = ''; el.style.willChange = ''; } else apply(); b.on = false; return false; } return true; };
    b.wake = () => { if (b.on) return; b.on = true; el.style.willChange = o.tilt ? 'scale,transform' : 'scale,translate'; run(b.tick); };
    b.base = () => b.down ? o.press : b.hov ? o.hover : 1;
    bodies.set(el, b); return b;
  }
  const hovered = new Set();
  addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const el = e.target.closest && e.target.closest(BTN + ',' + CARD); if (!el || el.contains(e.relatedTarget)) return;
    const b = body(el), o = b.o; b.hov = true; hovered.add(b); b.S.t = b.base(); b.S.v += o.kick; b.Q.v += o.squash * 18; b.wake(); }, true);
  addEventListener('pointerout', e => { if (e.pointerType !== 'mouse') return; const el = e.target.closest && e.target.closest(BTN + ',' + CARD); if (!el || el.contains(e.relatedTarget)) return;
    const b = body(el), o = b.o; b.hov = false; b.down = false; hovered.delete(b); b.S.t = 1; b.S.v -= o.kick * .6; b.Q.v -= o.squash * 14; b.X.t = b.Y.t = b.RX.t = b.RY.t = 0; b.wake(); }, true);
  let pressed = null;
  addEventListener('pointerdown', e => { const el = e.target.closest && e.target.closest(BTN + ',' + CARD); if (!el) return; const b = body(el); pressed = b;
    try { if (e.pointerType === 'mouse') el.setPointerCapture(e.pointerId); } catch (_) {} /* the button squashes under the pointer: keep the click on it */ b.down = true; b.S.t = b.o.press; b.Q.v -= b.o.squash * 10; b.wake(); }, true);
  const up = () => { const b = pressed; pressed = null; if (!b) return; b.down = false; b.S.t = b.hov ? b.o.hover : 1; b.S.v += b.o.kick * 1.8; b.Q.v += b.o.squash * 16; b.wake(); };
  addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
  let mvPend = null, mvOn = false;
  const mv = () => { const e = mvPend; mvPend = null; mvOn = false; if (!e) return false;
    for (const b of [...hovered]) { if (!b.el.isConnected) { hovered.delete(b); continue; } const r = b.el.getBoundingClientRect(), o = b.o;
      const cx = r.left + r.width / 2 - b.X.x, cy = r.top + r.height / 2 - b.Y.x, px = (e.clientX - cx), py = (e.clientY - cy);
      if (o.pull) { b.X.t = clamp(px * o.pull, -r.width * .38, r.width * .38); b.Y.t = clamp(py * o.pull, -r.height * .45, r.height * .45); }
      if (o.tilt) { const nx = clamp((e.clientX - r.left) / r.width, 0, 1), ny = clamp((e.clientY - r.top) / r.height, 0, 1); b.RY.t = (nx - .5) * 2 * o.tilt; b.RX.t = (.5 - ny) * 2 * o.tilt; b.el.style.setProperty('--x', nx * 100 + '%'); b.el.style.setProperty('--y', ny * 100 + '%'); }
      b.wake(); }
    return false; };
  addEventListener('pointermove', e => { if (!hovered.size) return; mvPend = e; if (!mvOn) { mvOn = true; run(mv); } }, { passive: true });

  /* ---- entrances: hand the element over to the engine once its burst-in has played ---- */
  new MutationObserver(recs => { for (const r of recs) { const t = r.target; if (t.classList.contains('in') && t.classList.contains('r') && !t.dataset.jd) { t.dataset.jd = 1; setTimeout(() => t.classList.add('rd'), 1700); } } })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });

  /* ---- cursor trail on loose springs ---- */
  if (FINE) {
    const N = 9, dots = [], px = { x: innerWidth / 2, y: innerHeight / 2 }; let seen = 0;
    for (let i = 0; i < N; i++) { const d = document.createElement('i'); d.className = 'jtr'; const s = 14 - i * 1.1; d.style.cssText = `width:${s}px;height:${s}px;margin:${-s / 2}px 0 0 ${-s / 2}px`; document.body.appendChild(d);
      dots.push({ d, x: new Sp(px.x, 110 - i * 5, .2, .3), y: new Sp(px.y, 110 - i * 5, .2, .3), a: .5 - i * .045 }); }
    addEventListener('pointermove', e => { px.x = e.clientX; px.y = e.clientY; seen = performance.now(); if (!trOn) { trOn = true; run(trTick); } }, { passive: true });
    let trOn = false;
    const trTick = dt => { let tx = px.x, ty = px.y, busy = performance.now() - seen < 1600;
      for (const t of dots) { t.x.t = tx; t.y.t = ty; t.x.step(dt); t.y.step(dt); const m = Math.min(1, Math.hypot(t.x.x - tx, t.y.x - ty) / 6 + .35);
        t.d.style.transform = `translate3d(${t.x.x.toFixed(1)}px,${t.y.x.toFixed(1)}px,0)`; t.d.style.opacity = busy ? (t.a * m).toFixed(3) : (t.a * m * Math.max(0, 1 - (performance.now() - seen - 1600) / 500)).toFixed(3);
        if (!t.x.rest || !t.y.rest) busy = true; tx = t.x.x; ty = t.y.x; }
      if (!busy || performance.now() - seen > 2300) { dots.forEach(t => t.d.style.opacity = 0); trOn = false; return false; } return true; };
  }

  /* ---- wheel scrolling that overshoots ~135px and bounces back, with a page that rubber-bands up to 300px past either end ---- */
  const FLOW = $$('header.hero,.mq,section,footer');
  let P = scrollY, T = P, V = 0, own = P, lastW = 0, eng = false;
  const maxY = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const SK = 60, SZ = .3, SC = 2 * SZ * Math.sqrt(SK);
  function scrollTick(dt) {
    const m = maxY(); if (performance.now() - lastW > 140 && (T < 0 || T > m)) T = clamp(T, 0, m);
    const n = Math.ceil(dt * 240), h = dt / n; for (let i = 0; i < n; i++) { V += (-SK * (P - T) - SC * V) * h; P += V * h; }
    const cl = clamp(P, 0, m), over = P - cl, soft = 300 * Math.tanh(over / 300);
    if (Math.abs(cl - own) > .01) { scrollTo(0, cl); own = scrollY; }
    const ty = soft ? (-soft).toFixed(1) + 'px' : ''; for (const s of FLOW) s.style.translate = ty ? `0 ${ty}` : '';
    if (Math.abs(P - T) < .3 && Math.abs(V) < 1 && T >= 0 && T <= m) { P = T; V = 0; for (const s of FLOW) s.style.translate = ''; scrollTo(0, P); own = scrollY; eng = false; return false; } return true; }
  const drive = () => { skewWake(); if (!eng) { eng = true; run(scrollTick); } };
  let skewWake = () => {};
  if (FINE) {
    const inner = (el, dy) => { for (; el && el !== document.body; el = el.parentElement) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) { if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true; } } return false; };
    addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY; if (inner(e.target, dy)) return; e.preventDefault();
      if (!eng) { P = T = scrollY; V = 0; own = scrollY; }
      lastW = performance.now(); const m = maxY(); let add = dy * 1.6;
      if ((T < 0 && add < 0) || (T > m && add > 0)) add *= Math.max(.08, 1 - (T < 0 ? -T : T - m) / 300);
      T = clamp(clamp(T + add, P - 380, P + 380), -300, m + 300); drive(); }, { passive: false });
    addEventListener('scroll', () => { if (!eng && Math.abs(scrollY - own) > 1) { P = T = own = scrollY; V = 0; } else if (eng && Math.abs(scrollY - own) > 2) { P = T = own = scrollY; V = 0; } }, { passive: true });
    /* in-page links get the same bounce */
    $$('a[href^="#"]').forEach(a => a.addEventListener('click', ev => { const t = document.querySelector(a.getAttribute('href')); if (!t) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (!eng) { P = T = scrollY; V = 0; own = scrollY; } lastW = performance.now(); T = clamp(t.getBoundingClientRect().top + scrollY - 0, 0, maxY()); drive(); }, true));
  }

  /* ---- sections skew with scroll speed (up to 15deg, and the spring swings past it) ---- */
  { const sk = new Sp(0, 140, .17, .02); let ly = scrollY, on = false, idle = 0;
    const tick = dt => { const y = scrollY, v = eng ? V : (y - ly) / Math.max(dt, .001); ly = y; sk.t = clamp(v * .009, -15, 15); sk.step(dt);
      const a = Math.abs(sk.x) > .02 ? `skewY(${sk.x.toFixed(3)}deg)` : ''; for (const s of FLOW) s.style.transform = a;
      if (Math.abs(sk.t) < .02 && sk.rest) { sk.snap(); for (const s of FLOW) s.style.transform = ''; on = false; return false; } return true; };
    skewWake = () => { if (!on) { on = true; ly = scrollY; run(tick); } };
    addEventListener('scroll', skewWake, { passive: true }); }

  /* ---- headline letters: squash, stretch, bounce, spin in 3D ---- */
  const h1 = document.querySelector('h1');
  if (h1) { const label = h1.textContent.replace(/\s+/g, ' ').trim(); h1.setAttribute('aria-label', label);
    const L = [], G = 4400, REST = .58;
    $$('.w > span', h1).forEach(sp => { const txt = sp.textContent; sp.textContent = ''; for (const ch of txt) { const c = document.createElement('span'); c.className = 'ch'; c.setAttribute('aria-hidden', 'true'); c.textContent = ch; sp.appendChild(c);
      L.push({ c, y: 0, vy: 0, delay: 0, cool: 0, Q: new Sp(0, 360, .12, .004), RX: new Sp(0, 110, .12, .05), RY: new Sp(0, 90, .1, .05), glow: !!sp.closest('.glow') || sp.classList.contains('glow'), started: false }); } });
    const paint = l => { const q = clamp(l.Q.x + clamp(Math.abs(l.vy) / 6500, 0, .22) * (l.y < -1 ? 1 : 0), -.5, .5); l.c.style.transform = `translate3d(0,${l.y.toFixed(1)}px,0) rotateX(${l.RX.x.toFixed(1)}deg) rotateY(${l.RY.x.toFixed(1)}deg) scale(${(1 - q * .8).toFixed(3)},${(1 + q).toFixed(3)})`; };
    const land = (l, im) => { l.Q.v -= Math.min(12, im / 1500 * 9.5); l.RX.v += (Math.random() - .5) * im / 25; };
    const ltick = dt => { let alive = false;
      for (const l of L) { if (l.delay > 0) { l.delay -= dt; alive = true; continue; } if (!l.started) { l.started = true; l.c.classList.add('go'); }
        l.cool -= dt;
        if (l.y !== 0 || l.vy !== 0) { l.vy += G * dt; l.y += l.vy * dt; if (l.y >= 0) { const im = l.vy; l.y = 0; if (im > 140) { l.vy = -im * REST; land(l, im); } else l.vy = 0; } alive = true; }
        l.Q.step(dt); l.RX.step(dt); l.RY.step(dt); paint(l);
        if (!(l.Q.rest && l.RX.rest && l.RY.rest)) alive = true; else { l.Q.snap(); l.RX.snap(); l.RY.snap(); } }
      return alive; };
    const hop = (l, v, spin) => { if (l.y === 0) l.y = -.01; l.vy = -v; l.Q.v += 7; l.RY.v += (Math.random() < .5 ? -1 : 1) * spin; l.RX.v += (Math.random() - .5) * 300; l.cool = .4; run(ltick); };
    const drop = () => { L.forEach((l, i) => { l.y = -(innerHeight * .75 + i * 28); l.vy = 0; l.delay = .12 + i * .075; l.started = false; l.c.classList.remove('go'); l.c.style.transform = `translate3d(0,${l.y}px,0)`; l.RY.v += 0; }); run(ltick); };
    const gradient = () => { $$('.glow', h1).forEach(w => { const wr = w.getBoundingClientRect(), W = Math.max(1, wr.width); [...w.querySelectorAll('.ch')].forEach(c => { const r = c.getBoundingClientRect(); c.style.setProperty('--bw', W + 'px'); c.style.setProperty('--bx', -(r.left - wr.left) + 'px'); }); }); };
    const start = () => { gradient(); drop(); };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(start, 250));
    setTimeout(() => L.forEach(l => { if (!l.started && !l.c.classList.contains('go')) { l.c.classList.add('go'); } }), 4500); // never leave the title hidden
    addEventListener('resize', () => { clearTimeout(gradient.t); gradient.t = setTimeout(gradient, 150); });
    let seen = true; new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting && !seen) { seen = true; setTimeout(drop, 120); } else if (!x.isIntersecting) seen = false; }), { threshold: .3 }).observe(h1);
    /* touch it and it hops, squashes on landing and keeps bouncing */
    let mvT = 0; addEventListener('pointermove', e => { const now = performance.now(); if (now - mvT < 32) return; mvT = now; const hr = h1.getBoundingClientRect(); if (e.clientY < hr.top - 60 || e.clientY > hr.bottom + 60 || e.clientX < hr.left - 60 || e.clientX > hr.right + 60) return;
      for (const l of L) { if (l.cool > 0 || l.delay > 0 || !l.started || Math.abs(l.y) > 2) continue; const r = l.c.getBoundingClientRect(); const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); if (d < r.width * .75 + 14) hop(l, 620 + Math.random() * 260, 900); } }, { passive: true });
    addEventListener('pointerdown', e => { const hr = h1.getBoundingClientRect(); if (e.clientY < hr.top - 40 || e.clientY > hr.bottom + 40) return;
      for (const l of L) { const r = l.c.getBoundingClientRect(), d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); if (d < 190 && l.started) hop(l, 1100 - d * 2.4, 1500); } }, true);
  }
  window.SurgeJelly = { Sp, run };
})();
