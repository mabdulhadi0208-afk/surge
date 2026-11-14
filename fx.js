// Surge effects pack, script half (see fx.css): particle bursts, 3D tilt, letter waves, scroll progress, rolling titles, idle winks.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const $$ = (s, r = document) => [...r.querySelectorAll(s)], acc = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || getComputedStyle(document.documentElement).getPropertyValue('--a').trim() || '#00FF85';

  /* particle burst from a point */
  function burst(x, y, n = 10, col) { const c = col || acc(); for (let i = 0; i < n; i++) { const p = document.createElement('i'), a = (i / n) * Math.PI * 2 + Math.random() * .6, d = 18 + Math.random() * 26;
    p.className = 'fx-p'; p.style.cssText = `--x0:${x - 3}px;--y0:${y - 3}px;--x1:${x - 3 + Math.cos(a) * d}px;--y1:${y - 3 + Math.sin(a) * d}px;--d:${.5 + Math.random() * .4}s;--c:${i % 3 ? c : '#fff'};width:${3 + Math.random() * 4}px;height:${3 + Math.random() * 4}px`;
    document.body.appendChild(p); setTimeout(() => p.remove(), 950); } }
  const centre = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  addEventListener('click', e => { const t = e.target.closest && e.target.closest('.tg,.grid .m,.mod,.fav,.theme,.step .btn.primary'); if (!t) return;
    setTimeout(() => { // after the app has flipped the state
      if (t.matches('.fav')) { if (t.classList.contains('on')) burst(...centre(t), 8, '#FFD60A'); return; }
      if (t.matches('.theme')) return burst(...centre(t.querySelector('i') || t), 14, getComputedStyle(t).getPropertyValue('--c1').trim());
      const tg = t.matches('.tg') ? t : t.querySelector('.tg'); const on = t.matches('.grid .m') ? t.classList.contains('on') : tg ? tg.classList.contains('on') : true;
      if (on) burst(...centre(t.matches('.grid .m') ? (t.querySelector('svg') || t) : tg || t), 10); }, 60); }, true);
  new MutationObserver(recs => { for (const r of recs) if (r.target.classList && r.target.classList.contains('step') && r.target.classList.contains('done') && !r.target.dataset.fxd) { r.target.dataset.fxd = 1; const n = r.target.querySelector('.num'); if (n && n.offsetParent) burst(...centre(n), 12); } })
    .observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });

  /* 3D tilt */
  const TILT = '.hero,.theme,.panel>header,.card#card';
  addEventListener('pointermove', e => { const el = e.target.closest && e.target.closest(TILT); $$('.fx-tilting').forEach(o => { if (o !== el) { o.classList.remove('fx-tilting'); o.style.transform = ''; } });
    if (!el) return; const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5, k = r.width > 400 ? 3 : 9;
    el.classList.add('fx-tilt', 'fx-tilting'); el.style.transform = `perspective(700px) rotateX(${(-py * k).toFixed(2)}deg) rotateY(${(px * k).toFixed(2)}deg)`; }, { passive: true });
  document.addEventListener('pointerleave', () => $$('.fx-tilting').forEach(o => { o.classList.remove('fx-tilting'); o.style.transform = ''; }));

  /* letter wave on the brand */
  $$('.brand').forEach(b => { const tn = [...b.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()); if (!tn) return; const w = document.createElement('span'); w.className = 'fx-wave';
    [...tn.textContent.trim()].forEach((ch, k) => { const s = document.createElement('span'); s.textContent = ch; s.style.setProperty('--k', k); w.appendChild(s); }); tn.replaceWith(w); });

  /* settings: scroll progress, header shadow, hero parallax, rolling title, sidebar cascade order, hero bubbles */
  const panes = document.getElementById('panes'), main = document.querySelector('main');
  if (panes && main) { const bar = document.createElement('i'); bar.className = 'fx-prog'; panes.appendChild(bar);
    panes.addEventListener('scroll', e => { const p = e.target; if (!p.classList || !p.classList.contains('pane')) return; const max = p.scrollHeight - p.clientHeight, f = max > 4 ? p.scrollTop / max : 0;
      bar.style.transform = `scaleX(${f.toFixed(3)})`; main.classList.toggle('fx-scrolled', p.scrollTop > 6);
      const h = p.querySelector('.hero'); if (h && !h.classList.contains('fx-tilting')) { const y = Math.min(p.scrollTop, 200); h.style.translate = `0 ${(y * .25).toFixed(1)}px`; h.style.opacity = String(1 - y / 320); } }, { capture: true, passive: true });
    const title = document.getElementById('title'); if (title) { let last = title.textContent; new MutationObserver(() => { if (title.textContent === last) return; last = title.textContent; title.classList.remove('fx-roll'); void title.offsetWidth; title.classList.add('fx-roll'); bar.style.transform = 'scaleX(0)'; main.classList.remove('fx-scrolled'); }).observe(title, { childList: true, characterData: true, subtree: true }); }
    const idx = () => { $$('#nav button').forEach((b, i) => b.style.setProperty('--ni', i)); $$('#pane-all .hero').forEach(h => { if (h.querySelector('.fx-b')) return; [[12, 0], [34, .9], [58, 1.7], [80, 2.5]].forEach(([l, d]) => { const b = document.createElement('i'); b.className = 'fx-b'; b.style.cssText = `left:${l}%;animation-delay:${d}s`; h.appendChild(b); }); }); };
    idx(); setTimeout(idx, 500); setTimeout(idx, 1500); }

  /* a random active icon winks now and then, so the window never looks frozen */
  setInterval(() => { if (document.hidden) return; const c = $$('.grid .m.on svg, nav button.live .ic, .ap.run .ic, .a .ic').filter(e => e.offsetParent && !e.matches(':hover')); if (!c.length) return; const el = c[Math.floor(Math.random() * c.length)];
    el.classList.add('fx-wink'); setTimeout(() => el.classList.remove('fx-wink'), 950); }, 9000);

  /* search with no results: the field shakes its head */
  const q = document.getElementById('q'); if (q) { let was = false; new MutationObserver(() => { const e = !!document.querySelector('.empty'); if (e && !was && q.value) { q.classList.remove('fx-shake'); void q.offsetWidth; q.classList.add('fx-shake'); } was = e; }).observe(document.body, { childList: true, subtree: true }); }

  /* dock: flag a low battery cell */
  if (document.getElementById('cell')) setInterval(() => { const c = document.getElementById('cell'), b = document.getElementById('bpct'); if (c && b) c.classList.toggle('low', +b.textContent <= 20 && !c.classList.contains('chg')); }, 2000);
  window.SurgeFx = { burst };
})();
