import { resolveText } from '@cx/content';
import { type EngineContext, scoreOf, settlementsOf } from '@cx/engine';
import type { SaveFile } from '@cx/host';

/** "3 minutes ago", "yesterday", "12 Oct". */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  if (s < 172800) return 'yesterday';
  if (s < 86400 * 14) return `${Math.round(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** What the Continue card shows about a saved game: the first human's civilization and progress. */
export function describeSave(ctx: EngineContext, save: SaveFile) {
  const state = save.state;
  const me =
    state.playerOrder.find((p) => state.players[p]!.kind === 'human') ?? state.playerOrder[0]!;
  const p = state.players[me]!;
  const c = ctx.content;
  const era = p.ages ? c.entities.era[p.ages.era] : undefined;
  let score = 0;
  try {
    score = scoreOf(ctx, state, me).total;
  } catch {
    // A save from other content: no score.
  }
  const humans = state.playerOrder.filter((id) => state.players[id]!.kind === 'human').length;
  return {
    leader: p.leader,
    name: p.name,
    era: era ? resolveText(c, era.name) : '',
    settlements: settlementsOf(state, me).length,
    civs: state.playerOrder.length,
    humans,
    score,
    map: c.entities.mapScript[state.settings.map.script]?.name ?? '',
    difficulty: c.entities.difficulty[state.settings.difficulty ?? '']?.name ?? '',
  };
}
