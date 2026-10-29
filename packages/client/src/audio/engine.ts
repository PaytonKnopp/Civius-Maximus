/**
 * The game's sound (docs/06-ui-ux.md, "Music and sound"): everything is synthesized with Web
 * Audio, so there are no sound files to download or license. One AudioContext, made on the first
 * user gesture (browsers require it), with master, music, effects and ambience buses. Volumes
 * live in localStorage.
 */

export interface AudioSettings {
  master: number;
  music: number;
  effects: number;
  ambience: number;
  muted: boolean;
}

const KEY = 'cx-audio';
const DEFAULTS: AudioSettings = {
  master: 0.8,
  music: 0.45,
  effects: 0.7,
  ambience: 0.35,
  muted: false,
};

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AudioSettings>) };
  } catch {
    // Storage blocked: defaults.
  }
  return { ...DEFAULTS };
}

class AudioEngine {
  settings: AudioSettings = load();
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  effects!: GainNode;
  ambience!: GainNode;
  /** A shared reverb send, for space. */
  reverb!: ConvolverNode;
  private listeners = new Set<() => void>();
  private noise: AudioBuffer | null = null;

  /** Creates the context on the first gesture; later calls resume it if suspended. */
  start(): AudioContext | null {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.music = ctx.createGain();
      this.effects = ctx.createGain();
      this.ambience = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.4, 2.2);
      const wet = ctx.createGain();
      wet.gain.value = 0.28;
      this.reverb.connect(wet).connect(this.master);
      for (const bus of [this.music, this.effects, this.ambience]) bus.connect(this.master);
      this.master.connect(comp).connect(ctx.destination);
      this.apply();
      for (const l of this.listeners) l();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  get ready() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  onStart(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(patch: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      // Not saved; fine.
    }
    this.apply();
  }

  private apply() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.music.gain.setTargetAtTime(s.music * 0.6, t, 0.2);
    this.effects.gain.setTargetAtTime(s.effects, t, 0.05);
    this.ambience.gain.setTargetAtTime(s.ambience * 0.5, t, 0.3);
  }

  /** White noise, shared. */
  noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      const ctx = this.ctx!;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return this.noise;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
}

export const audio = new AudioEngine();

// --- Instruments --------------------------------------------------------------------------------

export const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Voice {
  /** Where the voice goes (a bus). */
  out: AudioNode;
  /** Seconds, in context time. */
  at: number;
  midi: number;
  dur: number;
  vel?: number;
  /** Reverb send, 0–1. */
  wet?: number;
}

function envelope(
  ctx: AudioContext,
  at: number,
  a: number,
  peak: number,
  d: number,
  s: number,
  r: number,
  dur: number,
) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + a);
  g.gain.setTargetAtTime(peak * s, at + a, d);
  g.gain.setTargetAtTime(0, at + Math.max(a, dur), r);
  return g;
}

function send(g: AudioNode, v: Voice) {
  g.connect(v.out);
  if (v.wet) {
    const w = audio.ctx!.createGain();
    w.gain.value = v.wet;
    g.connect(w).connect(audio.reverb);
  }
}

/** A plucked string (lyre, lute, harp, koto): Karplus–Strong-ish, from filtered noise bursts. */
export function pluck(v: Voice, bright = 0.5) {
  const ctx = audio.ctx!;
  const hz = midiHz(v.midi);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = hz;
  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.value = hz * 1.002;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(hz * (4 + bright * 10), v.at);
  lp.frequency.exponentialRampToValueAtTime(
    Math.max(hz * 1.2, 200),
    v.at + Math.min(1.6, v.dur + 0.6),
  );
  const mix = ctx.createGain();
  mix.gain.value = 0.35;
  const g = envelope(ctx, v.at, 0.004, (v.vel ?? 0.6) * 0.5, 0.25, 0.25, 0.35, v.dur);
  osc.connect(lp);
  osc2.connect(mix).connect(lp);
  lp.connect(g);
  send(g, v);
  osc.start(v.at);
  osc2.start(v.at);
  osc.stop(v.at + v.dur + 2);
  osc2.stop(v.at + v.dur + 2);
}

/** A breathy flute or recorder: a sine with a little vibrato and filtered breath. */
export function flute(v: Voice) {
  const ctx = audio.ctx!;
  const hz = midiHz(v.midi);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = hz;
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const vibAmt = ctx.createGain();
  vibAmt.gain.value = hz * 0.006;
  vib.connect(vibAmt).connect(osc.frequency);
  const over = ctx.createOscillator();
  over.type = 'sine';
  over.frequency.value = hz * 2;
  const overG = ctx.createGain();
  overG.gain.value = 0.12;
  const breath = ctx.createBufferSource();
  breath.buffer = audio.noiseBuffer();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = hz * 2;
  bp.Q.value = 2;
  const breathG = ctx.createGain();
  breathG.gain.value = 0.05;
  const g = envelope(ctx, v.at, 0.08, (v.vel ?? 0.5) * 0.32, 0.3, 0.85, 0.18, v.dur);
  osc.connect(g);
  over.connect(overG).connect(g);
  breath.connect(bp).connect(breathG).connect(g);
  send(g, v);
  for (const n of [osc, vib, over]) {
    n.start(v.at);
    n.stop(v.at + v.dur + 1);
  }
  breath.start(v.at, Math.random());
  breath.stop(v.at + v.dur + 1);
}

/** A warm pad (strings or choir): detuned saws through a slow low-pass. */
export function pad(v: Voice, voice: 'strings' | 'choir' | 'organ' = 'strings') {
  const ctx = audio.ctx!;
  const hz = midiHz(v.midi);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = voice === 'choir' ? hz * 3 : voice === 'organ' ? hz * 6 : hz * 4;
  lp.Q.value = voice === 'choir' ? 4 : 0.7;
  const g = envelope(
    ctx,
    v.at,
    voice === 'organ' ? 0.05 : 0.6,
    (v.vel ?? 0.4) * 0.16,
    0.8,
    0.85,
    0.8,
    v.dur,
  );
  const detunes = voice === 'organ' ? [0, 1200, 1902] : [-8, 0, 7];
  for (const cents of detunes) {
    const o = ctx.createOscillator();
    o.type = voice === 'organ' ? 'sine' : voice === 'choir' ? 'triangle' : 'sawtooth';
    o.frequency.value = hz;
    o.detune.value = cents;
    o.connect(lp);
    o.start(v.at);
    o.stop(v.at + v.dur + 4);
  }
  lp.connect(g);
  send(g, v);
}

/** A soft piano-ish tone: two partials with a quick decay. */
export function keys(v: Voice) {
  const ctx = audio.ctx!;
  const hz = midiHz(v.midi);
  const g = envelope(ctx, v.at, 0.005, (v.vel ?? 0.6) * 0.35, 0.6, 0.15, 0.5, v.dur);
  for (const [mult, amp, type] of [
    [1, 1, 'triangle'],
    [2, 0.25, 'sine'],
    [3, 0.08, 'sine'],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz * mult;
    const a = ctx.createGain();
    a.gain.value = amp;
    o.connect(a).connect(g);
    o.start(v.at);
    o.stop(v.at + v.dur + 3);
  }
  send(g, v);
}

/** A bell or gong: inharmonic partials, long decay. */
export function bell(v: Voice, gong = false) {
  const ctx = audio.ctx!;
  const hz = midiHz(v.midi);
  const partials = gong ? [1, 1.48, 2.1, 2.7, 3.9] : [1, 2.01, 2.76, 4.07, 5.43];
  const g = envelope(
    ctx,
    v.at,
    gong ? 0.03 : 0.003,
    (v.vel ?? 0.5) * 0.3,
    gong ? 2.5 : 1.2,
    0.0,
    1,
    v.dur,
  );
  partials.forEach((p, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz * p;
    const a = ctx.createGain();
    a.gain.value = 1 / (i + 1.4);
    o.connect(a).connect(g);
    o.start(v.at);
    o.stop(v.at + v.dur + 6);
  });
  send(g, v);
}

/** A brass call: a filtered saw that opens as it swells. */
export function brass(v: Voice) {
  const ctx = audio.ctx!;
  const hz = midiHz(v.midi);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = hz;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(hz * 1.5, v.at);
  lp.frequency.linearRampToValueAtTime(hz * 6, v.at + 0.12);
  lp.frequency.setTargetAtTime(hz * 3, v.at + 0.15, 0.3);
  const g = envelope(ctx, v.at, 0.06, (v.vel ?? 0.6) * 0.22, 0.4, 0.75, 0.15, v.dur);
  o.connect(lp).connect(g);
  send(g, v);
  o.start(v.at);
  o.stop(v.at + v.dur + 1);
}

/** Drums: a pitched body with a noise skin. `kind` picks the drum. */
export function drum(
  out: AudioNode,
  at: number,
  kind: 'low' | 'frame' | 'snare' | 'tick',
  vel = 0.6,
  wet = 0.15,
) {
  const ctx = audio.ctx!;
  const g = ctx.createGain();
  const body = ctx.createOscillator();
  body.type = 'sine';
  const [f0, f1, len] =
    kind === 'low'
      ? [110, 45, 0.5]
      : kind === 'frame'
        ? [190, 120, 0.25]
        : kind === 'snare'
          ? [220, 160, 0.18]
          : [900, 700, 0.05];
  body.frequency.setValueAtTime(f0, at);
  body.frequency.exponentialRampToValueAtTime(f1, at + len);
  g.gain.setValueAtTime(vel * 0.6, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + len);
  body.connect(g);
  const n = ctx.createBufferSource();
  n.buffer = audio.noiseBuffer();
  const hp = ctx.createBiquadFilter();
  hp.type = kind === 'low' ? 'lowpass' : 'highpass';
  hp.frequency.value = kind === 'low' ? 600 : kind === 'tick' ? 4000 : 1500;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vel * (kind === 'snare' ? 0.5 : 0.2), at);
  ng.gain.exponentialRampToValueAtTime(0.001, at + len * 0.8);
  n.connect(hp).connect(ng).connect(g);
  send(g, { out, at, midi: 0, dur: len, wet });
  body.start(at);
  body.stop(at + len + 0.1);
  n.start(at, Math.random());
  n.stop(at + len + 0.1);
}

/** A burst of filtered noise: clashes, whooshes, explosions, footsteps. */
export function noise(
  out: AudioNode,
  at: number,
  opts: {
    dur: number;
    from: number;
    to: number;
    type?: BiquadFilterType;
    q?: number;
    vel?: number;
    wet?: number;
  },
) {
  const ctx = audio.ctx!;
  const n = ctx.createBufferSource();
  n.buffer = audio.noiseBuffer();
  const f = ctx.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.Q.value = opts.q ?? 1;
  f.frequency.setValueAtTime(opts.from, at);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), at + opts.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(opts.vel ?? 0.5, at + Math.min(0.01, opts.dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  n.connect(f).connect(g);
  send(g, { out, at, midi: 0, dur: opts.dur, wet: opts.wet ?? 0.1 });
  n.start(at, Math.random());
  n.stop(at + opts.dur + 0.05);
}
