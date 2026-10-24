import { type CompiledContent, resolveText } from '@cx/content';
import type { EngineContext } from './context';
import type { GameState, PlayerId } from './state';

/**
 * Civ uniques (docs/09-base-roster.md): a unit, building, district or improvement with `civ` is
 * only for players of that civ, and with `replaces` it takes the place of a standard item, which
 * that civ can't have. For everything else (adjacency, prerequisites, counting) a unique counts
 * as the item it replaces.
 */

export type UniqueKind = 'unit' | 'building' | 'district' | 'improvement';

/** `kind:civ:replaced` → the unique that replaces it, per compiled content. */
const replacements = new WeakMap<CompiledContent, Map<string, string>>();

function replacementMap(content: CompiledContent): Map<string, string> {
  let map = replacements.get(content);
  if (map) return map;
  map = new Map();
  for (const kind of ['unit', 'building', 'district', 'improvement'] as const) {
    const entities = content.entities[kind] as Record<
      string,
      { civ?: string | undefined; replaces?: string | undefined }
    >;
    for (const id of content.ids[kind]) {
      const def = entities[id]!;
      if (def.civ && def.replaces) map.set(`${kind}:${def.civ}:${def.replaces}`, id);
    }
  }
  replacements.set(content, map);
  return map;
}

function defOf(ctx: EngineContext, kind: UniqueKind, id: string) {
  return (
    ctx.content.entities[kind] as Record<
      string,
      { name: string; civ?: string | undefined; replaces?: string | undefined } | undefined
    >
  )[id];
}

/** The unique a civ has in place of `id`, if any. */
export function replacementFor(
  ctx: EngineContext,
  kind: UniqueKind,
  civ: string,
  id: string,
): string | undefined {
  return replacementMap(ctx.content).get(`${kind}:${civ}:${id}`);
}

/** What a unique stands for (the item it replaces), or the item itself. */
export function baseOf(ctx: EngineContext, kind: UniqueKind, id: string): string {
  return defOf(ctx, kind, id)?.replaces ?? id;
}

/** True if `id` is `wanted` or a unique that replaces it. */
export function countsAs(ctx: EngineContext, kind: UniqueKind, id: string, wanted: string) {
  return id === wanted || baseOf(ctx, kind, id) === wanted;
}

/** Why a player can't have this item because of uniques ("Only Rome", "Replaced by..."). */
export function uniqueProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  kind: UniqueKind,
  id: string,
): string | undefined {
  const def = defOf(ctx, kind, id);
  if (!def) return undefined;
  const civ = state.players[player]?.civ ?? '';
  if (def.civ && def.civ !== civ) {
    const owner = ctx.content.entities.civ[def.civ];
    return `Only ${owner ? resolveText(ctx.content, owner.name) : def.civ} can have ${resolveText(ctx.content, def.name)}`;
  }
  const replacement = replacementFor(ctx, kind, civ, id);
  if (replacement) {
    const r = defOf(ctx, kind, replacement)!;
    return `Replaced by ${resolveText(ctx.content, r.name)} for your civilization`;
  }
  return undefined;
}

/** The uniques of a civ, by kind (for showing a civ's kit). */
export function uniquesOf(
  ctx: EngineContext,
  civ: string,
): { kind: UniqueKind; id: string; replaces: string | undefined }[] {
  const out: { kind: UniqueKind; id: string; replaces: string | undefined }[] = [];
  for (const kind of ['unit', 'building', 'district', 'improvement'] as const) {
    for (const id of ctx.content.ids[kind]) {
      const def = defOf(ctx, kind, id)!;
      if (def.civ === civ) out.push({ kind, id, replaces: def.replaces });
    }
  }
  return out;
}
