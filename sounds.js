/* Surge sound library — every preset is a parameter set for the WebAudio synth in audio.html.
   Shared by the synth, the settings UI and the modules.  ~110 keyboard presets, 14 mouse presets. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.SurgeSounds = factory(); })(typeof window !== 'undefined' ? window : globalThis, function () {
  const L = (a, b, t) => a + (b - a) * t;
  // A key preset: body (resonant thump), click (noise transient), tail (soft lowpass noise), ping (spring ring), up (release)
  function P(name, o) { return { name, body: o.body || null, click: o.click || null, tail: o.tail || null, ping: o.ping || null, up: o.up || { f: 4200, dur: .014, vol: .35 }, space: o.space ?? 1.6, pv: o.pv ?? .22, tags: o.tags || [] }; }

  const THOCKY = ['Deep Thock','Holy Thock','Marble Thock','Velvet Thock','Midnight','Bass Drop','Lubed Linear','Walnut','Pillow','Boba','Leather','Subwoofer','Cave','Rain on Wood','Heavy Thock','Oak Barrel','Low Tide','Mellow','Thunder Soft','Dusk','Foam Mod','Tape Mod','Moss','Pebble','Deep Sea'];
  const CREAMY = ['Cream Linear','Butter','Silk','Vanilla','Custard','Milk Tea','Cloud','Caramel','Soft Serve','Marshmallow','Honey','Oat','Pudding','Satin','Fleece','Latte','Mochi','Whipped','Cashmere','Dove','Sand','Cream Soda','Almond','Linen','Daydream'];
  const CLICKY = ['Blue Click','Crisp','Snap','Sharp Click','Spring Ping','Typist','Clockwork','Popcorn','Cricket','Glass Click','Needle','Tick-Tock','Icicle','Firecracker','Crystal','Jade','Bell Click','Staccato','Switchblade','Zipper','Ratchet','Pin Drop','Pixel','Flint','Sparkle'];
  const CLACKY = ['Clack','ABS Clack','Arcade','Plastic','Hollow','Bamboo','Tin','Keycap Rattle','Board Clack','Chatter','Rattle','Tap Dance','Gravel','Dice','Domino','Skateboard','Knock','Ping Pong','Castanet','Tabletop','Pop Clack','Hard Hat','Box','Crate','Hailstorm'];
  const SPECIAL = ['Typewriter','Typewriter Ding','Retro 8-bit','Bubble','Laptop Soft','Membrane','Whisper','Raindrop','Piano Tap','Laser','Water Drop','Hollow Wood','Stone','Metal Pan','Kalimba'];

  // seeded RNG so every preset is stable but genuinely different
  function rng(seed) { let a = seed * 2654435761 >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const R = (r, a, b) => a + r() * (b - a);
  /* A richer recipe:
     body: up to 3 partials {ratio, decay, vol}, waveform, pitch drop, attack
     click: 1-2 noise transients (bandpass/highpass, varying Q)
     tail: lowpass noise with optional filter sweep
     ping: spring ring (clicky)
     rattle: a second quieter hit a few ms later (stabilizer / case)
     thin: highpass the whole hit (plastic / thin keycaps)  */
  function recipe(cat, i, name) {
    const r = rng(cat.charCodeAt(0) * 1000 + i * 7 + 13);
    const p = { name, cat, tags: [cat], pv: R(r, .08, .3), space: R(r, 1.3, 2) };
    const wave = pick(r, ['sine', 'triangle', 'sine', 'square', 'sawtooth']);
    if (cat === 'thocky') {
      const f = R(r, 95, 200);
      p.body = { f, drop: R(r, .2, .7), dur: R(r, .07, .22), type: pick(r, ['sine', 'sine', 'triangle']), vol: R(r, .6, 1), attack: R(r, .001, .006),
        partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: R(r, 1.4, 2.6), vol: R(r, .1, .5), decay: R(r, .3, .8) }, r() < .5 ? { ratio: R(r, 2.8, 4.5), vol: R(r, .05, .2), decay: R(r, .2, .5) } : null].filter(Boolean) };
      p.click = { f: R(r, 500, 1800), q: R(r, .6, 2.5), dur: R(r, .012, .04), vol: R(r, .05, .4), type: 'bandpass' };
      p.tail = { f: R(r, 400, 1400), dur: R(r, .03, .09), vol: R(r, .15, .5), sweep: r() < .5 ? R(r, .3, .7) : 0 };
      if (r() < .45) p.rattle = { delay: R(r, .008, .025), vol: R(r, .2, .5) };
      p.up = { f: R(r, 1200, 3000), dur: R(r, .012, .03), vol: R(r, .15, .4) };
    } else if (cat === 'creamy') {
      const f = R(r, 150, 290);
      p.body = { f, drop: R(r, .3, .8), dur: R(r, .05, .16), type: pick(r, ['sine', 'sine', 'triangle']), vol: R(r, .4, .8), attack: R(r, .002, .014),
        partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: R(r, 1.9, 3.1), vol: R(r, .05, .3), decay: R(r, .4, .9) }] };
      p.click = { f: R(r, 1200, 3200), q: R(r, .5, 1.5), dur: R(r, .015, .035), vol: R(r, .1, .35), type: pick(r, ['bandpass', 'lowpass']) };
      p.tail = { f: R(r, 900, 2600), dur: R(r, .04, .1), vol: R(r, .25, .6), sweep: R(r, .2, .8) };
      if (r() < .3) p.rattle = { delay: R(r, .01, .02), vol: R(r, .15, .3) };
      p.up = { f: R(r, 1800, 3600), dur: R(r, .015, .03), vol: R(r, .15, .35) };
    } else if (cat === 'clicky') {
      const f = R(r, 200, 420);
      p.body = { f, drop: R(r, .3, .8), dur: R(r, .015, .07), type: pick(r, ['triangle', 'square', 'sine']), vol: R(r, .15, .45), attack: .001, partials: [{ ratio: 1, vol: 1, decay: 1 }] };
      p.click = { f: R(r, 3500, 9000), q: R(r, .8, 4), dur: R(r, .006, .022), vol: R(r, .6, 1), type: pick(r, ['bandpass', 'highpass']) };
      if (r() < .6) p.click2 = { f: R(r, 2000, 5000), q: R(r, 1, 3), dur: R(r, .008, .02), vol: R(r, .2, .6), delay: R(r, .004, .012) };
      p.ping = { f: R(r, 2000, 5200), dur: R(r, .04, .2), vol: R(r, .05, .35), type: pick(r, ['sine', 'triangle']) };
      p.tail = { f: R(r, 1800, 4000), dur: R(r, .02, .05), vol: R(r, .1, .35), sweep: 0 };
      if (r() < .5) p.rattle = { delay: R(r, .006, .018), vol: R(r, .3, .7) };
      p.up = { f: R(r, 3500, 8000), dur: R(r, .008, .018), vol: R(r, .3, .7), ping: r() < .4 };
    } else if (cat === 'clacky') {
      const f = R(r, 230, 520);
      p.body = { f, drop: R(r, .2, .7), dur: R(r, .02, .09), type: pick(r, ['square', 'triangle', 'sawtooth', 'triangle']), vol: R(r, .25, .6), attack: .001,
        partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: R(r, 1.3, 2.2), vol: R(r, .2, .6), decay: R(r, .5, 1) }, r() < .5 ? { ratio: R(r, 3, 6), vol: R(r, .1, .3), decay: R(r, .3, .7) } : null].filter(Boolean) };
      p.click = { f: R(r, 1800, 5000), q: R(r, .6, 2.5), dur: R(r, .012, .03), vol: R(r, .5, .95), type: 'bandpass' };
      p.tail = { f: R(r, 1500, 3500), dur: R(r, .03, .07), vol: R(r, .3, .6), sweep: r() < .4 ? R(r, .3, .6) : 0 };
      if (r() < .7) p.rattle = { delay: R(r, .006, .03), vol: R(r, .3, .8) };
      if (r() < .5) p.thin = R(r, 150, 500);
      p.up = { f: R(r, 2500, 6000), dur: R(r, .01, .022), vol: R(r, .25, .55) };
    }
    return p;
  }
  function thocky(i) { return recipe('thocky', i, THOCKY[i]); }
  function creamy(i) { return recipe('creamy', i, CREAMY[i]); }
  function clicky(i) { return recipe('clicky', i, CLICKY[i]); }
  function clacky(i) { return recipe('clacky', i, CLACKY[i]); }
  const special = [
    P('Typewriter', { tags: ['special'], click: { f: 7000, q: 2, dur: .012, vol: 1 }, tail: { f: 2400, dur: .07, vol: .5, q: 6 }, body: { f: 420, f2: 200, dur: .03, type: 'square', vol: .25 }, space: 1.3, pv: .2 }),
    P('Typewriter Ding', { tags: ['special'], click: { f: 7000, q: 2, dur: .012, vol: 1 }, tail: { f: 2400, dur: .07, vol: .5, q: 6 }, body: { f: 420, f2: 200, dur: .03, type: 'square', vol: .25 }, enterBell: true, space: 1.3, pv: .2 }),
    P('Retro 8-bit', { tags: ['special'], body: { f: 880, f2: 660, dur: .05, type: 'square', vol: .35 }, up: { f: 1200, dur: .02, vol: .15, tone: true }, space: 1, pv: .3 }),
    P('Bubble', { tags: ['special'], body: { f: 500, f2: 1100, dur: .07, type: 'sine', vol: .5, rise: true }, click: { f: 4000, q: 1, dur: .02, vol: .15 }, space: .8, pv: .3 }),
    P('Laptop Soft', { tags: ['special'], tail: { f: 1800, dur: .035, vol: .45 }, body: { f: 220, f2: 120, dur: .03, type: 'sine', vol: .2 }, space: 1.3, pv: .15 }),
    P('Membrane', { tags: ['special'], tail: { f: 1200, dur: .045, vol: .5 }, body: { f: 160, f2: 100, dur: .04, type: 'sine', vol: .25 }, up: { f: 1500, dur: .02, vol: .15 }, space: 1.4, pv: .12 }),
    P('Whisper', { tags: ['special'], tail: { f: 900, dur: .03, vol: .22 }, up: { f: 1200, dur: .01, vol: .08 }, space: 1.2, pv: .1 }),
    P('Raindrop', { tags: ['special'], body: { f: 1800, f2: 600, dur: .06, type: 'sine', vol: .35 }, click: { f: 6000, q: 2, dur: .008, vol: .3 }, space: .7, pv: .4 }),
    P('Piano Tap', { tags: ['special'], body: { f: 523, f2: 523, dur: .18, type: 'triangle', vol: .3, notes: true }, click: { f: 3000, q: 1, dur: .015, vol: .25 }, space: .5, pv: 0 }),
    P('Laser', { tags: ['special'], body: { f: 1600, f2: 200, dur: .09, type: 'sawtooth', vol: .25 }, space: 1, pv: .2 }),
    P('Water Drop', { tags: ['special'], body: { f: 300, f2: 900, dur: .08, type: 'sine', vol: .45, rise: true }, space: .8, pv: .35 }),
    P('Hollow Wood', { tags: ['special'], body: { f: 240, f2: 180, dur: .07, type: 'triangle', vol: .6 }, click: { f: 1800, q: 1, dur: .02, vol: .35 }, tail: { f: 900, dur: .05, vol: .3 }, space: 1.6, pv: .2 }),
    P('Stone', { tags: ['special'], click: { f: 2200, q: .7, dur: .03, vol: .7 }, body: { f: 140, f2: 90, dur: .05, type: 'sine', vol: .5 }, space: 1.7, pv: .25 }),
    P('Metal Pan', { tags: ['special'], ping: { f: 3200, dur: .2, vol: .3 }, click: { f: 5000, q: 1.5, dur: .015, vol: .6 }, body: { f: 600, f2: 400, dur: .05, type: 'square', vol: .2 }, space: 1.2, pv: .3 }),
    P('Kalimba', { tags: ['special'], body: { f: 659, f2: 659, dur: .3, type: 'sine', vol: .35, notes: true }, click: { f: 3500, q: 1, dur: .01, vol: .2 }, space: .5, pv: 0 }),
  ];
  // ---- Switches: sound-alikes of real mechanical switches, hand-tuned to their known character (no affiliation) ----
  const SW = (name, o) => Object.assign(P(name, o), { tags: ['switches'] });
  const clickJacket = (f, vol) => ({ f, q: 2.2, dur: .012, vol, type: 'bandpass' });
  const switches = [
    SW('MX Blue', { body: { f: 330, drop: .5, dur: .035, type: 'triangle', vol: .3, partials: [{ ratio: 1, vol: 1, decay: 1 }] }, click: clickJacket(5200, .95), click2: { f: 3600, q: 1.6, dur: .012, vol: .45, delay: .018 }, tail: { f: 2600, dur: .035, vol: .3 }, up: { f: 5600, q: 2, dur: .012, vol: .7 }, space: 1.4, pv: .12 }),
    SW('MX Green', { body: { f: 300, drop: .5, dur: .04, type: 'triangle', vol: .35, partials: [{ ratio: 1, vol: 1, decay: 1 }] }, click: clickJacket(4800, 1), click2: { f: 3200, q: 1.6, dur: .014, vol: .55, delay: .02 }, tail: { f: 2400, dur: .04, vol: .35 }, up: { f: 5200, q: 2, dur: .013, vol: .8 }, space: 1.5, pv: .12 }),
    SW('MX Brown', { body: { f: 260, drop: .45, dur: .045, type: 'triangle', vol: .45, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.3, vol: .2, decay: .5 }] }, click: { f: 1900, q: .9, dur: .025, vol: .35 }, tail: { f: 2200, dur: .06, vol: .45, sweep: .5 }, rattle: { delay: .011, vol: .3 }, up: { f: 2600, dur: .018, vol: .3 }, space: 1.5, pv: .15 }),
    SW('MX Clear', { body: { f: 240, drop: .45, dur: .05, type: 'triangle', vol: .5, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.1, vol: .25, decay: .5 }] }, click: { f: 1700, q: .9, dur: .028, vol: .4 }, tail: { f: 2000, dur: .065, vol: .45, sweep: .5 }, rattle: { delay: .012, vol: .35 }, up: { f: 2400, dur: .02, vol: .32 }, space: 1.6, pv: .15 }),
    SW('MX Red', { body: { f: 280, drop: .5, dur: .035, type: 'sine', vol: .4, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.6, vol: .15, decay: .4 }] }, click: { f: 2400, q: .8, dur: .02, vol: .3 }, tail: { f: 2600, dur: .045, vol: .4, sweep: .4 }, up: { f: 3000, dur: .016, vol: .3 }, space: 1.5, pv: .14 }),
    SW('MX Black', { body: { f: 210, drop: .45, dur: .05, type: 'sine', vol: .55, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.4, vol: .15, decay: .4 }] }, click: { f: 1800, q: .8, dur: .022, vol: .3 }, tail: { f: 1900, dur: .05, vol: .4, sweep: .4 }, up: { f: 2400, dur: .018, vol: .3 }, space: 1.7, pv: .14 }),
    SW('MX Speed Silver', { body: { f: 340, drop: .55, dur: .025, type: 'sine', vol: .32, partials: [{ ratio: 1, vol: 1, decay: 1 }] }, click: { f: 3000, q: 1, dur: .014, vol: .35 }, tail: { f: 3200, dur: .03, vol: .35 }, up: { f: 3600, dur: .012, vol: .3 }, space: 1.3, pv: .12 }),
    SW('MX2A Red', { body: { f: 270, drop: .5, dur: .04, type: 'sine', vol: .42, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.2, vol: .1, decay: .4 }] }, click: { f: 2000, q: .7, dur: .02, vol: .22 }, tail: { f: 2200, dur: .05, vol: .38, sweep: .5 }, up: { f: 2600, dur: .016, vol: .25 }, space: 1.5, pv: .12 }),
    SW('Holy Panda', { body: { f: 150, drop: .4, dur: .09, type: 'sine', vol: .9, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 1.8, vol: .35, decay: .6 }, { ratio: 3.1, vol: .12, decay: .3 }] }, click: { f: 1300, q: 1.4, dur: .02, vol: .35 }, tail: { f: 900, dur: .07, vol: .4, sweep: .5 }, rattle: { delay: .014, vol: .3 }, up: { f: 1800, dur: .022, vol: .3 }, space: 1.8, pv: .12 }),
    SW('Boba U4T', { body: { f: 135, drop: .4, dur: .1, type: 'sine', vol: .95, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 1.6, vol: .3, decay: .6 }] }, click: { f: 1100, q: 1.2, dur: .02, vol: .3 }, tail: { f: 800, dur: .08, vol: .4, sweep: .5 }, up: { f: 1500, dur: .024, vol: .28 }, space: 1.9, pv: .1 }),
    SW('Boba U4 Silent', { body: { f: 140, drop: .4, dur: .06, type: 'sine', vol: .4, partials: [{ ratio: 1, vol: 1, decay: 1 }] }, tail: { f: 600, dur: .05, vol: .25, sweep: .4 }, up: { f: 900, dur: .02, vol: .1 }, space: 1.6, pv: .1 }),
    SW('Zealios V2', { body: { f: 230, drop: .45, dur: .055, type: 'triangle', vol: .5, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2, vol: .25, decay: .5 }] }, click: { f: 1800, q: 1, dur: .022, vol: .35 }, tail: { f: 1700, dur: .06, vol: .4, sweep: .5 }, rattle: { delay: .012, vol: .25 }, up: { f: 2300, dur: .02, vol: .3 }, space: 1.6, pv: .12 }),
    SW('Tangerine', { body: { f: 250, drop: .5, dur: .05, type: 'sine', vol: .5, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.5, vol: .12, decay: .4 }] }, click: { f: 2100, q: .8, dur: .018, vol: .25 }, tail: { f: 2300, dur: .05, vol: .4, sweep: .6 }, up: { f: 2800, dur: .016, vol: .25 }, space: 1.5, pv: .1 }),
    SW('Alpaca', { body: { f: 290, drop: .5, dur: .04, type: 'triangle', vol: .45, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.2, vol: .3, decay: .5 }] }, click: { f: 2800, q: 1, dur: .018, vol: .45 }, tail: { f: 2600, dur: .045, vol: .4 }, up: { f: 3200, dur: .015, vol: .35 }, space: 1.4, pv: .14 }),
    SW('Gateron Yellow', { body: { f: 270, drop: .5, dur: .04, type: 'triangle', vol: .42, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.3, vol: .2, decay: .5 }] }, click: { f: 2500, q: .9, dur: .02, vol: .35 }, tail: { f: 2400, dur: .045, vol: .4, sweep: .4 }, up: { f: 3000, dur: .016, vol: .3 }, space: 1.5, pv: .14 }),
    SW('Oil King', { body: { f: 170, drop: .4, dur: .08, type: 'sine', vol: .8, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 1.9, vol: .2, decay: .5 }] }, click: { f: 1400, q: 1, dur: .018, vol: .22 }, tail: { f: 1000, dur: .07, vol: .35, sweep: .6 }, up: { f: 1800, dur: .02, vol: .25 }, space: 1.8, pv: .1 }),
    SW('Box White', { body: { f: 380, drop: .55, dur: .025, type: 'square', vol: .22, partials: [{ ratio: 1, vol: 1, decay: 1 }] }, click: { f: 6500, q: 3, dur: .008, vol: 1, type: 'bandpass' }, ping: { f: 4200, dur: .05, vol: .18, type: 'sine' }, tail: { f: 3000, dur: .03, vol: .25 }, thin: 300, up: { f: 7000, q: 3, dur: .008, vol: .75, ping: true }, space: 1.3, pv: .08 }),
    SW('Box Jade', { body: { f: 340, drop: .5, dur: .03, type: 'square', vol: .3, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.7, vol: .3, decay: .5 }] }, click: { f: 5200, q: 2.5, dur: .012, vol: 1 }, click2: { f: 3400, q: 2, dur: .012, vol: .5, delay: .008 }, ping: { f: 3600, dur: .09, vol: .3, type: 'triangle' }, tail: { f: 2800, dur: .035, vol: .3 }, up: { f: 5600, q: 2.5, dur: .01, vol: .85, ping: true }, space: 1.4, pv: .08 }),
    SW('Box Navy', { body: { f: 300, drop: .5, dur: .035, type: 'square', vol: .35, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.5, vol: .35, decay: .5 }] }, click: { f: 4600, q: 2.5, dur: .014, vol: 1 }, click2: { f: 3000, q: 2, dur: .014, vol: .6, delay: .009 }, ping: { f: 3100, dur: .12, vol: .35, type: 'triangle' }, tail: { f: 2400, dur: .04, vol: .35 }, up: { f: 5000, q: 2.5, dur: .012, vol: .9, ping: true }, space: 1.5, pv: .08 }),
    SW('Speed Copper', { body: { f: 320, drop: .5, dur: .03, type: 'triangle', vol: .35, partials: [{ ratio: 1, vol: 1, decay: 1 }] }, click: { f: 2600, q: 1, dur: .016, vol: .4 }, tail: { f: 2800, dur: .035, vol: .35 }, rattle: { delay: .008, vol: .3 }, up: { f: 3200, dur: .013, vol: .3 }, space: 1.3, pv: .12 }),
    SW('Topre 45g', { body: { f: 190, drop: .35, dur: .07, type: 'sine', vol: .8, attack: .003, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 1.5, vol: .4, decay: .7 }, { ratio: 2.2, vol: .15, decay: .4 }] }, tail: { f: 1100, dur: .05, vol: .3, sweep: .6 }, up: { f: 1600, dur: .025, vol: .2 }, space: 1.7, pv: .1 }),
    SW('Buckling Spring', { body: { f: 420, drop: .4, dur: .04, type: 'square', vol: .35, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 3.2, vol: .3, decay: .6 }] }, click: { f: 4000, q: 1.5, dur: .016, vol: .9 }, ping: { f: 2700, dur: .22, vol: .45, type: 'triangle' }, tail: { f: 2200, dur: .05, vol: .4 }, rattle: { delay: .02, vol: .5 }, up: { f: 3800, q: 1.5, dur: .014, vol: .6, ping: true }, space: 1.4, pv: .1 }),
    SW('Alps SKCM Blue', { body: { f: 360, drop: .5, dur: .03, type: 'triangle', vol: .3, partials: [{ ratio: 1, vol: 1, decay: 1 }] }, click: { f: 5800, q: 2, dur: .011, vol: .95 }, tail: { f: 2900, dur: .035, vol: .3 }, rattle: { delay: .01, vol: .35 }, up: { f: 6000, q: 2, dur: .011, vol: .7 }, space: 1.4, pv: .1 }),
    SW('Outemu Blue', { body: { f: 350, drop: .55, dur: .03, type: 'square', vol: .3, partials: [{ ratio: 1, vol: 1, decay: 1 }] }, click: { f: 6000, q: 1.5, dur: .013, vol: 1 }, click2: { f: 4200, q: 1.5, dur: .013, vol: .5, delay: .02 }, tail: { f: 3200, dur: .03, vol: .35 }, thin: 250, up: { f: 6200, q: 1.5, dur: .012, vol: .75 }, space: 1.3, pv: .15 }),
    SW('Jelly Pink', { body: { f: 240, drop: .5, dur: .05, type: 'sine', vol: .5, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.4, vol: .12, decay: .4 }] }, click: { f: 1900, q: .7, dur: .02, vol: .22 }, tail: { f: 2000, dur: .055, vol: .42, sweep: .6 }, up: { f: 2600, dur: .018, vol: .25 }, space: 1.5, pv: .1 }),
    SW('NK Cream', { body: { f: 210, drop: .45, dur: .07, type: 'sine', vol: .7, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2, vol: .35, decay: .6 }, { ratio: 3.4, vol: .1, decay: .3 }] }, click: { f: 2200, q: 1, dur: .02, vol: .35 }, tail: { f: 1600, dur: .06, vol: .45, sweep: .5 }, rattle: { delay: .013, vol: .3 }, up: { f: 2600, dur: .02, vol: .3 }, space: 1.6, pv: .1 }),
    SW('Banana Split', { body: { f: 185, drop: .45, dur: .075, type: 'sine', vol: .75, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 1.7, vol: .25, decay: .5 }] }, click: { f: 1600, q: .9, dur: .02, vol: .28 }, tail: { f: 1200, dur: .06, vol: .4, sweep: .5 }, up: { f: 2000, dur: .02, vol: .26 }, space: 1.7, pv: .1 }),
    SW('Durock T1', { body: { f: 170, drop: .4, dur: .08, type: 'sine', vol: .8, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 1.9, vol: .3, decay: .6 }] }, click: { f: 1500, q: 1.2, dur: .022, vol: .4 }, tail: { f: 1100, dur: .065, vol: .4, sweep: .5 }, rattle: { delay: .015, vol: .35 }, up: { f: 1900, dur: .022, vol: .3 }, space: 1.8, pv: .12 }),
    SW('Aqua King', { body: { f: 230, drop: .5, dur: .055, type: 'sine', vol: .55, partials: [{ ratio: 1, vol: 1, decay: 1 }, { ratio: 2.1, vol: .15, decay: .5 }] }, click: { f: 1700, q: .7, dur: .018, vol: .2 }, tail: { f: 1500, dur: .06, vol: .4, sweep: .6 }, up: { f: 2200, dur: .018, vol: .22 }, space: 1.6, pv: .1 }),
    SW('Lavender Silent', { body: { f: 200, drop: .5, dur: .045, type: 'sine', vol: .35, partials: [{ ratio: 1, vol: 1, decay: 1 }] }, tail: { f: 700, dur: .04, vol: .25, sweep: .4 }, up: { f: 1000, dur: .018, vol: .1 }, space: 1.5, pv: .1 }),
  ];

  const keyboard = [
    { id: 'switches', name: 'Switches', color: '#FFFFFF', desc: 'Sound-alikes of real mechanical switches', presets: switches },
    { id: 'thocky', name: 'Thocky', color: '#FFB300', desc: 'Deep, muted, satisfying', presets: THOCKY.map((_, i) => thocky(i)) },
    { id: 'creamy', name: 'Creamy', color: '#7A5CFF', desc: 'Smooth, rounded, soft', presets: CREAMY.map((_, i) => creamy(i)) },
    { id: 'clicky', name: 'Clicky', color: '#00D4FF', desc: 'Crisp transient + spring ping', presets: CLICKY.map((_, i) => clicky(i)) },
    { id: 'clacky', name: 'Clacky', color: '#FF3DF0', desc: 'Bright, plasticky, loud', presets: CLACKY.map((_, i) => clacky(i)) },
    { id: 'special', name: 'Special', color: '#00FF85', desc: 'Typewriters, retro, instruments', presets: special },
  ];
  // slug ids: "thocky/Deep Thock" → "thocky:deep-thock"
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  for (const c of keyboard) for (const p of c.presets) { p.id = `${c.id}:${slug(p.name)}`; p.cat = c.id; }

  const M = (name, o) => ({ name, id: slug(name), ...o });
  const mouse = [
    M('Click', { click: { f: 3200, q: 1.5, dur: .02, vol: 1 }, body: { f: 240, f2: 120, dur: .03, type: 'triangle', vol: .3 }, up: { f: 4200, q: 1.5, dur: .012, vol: .5 } }),
    M('Tick', { click: { f: 6500, q: 3, dur: .01, vol: 1 }, up: { f: 7000, q: 3, dur: .008, vol: .5 } }),
    M('Pop', { body: { f: 420, f2: 160, dur: .05, type: 'sine', vol: .6 }, up: { f: 700, f2: 300, dur: .05, tone: true, vol: .35 } }),
    M('Wood', { body: { f: 380, f2: 200, dur: .06, type: 'triangle', vol: .5 }, click: { f: 1500, q: 1, dur: .03, vol: .3, type: 'lowpass' }, up: { f: 520, f2: 200, dur: .05, tone: true, vol: .3 } }),
    M('Glass', { ping: { f: 4200, dur: .12, vol: .3 }, click: { f: 7000, q: 2, dur: .01, vol: .6 }, up: { f: 5000, q: 2, dur: .01, vol: .3 } }),
    M('Deep Click', { body: { f: 150, f2: 70, dur: .07, type: 'sine', vol: .8 }, click: { f: 1200, q: 1, dur: .025, vol: .4 }, up: { f: 1800, q: 1, dur: .015, vol: .3 } }),
    M('Soft Click', { tail: { f: 1600, dur: .03, vol: .4 }, body: { f: 220, f2: 120, dur: .03, type: 'sine', vol: .2 }, up: { f: 2000, q: 1, dur: .012, vol: .15 } }),
    M('Shutter', { click: { f: 2800, q: 1, dur: .018, vol: .9 }, click2: { f: 3600, q: 1, dur: .018, vol: .7, delay: .045 }, up: null }),
    M('Bubble', { body: { f: 500, f2: 1100, dur: .07, type: 'sine', vol: .5, rise: true }, up: { f: 900, f2: 1400, dur: .05, tone: true, vol: .25 } }),
    M('Snap', { click: { f: 5000, q: 1.2, dur: .015, vol: 1 }, body: { f: 600, f2: 200, dur: .03, type: 'square', vol: .25 }, up: { f: 5500, q: 1.2, dur: .01, vol: .4 } }),
    M('Metal', { ping: { f: 3000, dur: .15, vol: .25 }, click: { f: 4500, q: 1.5, dur: .014, vol: .6 }, body: { f: 700, f2: 500, dur: .04, type: 'square', vol: .15 }, up: { f: 3800, q: 1.5, dur: .01, vol: .3 } }),
    M('Marble', { body: { f: 900, f2: 500, dur: .05, type: 'sine', vol: .4 }, click: { f: 4000, q: 1, dur: .012, vol: .5 }, up: { f: 3500, q: 1, dur: .01, vol: .25 } }),
    M('Typewriter', { click: { f: 7000, q: 2, dur: .012, vol: 1 }, tail: { f: 2400, dur: .06, vol: .5, q: 6 }, up: { f: 6000, q: 2, dur: .01, vol: .35 } }),
    M('Silent', { tail: { f: 800, dur: .02, vol: .18 }, up: null }),
  ];

  const scrolls = [M('Fine', { click: { f: 7000, q: 4, dur: .008, vol: 1 } }), M('Ratchet', { click: { f: 4000, q: 2, dur: .012, vol: 1 }, body: { f: 500, f2: 300, dur: .02, type: 'square', vol: .2 } }), M('Soft', { tail: { f: 1500, dur: .015, vol: .6 } })];

  const all = keyboard.flatMap(c => c.presets);
  const GAINS = {"thocky:deep-thock":4.986,"thocky:holy-thock":0.587,"thocky:marble-thock":0.922,"thocky:velvet-thock":0.591,"thocky:midnight":0.853,"thocky:bass-drop":0.87,"thocky:lubed-linear":1.307,"thocky:walnut":0.752,"thocky:pillow":1.18,"thocky:boba":0.962,"thocky:leather":0.737,"thocky:subwoofer":0.884,"thocky:cave":0.702,"thocky:rain-on-wood":0.71,"thocky:heavy-thock":0.92,"thocky:oak-barrel":0.795,"thocky:low-tide":0.819,"thocky:mellow":1.044,"thocky:thunder-soft":0.762,"thocky:dusk":0.7,"thocky:foam-mod":0.808,"thocky:tape-mod":0.709,"thocky:moss":0.684,"thocky:pebble":0.995,"thocky:deep-sea":0.654,"creamy:cream-linear":1.217,"creamy:butter":1.488,"creamy:silk":1.067,"creamy:vanilla":0.844,"creamy:custard":1.294,"creamy:milk-tea":0.903,"creamy:cloud":1.017,"creamy:caramel":1.266,"creamy:soft-serve":1.276,"creamy:marshmallow":0.98,"creamy:honey":0.865,"creamy:oat":1.689,"creamy:pudding":1.09,"creamy:satin":1.225,"creamy:fleece":0.693,"creamy:latte":1.055,"creamy:mochi":0.806,"creamy:whipped":1.536,"creamy:cashmere":0.747,"creamy:dove":0.819,"creamy:sand":1.178,"creamy:cream-soda":0.773,"creamy:almond":0.957,"creamy:linen":0.965,"creamy:daydream":1.021,"clicky:blue-click":0.847,"clicky:crisp":0.849,"clicky:snap":0.957,"clicky:sharp-click":0.679,"clicky:spring-ping":2.584,"clicky:typist":0.704,"clicky:clockwork":0.754,"clicky:popcorn":1.017,"clicky:cricket":0.778,"clicky:glass-click":1.517,"clicky:needle":0.799,"clicky:tick-tock":0.71,"clicky:icicle":0.948,"clicky:firecracker":1.435,"clicky:crystal":0.681,"clicky:jade":1.503,"clicky:bell-click":0.857,"clicky:staccato":2.361,"clicky:switchblade":0.755,"clicky:zipper":1.714,"clicky:ratchet":0.855,"clicky:pin-drop":0.854,"clicky:pixel":0.912,"clicky:flint":1.341,"clicky:sparkle":1.322,"clacky:clack":1.011,"clacky:abs-clack":0.857,"clacky:arcade":0.928,"clacky:plastic":0.675,"clacky:hollow":0.924,"clacky:bamboo":1.68,"clacky:tin":1.411,"clacky:keycap-rattle":1.529,"clacky:board-clack":1.608,"clacky:chatter":1.096,"clacky:rattle":1.076,"clacky:tap-dance":1.04,"clacky:gravel":1.279,"clacky:dice":1.08,"clacky:domino":1.092,"clacky:skateboard":0.968,"clacky:knock":0.837,"clacky:ping-pong":1.292,"clacky:castanet":0.982,"clacky:tabletop":0.591,"clacky:pop-clack":1.956,"clacky:hard-hat":1.024,"clacky:box":0.779,"clacky:crate":0.681,"clacky:hailstorm":1.055,"special:typewriter":1.249,"special:typewriter-ding":1.077,"special:retro-8-bit":2.036,"special:bubble":1.294,"special:laptop-soft":1.912,"special:membrane":2.658,"special:whisper":5,"special:raindrop":1.608,"special:piano-tap":2.11,"special:laser":2.851,"special:water-drop":1.44,"special:hollow-wood":0.982,"special:stone":1.133,"special:metal-pan":1.762,"special:kalimba":1.836,"click":1.282,"tick":2.39,"pop":1.221,"wood":1.72,"glass":2.193,"deep-click":0.973,"soft-click":2.39,"shutter":1.298,"bubble":1.339,"snap":0.919,"metal":1.618,"marble":1.284,"typewriter":1.676,"silent":5,"switches:mx-blue":5,"switches:mx-green":0.972,"switches:mx-brown":1.202,"switches:mx-clear":1.229,"switches:mx-red":1.406,"switches:mx-black":0.904,"switches:mx-speed-silver":1.583,"switches:mx2a-red":1.328,"switches:holy-panda":0.756,"switches:boba-u4t":0.715,"switches:boba-u4-silent":1.761,"switches:zealios-v2":1.483,"switches:tangerine":0.902,"switches:alpaca":1.495,"switches:gateron-yellow":1.367,"switches:oil-king":0.787,"switches:box-white":1.075,"switches:box-jade":1.105,"switches:box-navy":0.719,"switches:speed-copper":1.441,"switches:topre-45g":0.803,"switches:buckling-spring":0.713,"switches:alps-skcm-blue":1.201,"switches:outemu-blue":0.897,"switches:jelly-pink":0.926,"switches:nk-cream":0.809,"switches:banana-split":0.875,"switches:durock-t1":0.648,"switches:aqua-king":1.531,"switches:lavender-silent":2.007};
  for (const p of [...all, ...mouse]) p.gain = GAINS[p.id] ?? 1;
  return { keyboard, mouse, scrolls, all, findKey: id => all.find(p => p.id === id) || all[0], findMouse: id => mouse.find(p => p.id === id) || mouse[0], findScroll: id => scrolls.find(p => p.id === id) || scrolls[0], count: all.length };
});
