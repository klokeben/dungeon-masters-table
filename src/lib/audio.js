/* ============================================================
   THE SOUNDBOARD — everything here is synthesized live in the
   browser with the Web Audio API. No audio files, no licensing,
   no loading. Ambiences layer drones, filtered noise and
   scheduled motifs; SFX are one-shot synth patches.
   ============================================================ */

const A4 = 440;
/** note('D4') -> Hz */
export function note(n) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  if (!m) return 440;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const oct = parseInt(m[3], 10);
  const midi = 12 * (oct + 1) + base + acc;
  return A4 * Math.pow(2, (midi - 69) / 12);
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ============================================================
   ENGINE
   ============================================================ */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverb = null;
    this.reverbSend = null;
    this.dry = null;
    this.current = null; // { key, gain, dispose }
    this.noiseCache = {};
    this.volume = 0.7;
    this.ambienceVolume = 0.55;
    this.sfxVolume = 0.9;
  }

  /** Must be called from a user gesture (browsers block autoplay). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // A generated cathedral-ish impulse response.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.9, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.85;
    this.reverb.connect(wet);
    wet.connect(this.master);

    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(this.reverb);

    this.dry = ctx.createGain();
    this.dry.gain.value = 1;
    this.dry.connect(this.master);

    return ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /* ---------- buffers ---------- */

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  noise(type = 'white', seconds = 3) {
    const key = `${type}:${seconds}`;
    if (this.noiseCache[key]) return this.noiseCache[key];
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);

    if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    this.noiseCache[key] = buf;
    return buf;
  }

  /* ---------- primitives ---------- */

  /** A looping noise source through a filter — wind, murmur, sea, rain. */
  noiseLayer(out, { type = 'pink', freq = 700, q = 0.7, filter = 'bandpass', gain = 0.2 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(type, 4);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(out);
    g.gain.setTargetAtTime(gain, ctx.currentTime, 1.2);
    src.start();
    return { src, filter: f, gain: g };
  }

  /** A sustained tone with slow detune drift — the backbone of every drone. */
  drone(out, freq, { type = 'sawtooth', gain = 0.09, cutoff = 300, detune = 0, drift = 6 } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 1.5;

    const g = ctx.createGain();
    g.gain.value = 0;

    // slow LFO on the filter so the drone breathes
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rand(0.03, 0.11);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cutoff * 0.45;
    lfo.connect(lfoGain).connect(f.frequency);
    lfo.start();

    osc.connect(f).connect(g).connect(out);
    g.gain.setTargetAtTime(gain, ctx.currentTime, 2.0);
    osc.start();

    if (drift) {
      const dl = ctx.createOscillator();
      dl.frequency.value = rand(0.05, 0.15);
      const dg = ctx.createGain();
      dg.gain.value = drift;
      dl.connect(dg).connect(osc.detune);
      dl.start();
    }
    return { osc, gain: g, filter: f };
  }

  /** Plucked string — noise burst into a resonant bandpass, plus a body tone. */
  pluck(out, freq, when = 0, { gain = 0.22, decay = 1.1, bright = 2.2 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;

    const src = ctx.createBufferSource();
    src.buffer = this.noise('white', 1);
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * bright;
    bp.Q.value = 6;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * 0.8, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.5);

    src.connect(bp).connect(g).connect(out);
    src.start(t);
    src.stop(t + decay * 0.6);

    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = freq;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(gain, t + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    body.connect(bg).connect(out);
    body.start(t);
    body.stop(t + decay + 0.05);
  }

  /** Simple enveloped oscillator tone. */
  tone(out, freq, when = 0, { type = 'sine', gain = 0.2, attack = 0.01, decay = 0.5, sweepTo = null } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.05);
    return osc;
  }

  /** Membrane hit — kick, tom, heartbeat, distant boom. */
  drum(out, freq = 90, when = 0, { gain = 0.5, decay = 0.4, sweep = 0.25 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * sweep), t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.05);

    // a touch of skin noise
    const n = ctx.createBufferSource();
    n.buffer = this.noise('white', 1);
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(nf).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 0.12);
  }

  /** Filtered noise burst — whoosh, clash, crackle, wave. */
  burst(out, when = 0, { gain = 0.4, decay = 0.3, freq = 2000, q = 1, type = 'bandpass', noiseType = 'white', sweepTo = null } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(noiseType, 2);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + decay + 0.06);
  }

  /* ============================================================
     AMBIENCE
     ============================================================ */

  playAmbience(key) {
    this.init();
    const def = AMBIENCE_MAP[key];
    if (!def) return;

    if (this.current?.key === key) return this.stopAmbience();

    this.stopAmbience();

    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.dry);

    const send = ctx.createGain();
    send.gain.value = def.reverb ?? 0.25;
    bus.connect(send).connect(this.reverbSend);

    const timers = [];
    const every = (ms, fn, jitter = 0.5) => {
      const schedule = () => {
        const t = setTimeout(() => {
          fn();
          schedule();
        }, ms * rand(1 - jitter, 1 + jitter));
        timers.push(t);
      };
      schedule();
    };

    const nodes = def.build(this, bus, { every, rand, pick, note });

    bus.gain.setTargetAtTime(this.ambienceVolume * (def.level ?? 1), ctx.currentTime, 1.4);

    this.current = {
      key,
      bus,
      dispose: () => {
        timers.forEach(clearTimeout);
        bus.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
        setTimeout(() => {
          (nodes || []).forEach((n) => {
            try { n?.src?.stop?.(); } catch { /* already stopped */ }
            try { n?.osc?.stop?.(); } catch { /* already stopped */ }
          });
          try { bus.disconnect(); } catch { /* already gone */ }
        }, 2600);
      },
    };
    return key;
  }

  stopAmbience() {
    if (this.current) {
      this.current.dispose();
      this.current = null;
    }
  }

  get playing() {
    return this.current?.key || null;
  }

  /* ============================================================
     SFX
     ============================================================ */

  playSfx(key) {
    this.init();
    const def = SFX_MAP[key];
    if (!def) return;
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = this.sfxVolume;
    bus.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = def.reverb ?? 0.2;
    bus.connect(send).connect(this.reverbSend);
    def.build(this, bus, { rand, pick, note });
    setTimeout(() => bus.disconnect(), (def.life ?? 4) * 1000);
  }
}

/* ============================================================
   AMBIENCE DEFINITIONS
   ============================================================ */

export const AMBIENCES = [
  {
    key: 'tavern',
    label: 'The Common Room',
    glyph: '🍺',
    desc: 'Murmuring crowd, crackling hearth, a lute in the corner',
    reverb: 0.18,
    level: 1,
    build(eng, out, { every }) {
      const nodes = [];
      nodes.push(eng.noiseLayer(out, { type: 'brown', freq: 420, q: 0.6, gain: 0.16 })); // crowd
      nodes.push(eng.noiseLayer(out, { type: 'pink', freq: 1400, q: 0.4, filter: 'lowpass', gain: 0.045 })); // room
      // hearth crackle
      every(420, () => {
        const n = Math.floor(rand(1, 4));
        for (let i = 0; i < n; i++) {
          eng.burst(out, i * rand(0.01, 0.07), { gain: rand(0.05, 0.16), decay: rand(0.02, 0.07), freq: rand(900, 3200), q: 1.4 });
        }
      });
      // lute — D dorian, lilting
      const scale = ['D3', 'F3', 'G3', 'A3', 'C4', 'D4', 'F4', 'G4', 'A4'];
      let step = 0;
      every(2400, () => {
        const seq = [0, 2, 4, 3, 5, 4, 2, 1];
        for (let i = 0; i < 6; i++) {
          const idx = (seq[(step + i) % seq.length] + (step % 3)) % scale.length;
          eng.pluck(out, note(scale[idx]), i * 0.28, { gain: rand(0.05, 0.09), decay: rand(0.7, 1.4) });
        }
        step++;
      }, 0.15);
      // mugs, laughter, a bench scraping
      every(6000, () => {
        eng.tone(out, rand(1100, 2000), 0, { type: 'triangle', gain: 0.09, decay: 0.35 });
        eng.tone(out, rand(1400, 2600), 0.06, { type: 'triangle', gain: 0.05, decay: 0.25 });
      });
      return nodes;
    },
  },
  {
    key: 'town',
    label: 'Market & Streets',
    glyph: '🏘️',
    desc: 'Daytime bustle, cart wheels, a distant bell',
    reverb: 0.22,
    build(eng, out, { every }) {
      const nodes = [];
      nodes.push(eng.noiseLayer(out, { type: 'brown', freq: 560, q: 0.5, gain: 0.13 }));
      nodes.push(eng.noiseLayer(out, { type: 'pink', freq: 2600, q: 0.3, filter: 'highpass', gain: 0.022 }));
      every(3400, () => {
        // cart / footfalls
        for (let i = 0; i < 4; i++) eng.burst(out, i * 0.19, { gain: 0.07, decay: 0.1, freq: rand(200, 480), q: 2 });
      });
      every(19000, () => {
        // town bell
        [0, 2.4].forEach((d) => {
          eng.tone(out, note('G3'), d, { type: 'sine', gain: 0.16, attack: 0.005, decay: 2.6 });
          eng.tone(out, note('G3') * 2.76, d, { type: 'sine', gain: 0.06, attack: 0.005, decay: 1.8 });
          eng.tone(out, note('G3') * 5.4, d, { type: 'sine', gain: 0.025, attack: 0.005, decay: 1.1 });
        });
      }, 0.3);
      return nodes;
    },
  },
  {
    key: 'forest',
    label: 'Deep Wood',
    glyph: '🌲',
    desc: 'Wind through leaves, birdsong, something moving',
    reverb: 0.2,
    build(eng, out, { every }) {
      const nodes = [];
      const wind = eng.noiseLayer(out, { type: 'pink', freq: 800, q: 0.45, gain: 0.14 });
      nodes.push(wind);
      // wind swells
      const ctx = eng.ctx;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06;
      const lg = ctx.createGain();
      lg.gain.value = 480;
      lfo.connect(lg).connect(wind.filter.frequency);
      lfo.start();
      nodes.push({ osc: lfo });

      every(2600, () => {
        // birdsong — a few chirps
        const base = rand(1800, 3600);
        const n = Math.floor(rand(2, 5));
        for (let i = 0; i < n; i++) {
          eng.tone(out, base * rand(0.9, 1.15), i * 0.11, {
            type: 'sine', gain: 0.055, attack: 0.006, decay: 0.09, sweepTo: base * rand(1.2, 1.9),
          });
        }
      }, 0.6);
      every(7000, () => {
        // leaf rustle
        eng.burst(out, 0, { gain: 0.09, decay: 0.5, freq: 3400, q: 0.8, noiseType: 'pink' });
      });
      return nodes;
    },
  },
  {
    key: 'camp',
    label: 'Night Camp',
    glyph: '🔥',
    desc: 'Crickets, a low fire, watch after watch',
    reverb: 0.15,
    build(eng, out, { every }) {
      const nodes = [];
      nodes.push(eng.noiseLayer(out, { type: 'pink', freq: 400, q: 0.4, filter: 'lowpass', gain: 0.06 }));
      // crickets — rhythmic high chirps
      every(900, () => {
        const f = rand(4200, 5200);
        for (let i = 0; i < 3; i++) {
          eng.tone(out, f, i * 0.055, { type: 'square', gain: 0.012, attack: 0.004, decay: 0.035 });
        }
      }, 0.25);
      every(300, () => {
        eng.burst(out, 0, { gain: rand(0.04, 0.13), decay: rand(0.02, 0.08), freq: rand(700, 2800), q: 1.6 });
      });
      every(11000, () => {
        eng.tone(out, rand(300, 700), 0, { type: 'sine', gain: 0.03, attack: 0.05, decay: 1.4, sweepTo: rand(160, 320) });
      });
      return nodes;
    },
  },
  {
    key: 'dungeon',
    label: 'Beneath the Stone',
    glyph: '🕯️',
    desc: 'Dripping water, low rumble, held breath',
    reverb: 0.55,
    build(eng, out, { every }) {
      const nodes = [];
      nodes.push(eng.drone(out, note('C1'), { gain: 0.13, cutoff: 150, type: 'sawtooth' }));
      nodes.push(eng.drone(out, note('G1'), { gain: 0.06, cutoff: 190, type: 'triangle', detune: -8 }));
      nodes.push(eng.noiseLayer(out, { type: 'brown', freq: 180, q: 0.4, filter: 'lowpass', gain: 0.09 }));
      every(2800, () => {
        // drip
        eng.tone(out, rand(900, 1700), 0, {
          type: 'sine', gain: 0.11, attack: 0.003, decay: 0.16, sweepTo: rand(300, 600),
        });
      }, 0.7);
      every(15000, () => {
        // distant collapse
        eng.drum(out, 48, 0, { gain: 0.22, decay: 1.6, sweep: 0.4 });
        eng.burst(out, 0.05, { gain: 0.08, decay: 1.2, freq: 220, q: 0.7, type: 'lowpass', noiseType: 'brown' });
      }, 0.5);
      return nodes;
    },
  },
  {
    key: 'temple',
    label: 'Hall of the Divine',
    glyph: '⛪',
    desc: 'Choral fifths in a vast stone space',
    reverb: 0.7,
    build(eng, out, { every }) {
      const nodes = [];
      ['C3', 'G3', 'C4', 'E4'].forEach((n, i) =>
        nodes.push(eng.drone(out, note(n), { gain: 0.05 - i * 0.006, cutoff: 900, type: 'sine', detune: i * 4 - 6 }))
      );
      nodes.push(eng.noiseLayer(out, { type: 'pink', freq: 3000, q: 0.3, filter: 'highpass', gain: 0.012 }));
      every(13000, () => {
        eng.tone(out, note('C5'), 0, { type: 'sine', gain: 0.1, attack: 0.01, decay: 3.4 });
        eng.tone(out, note('G5'), 0.02, { type: 'sine', gain: 0.045, attack: 0.01, decay: 2.6 });
      }, 0.4);
      return nodes;
    },
  },
  {
    key: 'sea',
    label: 'Ship & Open Water',
    glyph: '⛵',
    desc: 'Waves against the hull, rigging, gulls',
    reverb: 0.3,
    build(eng, out, { every }) {
      const nodes = [];
      const sea = eng.noiseLayer(out, { type: 'brown', freq: 500, q: 0.35, filter: 'lowpass', gain: 0.17 });
      nodes.push(sea);
      const ctx = eng.ctx;
      const swell = ctx.createOscillator();
      swell.frequency.value = 0.11;
      const sg = ctx.createGain();
      sg.gain.value = 0.09;
      swell.connect(sg).connect(sea.gain.gain);
      swell.start();
      nodes.push({ osc: swell });

      every(5200, () => {
        // wave break
        eng.burst(out, 0, { gain: 0.13, decay: 1.5, freq: 1800, q: 0.5, sweepTo: 300, noiseType: 'white' });
      }, 0.4);
      every(8000, () => {
        // timber creak
        eng.tone(out, rand(120, 260), 0, { type: 'sawtooth', gain: 0.035, attack: 0.2, decay: 1.1, sweepTo: rand(90, 180) });
      });
      every(17000, () => {
        // gull
        const f = rand(1400, 2000);
        for (let i = 0; i < 3; i++)
          eng.tone(out, f, i * 0.22, { type: 'sawtooth', gain: 0.04, attack: 0.02, decay: 0.18, sweepTo: f * 0.6 });
      }, 0.5);
      return nodes;
    },
  },
  {
    key: 'combat',
    label: 'Steel & Fury',
    glyph: '⚔️',
    desc: 'Driving war drums under a tense drone',
    reverb: 0.18,
    level: 0.95,
    build(eng, out, { every }) {
      const nodes = [];
      nodes.push(eng.drone(out, note('D1'), { gain: 0.1, cutoff: 220, type: 'sawtooth' }));
      nodes.push(eng.drone(out, note('A1'), { gain: 0.05, cutoff: 260, type: 'square', detune: 6 }));
      // 4/4 war drum at ~112 bpm
      const beat = 60 / 112;
      let bar = 0;
      every(beat * 4 * 1000, () => {
        const p = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
        p.forEach((b, i) => {
          const strong = i % 4 === 0;
          if (!strong && Math.random() < 0.35) return;
          eng.drum(out, strong ? 74 : 96, b * beat, { gain: strong ? 0.46 : 0.2, decay: strong ? 0.4 : 0.22 });
        });
        if (bar % 4 === 3) {
          for (let i = 0; i < 4; i++)
            eng.drum(out, 110 - i * 8, 3 * beat + i * (beat / 4), { gain: 0.26, decay: 0.16 });
        }
        bar++;
      }, 0.001);
      every(9000, () => {
        eng.tone(out, note('D3'), 0, { type: 'sawtooth', gain: 0.05, attack: 1.2, decay: 3.2, sweepTo: note('F3') });
      }, 0.3);
      return nodes;
    },
  },
  {
    key: 'boss',
    label: 'The Thing Itself',
    glyph: '💀',
    desc: 'Heartbeat, tritone dread, something enormous',
    reverb: 0.45,
    build(eng, out, { every }) {
      const nodes = [];
      nodes.push(eng.drone(out, note('C1'), { gain: 0.14, cutoff: 140, type: 'sawtooth' }));
      nodes.push(eng.drone(out, note('F#1'), { gain: 0.08, cutoff: 170, type: 'sawtooth', detune: 9 })); // tritone
      nodes.push(eng.drone(out, note('C2'), { gain: 0.05, cutoff: 400, type: 'square', detune: -11 }));
      nodes.push(eng.noiseLayer(out, { type: 'brown', freq: 120, q: 0.3, filter: 'lowpass', gain: 0.1 }));
      // heartbeat
      every(1700, () => {
        eng.drum(out, 52, 0, { gain: 0.44, decay: 0.5, sweep: 0.3 });
        eng.drum(out, 46, 0.29, { gain: 0.3, decay: 0.45, sweep: 0.3 });
      }, 0.03);
      every(12000, () => {
        eng.tone(out, note('C4'), 0, { type: 'sine', gain: 0.05, attack: 1.5, decay: 4.5, sweepTo: note('B3') });
        eng.tone(out, note('F#4'), 0.4, { type: 'sine', gain: 0.035, attack: 1.5, decay: 4.0 });
      }, 0.3);
      return nodes;
    },
  },
  {
    key: 'fey',
    label: 'Feywild Shimmer',
    glyph: '✨',
    desc: 'Glassy bells and detuned light',
    reverb: 0.6,
    build(eng, out, { every }) {
      const nodes = [];
      ['E3', 'B3', 'F#4', 'C#5'].forEach((n, i) =>
        nodes.push(eng.drone(out, note(n), { gain: 0.038, cutoff: 1600, type: 'sine', detune: (i - 1.5) * 11, drift: 14 }))
      );
      const bells = ['E5', 'F#5', 'A5', 'B5', 'C#6', 'E6'];
      every(1700, () => {
        const n = pick(bells);
        eng.tone(out, note(n), 0, { type: 'sine', gain: 0.09, attack: 0.004, decay: rand(1.6, 3.4) });
        eng.tone(out, note(n) * 2.01, 0.01, { type: 'sine', gain: 0.03, attack: 0.004, decay: 1.4 });
      }, 0.6);
      return nodes;
    },
  },
  {
    key: 'arcane',
    label: 'Arcane Laboratory',
    glyph: '🔮',
    desc: 'Humming wards, ticking mechanisms, unstable magic',
    reverb: 0.35,
    build(eng, out, { every }) {
      const nodes = [];
      nodes.push(eng.drone(out, note('A2'), { gain: 0.06, cutoff: 700, type: 'square', drift: 3 }));
      nodes.push(eng.drone(out, note('E3'), { gain: 0.035, cutoff: 900, type: 'sine', detune: 14 }));
      every(1100, () => {
        eng.tone(out, rand(2600, 4200), 0, { type: 'square', gain: 0.018, attack: 0.002, decay: 0.03 });
      }, 0.15);
      every(4200, () => {
        eng.burst(out, 0, { gain: 0.07, decay: 0.4, freq: 5000, q: 2, sweepTo: 900 });
      }, 0.6);
      return nodes;
    },
  },
  {
    key: 'requiem',
    label: 'Requiem',
    glyph: '🕊️',
    desc: 'For the fallen — slow, minor, and kind',
    reverb: 0.65,
    build(eng, out, { every }) {
      const nodes = [];
      ['A2', 'C3', 'E3', 'A3'].forEach((n, i) =>
        nodes.push(eng.drone(out, note(n), { gain: 0.05 - i * 0.005, cutoff: 800, type: 'sine', detune: i * 5 - 7 }))
      );
      const mel = ['A4', 'C5', 'B4', 'A4', 'G4', 'E4', 'A4'];
      let i = 0;
      every(3600, () => {
        eng.tone(out, note(mel[i % mel.length]), 0, { type: 'sine', gain: 0.075, attack: 0.4, decay: 3.4 });
        i++;
      }, 0.1);
      every(21000, () => {
        eng.tone(out, note('A2'), 0, { type: 'sine', gain: 0.14, attack: 0.01, decay: 5.5 });
      }, 0.2);
      return nodes;
    },
  },
  {
    key: 'blizzard',
    label: 'Frozen Waste',
    glyph: '❄️',
    desc: 'Howling wind, ice, nowhere to shelter',
    reverb: 0.3,
    build(eng, out, { every }) {
      const nodes = [];
      const w = eng.noiseLayer(out, { type: 'white', freq: 1100, q: 0.9, gain: 0.14 });
      nodes.push(w);
      nodes.push(eng.noiseLayer(out, { type: 'brown', freq: 300, q: 0.4, filter: 'lowpass', gain: 0.12 }));
      const ctx = eng.ctx;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const g = ctx.createGain();
      g.gain.value = 700;
      lfo.connect(g).connect(w.filter.frequency);
      lfo.start();
      nodes.push({ osc: lfo });
      every(6500, () => {
        eng.tone(out, rand(600, 1300), 0, { type: 'sine', gain: 0.03, attack: 0.9, decay: 2.6, sweepTo: rand(300, 600) });
      }, 0.5);
      return nodes;
    },
  },
  {
    key: 'chase',
    label: 'The Chase',
    glyph: '🏃',
    desc: 'Fast pulse, running feet, no time to think',
    reverb: 0.12,
    build(eng, out, { every }) {
      const nodes = [];
      nodes.push(eng.drone(out, note('E1'), { gain: 0.08, cutoff: 260, type: 'sawtooth' }));
      const beat = 60 / 158;
      every(beat * 4 * 1000, () => {
        for (let i = 0; i < 8; i++) {
          eng.drum(out, i % 2 === 0 ? 82 : 120, i * (beat / 2), { gain: i % 4 === 0 ? 0.36 : 0.16, decay: 0.14 });
        }
        const arp = ['E2', 'G2', 'B2', 'E3'];
        for (let i = 0; i < 8; i++) {
          eng.tone(out, note(arp[i % 4]), i * (beat / 2), { type: 'square', gain: 0.035, attack: 0.004, decay: 0.16 });
        }
      }, 0.001);
      return nodes;
    },
  },
];

const AMBIENCE_MAP = Object.fromEntries(AMBIENCES.map((a) => [a.key, a]));

/* ============================================================
   SFX DEFINITIONS
   ============================================================ */

export const SFX = [
  /* ---------- combat ---------- */
  {
    key: 'swordClash', label: 'Sword Clash', glyph: '⚔️', group: 'Combat', reverb: 0.22,
    build(e, out) {
      e.burst(out, 0, { gain: 0.5, decay: 0.5, freq: 3400, q: 3, sweepTo: 1400 });
      e.tone(out, 2600, 0, { type: 'triangle', gain: 0.22, attack: 0.002, decay: 0.7 });
      e.tone(out, 3910, 0.005, { type: 'triangle', gain: 0.12, attack: 0.002, decay: 0.5 });
    },
  },
  {
    key: 'swordSwing', label: 'Swing & Miss', glyph: '🌬️', group: 'Combat', reverb: 0.15,
    build(e, out) {
      e.burst(out, 0, { gain: 0.3, decay: 0.28, freq: 900, q: 1.2, sweepTo: 2800, noiseType: 'pink' });
    },
  },
  {
    key: 'critical', label: 'Critical Hit', glyph: '💥', group: 'Combat', reverb: 0.3,
    build(e, out) {
      e.drum(out, 130, 0, { gain: 0.6, decay: 0.5 });
      e.burst(out, 0, { gain: 0.5, decay: 0.45, freq: 2600, q: 1.4, sweepTo: 500 });
      e.tone(out, note('C4'), 0.03, { type: 'sawtooth', gain: 0.18, attack: 0.005, decay: 0.6, sweepTo: note('C5') });
      e.tone(out, note('G4'), 0.06, { type: 'sawtooth', gain: 0.12, attack: 0.005, decay: 0.5 });
    },
  },
  {
    key: 'bowShot', label: 'Arrow', glyph: '🏹', group: 'Combat', reverb: 0.2,
    build(e, out) {
      e.tone(out, 260, 0, { type: 'triangle', gain: 0.2, attack: 0.002, decay: 0.1, sweepTo: 90 });
      e.burst(out, 0.02, { gain: 0.28, decay: 0.4, freq: 4200, q: 2.5, sweepTo: 900 });
      e.tone(out, 900, 0.34, { type: 'triangle', gain: 0.18, attack: 0.002, decay: 0.14, sweepTo: 200 });
    },
  },
  {
    key: 'shieldBash', label: 'Shield Bash', glyph: '🛡️', group: 'Combat', reverb: 0.25,
    build(e, out) {
      e.drum(out, 150, 0, { gain: 0.5, decay: 0.35, sweep: 0.4 });
      e.burst(out, 0, { gain: 0.3, decay: 0.5, freq: 700, q: 2.5 });
      e.tone(out, 420, 0.01, { type: 'triangle', gain: 0.14, decay: 0.9 });
    },
  },
  {
    key: 'deathKnell', label: 'Death Knell', glyph: '☠️', group: 'Combat', reverb: 0.7, life: 8,
    build(e, out) {
      [0, 2.2, 4.4].forEach((d, i) => {
        e.tone(out, note('C2'), d, { type: 'sine', gain: 0.28 - i * 0.05, attack: 0.006, decay: 3.6 });
        e.tone(out, note('C2') * 2.74, d, { type: 'sine', gain: 0.1, attack: 0.006, decay: 2.4 });
        e.tone(out, note('C2') * 5.1, d, { type: 'sine', gain: 0.04, attack: 0.006, decay: 1.6 });
      });
    },
  },

  /* ---------- magic ---------- */
  {
    key: 'fireball', label: 'Fireball', glyph: '🔥', group: 'Magic', reverb: 0.35, life: 5,
    build(e, out) {
      e.burst(out, 0, { gain: 0.28, decay: 0.55, freq: 400, q: 0.8, sweepTo: 3000, noiseType: 'pink' });
      e.drum(out, 90, 0.5, { gain: 0.72, decay: 1.5, sweep: 0.25 });
      e.burst(out, 0.5, { gain: 0.6, decay: 1.6, freq: 2600, q: 0.5, sweepTo: 180, noiseType: 'brown' });
      for (let i = 0; i < 14; i++)
        e.burst(out, 0.7 + i * 0.09, { gain: rand(0.03, 0.1), decay: 0.09, freq: rand(1200, 4000), q: 2 });
    },
  },
  {
    key: 'lightning', label: 'Lightning Bolt', glyph: '⚡', group: 'Magic', reverb: 0.4, life: 5,
    build(e, out) {
      e.burst(out, 0, { gain: 0.55, decay: 0.14, freq: 6000, q: 0.6, sweepTo: 2000 });
      e.tone(out, 3000, 0, { type: 'sawtooth', gain: 0.16, attack: 0.001, decay: 0.13, sweepTo: 200 });
      e.drum(out, 60, 0.1, { gain: 0.7, decay: 1.9, sweep: 0.3 });
      e.burst(out, 0.12, { gain: 0.4, decay: 2.0, freq: 900, q: 0.4, sweepTo: 120, noiseType: 'brown', type: 'lowpass' });
    },
  },
  {
    key: 'frost', label: 'Frost / Ice', glyph: '❄️', group: 'Magic', reverb: 0.4,
    build(e, out) {
      e.burst(out, 0, { gain: 0.3, decay: 0.9, freq: 900, q: 1.2, sweepTo: 6000, noiseType: 'white' });
      for (let i = 0; i < 9; i++)
        e.tone(out, rand(2400, 5200), 0.1 + i * 0.055, { type: 'sine', gain: 0.07, attack: 0.002, decay: 0.4 });
    },
  },
  {
    key: 'heal', label: 'Healing Word', glyph: '💚', group: 'Magic', reverb: 0.5,
    build(e, out) {
      ['C5', 'E5', 'G5', 'C6'].forEach((n, i) =>
        e.tone(out, note(n), i * 0.1, { type: 'sine', gain: 0.14, attack: 0.03, decay: 1.7 })
      );
      e.tone(out, note('C4'), 0, { type: 'sine', gain: 0.09, attack: 0.15, decay: 2.2 });
    },
  },
  {
    key: 'shimmer', label: 'Magic Shimmer', glyph: '✨', group: 'Magic', reverb: 0.55,
    build(e, out) {
      for (let i = 0; i < 12; i++)
        e.tone(out, rand(1800, 6000), i * 0.045, { type: 'sine', gain: rand(0.04, 0.09), attack: 0.004, decay: rand(0.4, 1.3) });
    },
  },
  {
    key: 'eldritch', label: 'Eldritch Whisper', glyph: '👁️', group: 'Magic', reverb: 0.7, life: 6,
    build(e, out) {
      e.burst(out, 0, { gain: 0.14, decay: 2.6, freq: 700, q: 3.5, sweepTo: 200, noiseType: 'pink' });
      e.tone(out, note('C2'), 0, { type: 'sawtooth', gain: 0.1, attack: 0.4, decay: 3.2, sweepTo: note('B1') });
      e.tone(out, note('F#2'), 0.3, { type: 'sawtooth', gain: 0.07, attack: 0.4, decay: 2.6 });
    },
  },
  {
    key: 'teleport', label: 'Teleport', glyph: '🌀', group: 'Magic', reverb: 0.45,
    build(e, out) {
      e.tone(out, 200, 0, { type: 'sine', gain: 0.2, attack: 0.02, decay: 0.7, sweepTo: 4000 });
      e.burst(out, 0.5, { gain: 0.4, decay: 0.5, freq: 5000, q: 1, sweepTo: 300 });
      e.tone(out, 4000, 0.55, { type: 'sine', gain: 0.14, attack: 0.005, decay: 0.6, sweepTo: 120 });
    },
  },

  /* ---------- the table ---------- */
  {
    key: 'dice', label: 'Dice Roll', glyph: '🎲', group: 'At the Table', reverb: 0.14,
    build(e, out) {
      const n = Math.floor(rand(7, 12));
      for (let i = 0; i < n; i++) {
        const t = Math.pow(i / n, 1.7) * 0.85;
        e.burst(out, t, { gain: rand(0.1, 0.3) * (1 - i / n) + 0.05, decay: 0.05, freq: rand(1400, 3600), q: 3 });
      }
      e.burst(out, 0.95, { gain: 0.18, decay: 0.1, freq: 1200, q: 2 });
    },
  },
  {
    key: 'levelUp', label: 'Level Up', glyph: '⭐', group: 'At the Table', reverb: 0.4, life: 6,
    build(e, out) {
      ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6'].forEach((n, i) =>
        e.tone(out, note(n), i * 0.075, { type: 'triangle', gain: 0.15, attack: 0.008, decay: 1.5 })
      );
      e.tone(out, note('C3'), 0, { type: 'sine', gain: 0.12, attack: 0.02, decay: 2.4 });
      for (let i = 0; i < 10; i++)
        e.tone(out, rand(3000, 7000), 0.5 + i * 0.05, { type: 'sine', gain: 0.05, attack: 0.003, decay: 0.6 });
    },
  },
  {
    key: 'victory', label: 'Victory Fanfare', glyph: '🎺', group: 'At the Table', reverb: 0.4, life: 7,
    build(e, out) {
      const mel = [['G3', 0], ['C4', 0.18], ['E4', 0.36], ['G4', 0.54], ['E4', 0.78], ['G4', 0.96]];
      mel.forEach(([n, t]) => {
        e.tone(out, note(n), t, { type: 'sawtooth', gain: 0.13, attack: 0.02, decay: 0.55 });
        e.tone(out, note(n) * 1.5, t, { type: 'sawtooth', gain: 0.05, attack: 0.02, decay: 0.45 });
      });
      e.tone(out, note('C3'), 0.96, { type: 'sawtooth', gain: 0.16, attack: 0.03, decay: 2.2 });
      e.drum(out, 80, 0.96, { gain: 0.5, decay: 0.8 });
    },
  },
  {
    key: 'failure', label: 'Grim Failure', glyph: '📉', group: 'At the Table', reverb: 0.4,
    build(e, out) {
      ['E4', 'Eb4', 'D4', 'Db4'].forEach((n, i) =>
        e.tone(out, note(n), i * 0.16, { type: 'sawtooth', gain: 0.12, attack: 0.02, decay: 0.9 })
      );
      e.tone(out, note('A2'), 0.5, { type: 'sawtooth', gain: 0.14, attack: 0.05, decay: 2.2 });
    },
  },
  {
    key: 'coins', label: 'Coin Purse', glyph: '🪙', group: 'At the Table', reverb: 0.2,
    build(e, out) {
      for (let i = 0; i < 16; i++) {
        e.tone(out, rand(2400, 5600), rand(0, 0.6), { type: 'triangle', gain: rand(0.03, 0.09), attack: 0.002, decay: rand(0.15, 0.5) });
      }
    },
  },

  /* ---------- the world ---------- */
  {
    key: 'doorCreak', label: 'Creaking Door', glyph: '🚪', group: 'The World', reverb: 0.35, life: 5,
    build(e, out) {
      const ctx = e.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.linearRampToValueAtTime(310, t + 1.5);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.2);
      // uneven, sticking hinge
      for (let i = 0; i < 12; i++) g.gain.setValueAtTime(rand(0.04, 0.14), t + 0.25 + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      osc.connect(f).connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 1.8);
      e.drum(out, 70, 1.75, { gain: 0.3, decay: 0.5 });
    },
  },
  {
    key: 'portcullis', label: 'Portcullis / Stone', glyph: '🏰', group: 'The World', reverb: 0.5, life: 6,
    build(e, out) {
      e.burst(out, 0, { gain: 0.34, decay: 2.4, freq: 320, q: 1.4, noiseType: 'brown', sweepTo: 140 });
      for (let i = 0; i < 9; i++) e.drum(out, rand(60, 110), i * 0.24, { gain: 0.18, decay: 0.3 });
      e.drum(out, 48, 2.3, { gain: 0.65, decay: 1.4, sweep: 0.4 });
    },
  },
  {
    key: 'chest', label: 'Chest Opens', glyph: '🧰', group: 'The World', reverb: 0.3,
    build(e, out) {
      e.burst(out, 0, { gain: 0.22, decay: 0.16, freq: 500, q: 3 });
      e.tone(out, 220, 0, { type: 'triangle', gain: 0.14, decay: 0.3, sweepTo: 140 });
      e.burst(out, 0.28, { gain: 0.2, decay: 0.9, freq: 700, q: 1.4, sweepTo: 260, noiseType: 'pink' });
      for (let i = 0; i < 7; i++) e.tone(out, rand(2600, 5400), 0.5 + i * 0.06, { type: 'sine', gain: 0.06, attack: 0.003, decay: 0.7 });
    },
  },
  {
    key: 'thunder', label: 'Thunder', glyph: '⛈️', group: 'The World', reverb: 0.55, life: 8,
    build(e, out) {
      e.drum(out, 42, 0, { gain: 0.7, decay: 2.6, sweep: 0.35 });
      e.burst(out, 0, { gain: 0.42, decay: 3.4, freq: 500, q: 0.35, type: 'lowpass', noiseType: 'brown', sweepTo: 90 });
      e.burst(out, 1.1, { gain: 0.25, decay: 2.2, freq: 300, q: 0.4, type: 'lowpass', noiseType: 'brown' });
      e.burst(out, 2.4, { gain: 0.14, decay: 2.6, freq: 200, q: 0.4, type: 'lowpass', noiseType: 'brown' });
    },
  },
  {
    key: 'wolf', label: 'Wolf Howl', glyph: '🐺', group: 'The World', reverb: 0.6, life: 6,
    build(e, out) {
      const ctx = e.ctx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.55);
      osc.frequency.setValueAtTime(520, t + 1.7);
      osc.frequency.exponentialRampToValueAtTime(210, t + 2.5);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.17, t + 0.35);
      g.gain.setValueAtTime(0.17, t + 1.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      osc.connect(f).connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 2.7);
    },
  },
  {
    key: 'dragon', label: 'Dragon Roar', glyph: '🐉', group: 'The World', reverb: 0.5, life: 7,
    build(e, out) {
      const ctx = e.ctx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(70, t);
      osc.frequency.exponentialRampToValueAtTime(130, t + 0.5);
      osc.frequency.exponentialRampToValueAtTime(58, t + 2.6);
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 512) - 1;
        curve[i] = Math.tanh(x * 4);
      }
      shaper.curve = curve;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(1600, t);
      f.frequency.exponentialRampToValueAtTime(320, t + 2.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.18);
      g.gain.setValueAtTime(0.3, t + 1.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      osc.connect(shaper).connect(f).connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 2.9);
      e.burst(out, 0, { gain: 0.22, decay: 2.6, freq: 900, q: 0.5, noiseType: 'brown', sweepTo: 200 });
    },
  },
  {
    key: 'horn', label: 'War Horn', glyph: '📯', group: 'The World', reverb: 0.55, life: 6,
    build(e, out) {
      [0, 1.15].forEach((d) => {
        ['G2', 'D3', 'G3'].forEach((n, i) =>
          e.tone(out, note(n), d, { type: 'sawtooth', gain: 0.14 - i * 0.03, attack: 0.08, decay: 1.0 })
        );
      });
    },
  },
  {
    key: 'bell', label: 'Alarm Bell', glyph: '🔔', group: 'The World', reverb: 0.6, life: 7,
    build(e, out) {
      for (let i = 0; i < 6; i++) {
        const d = i * 0.62;
        e.tone(out, note('E4'), d, { type: 'sine', gain: 0.16, attack: 0.003, decay: 1.6 });
        e.tone(out, note('E4') * 2.76, d, { type: 'sine', gain: 0.07, attack: 0.003, decay: 1.1 });
        e.tone(out, note('E4') * 5.4, d, { type: 'sine', gain: 0.03, attack: 0.003, decay: 0.7 });
      }
    },
  },
  {
    key: 'footsteps', label: 'Footsteps', glyph: '👣', group: 'The World', reverb: 0.4, life: 5,
    build(e, out) {
      for (let i = 0; i < 8; i++) {
        e.burst(out, i * 0.46, { gain: 0.16, decay: 0.13, freq: rand(280, 520), q: 2.2, noiseType: 'brown' });
        e.drum(out, 90, i * 0.46, { gain: 0.1, decay: 0.1 });
      }
    },
  },
  {
    key: 'potion', label: 'Drink Potion', glyph: '🧪', group: 'The World', reverb: 0.2,
    build(e, out) {
      e.burst(out, 0, { gain: 0.14, decay: 0.1, freq: 2200, q: 4 }); // cork
      for (let i = 0; i < 5; i++)
        e.tone(out, rand(300, 600), 0.25 + i * 0.13, { type: 'sine', gain: 0.11, attack: 0.01, decay: 0.14, sweepTo: rand(700, 1100) });
    },
  },
  {
    key: 'torch', label: 'Torch Whoosh', glyph: '🕯️', group: 'The World', reverb: 0.3,
    build(e, out) {
      e.burst(out, 0, { gain: 0.34, decay: 0.9, freq: 600, q: 0.7, sweepTo: 2400, noiseType: 'pink' });
      for (let i = 0; i < 8; i++) e.burst(out, 0.5 + i * 0.11, { gain: rand(0.04, 0.11), decay: 0.06, freq: rand(1200, 3400), q: 2 });
    },
  },
];

const SFX_MAP = Object.fromEntries(SFX.map((s) => [s.key, s]));

/* One engine for the whole app. */
export const engine = new AudioEngine();
