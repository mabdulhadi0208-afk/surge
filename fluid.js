// Surge fluid layer (see fluid.css). No dependencies; every effect is transform/opacity only so it stays at 60fps.
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPRING = getComputedStyle(document.documentElement).getPropertyValue('--spring').trim() || 'ease-out';
  const C = Object.assign({ press: 'button,.btn,.grid .m,.q,.mod,.w,.theme,.chip,.pr,.tab,.wi,.it,.tg,.step .num,.ib,.pill', ripple: '.btn,.grid .m,.q,.mod,.w:not(.apps),.theme,.pr,.chip,.tab,.wi,.upd button',
    magnet: '.__none', pop: '#onCount,.hero .n,#pct,#bpct,output', light: true, blobs: null }, window.FLUID || {});
  if (RM) return;
  const closest = (t, sel) => (t && t.closest) ? t.closest(sel) : null;

  /* jelly: controls squash on press, swell on hover and wobble back on underdamped springs (scale / translate only, so the compositor does the work) */
  class Sp { constructor(x, k, z, e) { this.x = x; this.v = 0; this.t = x; this.k = k; this.c = 2 * z * Math.sqrt(k); this.e = e || .0008; }
    step(dt) { const n = Math.ceil(dt * 240), h = dt / n; for (let i = 0; i < n; i++) { this.v += (-this.k * (this.x - this.t) - this.c * this.v) * h; this.x += this.v * h; } }
    get rest() { return Math.abs(this.x - this.t) < this.e && Math.abs(this.v) < this.e * 6; } snap() { this.x = this.t; this.v = 0; } }
  const jt = new Set(); let jraf = 0, jlast = 0;
  const jframe = now => { jraf = 0; const dt = Math.min(.034, (now - jlast) / 1000 || .016); jlast = now; for (const t of [...jt]) { let on = false; try { on = t(dt); } catch (e) {} if (!on) jt.delete(t); } if (jt.size) jraf = requestAnimationFrame(jframe); };
  const jrun = t => { jt.add(t); if (!jraf) { jlast = performance.now(); jraf = requestAnimationFrame(jframe); } };
  const HOV = C.keepAlive ? null : (C.hover || '.btn,.q,.ib,.chip,.tab,.pr,.theme,.pill,.grid .m,.mod,.wi,.it,.tg,.step .num,.a');
  const bodies = new WeakMap(), hovered = new Set();
  function body(el) { let b = bodies.get(el); if (b) return b;
    const big = el.offsetWidth > 260, hv = HOV && el.matches(HOV);
    const o = big ? { hover: hv ? 1.012 : 1, press: .97, pull: 0, squash: .015, kick: .2 } : !hv ? { hover: 1, press: .76, pull: 0, squash: .2, kick: .9 } : el.matches('.a') ? { hover: 1.08, press: .78, pull: 0, squash: .14, kick: .6 } : el.matches('.tg,.step .num,.ib') ? { hover: 1.22, press: .7, pull: .2, squash: .24, kick: 1.1 } : { hover: 1.13, press: .72, pull: .2, squash: .2, kick: .9 };
    const S = new Sp(1, 260, .14), Q = new Sp(0, 320, .12), X = new Sp(0, 170, .2, .04), Y = new Sp(0, 170, .2, .04);
    b = { el, o, S, Q, X, Y, hov: false, down: false, on: false }; const sps = [S, Q, X, Y];
    const apply = () => { el.style.scale = `${(S.x * (1 + Q.x)).toFixed(4)} ${(S.x * (1 - Q.x * .9)).toFixed(4)}`; if (o.pull) el.style.translate = `${X.x.toFixed(2)}px ${Y.x.toFixed(2)}px`; };
    b.tick = dt => { for (const s of sps) s.step(dt); apply(); if (sps.every(s => s.rest)) { for (const s of sps) s.snap(); if (!b.hov && !b.down && S.t === 1) { el.style.scale = ''; el.style.translate = ''; el.style.willChange = ''; el.removeAttribute('data-jl'); } else apply(); b.on = false; return false; } return true; };
    b.wake = () => { if (b.on) return; b.on = true; el.style.willChange = 'scale,translate'; el.setAttribute('data-jl', ''); jrun(b.tick); };
    bodies.set(el, b); return b; }
  const SKIP = '.apps,.mh .tg';
  let pressed = null;
  addEventListener('pointerdown', e => { const el = closest(e.target, C.press); if (!el || el.matches(SKIP)) return; const b = body(el); pressed = b; b.down = true; b.S.t = b.o.press; b.Q.v -= b.o.squash * 10; b.wake();
    try { if (e.pointerType === 'mouse' && el.offsetWidth <= 200) el.setPointerCapture(e.pointerId); } catch (_) {}   /* it squashes under the pointer: keep the click on it */
    const r = closest(e.target, C.ripple); if (r && !closest(e.target, 'input,textarea,select')) ripple(r, e); }, true);
  const release = () => { const b = pressed; pressed = null; if (!b) return; b.down = false; b.S.t = b.hov ? b.o.hover : 1; b.S.v += b.o.kick * 1.8; b.Q.v += b.o.squash * 16; b.wake(); };
  addEventListener('pointerup', release, true); addEventListener('pointercancel', release, true); addEventListener('blur', release);
  if (HOV) {
    addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const el = closest(e.target, HOV); if (!el || el.contains(e.relatedTarget) || el.matches(SKIP)) return; const b = body(el); b.hov = true; hovered.add(b); b.S.t = b.down ? b.o.press : b.o.hover; b.S.v += b.o.kick; b.Q.v += b.o.squash * 18; b.wake(); }, true);
    addEventListener('pointerout', e => { if (e.pointerType !== 'mouse') return; const el = closest(e.target, HOV); if (!el || el.contains(e.relatedTarget)) return; const b = bodies.get(el); if (!b) return; b.hov = false; hovered.delete(b); b.S.t = b.down ? b.o.press : 1; b.S.v -= b.o.kick * .6; b.Q.v -= b.o.squash * 14; b.X.t = b.Y.t = 0; b.wake(); }, true);
    let mvE = null, mvOn = false; const mvTick = () => { const e = mvE; mvE = null; mvOn = false; if (!e) return false; for (const b of [...hovered]) { if (!b.el.isConnected) { hovered.delete(b); continue; } if (!b.o.pull) continue; const r = b.el.getBoundingClientRect();
        b.X.t = Math.max(-r.width * .3, Math.min(r.width * .3, (e.clientX - (r.left + r.width / 2 - b.X.x)) * b.o.pull)); b.Y.t = Math.max(-r.height * .35, Math.min(r.height * .35, (e.clientY - (r.top + r.height / 2 - b.Y.x)) * b.o.pull)); b.wake(); } return false; };
    addEventListener('pointermove', e => { if (!hovered.size) return; mvE = e; if (!mvOn) { mvOn = true; jrun(mvTick); } }, { passive: true }); }
  function ripple(el, e) { const r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.4, s = document.createElement('span'); s.className = 'fl-rip';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left}px;top:${e.clientY - r.top}px`; el.classList.add('fl-clip'); el.appendChild(s);
    setTimeout(() => { s.remove(); if (!el.querySelector('.fl-rip')) el.classList.remove('fl-clip'); }, 780); }

  /* cursor light + magnetic controls: one rAF loop with spring lag, asleep whenever the pointer is still */
  let light = null, lx = 0, ly = 0, tx = 0, ty = 0, vx = 0, vy = 0, raf = 0, mag = null, mx = 0, my = 0, mvx = 0, mvy = 0, mtx = 0, mty = 0, inside = false;
  const host = document.querySelector(C.host || '.panel,.win,.box') || document.body; host.classList.add('fl-host'); if (host !== document.body && getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const layer = (cls) => { const l = document.createElement('div'); l.className = 'fl-layer ' + cls; host.prepend(l); return l; };
  if (C.light) { light = document.createElement('div'); light.className = 'fl-light'; layer('top').appendChild(light); }
  const loop = () => { raf = 0; let busy = false;
    if (light) { vx = (vx + (tx - lx) * .09) * .74; vy = (vy + (ty - ly) * .09) * .74; lx += vx; ly += vy; light.style.transform = `translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px)`; if (Math.abs(vx) + Math.abs(vy) > .05 || Math.abs(tx - lx) + Math.abs(ty - ly) > .5) busy = true; }
    if (mag || Math.abs(mx) + Math.abs(my) > .1) { mvx = (mvx + (mtx - mx) * .16) * .68; mvy = (mvy + (mty - my) * .16) * .68; mx += mvx; my += mvy; const el = mag || lastMag; if (el) el.style.translate = (Math.abs(mx) + Math.abs(my) < .1 && !mag) ? '' : `${mx.toFixed(2)}px ${my.toFixed(2)}px`; if (Math.abs(mvx) + Math.abs(mvy) > .03 || Math.abs(mtx - mx) + Math.abs(mty - my) > .1) busy = true; }
    if (busy) raf = requestAnimationFrame(loop); };
  let lastMag = null; const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  addEventListener('pointermove', e => {
    if (light) { const h = host.getBoundingClientRect(); tx = e.clientX - h.left; ty = e.clientY - h.top; if (!inside) { inside = true; lx = tx; ly = ty; light.classList.add('on'); } }
    const m = closest(e.target, C.magnet);
    if (m !== mag) { if (mag) { lastMag = mag; mtx = mty = 0; } if (m) { if (lastMag && lastMag !== m) lastMag.style.translate = ''; mx = my = mvx = mvy = 0; } mag = m; }
    if (mag) { const r = mag.getBoundingClientRect(); mtx = (e.clientX - (r.left + r.width / 2)) * .22; mty = (e.clientY - (r.top + r.height / 2)) * .3; }
    kick(); }, { passive: true });
  document.addEventListener('pointerleave', () => { inside = false; light && light.classList.remove('on'); if (mag) { lastMag = mag; mag = null; mtx = mty = 0; kick(); } });

  /* drifting colour */
  if (C.blobs) { const L = layer('back'); for (const [cls, css] of [['', 'width:70%;height:70%;left:-25%;top:-28%'], ['b', 'width:74%;height:70%;right:-28%;bottom:-30%']]) { const b = document.createElement('i'); b.className = 'fl-blob ' + cls; b.style.cssText = css; L.appendChild(b); } }

  /* segmented controls: the selection slides and stretches instead of jumping */
  const segs = new WeakSet();
  function segSync(seg, first) { const on = seg.querySelector('button.on'); let ind = seg.querySelector(':scope > .fl-ind'); if (!on) { ind && (ind.style.opacity = 0); return; }
    if (!ind) { ind = document.createElement('i'); ind.className = 'fl-ind'; seg.prepend(ind); first = true; }
    if (first) { ind.style.transition = 'none'; requestAnimationFrame(() => requestAnimationFrame(() => ind.style.transition = '')); }
    if (!on.offsetWidth) return; ind.style.opacity = 1; ind.style.width = on.offsetWidth + 'px'; ind.style.transform = `translateX(${on.offsetLeft}px)`; if (!seg.classList.contains('fl-seg')) seg.classList.add('fl-seg'); }
  function scanSegs(root) { (root.querySelectorAll ? root.querySelectorAll('.seg') : []).forEach(seg => { if (segs.has(seg)) return segSync(seg); segs.add(seg); segSync(seg, true);
    new MutationObserver(recs => { if (recs.some(r => r.target !== seg && r.target.tagName === 'BUTTON')) segSync(seg); }).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'] }); }); }

  /* numbers jump when they change */
  const popSeen = new WeakMap();
  function scanPop() { if (!C.pop) return; document.querySelectorAll(C.pop).forEach(el => { const t = el.textContent; if (popSeen.has(el) && popSeen.get(el) !== t && el.offsetParent) { el.classList.remove('fl-pop'); void el.offsetWidth; el.classList.add('fl-pop'); } popSeen.set(el, t); }); }

  let scanT = 0; const scan = () => { clearTimeout(scanT); scanT = setTimeout(() => { scanSegs(document); scanPop(); }, 30); };
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  addEventListener('resize', () => document.querySelectorAll('.seg').forEach(s => segSync(s, true)));
  addEventListener('load', scan); scan(); setTimeout(() => document.querySelectorAll('.seg').forEach(s => segSync(s, true)), 600);
  /* rubber-band: push past the end of a list and it stretches, then springs back */
  { let el = null, off = 0, v = 0, rb = 0, lastW = 0; const RB = C.rubber || '.pane.on,.list,.grid,.sp .list';
    const tick = () => { rb = 0; if (!el) return; if (performance.now() - lastW > 70) { v = (v + (0 - off) * .14) * .9; off += v; } if (Math.abs(off) < .3 && Math.abs(v) < .3 && performance.now() - lastW > 70) { el.style.translate = ''; el = null; off = v = 0; return; } el.style.translate = `0 ${off.toFixed(1)}px`; rb = requestAnimationFrame(tick); };
    addEventListener('wheel', e => { if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; let s = closest(e.target, RB); while (s && s.scrollHeight <= s.clientHeight + 2) s = closest(s.parentElement, RB); if (!s) return;
      const top = s.scrollTop <= 0 && e.deltaY < 0, bot = s.scrollTop + s.clientHeight >= s.scrollHeight - 1 && e.deltaY > 0; if (!top && !bot) { if (el === s && off) lastW = 0; return; }
      if (el && el !== s) { el.style.translate = ''; off = v = 0; } el = s; lastW = performance.now(); off += -e.deltaY * .3 * (1 - Math.min(1, Math.abs(off) / 130)); off = Math.max(-130, Math.min(130, off)); v = 0; if (!rb) rb = requestAnimationFrame(tick); }, { passive: true, capture: true }); }

  /* a thin rim of light around the glass (static: painted once) */
  if (C.rim !== false && host !== document.body) { const r = document.createElement('i'); r.className = 'fl-rim'; (host.querySelector(':scope > .fl-layer.top') || layer('top')).appendChild(r); }

  /* a window nobody is using should cost nothing: ambient loops stop when it loses focus (the dock opts out: it is never focused) */
  if (!C.keepAlive) { const idle = v => document.documentElement.classList.toggle('fl-idle', v); addEventListener('blur', () => idle(true)); addEventListener('focus', () => idle(false)); document.addEventListener('visibilitychange', () => idle(document.hidden)); }
  window.SurgeFluid = { scan, segSync };
})();
