import type { CompiledContent } from '@cx/content';
import {
  createRng,
  generateMap,
  isOnRiver,
  type MapSettings,
  makeRandom,
  type MapState,
  validateMap,
} from '@cx/engine';

const mapSettings = (script: string, size: string): MapSettings => ({
  script,
  size,
  wrapX: true,
  resources: 'standard',
  startBalance: 'normal',
});

function players(content: CompiledContent, size: string) {
  const n = content.entities.mapSize[size]?.players ?? 2;
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));
}

/** `cx mapcheck`: generates many maps per script and size, validates each, reports timing. */
export function runMapCheck(
  content: CompiledContent,
  count: number,
  sizes?: string[],
): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  for (const script of content.ids.mapScript) {
    for (const size of sizes ?? content.ids.mapSize) {
      let failed = 0;
      let worst = 0;
      let total = 0;
      const examples: string[] = [];
      for (let s = 0; s < count; s++) {
        const start = performance.now();
        try {
          const { map, starts } = generateMap(
            { content, settings: mapSettings(script, size), players: players(content, size) },
            makeRandom(createRng(`mapcheck-${s}`)),
          );
          const problems = validateMap(map, starts, content);
          if (problems.length > 0) {
            failed++;
            if (examples.length < 3) examples.push(`seed ${s}: ${problems[0]}`);
          }
        } catch (e) {
          failed++;
          if (examples.length < 3)
            examples.push(`seed ${s}: ${e instanceof Error ? e.message : String(e)}`);
        }
        const ms = performance.now() - start;
        worst = Math.max(worst, ms);
        total += ms;
      }
      if (failed > 0 || worst > 1000) ok = false;
      lines.push(
        `${failed === 0 && worst <= 1000 ? '✓' : '✗'} ${script.padEnd(12)} ${size.padEnd(9)} ` +
          `${count - failed}/${count} valid  avg ${(total / count).toFixed(0)}ms  worst ${worst.toFixed(0)}ms`,
        ...examples.map((e) => `    ${e}`),
      );
    }
  }
  return { ok, lines };
}

const CHARS: Record<string, string> = {
  ocean: '~',
  coast: '-',
  lake: 'o',
  grassland: 'g',
  plains: 'p',
  desert: 'd',
  tundra: 't',
  snow: 's',
};

/** Text rendering of a map: one character per tile (see the legend). For a quick look before M4. */
export function renderMapText(map: MapState, starts: Record<string, number>): string[] {
  const startTiles = new Set(Object.values(starts));
  const rivers = map.tiles.map((t) => t.river);
  const lines: string[] = [];
  for (let row = 0; row < map.height; row++) {
    let line = row % 2 ? ' ' : '';
    for (let col = 0; col < map.width; col++) {
      const i = row * map.width + col;
      const t = map.tiles[i]!;
      let ch = CHARS[t.terrain] ?? '?';
      if (t.elevation === 'mountain') ch = '^';
      else if (t.elevation === 'hills') ch = ch.toUpperCase();
      if (t.feature === 'woods') ch = 'w';
      else if (t.feature === 'rainforest') ch = 'j';
      else if (t.feature === 'ice') ch = '#';
      if (startTiles.has(i)) ch = '@';
      else if (isOnRiver(map, rivers, i)) ch += '̱';
      line += `${ch} `;
    }
    lines.push(line);
  }
  lines.push(
    '',
    'legend: ~ ocean  - coast  o lake  g grassland  p plains  d desert  t tundra  s snow',
    '        CAPITAL = hills  ^ mountain  w woods  j rainforest  # ice  underlined = river  @ start',
  );
  return lines;
}

export function previewMap(
  content: CompiledContent,
  script: string,
  size: string,
  seed: string,
): string[] {
  const { map, starts } = generateMap(
    { content, settings: mapSettings(script, size), players: players(content, size) },
    makeRandom(createRng(seed)),
  );
  return renderMapText(map, starts);
}
