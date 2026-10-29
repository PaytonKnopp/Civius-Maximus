import { audio, bell, brass, drum, flute, keys, pad, pluck } from './engine';

/**
 * Music (docs/06-ui-ux.md, "Music and sound"): composed live, so it never loops the same way.
 * Each era has a style (tempo, mode, instruments, drums), and a civ's culture colors the early
 * eras (pentatonic for East Asia and the steppe, the Hijaz mode for the Middle East...). Pieces
 * are 16 bars of melody over a chord progression, built from a motif that repeats and varies;
 * now and then the game plays a public-domain melody instead (Greensleeves, Ode to Joy, Sakura,
 * a minuet, Amazing Grace, a Gymnopédie) on its own instruments. Between pieces: quiet, with the
 * wind and birds of the ambience.
 */

type Lead = 'flute' | 'pluck' | 'keys' | 'brass';
type Harmony = 'pluck' | 'strings' | 'choir' | 'organ' | 'keys';

interface Style {
  tempo: number;
  /** Semitones from the tonic. */
  mode: number[];
  root: number;
  lead: Lead[];
  harmony: Harmony;
  /** Arpeggiate the chord on the harmony instrument (harp, lute) as well as holding it. */
  arpeggio: boolean;
  drums: ('low' | 'frame' | 'snare' | 'tick' | null)[];
  beats: 3 | 4;
  /** Chord roots as scale degrees, one per bar, looped. */
  progressions: number[][];
  themes: Theme[];
}

interface Theme {
  name: string;
  beats: 3 | 4;
  /** [semitones from the tonic, beats]; null pitch is a rest. */
  notes: [number | null, number][];
  /** Major or minor harmony. */
  minor: boolean;
}

const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  inScale: [0, 1, 5, 7, 8],
};

// --- Public-domain melodies, written out from memory of the tunes ----------------------------

const GREENSLEEVES: Theme = {
  name: 'Greensleeves',
  beats: 3,
  minor: true,
  notes: [
    [null, 2],
    [0, 1],
    [3, 2],
    [5, 1],
    [7, 1.5],
    [8, 0.5],
    [7, 1],
    [5, 2],
    [2, 1],
    [-2, 1.5],
    [0, 0.5],
    [2, 1],
    [3, 2],
    [0, 1],
    [0, 1.5],
    [-1, 0.5],
    [0, 1],
    [2, 2],
    [-1, 1],
    [-5, 2],
    [0, 1],
    [3, 2],
    [5, 1],
    [7, 1.5],
    [8, 0.5],
    [7, 1],
    [5, 2],
    [2, 1],
    [-2, 1.5],
    [0, 0.5],
    [2, 1],
    [3, 1.5],
    [2, 0.5],
    [0, 1],
    [-1, 1.5],
    [-3, 0.5],
    [-1, 1],
    [0, 3],
  ],
};

const ODE_TO_JOY: Theme = {
  name: 'Ode to Joy',
  beats: 4,
  minor: false,
  notes: [
    [4, 1],
    [4, 1],
    [5, 1],
    [7, 1],
    [7, 1],
    [5, 1],
    [4, 1],
    [2, 1],
    [0, 1],
    [0, 1],
    [2, 1],
    [4, 1],
    [4, 1.5],
    [2, 0.5],
    [2, 2],
    [4, 1],
    [4, 1],
    [5, 1],
    [7, 1],
    [7, 1],
    [5, 1],
    [4, 1],
    [2, 1],
    [0, 1],
    [0, 1],
    [2, 1],
    [4, 1],
    [2, 1.5],
    [0, 0.5],
    [0, 2],
  ],
};

const SAKURA: Theme = {
  name: 'Sakura',
  beats: 4,
  minor: true,
  notes: [
    [0, 1],
    [0, 1],
    [2, 2],
    [0, 1],
    [0, 1],
    [2, 2],
    [0, 1],
    [2, 1],
    [3, 1],
    [2, 1],
    [0, 1],
    [2, 0.5],
    [0, 0.5],
    [-4, 2],
    [-5, 1],
    [-9, 1],
    [-5, 1],
    [-4, 1],
    [-5, 1],
    [-5, 0.5],
    [-9, 0.5],
    [-10, 2],
    [0, 1],
    [2, 1],
    [3, 1],
    [2, 1],
    [0, 1],
    [2, 0.5],
    [0, 0.5],
    [-4, 2],
    [-5, 1],
    [-4, 1],
    [0, 1],
    [2, 1],
    [-4, 1],
    [-5, 1],
    [-5, 2],
  ],
};

const MINUET: Theme = {
  name: 'Minuet in G',
  beats: 3,
  minor: false,
  notes: [
    [7, 1],
    [0, 0.5],
    [2, 0.5],
    [4, 0.5],
    [5, 0.5],
    [7, 1],
    [0, 1],
    [0, 1],
    [9, 1],
    [5, 0.5],
    [7, 0.5],
    [9, 0.5],
    [11, 0.5],
    [12, 1],
    [0, 1],
    [0, 1],
    [5, 1],
    [7, 0.5],
    [5, 0.5],
    [4, 0.5],
    [2, 0.5],
    [4, 1],
    [5, 0.5],
    [4, 0.5],
    [2, 0.5],
    [0, 0.5],
    [-1, 1],
    [0, 0.5],
    [2, 0.5],
    [4, 0.5],
    [0, 0.5],
    [2, 3],
  ],
};

const AMAZING_GRACE: Theme = {
  name: 'Amazing Grace',
  beats: 3,
  minor: false,
  notes: [
    [null, 2],
    [-5, 1],
    [0, 2],
    [4, 0.5],
    [0, 0.5],
    [4, 2],
    [2, 1],
    [0, 2],
    [-3, 1],
    [-5, 2],
    [-5, 1],
    [0, 2],
    [4, 0.5],
    [0, 0.5],
    [4, 2],
    [2, 0.5],
    [4, 0.5],
    [7, 3],
    [null, 2],
    [4, 1],
    [7, 1.5],
    [4, 0.5],
    [7, 0.5],
    [4, 0.5],
    [0, 2],
    [-5, 1],
    [-3, 1.5],
    [0, 0.5],
    [0, 0.5],
    [-3, 0.5],
    [-5, 2],
    [-5, 1],
    [0, 2],
    [4, 0.5],
    [0, 0.5],
    [4, 2],
    [2, 1],
    [0, 3],
  ],
};

const GYMNOPEDIE: Theme = {
  name: 'Gymnopédie',
  beats: 3,
  minor: false,
  notes: [
    [null, 3],
    [null, 3],
    [16, 1],
    [19, 1],
    [17, 1],
    [16, 1],
    [11, 1],
    [9, 1],
    [11, 1],
    [12, 1],
    [7, 1],
    [4, 3],
    [4, 3],
    [4, 3],
    [16, 1],
    [19, 1],
    [17, 1],
    [16, 1],
    [11, 1],
    [9, 1],
    [11, 1],
    [12, 1],
    [7, 1],
    [16, 3],
    [14, 3],
    [14, 3],
  ],
};

const ERA_STYLES: Record<number, Style> = {
  1: {
    tempo: 64,
    mode: MODES.dorian,
    root: 50,
    lead: ['flute'],
    harmony: 'pluck',
    arpeggio: true,
    drums: ['frame', null, 'tick', null, 'frame', null, 'tick', 'tick'],
    beats: 4,
    progressions: [
      [0, 0, 6, 0],
      [0, 3, 0, 6],
      [0, 4, 3, 0],
    ],
    themes: [],
  },
  2: {
    tempo: 70,
    mode: MODES.mixolydian,
    root: 50,
    lead: ['flute', 'pluck'],
    harmony: 'choir',
    arpeggio: true,
    drums: ['frame', null, null, 'tick', 'frame', null],
    beats: 3,
    progressions: [
      [0, 6, 3, 0],
      [0, 4, 6, 0],
      [0, 3, 4, 0],
    ],
    themes: [GREENSLEEVES],
  },
  3: {
    tempo: 74,
    mode: MODES.dorian,
    root: 52,
    lead: ['flute', 'pluck'],
    harmony: 'choir',
    arpeggio: true,
    drums: ['frame', null, 'tick', 'frame', null, 'tick'],
    beats: 3,
    progressions: [
      [0, 2, 3, 0],
      [0, 6, 4, 0],
      [0, 3, 6, 4],
    ],
    themes: [GREENSLEEVES],
  },
  4: {
    tempo: 84,
    mode: MODES.ionian,
    root: 55,
    lead: ['pluck', 'flute'],
    harmony: 'strings',
    arpeggio: true,
    drums: ['frame', null, 'tick', null, 'frame', 'tick', 'tick', null],
    beats: 4,
    progressions: [
      [0, 4, 5, 3],
      [0, 3, 4, 0],
      [5, 3, 0, 4],
    ],
    themes: [MINUET, GREENSLEEVES],
  },
  5: {
    tempo: 78,
    mode: MODES.ionian,
    root: 53,
    lead: ['keys', 'brass'],
    harmony: 'strings',
    arpeggio: false,
    drums: ['low', null, 'snare', null, 'low', null, 'snare', 'tick'],
    beats: 4,
    progressions: [
      [0, 5, 3, 4],
      [0, 3, 0, 4],
      [5, 3, 4, 0],
    ],
    themes: [ODE_TO_JOY, AMAZING_GRACE],
  },
  6: {
    tempo: 60,
    mode: MODES.lydian,
    root: 50,
    lead: ['keys'],
    harmony: 'strings',
    arpeggio: false,
    drums: [null, null, null, null],
    beats: 3,
    progressions: [
      [0, 4, 0, 4],
      [0, 1, 5, 4],
      [3, 0, 4, 0],
    ],
    themes: [GYMNOPEDIE],
  },
};

/** Early-era colors by architecture (content: `civ.architecture`). */
const FLAVORS: Record<string, { mode: number[]; themes?: Theme[]; lead?: Lead[] }> = {
  east_asian: { mode: MODES.pentatonic, themes: [SAKURA], lead: ['pluck', 'flute'] },
  steppe: { mode: MODES.minorPentatonic, lead: ['flute'] },
  african: { mode: MODES.pentatonic, lead: ['pluck', 'flute'] },
  american: { mode: MODES.minorPentatonic, lead: ['flute'] },
  middle_eastern: { mode: MODES.hijaz, lead: ['pluck', 'flute'] },
  south_asian: { mode: MODES.hijaz, lead: ['flute', 'pluck'] },
  northern: { mode: MODES.aeolian },
};

function styleFor(era: number, architecture: string): Style {
  const base = ERA_STYLES[Math.max(1, Math.min(6, era))]!;
  const flavor = era <= 3 ? FLAVORS[architecture] : undefined;
  if (!flavor) return base;
  return {
    ...base,
    mode: flavor.mode,
    lead: flavor.lead ?? base.lead,
    themes: [...(flavor.themes ?? []), ...(architecture === 'east_asian' ? [] : base.themes)],
  };
}

// --- Composing ---------------------------------------------------------------------------------

interface Note {
  /** Beat offset within the bar. */
  at: number;
  dur: number;
  /** Semitones from the tonic, or null for a rest. */
  pitch: number | null;
}

interface Piece {
  bars: { melody: Note[]; chord: number[] }[];
  lead: Lead;
}

const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

/** A scale degree as semitones (degrees past the scale wrap into the next octave). */
function degree(mode: number[], d: number) {
  const n = mode.length;
  const oct = Math.floor(d / n);
  return mode[((d % n) + n) % n]! + oct * 12;
}

function chordOf(mode: number[], root: number): number[] {
  const step = mode.length >= 7 ? 2 : 2;
  return [degree(mode, root), degree(mode, root + step), degree(mode, root + step * 2)];
}

const RHYTHMS: Record<3 | 4, number[][]> = {
  4: [
    [1, 1, 2],
    [2, 1, 1],
    [1.5, 0.5, 1, 1],
    [1, 1, 1, 1],
    [2, 2],
    [0.5, 0.5, 1, 2],
    [3, 1],
  ],
  3: [[1, 1, 1], [2, 1], [1.5, 0.5, 1], [1, 2], [0.5, 0.5, 1, 1], [3]],
};

function composeGenerative(style: Style): Piece {
  const prog = pick(style.progressions);
  const chords = Array.from({ length: 16 }, (_, i) => prog[i % prog.length]!);
  const motif = (startDeg: number, bars: number): Note[][] => {
    let d = startDeg;
    return Array.from({ length: bars }, () => {
      const rhythm = pick(RHYTHMS[style.beats]);
      let t = 0;
      return rhythm.map((dur) => {
        const note: Note = {
          at: t,
          dur,
          pitch: Math.random() < 0.08 ? null : degree(style.mode, d),
        };
        t += dur;
        d += pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]);
        d = Math.max(-2, Math.min(style.mode.length + 4, d));
        return note;
      });
    });
  };
  const a = motif(chords[0]! + style.mode.length, 2);
  const b = motif(chords[4]! + style.mode.length + 2, 2);
  const shift = (bars: Note[][], semis: number) =>
    bars.map((bar) => bar.map((n) => ({ ...n, pitch: n.pitch === null ? null : n.pitch + semis })));
  const cadence = (bars: Note[][]): Note[][] => {
    const out = bars.map((bar) => bar.slice());
    const lastBar = out[out.length - 1]!;
    out[out.length - 1] = [
      ...lastBar.slice(0, 1).map((n) => ({ ...n, dur: 1 })),
      { at: 1, dur: style.beats - 1, pitch: degree(style.mode, style.mode.length) },
    ];
    return out;
  };
  // AA'BA, twice: 16 bars.
  const sections = [a, shift(a, degree(style.mode, 2) - degree(style.mode, 0)), b, cadence(a)];
  const melody = [...sections, ...sections].flat();
  return {
    bars: melody.map((m, i) => ({ melody: m, chord: chordOf(style.mode, chords[i]!) })),
    lead: pick(style.lead),
  };
}

function composeTheme(style: Style, theme: Theme): Piece {
  const bars: { melody: Note[]; chord: number[] }[] = [];
  let bar: Note[] = [];
  let t = 0;
  const flush = () => {
    const first = bar.find((n) => n.pitch !== null)?.pitch ?? 0;
    // Harmonize: the triad of the scale degree nearest the bar's first note.
    const mode = theme.minor ? MODES.aeolian : MODES.ionian;
    const pc = ((first % 12) + 12) % 12;
    const roots = theme.minor ? [0, 3, 5, 4] : [0, 3, 4, 5];
    const root = roots.find((r) => chordOf(mode, r).some((c) => c % 12 === pc)) ?? 0;
    bars.push({ melody: bar, chord: chordOf(mode, root) });
    bar = [];
    t = 0;
  };
  for (const [pitch, dur] of theme.notes) {
    bar.push({ at: t, dur, pitch: pitch === null ? null : pitch + 12 });
    t += dur;
    if (t >= theme.beats - 1e-6) flush();
  }
  if (bar.length) flush();
  return { bars, lead: pick(style.lead) };
}

// --- Playing ---------------------------------------------------------------------------------

class MusicPlayer {
  private timer: number | null = null;
  private style: Style = ERA_STYLES[1]!;
  private era = 1;
  private architecture = 'mediterranean';
  private piece: Piece | null = null;
  private bar = 0;
  private nextBarAt = 0;
  private restUntil = 0;
  private wind: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null =
    null;
  private nextBird = 0;
  /** The theme played last, so the same tune doesn't come round twice in a row. */
  private lastTheme = '';
  /** Beats per bar of the piece playing. */
  private beats: number = 4;

  start() {
    const ctx = audio.start();
    if (!ctx || this.timer !== null) return;
    this.nextBarAt = ctx.currentTime + 0.5;
    this.restUntil = ctx.currentTime + 1;
    this.timer = window.setInterval(() => this.tick(), 120);
    this.startWind();
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.piece = null;
    if (this.wind) {
      this.wind.gain.gain.setTargetAtTime(0, audio.ctx!.currentTime, 0.5);
      this.wind.src.stop(audio.ctx!.currentTime + 2);
      this.wind = null;
    }
  }

  /** The viewer's era (order, 1 = ancient) and their civ's architecture. */
  setEra(era: number, architecture: string) {
    if (era === this.era && architecture === this.architecture) return;
    const changed = era !== this.era;
    this.era = era;
    this.architecture = architecture;
    this.style = styleFor(era, architecture);
    // A new era starts a new piece after a breath.
    if (changed && audio.ctx) {
      this.piece = null;
      this.restUntil = audio.ctx.currentTime + 3;
    }
  }

  /** Lowers the music under a stinger (a wonder, a victory). */
  duck(seconds: number) {
    const ctx = audio.ctx;
    if (!ctx) return;
    const g = audio.music.gain;
    const level = audio.settings.music * 0.6;
    g.cancelScheduledValues(ctx.currentTime);
    g.setTargetAtTime(level * 0.25, ctx.currentTime, 0.15);
    g.setTargetAtTime(level, ctx.currentTime + seconds, 0.8);
  }

  private tick() {
    const ctx = audio.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.ambience(ctx.currentTime);
    while (this.nextBarAt < ctx.currentTime + 0.7) {
      if (!this.piece) {
        if (ctx.currentTime < this.restUntil) {
          this.nextBarAt = Math.max(this.nextBarAt, this.restUntil);
          return;
        }
        const themes = this.style.themes.filter((t) => t.name !== this.lastTheme);
        const useTheme = themes.length > 0 && Math.random() < 0.35;
        if (useTheme) {
          const theme = pick(themes);
          this.lastTheme = theme.name;
          this.piece = composeTheme({ ...this.style, beats: theme.beats }, theme);
          this.beats = theme.beats;
        } else {
          this.piece = composeGenerative(this.style);
          this.beats = this.style.beats;
        }
        this.bar = 0;
      }
      this.playBar(this.nextBarAt);
      this.nextBarAt += (60 / this.style.tempo) * this.beats;
      this.bar++;
      if (this.bar >= this.piece.bars.length) {
        this.piece = null;
        this.restUntil = this.nextBarAt + 4 + Math.random() * 8;
      }
    }
  }

  private playBar(at: number) {
    const piece = this.piece!;
    const { melody, chord } = piece.bars[this.bar]!;
    const s = this.style;
    const beat = 60 / s.tempo;
    const out = audio.music;
    const root = s.root;
    const fade = this.bar >= piece.bars.length - 2 ? 0.7 : 1;
    // Harmony: the chord held, and arpeggiated on harp or lute.
    if (s.harmony === 'pluck' || s.harmony === 'keys') {
      chord.forEach((c, i) =>
        (s.harmony === 'keys' ? keys : pluck)({
          out,
          at: at + i * 0.02,
          midi: root + c,
          dur: beat * this.beats,
          vel: 0.22 * fade,
          wet: 0.5,
        }),
      );
    } else {
      chord.forEach((c) =>
        pad(
          { out, at, midi: root + c, dur: beat * this.beats * 0.95, vel: 0.28 * fade, wet: 0.6 },
          s.harmony as 'strings',
        ),
      );
    }
    if (s.arpeggio) {
      const notes = [chord[0]!, chord[1]!, chord[2]!, chord[1]! + 12];
      for (let i = 0; i < this.beats * 2; i++) {
        pluck(
          {
            out,
            at: at + i * beat * 0.5,
            midi: root + 12 + notes[i % notes.length]!,
            dur: beat,
            vel: 0.13 * fade,
            wet: 0.45,
          },
          0.35,
        );
      }
    }
    // Bass on the downbeat.
    pluck(
      { out, at, midi: root - 12 + chord[0]!, dur: beat * 2, vel: 0.32 * fade, wet: 0.3 },
      0.15,
    );
    // Drums.
    if (s.drums.some(Boolean)) {
      const steps = s.drums.length;
      for (let i = 0; i < steps; i++) {
        const k = s.drums[i];
        if (k)
          drum(out, at + (i * beat * this.beats) / steps, k, (i === 0 ? 0.32 : 0.2) * fade, 0.25);
      }
    }
    // Melody.
    for (const n of melody) {
      if (n.pitch === null) continue;
      const v = {
        out,
        at: at + n.at * beat,
        midi: root + 12 + n.pitch,
        dur: n.dur * beat * 0.95,
        vel: 0.42 * fade,
        wet: 0.5,
      };
      if (piece.lead === 'flute') flute(v);
      else if (piece.lead === 'keys') keys(v);
      else if (piece.lead === 'brass') brass({ ...v, vel: 0.3 * fade });
      else pluck(v, 0.55);
    }
    // A bell at the top of each section.
    if (this.bar % 8 === 0 && this.era >= 2)
      bell({ out, at, midi: root + 24 + chord[0]!, dur: 2, vel: 0.08, wet: 0.7 });
  }

  /** Wind, always; birds in the early eras. */
  private ambience(now: number) {
    if (this.era <= 4 && now > this.nextBird) {
      this.nextBird = now + 6 + Math.random() * 12;
      const ctx = audio.ctx!;
      const at = now + 0.1;
      const base = 2400 + Math.random() * 1600;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        const t = at + i * 0.13;
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.06);
        o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.11);
        o.connect(g).connect(audio.ambience);
        o.start(t);
        o.stop(t + 0.15);
      }
    }
  }

  private startWind() {
    const ctx = audio.ctx!;
    if (this.wind) return;
    const src = ctx.createBufferSource();
    src.buffer = audio.noiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 180;
    lfo.connect(lfoAmt).connect(filter.frequency);
    lfo.start();
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    src.connect(filter).connect(gain).connect(audio.ambience);
    src.start();
    this.wind = { src, filter, gain };
  }
}

export const music = new MusicPlayer();
