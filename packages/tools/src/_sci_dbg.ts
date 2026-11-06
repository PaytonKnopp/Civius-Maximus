import { writeFileSync } from 'node:fs';
import { compileFromDirs } from '@cx/content/node';
import { districtYields, settlementYields, type GameState } from '@cx/engine';
import { runStats } from './stats';
const content = compileFromDirs().content!;
const ctx = { content };
const turns = Number(process.argv[2] ?? 120);
runStats(
  content,
  { players: 6, seed: '1', size: 'small', script: 'continents', speed: 'speed_standard', turns },
  undefined,
  (state: GameState) => {
    writeFileSync(process.argv[3]!, JSON.stringify(state));
    const totals = state.playerOrder.map((id) => {
      let sci = 0;
      for (const s of Object.values(state.settlements))
        if (s.owner === id) sci += settlementYields(ctx, state, s).total.science ?? 0;
      return [id, sci] as const;
    });
    console.log(
      'science',
      totals
        .map(([id, v]) => `${id}:${(v / 100).toFixed(0)}(${state.players[id]!.leader})`)
        .join(' '),
    );
    const top = [...totals].sort((a, b) => b[1] - a[1])[0]![0];
    const lines: Record<string, number> = {};
    for (const s of Object.values(state.settlements)) {
      if (s.owner !== top) continue;
      for (const l of settlementYields(ctx, state, s).lines.science ?? []) {
        const key = l.label.replace(/\(\d+\)/, '(n)').replace(/ in .*/, '');
        lines[key] = (lines[key] ?? 0) + l.amount;
      }
      for (const d of s.districts)
        if (d.id.includes('campus') || d.id.includes('seowon'))
          console.log(
            'campus',
            s.name,
            JSON.stringify(districtYields(ctx, state, d.tile, d.id).lines.science),
          );
    }
    console.log(
      Object.entries(lines)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([k, v]) => `${(v / 100).toFixed(1)}  ${k}`)
        .join('\n'),
    );
    const p = state.players[top]!;
    console.log('policies', JSON.stringify(p.policies), 'gov', p.government, 'gp', p.greatPeople);
    console.log('research', JSON.stringify(state.diplomacy.research ?? {}));
  },
);
