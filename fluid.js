// Surge fluid layer (see fluid.css). No dependencies; every effect is transform/opacity only so it stays at 60fps.
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPRING = getComputedStyle(document.documentElement).getPropertyValue('--spring').trim() || 'ease-out';
  const C = Object.assign({ press: 'button,.btn,.grid .m,.q,.mod,.w,.theme,.chip,.pr,.tab,.wi,.it,.tg,.step .num,.ib,.pill', ripple: '.btn,.grid .m,.q,.mod,.w:not(.apps),.theme,.pr,.chip,.tab,.wi,.upd button',
    magnet: '.btn,.q,.ib,header .btn', pop: '#onCount,.hero .n,#pct,#bpct,output', light: true, blobs: null }, window.FLUID || {});
  if (RM) return;
  const closest = (t, sel) => (t && t.closest) ? t.closest(sel) : null;

  /* squish on press, spring back on release — uses the standalone `scale` property so it never fights hover transforms */
  let pressed = null;
  addEventListener('pointerdown', e => { const el = closest(e.target, C.press); if (!el || el.matches('.apps')) return; pressed = el;
    el.getAnimations().filter(a => a.id === 'fl-press').forEach(a => a.cancel());
    const big = el.offsetWidth > 260; el.animate({ scale: ['1', big ? '.975' : '.92'] }, { duration: 130, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards', id: 'fl-press' });
    const r = closest(e.target, C.ripple); if (r && !closest(e.target, 'input,textarea,select')) ripple(r, e); }, true);
  const release = () => { const el = pressed; pressed = null; if (!el) return; el.getAnimations().filter(a => a.id === 'fl-press').forEach(a => a.cancel());
    const big = el.offsetWidth > 260; el.animate({ scale: [big ? '.975' : '.92', '1'] }, { duration: 750, easing: SPRING, id: 'fl-press' }); };
  addEventListener('pointerup', release, true); addEventListener('pointercancel', release, true); addEventListener('blur', release);
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
    const tick = () => { rb = 0; if (!el) return; if (performance.now() - lastW > 70) { v = (v + (0 - off) * .14) * .7; off += v; } if (Math.abs(off) < .3 && Math.abs(v) < .3 && performance.now() - lastW > 70) { el.style.translate = ''; el = null; off = v = 0; return; } el.style.translate = `0 ${off.toFixed(1)}px`; rb = requestAnimationFrame(tick); };
    addEventListener('wheel', e => { if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; let s = closest(e.target, RB); while (s && s.scrollHeight <= s.clientHeight + 2) s = closest(s.parentElement, RB); if (!s) return;
      const top = s.scrollTop <= 0 && e.deltaY < 0, bot = s.scrollTop + s.clientHeight >= s.scrollHeight - 1 && e.deltaY > 0; if (!top && !bot) { if (el === s && off) lastW = 0; return; }
      if (el && el !== s) { el.style.translate = ''; off = v = 0; } el = s; lastW = performance.now(); off += -e.deltaY * .22 * (1 - Math.min(1, Math.abs(off) / 70)); off = Math.max(-70, Math.min(70, off)); v = 0; if (!rb) rb = requestAnimationFrame(tick); }, { passive: true, capture: true }); }

  /* a thin rim of light around the glass (static: painted once) */
  if (C.rim !== false && host !== document.body) { const r = document.createElement('i'); r.className = 'fl-rim'; (host.querySelector(':scope > .fl-layer.top') || layer('top')).appendChild(r); }

  /* a window nobody is using should cost nothing: ambient loops stop when it loses focus (the dock opts out: it is never focused) */
  if (!C.keepAlive) { const idle = v => document.documentElement.classList.toggle('fl-idle', v); addEventListener('blur', () => idle(true)); addEventListener('focus', () => idle(false)); document.addEventListener('visibilitychange', () => idle(document.hidden)); }
  window.SurgeFluid = { scan, segSync };
})();
