import type { CompiledContent } from '@cx/content';
import type { GameStats } from './stats';

/**
 * Turns many `GameStats` (one per all-AI game) into readable tables: pace, victories, yields
 * over time, what got built, and how often each choice was taken. Used for
 * docs/MECHANICS-REVIEW.md; run it with `pnpm cx stats-report <file.jsonl> [groupBy]`.
 */

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const med = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const f = (n: number, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const pad = (s: string, w: number) => (s.length >= w ? s : s + ' '.repeat(w - s.length));
const lpad = (s: string, w: number) => (s.length >= w ? s : ' '.repeat(w - s.length) + s);

function table(head: string[], rows: string[][]): string[] {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (r: string[]) =>
    r.map((c, i) => (i === 0 ? pad(c, widths[i]!) : lpad(c, widths[i]!))).join('  ');
  return [line(head), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)];
}

export type GroupKey = 'speed' | 'size' | 'difficulty' | 'startEra' | 'script' | 'players' | 'all';

function groupOf(g: GameStats, by: GroupKey): string {
  const c = g.config;
  switch (by) {
    case 'speed':
      return c.speed.replace('speed_', '');
    case 'size':
      return c.size;
    case 'difficulty':
      return c.difficulty.replace('difficulty_', '');
    case 'startEra':
      return (c.startEra ?? 'era_ancient').replace('era_', '');
    case 'script':
      return c.script;
    case 'players':
      return String(c.players);
    default:
      return 'all';
  }
}

/** The sample nearest a turn, for each game that got that far. */
function sampleAt(g: GameStats, turn: number) {
  let best: GameStats['samples'][number] | undefined;
  for (const s of g.samples) if (s.turn <= turn && (!best || s.turn > best.turn)) best = s;
  return best && turn - best.turn < 10 ? best : undefined;
}

export function summarizeStats(
  games: GameStats[],
  by: GroupKey = 'speed',
  content?: CompiledContent,
): string[] {
  const out: string[] = [];
  const name = (kind: string, id: string) => {
    const def = (content?.entities as Record<string, Record<string, { name?: unknown }>>)?.[kind]?.[
      id
    ];
    return typeof def?.name === 'string' ? def.name : id;
  };
  const groups = new Map<string, GameStats[]>();
  for (const g of games) {
    const k = groupOf(g, by);
    groups.set(k, [...(groups.get(k) ?? []), g]);
  }
  const keys = [...groups.keys()].sort();

  out.push(`## ${games.length} games, grouped by ${by}`, '');

  // Pace and victories.
  out.push('### Length and victories', '');
  out.push(
    ...table(
      [
        'group',
        'games',
        'avg end',
        'limit',
        'score',
        'science',
        'culture',
        'religion',
        'diplo',
        'domin',
        'conq',
        'AI ms',
        'turn ms',
      ],
      keys.map((k) => {
        const gs = groups.get(k)!;
        const r = (reason: string) => String(gs.filter((g) => g.result?.reason === reason).length);
        return [
          k,
          String(gs.length),
          f(avg(gs.map((g) => g.endTurn))),
          f(avg(gs.map((g) => g.config.turns ?? 0))),
          r('score'),
          r('science'),
          r('culture'),
          r('religion'),
          r('diplomatic'),
          r('domination'),
          r('conquest'),
          f(avg(gs.map((g) => g.aiMs.average))),
          f(avg(gs.map((g) => g.processMs.average))),
        ];
      }),
    ),
    '',
  );
  const decisive = games.filter((g) => g.result && g.result.reason !== 'score');
  if (decisive.length) {
    out.push(
      'Decisive wins: ' +
        decisive
          .map((g) => `${g.result!.reason}@${g.endTurn}(${g.config.speed.replace('speed_', '')})`)
          .join(', '),
      '',
    );
  }

  // Era pace.
  out.push('### Turn half the civs reached each era (first civ in brackets)', '');
  const eraNames = ['anc', 'cla', 'med', 'ren', 'ind', 'mod', 'ato', 'inf', 'fut'];
  out.push(
    ...table(
      ['group', ...eraNames.slice(1)],
      keys.map((k) => {
        const gs = groups.get(k)!;
        return [
          k,
          ...eraNames.slice(1).map((_, i) => {
            const e = i + 2; // era orders start at 1 (Ancient)
            const half = gs.map((g) => g.eraHalf[e]).filter((x): x is number => x !== undefined);
            const first = gs.map((g) => g.eraFirst[e]).filter((x): x is number => x !== undefined);
            if (!first.length) return '-';
            return `${half.length ? f(avg(half)) : '-'}(${f(avg(first))})`;
          }),
        ];
      }),
    ),
    '',
  );

  // Yields over time: the median civ, averaged over games.
  const checkpoints = [25, 50, 100, 150, 200, 250, 300, 400, 500, 700, 1000, 1400];
  const yields = [
    'food',
    'production',
    'gold',
    'science',
    'culture',
    'faith',
    'influence',
    'tourism',
    'happiness',
  ];
  for (const k of keys) {
    const gs = groups.get(k)!;
    const rows: string[][] = [];
    for (const t of checkpoints) {
      const per = gs.map((g) => sampleAt(g, t)).filter((s) => s !== undefined);
      if (per.length < Math.max(1, gs.length / 2)) continue;
      const civ = (fn: (p: GameStats['samples'][number]['players'][string]) => number) =>
        f(avg(per.map((s) => med(Object.values(s.players).map(fn)))), 0);
      rows.push([
        String(t),
        ...yields.map((y) => civ((p) => p.yields[y] ?? 0)),
        civ((p) => p.goldNet),
        civ((p) => p.gold),
        civ((p) => p.settlements),
        civ((p) => p.cities),
        civ((p) => p.population),
        civ((p) => p.techs),
        civ((p) => p.civics),
        civ((p) => p.era),
        civ((p) => p.districts),
        civ((p) => p.buildings),
        civ((p) => p.units),
        civ((p) => p.unhappy),
        civ((p) => p.unrest ?? NaN),
        f(avg(per.map((s) => med(Object.values(s.players).map((p) => p.balance ?? NaN)))), 1),
      ]);
    }
    out.push(`### Median civ over time: ${k}`, '');
    out.push(
      ...table(
        [
          'turn',
          'food',
          'prod',
          'gold',
          'sci',
          'cult',
          'faith',
          'infl',
          'tour',
          'happy',
          'net$',
          'bank$',
          'setl',
          'city',
          'pop',
          'tech',
          'civic',
          'era',
          'dist',
          'bldg',
          'units',
          'sad',
          'riot',
          'mood',
        ],
        rows,
      ),
      '',
    );
  }

  // Great people, religion, wonders, war.
  out.push('### Great people, religion, wonders and war (per game)', '');
  out.push(
    ...table(
      [
        'group',
        'GP',
        '1st GP',
        'pantheon 1st/avg',
        'religions',
        '1st rel',
        'wonders',
        '1st wonder',
        'wars',
        'CS wars',
        'captures',
        'defeated',
      ],
      keys.map((k) => {
        const gs = groups.get(k)!;
        return [
          k,
          f(avg(gs.map((g) => g.greatPeople.length)), 1),
          f(avg(gs.map((g) => g.greatPeople[0]?.turn ?? NaN).filter(Number.isFinite))),
          `${f(avg(gs.map((g) => g.pantheons[0]?.turn ?? NaN).filter(Number.isFinite)))}/${f(avg(gs.flatMap((g) => g.pantheons.map((p) => p.turn))))}`,
          f(avg(gs.map((g) => g.religions.length)), 1),
          f(avg(gs.map((g) => g.religions[0]?.turn ?? NaN).filter(Number.isFinite))),
          f(avg(gs.map((g) => g.wonders.length)), 1),
          f(avg(gs.map((g) => g.wonders[0]?.turn ?? NaN).filter(Number.isFinite))),
          f(avg(gs.map((g) => g.wars.filter((w) => !w.cityState).length)), 1),
          f(avg(gs.map((g) => g.wars.filter((w) => w.cityState).length)), 1),
          f(avg(gs.map((g) => g.captures.length)), 1),
          f(avg(gs.map((g) => g.defeated.length)), 1),
        ];
      }),
    ),
    '',
  );

  // Leader win rates (decisive and score wins alike).
  const appear: Record<string, number> = {};
  const wins: Record<string, number> = {};
  const scoreRank: Record<string, number[]> = {};
  for (const g of games) {
    const ranked = [...g.players].sort((a, b) => b.score - a.score);
    ranked.forEach((p, i) => {
      appear[p.leader] = (appear[p.leader] ?? 0) + 1;
      (scoreRank[p.leader] ??= []).push(ranked.length > 1 ? i / (ranked.length - 1) : 0);
    });
    if (g.winnerLeader) wins[g.winnerLeader] = (wins[g.winnerLeader] ?? 0) + 1;
  }
  out.push('### Leaders: games, wins, average finishing place (0 = first, 1 = last)', '');
  out.push(
    ...table(
      ['leader', 'games', 'wins', 'win%', 'avg place'],
      Object.keys(appear)
        .sort((a, b) => avg(scoreRank[a]!) - avg(scoreRank[b]!))
        .map((l) => [
          name('leader', l),
          String(appear[l]),
          String(wins[l] ?? 0),
          f((100 * (wins[l] ?? 0)) / appear[l]!),
          f(avg(scoreRank[l]!), 2),
        ]),
    ),
    '',
  );

  // What got built, per game, and what never was.
  const sumKind = (kind: keyof GameStats['built']) => {
    const total: Record<string, number> = {};
    for (const g of games)
      for (const [id, n] of Object.entries(g.built[kind])) total[id] = (total[id] ?? 0) + n;
    return total;
  };
  for (const kind of ['unit', 'building', 'district', 'project'] as const) {
    const total = sumKind(kind);
    const all = content ? (content.ids[kind as 'unit'] ?? []) : Object.keys(total);
    const never = all.filter((id) => !total[id]);
    out.push(`### ${kind}s built per game (all AI civs together)`, '');
    out.push(
      Object.entries(total)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${name(kind, id)} ${f(n / games.length, 1)}`)
        .join(', '),
    );
    if (never.length) out.push(`Never built: ${never.map((id) => name(kind, id)).join(', ')}`);
    out.push('');
  }
  const wonderTurns: Record<string, number[]> = {};
  for (const g of games) for (const w of g.wonders) (wonderTurns[w.id] ??= []).push(w.turn);
  out.push('### Wonders: share of games built, average turn', '');
  out.push(
    Object.entries(wonderTurns)
      .sort((a, b) => avg(a[1]) - avg(b[1]))
      .map(
        ([id, ts]) => `${name('wonder', id)} ${f((100 * ts.length) / games.length)}%@${f(avg(ts))}`,
      )
      .join(', '),
  );
  if (content) {
    const never = content.ids.wonder.filter((w) => !wonderTurns[w]);
    if (never.length) out.push(`Never built: ${never.map((id) => name('wonder', id)).join(', ')}`);
  }
  out.push('');

  const shares = (
    title: string,
    kind: string,
    pick: (g: GameStats) => Record<string, number>,
    all?: string[],
  ) => {
    const total: Record<string, number> = {};
    for (const g of games)
      for (const [id, n] of Object.entries(pick(g))) total[id] = (total[id] ?? 0) + n;
    const sum = Object.values(total).reduce((a, b) => a + b, 0) || 1;
    out.push(`### ${title}`, '');
    out.push(
      Object.entries(total)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${name(kind, id)} ${f((100 * n) / sum, 1)}%`)
        .join(', '),
    );
    const never = (all ?? []).filter((id) => !total[id]);
    if (never.length) out.push(`Never: ${never.map((id) => name(kind, id)).join(', ')}`);
    out.push('');
  };
  shares(
    'Policy cards (share of slotted player-turns)',
    'policy',
    (g) => g.policyTurns,
    content?.ids.policy,
  );
  shares(
    'Governments (share of player-turns)',
    'government',
    (g) => g.governmentTurns,
    content?.ids.government,
  );
  shares('Beliefs taken', 'belief', (g) => g.beliefs, content?.ids.belief);
  shares('Dedications', 'dedication', (g) => g.dedications, content?.ids.dedication);
  shares('Ages entered', 'age', (g) => g.ages);
  shares('Governors appointed', 'governor', (g) => g.governors, content?.ids.governor);
  shares('Spy missions (mission:outcome)', 'spyMission', (g) => g.spyMissions);
  shares('Resolutions passed', 'resolution', (g) => g.resolutions);
  shares('Bought instead of built', 'x', (g) => g.bought);

  const gpTurns: Record<string, number[]> = {};
  for (const g of games) for (const p of g.greatPeople) (gpTurns[p.id] ??= []).push(p.turn);
  out.push('### Great people: share of games earned, average turn', '');
  out.push(
    Object.entries(gpTurns)
      .sort((a, b) => avg(a[1]) - avg(b[1]))
      .map(
        ([id, ts]) =>
          `${name('greatPerson', id)} ${f((100 * ts.length) / games.length)}%@${f(avg(ts))}`,
      )
      .join(', '),
  );
  out.push('');

  const refused: Record<string, number> = {};
  for (const g of games)
    for (const [k, n] of Object.entries(g.rejected)) refused[k] = (refused[k] ?? 0) + n;
  out.push('### Refused AI actions (total)', '', JSON.stringify(refused), '');
  const ev: Record<string, number> = {};
  for (const g of games) for (const [k, n] of Object.entries(g.events)) ev[k] = (ev[k] ?? 0) + n;
  out.push(
    '### Events per game',
    '',
    Object.entries(ev)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${f(n / games.length, 1)}`)
      .join(', '),
    '',
  );
  return out;
}
