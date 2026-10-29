import { audio, bell, brass, drum, flute, keys, noise, pad, pluck } from './engine';

/**
 * Sound effects (docs/06-ui-ux.md, "Music and sound"): one short synthesized cue per kind of
 * thing that happens, tuned to sit under the music. `play(name)` is safe to call any time: it
 * does nothing until sound has started, and rate-limits each cue so a burst of events doesn't
 * stack.
 */

export type Sfx =
  | 'click'
  | 'open'
  | 'close'
  | 'select'
  | 'select_civilian'
  | 'move'
  | 'move_horse'
  | 'move_ship'
  | 'found'
  | 'build'
  | 'buy'
  | 'research'
  | 'civic'
  | 'boost'
  | 'grow'
  | 'border'
  | 'melee'
  | 'ranged'
  | 'gun'
  | 'cannon'
  | 'killed'
  | 'captured'
  | 'promote'
  | 'war'
  | 'peace'
  | 'deal'
  | 'wonder'
  | 'great_person'
  | 'religion'
  | 'government'
  | 'era'
  | 'turn'
  | 'end_turn'
  | 'notify'
  | 'error'
  | 'gold'
  | 'burning'
  | 'victory'
  | 'defeat';

const last = new Map<Sfx, number>();
const GAP: Partial<Record<Sfx, number>> = {
  click: 0.04,
  move: 0.12,
  move_horse: 0.12,
  notify: 0.4,
};

export function play(name: Sfx, delay = 0) {
  const ctx = audio.ctx;
  if (!ctx || ctx.state !== 'running' || audio.settings.muted) return;
  const now = ctx.currentTime;
  const gap = GAP[name] ?? 0.08;
  if ((last.get(name) ?? -1) > now - gap) return;
  last.set(name, now);
  const at = now + 0.01 + delay;
  const out = audio.effects;
  const chord = (notes: number[], fn: (m: number, i: number) => void) => notes.forEach(fn);
  switch (name) {
    case 'click':
      noise(out, at, { dur: 0.035, from: 3200, to: 2200, q: 3, vel: 0.12, wet: 0 });
      break;
    case 'open':
      pluck({ out, at, midi: 79, dur: 0.15, vel: 0.25, wet: 0.2 }, 0.7);
      pluck({ out, at: at + 0.05, midi: 84, dur: 0.2, vel: 0.2, wet: 0.2 }, 0.7);
      break;
    case 'close':
      pluck({ out, at, midi: 81, dur: 0.12, vel: 0.2, wet: 0.15 }, 0.6);
      pluck({ out, at: at + 0.045, midi: 76, dur: 0.18, vel: 0.18, wet: 0.15 }, 0.6);
      break;
    case 'select':
      noise(out, at, { dur: 0.09, from: 1800, to: 900, q: 6, vel: 0.18 });
      drum(out, at, 'tick', 0.25, 0);
      break;
    case 'select_civilian':
      pluck({ out, at, midi: 74, dur: 0.18, vel: 0.3, wet: 0.2 });
      break;
    case 'move':
      for (let i = 0; i < 3; i++)
        noise(out, at + i * 0.11, { dur: 0.06, from: 900, to: 300, q: 1.5, vel: 0.16, wet: 0 });
      break;
    case 'move_horse':
      for (let i = 0; i < 4; i++) drum(out, at + i * 0.09 + (i % 2) * 0.02, 'frame', 0.2, 0);
      break;
    case 'move_ship':
      noise(out, at, { dur: 0.7, from: 600, to: 250, type: 'lowpass', vel: 0.22, wet: 0.3 });
      break;
    case 'found':
      bell({ out, at, midi: 67, dur: 1.4, vel: 0.5, wet: 0.5 });
      chord([55, 62, 67, 71], (m, i) =>
        pad({ out, at: at + 0.05 + i * 0.03, midi: m, dur: 1.6, vel: 0.5, wet: 0.5 }),
      );
      break;
    case 'build':
      for (let i = 0; i < 3; i++) drum(out, at + i * 0.13, 'frame', 0.35, 0.1);
      bell({ out, at: at + 0.4, midi: 79, dur: 0.8, vel: 0.35, wet: 0.4 });
      break;
    case 'buy':
    case 'gold':
      for (let i = 0; i < 4; i++)
        bell({ out, at: at + i * 0.06, midi: 88 + (i % 2) * 3, dur: 0.25, vel: 0.18, wet: 0.2 });
      break;
    case 'research':
      chord([72, 76, 79, 84], (m, i) =>
        keys({ out, at: at + i * 0.08, midi: m, dur: 0.9, vel: 0.4, wet: 0.45 }),
      );
      break;
    case 'civic':
      chord([67, 71, 74, 79, 83], (m, i) =>
        pluck({ out, at: at + i * 0.06, midi: m, dur: 1, vel: 0.4, wet: 0.5 }, 0.4),
      );
      break;
    case 'boost':
      chord([79, 86], (m, i) =>
        bell({ out, at: at + i * 0.07, midi: m, dur: 0.6, vel: 0.3, wet: 0.4 }),
      );
      break;
    case 'grow':
      flute({ out, at, midi: 79, dur: 0.22, vel: 0.35, wet: 0.4 });
      flute({ out, at: at + 0.18, midi: 84, dur: 0.4, vel: 0.35, wet: 0.4 });
      break;
    case 'border':
      pad({ out, at, midi: 67, dur: 0.8, vel: 0.35, wet: 0.5 }, 'choir');
      break;
    case 'melee':
      noise(out, at, { dur: 0.18, from: 5200, to: 1800, q: 8, vel: 0.5, wet: 0.2 });
      bell({ out, at, midi: 96, dur: 0.3, vel: 0.15, wet: 0.2 });
      noise(out, at + 0.12, { dur: 0.12, from: 3000, to: 1200, q: 6, vel: 0.35, wet: 0.2 });
      drum(out, at + 0.05, 'low', 0.35, 0.1);
      break;
    case 'ranged':
      noise(out, at, { dur: 0.35, from: 900, to: 3500, q: 4, vel: 0.25, wet: 0.1 });
      drum(out, at + 0.4, 'frame', 0.4, 0.1);
      break;
    case 'gun':
      for (let i = 0; i < 3; i++) {
        noise(out, at + i * 0.09, {
          dur: 0.16,
          from: 2400,
          to: 300,
          type: 'lowpass',
          vel: 0.55,
          wet: 0.35,
        });
        drum(out, at + i * 0.09, 'snare', 0.3, 0.2);
      }
      break;
    case 'cannon':
      drum(out, at, 'low', 1, 0.5);
      noise(out, at, { dur: 0.9, from: 1200, to: 80, type: 'lowpass', vel: 0.8, wet: 0.5 });
      break;
    case 'killed':
      drum(out, at, 'low', 0.6, 0.3);
      pad({ out, at, midi: 45, dur: 0.6, vel: 0.4, wet: 0.4 });
      break;
    case 'captured':
      brass({ out, at, midi: 60, dur: 0.25, vel: 0.5, wet: 0.4 });
      brass({ out, at: at + 0.22, midi: 67, dur: 0.6, vel: 0.55, wet: 0.4 });
      drum(out, at, 'low', 0.6, 0.3);
      break;
    case 'promote':
      chord([76, 79, 83, 88], (m, i) =>
        bell({ out, at: at + i * 0.05, midi: m, dur: 0.5, vel: 0.25, wet: 0.35 }),
      );
      break;
    case 'war':
      for (let i = 0; i < 3; i++) drum(out, at + i * 0.32, 'low', 0.9, 0.4);
      brass({ out, at: at + 0.1, midi: 50, dur: 0.9, vel: 0.6, wet: 0.5 });
      brass({ out, at: at + 0.1, midi: 57, dur: 0.9, vel: 0.5, wet: 0.5 });
      break;
    case 'peace':
      chord([60, 64, 67, 72], (m) =>
        pad({ out, at, midi: m, dur: 1.8, vel: 0.45, wet: 0.6 }, 'choir'),
      );
      flute({ out, at: at + 0.3, midi: 79, dur: 1, vel: 0.35, wet: 0.5 });
      break;
    case 'deal':
      chord([67, 72], (m, i) =>
        pluck({ out, at: at + i * 0.1, midi: m, dur: 0.6, vel: 0.35, wet: 0.3 }),
      );
      break;
    case 'wonder':
      // A short fanfare over a choir.
      chord([60, 64, 67], (m) => pad({ out, at, midi: m, dur: 2.4, vel: 0.5, wet: 0.6 }, 'choir'));
      [
        [67, 0, 0.2],
        [72, 0.2, 0.2],
        [76, 0.4, 0.2],
        [79, 0.6, 1.0],
      ].forEach(([m, t, d]) => brass({ out, at: at + t!, midi: m!, dur: d!, vel: 0.5, wet: 0.5 }));
      bell({ out, at: at + 0.6, midi: 84, dur: 2, vel: 0.35, wet: 0.6 });
      break;
    case 'great_person':
      chord([62, 69, 74, 78], (m, i) =>
        pad({ out, at: at + i * 0.1, midi: m, dur: 2, vel: 0.45, wet: 0.7 }, 'choir'),
      );
      break;
    case 'religion':
      chord([48, 55, 60, 64, 67], (m) =>
        pad({ out, at, midi: m, dur: 2.4, vel: 0.5, wet: 0.7 }, 'organ'),
      );
      break;
    case 'government':
      brass({ out, at, midi: 62, dur: 0.3, vel: 0.45, wet: 0.4 });
      brass({ out, at: at + 0.28, midi: 69, dur: 0.7, vel: 0.5, wet: 0.4 });
      break;
    case 'era':
      bell({ out, at, midi: 40, dur: 4, vel: 0.8, wet: 0.7 }, true);
      chord([52, 59, 64], (m) => pad({ out, at: at + 0.2, midi: m, dur: 3, vel: 0.4, wet: 0.6 }));
      break;
    case 'turn':
      bell({ out, at, midi: 76, dur: 0.9, vel: 0.22, wet: 0.5 });
      break;
    case 'end_turn':
      drum(out, at, 'frame', 0.35, 0.2);
      pluck({ out, at: at + 0.02, midi: 64, dur: 0.4, vel: 0.25, wet: 0.3 });
      break;
    case 'notify':
      pluck({ out, at, midi: 84, dur: 0.2, vel: 0.18, wet: 0.3 }, 0.8);
      break;
    case 'error':
      pad({ out, at, midi: 43, dur: 0.18, vel: 0.5, wet: 0 }, 'organ');
      break;
    case 'burning':
      noise(out, at, {
        dur: 1.6,
        from: 1400,
        to: 500,
        type: 'bandpass',
        q: 0.6,
        vel: 0.3,
        wet: 0.3,
      });
      break;
    case 'victory':
      chord([60, 64, 67, 72], (m) =>
        pad({ out, at, midi: m, dur: 4, vel: 0.55, wet: 0.6 }, 'choir'),
      );
      [
        [67, 0, 0.3],
        [72, 0.3, 0.3],
        [76, 0.6, 0.3],
        [79, 0.9, 0.6],
        [76, 1.5, 0.3],
        [79, 1.8, 1.6],
      ].forEach(([m, t, d]) => brass({ out, at: at + t!, midi: m!, dur: d!, vel: 0.55, wet: 0.5 }));
      break;
    case 'defeat':
      chord([45, 48, 52], (m) => pad({ out, at, midi: m, dur: 4, vel: 0.5, wet: 0.7 }));
      bell({ out, at, midi: 36, dur: 5, vel: 0.6, wet: 0.7 }, true);
      break;
  }
}
