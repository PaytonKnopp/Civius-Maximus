import {
  type Action,
  availableItems,
  distance,
  type EngineContext,
  findPath,
  fogOfWar,
  foundingProblem,
  type GameState,
  type PlayerId,
  settlementsOf,
  tilesWithin,
  unitIds,
} from '@cx/engine';

/**
 * Stand-in for the real AI (M11), so AI seats aren't empty: they found settlements, keep their
 * cities building, and leave every other choice to the engine's automatic defaults.
 */
export function placeholderAiActions(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): Action[] {
  const actions: Action[] = [];
  const fog = fogOfWar(ctx, state, player);
  for (const id of unitIds(state)) {
    const unit = state.units[id]!;
    if (unit.owner !== player || unit.type !== 'unit_settler' || unit.moves <= 0) continue;
    if (!foundingProblem(ctx, state, player, unit.tile)) {
      actions.push({ type: 'found_settlement', player, unit: id });
      continue;
    }
    if (unit.orders?.kind === 'move') continue;
    const site = tilesWithin(state.map, unit.tile, 8)
      .filter((t) => fog[t] !== 0 && !foundingProblem(ctx, state, player, t))
      .sort(
        (a, b) => distance(state.map, unit.tile, a) - distance(state.map, unit.tile, b) || a - b,
      )
      .find((t) => findPath(ctx, state, unit, t, 8));
    if (site !== undefined) actions.push({ type: 'move_unit', player, unit: id, to: site });
  }
  for (const s of settlementsOf(state, player)) {
    if (s.kind !== 'city' || s.queue.length > 0) continue;
    const can = new Set(availableItems(ctx, state, s).map((i) => i.id));
    const wanted = ['unit_warrior', 'building_monument', 'unit_settler', 'building_granary'];
    const queue = wanted
      .filter((id) => can.has(id))
      .map((id) => ({
        kind: id.startsWith('unit_') ? ('unit' as const) : ('building' as const),
        id,
      }));
    if (queue.length > 0) actions.push({ type: 'set_queue', player, settlement: s.id, queue });
  }
  return actions;
}
