/* ===================== Surge glow engine v2 =====================
   Everything moves:
   • FLOW   — two counter-rotating conic gradients with crisp, saturated
              colour bands travel around the perimeter at different speeds
   • RIPPLE — the edge thickness breathes in a travelling wave
   • IGNITE / BLOOM / REST / FADE envelope, spring capsule
   Shared by the overlay, the settings preview and the website.
================================================================== */
(function (root) {
  const PALETTES = {
    aurora: ['#00FF85', '#00E5A0', '#39FF14', '#00C97A', '#00FF85'],   // plug-in = green
    ember:  ['#FF3B1F', '#FF9500', '#FF2D7A', '#FFD60A', '#FF3B1F'],
    ice:    ['#7DF9FF', '#3E7BFF', '#B388FF', '#D6FBFF', '#7DF9FF'],
    unplug: ['#FF7A00', '#FFB800', '#FF4D1F', '#FFD37A', '#FF7A00'],
    low:    ['#FF1744', '#FF4D6D', '#C70039', '#FF8A80', '#FF1744'],
    full:   ['#FFD60A', '#FFF176', '#FFB300', '#FFE97A', '#FFD60A'],
    info:   ['#7DF9FF', '#3E7BFF', '#B388FF', '#D6FBFF', '#7DF9FF'],
    warn:   ['#FFB300', '#FF7A00', '#FFD60A', '#FF9500', '#FFB300'],
    hud:    ['#8E8E9C', '#B0B0BC', '#8E8E9C', '#B0B0BC', '#8E8E9C'],
  };
  // charge tint: 0% → 100%
  const TINT = [
    [0,   ['#FF1744', '#FF3DF0', '#FF2D7A', '#FF6E40', '#FF1744']],
    [35,  ['#FF6D00', '#FFB300', '#FF3D7A', '#FF8F00', '#FF6D00']],
    [65,  ['#7CFF4D', '#C6FF00', '#39FF14', '#00E676', '#7CFF4D']],
    [100, ['#00FF85', '#00E5A0', '#39FF14', '#00C97A', '#00FF85']],
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutExpo = t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const spring = (t, s = 5.5, d = 0.5) => 1 - Math.exp(-s * t) * Math.cos(d * 12 * t);

  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return [0, 1, 2].map(i => Math.round(lerp(A[i], B[i], t))); }
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function brighten(c, k) { return c.map(v => Math.round(clamp(v + (255 - v) * k, 0, 255))); }

  function paletteFor(kind, level, S) {
    if (PALETTES[kind] && kind !== 'aurora' && kind !== 'ember' && kind !== 'ice') return PALETTES[kind];
    if (S.theme === 'ember' || S.theme === 'ice') return PALETTES[S.theme];
    if (S.theme === 'solid') {
      const c = S.color || '#00D4FF'; const r = hex2rgb(c);
      const hi = '#' + brighten(r, 0.45).map(v => v.toString(16).padStart(2, '0')).join('');
      const lo = '#' + r.map(v => Math.round(v * 0.75)).map(v => v.toString(16).padStart(2, '0')).join('');
      return [c, hi, c, lo, c];
    }
    if (!S.batteryColor) return PALETTES.aurora;
    // battery tint
    const L = clamp(level, 0, 100);
    for (let i = 1; i < TINT.length; i++) {
      if (L <= TINT[i][0]) {
        const t = (L - TINT[i - 1][0]) / (TINT[i][0] - TINT[i - 1][0]);
        return TINT[i - 1][1].map((c, k) => '#' + mix(c, TINT[i][1][k], t).map(v => v.toString(16).padStart(2, '0')).join(''));
      }
    }
    return TINT[TINT.length - 1][1];
  }

  function create(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    const S = Object.assign({ theme: 'aurora', color: '#00FF85', batteryColor: false, intensity: 0.9, thickness: 150, duration: 3.6, showCapsule: true, speed: 1 }, opts.settings);
    let W = 0, H = 0, dpr = 1, anim = null, raf = 0, scrub = null, stopped = false, loopT = 0;
    const loop = opts.loop ?? false, gap = opts.gap ?? 1500, refW = opts.refWidth ?? 1440;
    const onDone = opts.onDone || (() => {});

    function size() {
      const r = canvas.getBoundingClientRect();
      const w = r.width || canvas.width, h = r.height || canvas.height;
      dpr = Math.min(root.devicePixelRatio || 1, opts.maxDpr ?? 1.5);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = w * dpr; canvas.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); W = w; H = h;
    }
    function perimeter(inset, r) {
      const x = inset, y = inset, w = W - inset * 2, h = H - inset * 2, p = new Path2D();
      p.moveTo(x + w / 2, y + h); p.lineTo(x + r, y + h); p.arcTo(x, y + h, x, y + h - r, r);
      p.lineTo(x, y + r); p.arcTo(x, y, x + r, y, r); p.lineTo(x + w - r, y); p.arcTo(x + w, y, x + w, y + r, r);
      p.lineTo(x + w, y + h - r); p.arcTo(x + w, y + h, x + w - r, y + h, r); p.closePath();
      return { p, L: 2 * (w + h) - 8 * r + 2 * Math.PI * r };
    }
    /** point on the rectangle edge; prog 0 = bottom centre, increases clockwise (right → up → left → down) */
    function edgePoint(prog) {
      const per = 2 * (W + H); let d = ((prog % 1 + 1) % 1) * per + W / 2;
      d %= per;
      if (d < W) return [d, H];              // bottom, left→right
      d -= W; if (d < H) return [W, H - d];  // right, up
      d -= H; if (d < W) return [W - d, 0];  // top, right→left
      d -= W; return [0, d];                 // left, down
    }
    function flowGradient(pal, angle, alpha, bands = 2) {
      const g = ctx.createConicGradient(angle, W / 2, H / 2);
      const n = (pal.length - 1) * bands;
      for (let i = 0; i <= n; i++) { const c = hex2rgb(pal[i % (pal.length - 1)]); g.addColorStop(i / n, rgba(c, alpha)); }
      return g;
    }

    function fire(kind = 'plug', level = 67, extra = {}) {
      kind = kind === 'preview' ? 'plug' : kind;
      const dur = kind === 'low' ? 2.8 : kind === 'unplug' ? Math.max(1.8, S.duration * 0.7) : kind === 'full' ? S.duration * 1.2 : kind === 'hud' ? 1.6 : (kind === 'info' || kind === 'warn') ? Math.max(2, S.duration * 0.8) : S.duration;
      let pal = paletteFor(kind, level, S);
      if (extra.hud?.color && kind !== 'hud') { /* keep event palette */ } else if (extra.hud?.color) { const c = extra.hud.color; pal = [c, c, c, c, c]; }
      anim = { t0: performance.now(), kind, level, pal, dur, hud: extra.hud || null }; stopped = false; clearTimeout(loopT);
      cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    }

    // low-res offscreen canvas for everything soft (blur is ~free at 1/6 scale, and upscaling blurs further)
    const lo = document.createElement('canvas'), lx = lo.getContext('2d');
    let lastT = 0;

    function draw(t) {
      size(); ctx.clearRect(0, 0, W, H);
      const { kind, pal, dur, level } = anim;
      const sc = W / refW, thick = clamp(S.thickness, 40, 400) * sc, inten = clamp(S.intensity, 0.1, 1), spd = S.speed || 1;

      // ---- envelope: ignite (sweep from port) → bloom → rest → fade. All eased, nothing snaps.
      const ig = kind === 'unplug' ? 0.6 : 0.9;
      const sweep = easeOutExpo(clamp(t / ig, 0, 1));
      const fadeLen = Math.min(1.1, dur * 0.3), fs = dur - fadeLen;
      const env = t < fs ? 1 : easeInOutCubic(clamp(1 - (t - fs) / fadeLen, 0, 1));
      const settle = 1 - 0.12 * clamp((t - ig) / 1.2, 0, 1);           // bloom slightly brighter, then rests
      const breathe = 1 - 0.06 * (0.5 - 0.5 * Math.cos(t * 1.9));        // slow, gentle
      const pulse = kind === 'low' ? 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(t * 5.2)) : 1;
      const A = env * inten * settle * breathe * pulse;
      const c0 = hex2rgb(pal[0]), c3 = hex2rgb(pal[3]);
      const r = Math.min(W, H) * 0.045 + 6;

      if (kind === 'hud') { if (S.showCapsule !== false) capsule(t, dur, A, sc, pal, level, kind); return; }
      // ================= soft layers (offscreen, low-res) =================
      const K = 6; // downscale factor
      const lw = Math.max(64, Math.round(W / K)), lh = Math.max(40, Math.round(H / K));
      if (lo.width !== lw || lo.height !== lh) { lo.width = lw; lo.height = lh; }
      lx.setTransform(1, 0, 0, 1, 0, 0); lx.clearRect(0, 0, lw, lh);
      const k = lw / W, tk = thick * k, rk = r * k;
      const loPath = (inset, rad) => { const x = inset, y = inset, w = lw - inset * 2, h = lh - inset * 2, p = new Path2D(); p.moveTo(x + w / 2, y + h); p.lineTo(x + rad, y + h); p.arcTo(x, y + h, x, y + h - rad, rad); p.lineTo(x, y + rad); p.arcTo(x, y, x + rad, y, rad); p.lineTo(x + w - rad, y); p.arcTo(x + w, y, x + w, y + rad, rad); p.lineTo(x + w, y + h - rad); p.arcTo(x + w, y + h, x + w - rad, y + h, rad); p.closePath(); return { p, L: 2 * (w + h) - 8 * rad + 2 * Math.PI * rad }; };
      const loGrad = (angle, alpha, bands) => { const g = lx.createConicGradient(angle, lw / 2, lh / 2); const n = (pal.length - 1) * bands; for (let i = 0; i <= n; i++) { const c = hex2rgb(pal[i % (pal.length - 1)]); g.addColorStop(i / n, rgba(c, alpha)); } return g; };
      lx.save(); lx.lineCap = 'round'; lx.lineJoin = 'round'; lx.globalCompositeOperation = 'screen';
      // 1. wide bleed — slow flow, gentle ripple
      { const pr = loPath(-tk * 0.55, Math.max(rk, 2)); lx.save();
        if (sweep < 1) { const seg = pr.L * sweep; lx.setLineDash([seg / 2, pr.L - seg, seg / 2, pr.L * 4]); lx.lineDashOffset = 0; }
        lx.lineWidth = tk * 1.7 * (1 + 0.06 * Math.sin(t * 1.7 * spd)); lx.filter = `blur(${Math.max(1, tk * 0.45)}px)`;
        lx.strokeStyle = loGrad(t * 0.8 * spd, 0.5 * A, 1); lx.stroke(pr.p); lx.restore(); }
      // 2. main band — counter-flow, this is the visible motion
      { const pr = loPath(-tk * 0.08, Math.max(rk, 2)); lx.save();
        if (sweep < 1) { const seg = pr.L * sweep; lx.setLineDash([seg / 2, pr.L - seg, seg / 2, pr.L * 4]); lx.lineDashOffset = 0; }
        lx.lineWidth = tk * 0.45 * (1 + 0.08 * Math.sin(t * 2.3 * spd + 1)); lx.filter = `blur(${Math.max(0.5, tk * 0.12)}px)`;
        lx.strokeStyle = loGrad(-t * 1.4 * spd + 2, 0.95 * A, 2); lx.stroke(pr.p); lx.restore(); }
      // 3. ignition seed: a bright bloom at the port that expands as the sweep leaves it
      if (t < ig * 1.6) { const g = lx.createRadialGradient(lw / 2, lh, 0, lw / 2, lh, tk * (1.2 + sweep * 2)); const sa = (1 - clamp((t - ig * 0.6) / ig, 0, 1)) * A;
        g.addColorStop(0, rgba(brighten(c3, 0.6), sa)); g.addColorStop(0.5, rgba(c3, sa * 0.35)); g.addColorStop(1, rgba(c3, 0)); lx.fillStyle = g; lx.fillRect(0, 0, lw, lh); }
      // 4. port wash — light leaking up from the charger
      { const g = lx.createRadialGradient(lw / 2, lh + tk * 0.6, 0, lw / 2, lh + tk * 0.6, Math.max(lw, lh) * 0.55);
        g.addColorStop(0, rgba(c3, 0.2 * A)); g.addColorStop(0.5, rgba(c0, 0.05 * A)); g.addColorStop(1, rgba(c0, 0)); lx.fillStyle = g; lx.fillRect(0, 0, lw, lh); }
      lx.restore();
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(lo, 0, 0, W, H); ctx.restore();

      // ================= crisp core (full res, no filters) =================
      { const pr = perimeter(1, r); ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalCompositeOperation = 'screen';
        if (sweep < 1) { const seg = pr.L * sweep; ctx.setLineDash([seg / 2, pr.L - seg, seg / 2, pr.L * 4]); ctx.lineDashOffset = 0; }
        const bright = pal.map(p => '#' + brighten(hex2rgb(p), 0.35).map(v => v.toString(16).padStart(2, '0')).join(''));
        const g = ctx.createConicGradient(-t * 1.4 * spd + 2, W / 2, H / 2); const n = (bright.length - 1) * 2;
        for (let i = 0; i <= n; i++) g.addColorStop(i / n, rgba(hex2rgb(bright[i % (bright.length - 1)]), A));
        ctx.lineWidth = Math.max(2, 7 * sc); ctx.globalAlpha = 0.35; ctx.strokeStyle = g; ctx.stroke(pr.p);   // soft halo
        ctx.lineWidth = Math.max(1.25, 2.5 * sc); ctx.globalAlpha = 1; ctx.stroke(pr.p);                     // hairline
        ctx.restore(); }

      if (S.showCapsule) capsule(t, dur, A, sc, pal, level, kind);
    }

    function capsule(t, dur, A, sc, pal, level, kind) {
      if (anim.hud) return drawHud(t, dur, A, sc, pal, anim.hud);
      const inT = clamp(t / 0.9, 0, 1), outT = clamp((t - (dur - 0.75)) / 0.75, 0, 1);
      const sIn = spring(inT), sOut = 1 - easeInOutCubic(outT);
      const scale = lerp(0.6, 1, Math.min(sIn, 1.08)) * lerp(1, 0.88, 1 - sOut), al = Math.min(inT * 1.6, 1) * sOut;
      if (al <= 0) return;
      const k = sc * (opts.capsuleScale ?? 1);
      const cw = 236 * k, ch = 72 * k, cx = W / 2, cy = H - 128 * k + (1 - sIn) * 40 * k;
      const c0 = hex2rgb(pal[0]), c1 = hex2rgb(pal[1]);
      const label = kind === 'low' ? 'Low battery' : kind === 'unplug' ? 'Unplugged' : (kind === 'full' || level >= 100) ? 'Fully charged' : 'Charging';
      ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.globalAlpha = al;
      // glow halo behind the capsule (cheap: a few expanding strokes)
      for (let i = 4; i >= 1; i--) { ctx.beginPath(); ctx.roundRect(-cw / 2 - i * 5 * k, -ch / 2 - i * 5 * k, cw + i * 10 * k, ch + i * 10 * k, ch / 2 + i * 5 * k); ctx.fillStyle = rgba(c0, 0.045 * A); ctx.fill(); }
      ctx.beginPath(); ctx.roundRect(-cw / 2, -ch / 2, cw, ch, ch / 2);
      ctx.fillStyle = 'rgba(12,12,16,0.86)'; ctx.fill();
      // animated gradient rim
      const rim = ctx.createLinearGradient(-cw / 2, 0, cw / 2, 0);
      const ph = (t * 0.7) % 1;
      rim.addColorStop(0, rgba(c0, 0.35)); rim.addColorStop(ph, rgba(brighten(c1, 0.5), 0.95)); rim.addColorStop(Math.min(1, ph + 0.001), rgba(c1, 0.95)); rim.addColorStop(1, rgba(c0, 0.35));
      ctx.lineWidth = 1.2 * k; ctx.strokeStyle = rim; ctx.stroke();
      // ring
      const rx = -cw / 2 + 36 * k, rr = 20 * k;
      ctx.lineWidth = 4 * k; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(rx, 0, rr, 0, Math.PI * 2); ctx.stroke();
      const g = ctx.createLinearGradient(rx - rr, 0, rx + rr, 0); g.addColorStop(0, rgba(brighten(c1, 0.3))); g.addColorStop(1, rgba(c0));
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.arc(rx, 0, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * easeOutExpo(inT) * clamp(level, 0, 100) / 100); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.beginPath();
      ctx.moveTo(rx + 2 * k, -9 * k); ctx.lineTo(rx - 6 * k, 2 * k); ctx.lineTo(rx - 1 * k, 2 * k); ctx.lineTo(rx - 2 * k, 9 * k); ctx.lineTo(rx + 6 * k, -2 * k); ctx.lineTo(rx + 1 * k, -2 * k); ctx.closePath(); ctx.fill();
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.font = `600 ${20 * k}px -apple-system, "SF Pro Display", "Inter Tight", Inter, system-ui, sans-serif`; ctx.fillStyle = '#fff';
      ctx.fillText(`${Math.round(level)}%`, rx + 34 * k, -11 * k);
      ctx.font = `500 ${13 * k}px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`; ctx.fillStyle = rgba(brighten(c1, 0.45));
      ctx.fillText(label, rx + 34 * k, 12 * k);
      ctx.restore();
    }

    function drawHud(t, dur, A, sc, pal, hud) {
      // simple centred pill: text only, springs in / fades out
      const inT = clamp(t / 0.6, 0, 1), outT = clamp((t - (dur - 0.5)) / 0.5, 0, 1);
      const sIn = spring(inT), al = Math.min(inT * 1.8, 1) * (1 - easeInOutCubic(outT));
      if (al <= 0) return;
      const k = sc * (opts.capsuleScale ?? 1), c0 = hex2rgb(pal[0]);
      ctx.save(); ctx.font = `600 ${16 * k}px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      const tw = ctx.measureText(hud.text).width, cw = tw + 56 * k, ch = 46 * k;
      ctx.translate(W / 2, H - 110 * k + (1 - sIn) * 30 * k); ctx.scale(lerp(0.7, 1, Math.min(sIn, 1.06)), lerp(0.7, 1, Math.min(sIn, 1.06))); ctx.globalAlpha = al;
      for (let i = 3; i >= 1; i--) { ctx.beginPath(); ctx.roundRect(-cw / 2 - i * 5 * k, -ch / 2 - i * 5 * k, cw + i * 10 * k, ch + i * 10 * k, ch); ctx.fillStyle = rgba(c0, 0.05); ctx.fill(); }
      ctx.beginPath(); ctx.roundRect(-cw / 2, -ch / 2, cw, ch, ch / 2); ctx.fillStyle = 'rgba(12,12,16,0.88)'; ctx.fill(); ctx.lineWidth = 1 * k; ctx.strokeStyle = rgba(c0, 0.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(-cw / 2 + 20 * k, 0, 5 * k, 0, Math.PI * 2); ctx.fillStyle = rgba(c0); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(hud.text, 8 * k, 1);
      ctx.restore();
    }

    function frame(now) {
      if (!anim) return;
      if (scrub != null) { draw(scrub * anim.dur); return; }
      const t = (now - anim.t0) / 1000;
      draw(t);
      if (t < anim.dur + 0.1) raf = requestAnimationFrame(frame);
      else { size(); ctx.clearRect(0, 0, W, H); const k = anim.kind, l = anim.level; anim = null; onDone(); if (loop && !stopped) loopT = setTimeout(() => !stopped && fire(k, l), gap); }
    }

    return {
      fire,
      set(k, v) { S[k] = v; }, assign(o) { Object.assign(S, o); },
      scrubTo(f) { if (!anim) { anim = { t0: 0, kind: 'plug', level: 67, pal: paletteFor('plug', 67, S), dur: S.duration }; } scrub = f; draw(f * anim.dur); },
      stop() { stopped = true; clearTimeout(loopT); cancelAnimationFrame(raf); anim = null; size(); ctx.clearRect(0, 0, W, H); },
      get settings() { return S; },
      palettes: PALETTES,
    };
  }

  root.SurgeEngine = { create, paletteFor, PALETTES };
})(typeof window !== 'undefined' ? window : globalThis);
