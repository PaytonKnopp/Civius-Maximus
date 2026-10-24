import {
  type Action,
  availableItems,
  type BuildItem,
  distance,
  districtYields,
  type EngineContext,
  findPath,
  fogOfWar,
  foundingProblem,
  type GameState,
  type PlayerId,
  availableNodes,
  availablePolicies,
  nodeCost,
  placementTiles,
  policySlots,
  SLOT_KINDS,
  settlementsOf,
  trackOf,
  tilesWithin,
  unitIds,
} from '@cx/engine';

/**
 * Stand-in for the real AI (M11), so AI seats aren't empty: they found settlements, keep their
 * cities building, research, fill policy slots, and leave every other choice to the engine's
 * automatic defaults.
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
    const items = availableItems(ctx, state, s);
    const can = new Set(items.map((i) => i.id));
    const wanted = ['unit_warrior', 'building_monument', 'unit_settler', 'building_granary'];
    const queue: BuildItem[] = wanted
      .filter((id) => can.has(id))
      .map((id) => ({
        kind: id.startsWith('unit_') ? ('unit' as const) : ('building' as const),
        id,
      }));
    // Then a couple of other buildings, and the district with the best adjacency.
    queue.push(...items.filter((i) => i.kind === 'building' && !wanted.includes(i.id)).slice(0, 2));
    const district = bestDistrict(ctx, state, s.id, items);
    if (district) queue.push(district);
    if (queue.length > 0) actions.push({ type: 'set_queue', player, settlement: s.id, queue });
  }
  // Research and civics: the cheapest available node whenever nothing is chosen.
  const p = state.players[player]!;
  for (const kind of ['tech', 'civic'] as const) {
    if (trackOf(p, kind).current) continue;
    const next = availableNodes(ctx, p, kind).sort(
      (a, b) => nodeCost(ctx, kind, a) - nodeCost(ctx, kind, b) || (a < b ? -1 : 1),
    )[0];
    if (!next) continue;
    actions.push(
      kind === 'tech'
        ? { type: 'set_research', player, tech: next }
        : { type: 'set_civic', player, civic: next },
    );
  }
  // Policies: fill empty slots while changes are free, newest cards first.
  if (p.policyWindow) {
    const slots = policySlots(ctx, state, player);
    const fill: Record<(typeof SLOT_KINDS)[number], string[]> = {
      military: [],
      economic: [],
      diplomatic: [],
      wildcard: [],
    };
    for (const id of [...availablePolicies(ctx, p)].reverse()) {
      const kind = ctx.content.entities.policy[id]!.slot;
      if (fill[kind].length < slots[kind]) fill[kind].push(id);
      else if (fill.wildcard.length < slots.wildcard) fill.wildcard.push(id);
    }
    actions.push({ type: 'set_policies', player, policies: fill });
  }
  return actions;
}

/** The available district and tile with the largest total yield there (ties: content order). */
function bestDistrict(
  ctx: EngineContext,
  state: GameState,
  id: string,
  items: BuildItem[],
): BuildItem | undefined {
  const s = state.settlements[id]!;
  let best: { item: BuildItem; score: number } | undefined;
  for (const item of items) {
    if (item.kind !== 'district') continue;
    for (const tile of placementTiles(ctx, state, s, 'district', item.id)) {
      const total = districtYields(ctx, state, tile, item.id).total;
      const score = Object.values(total).reduce((a, b) => a + b, 0);
      if (!best || score > best.score) best = { item: { ...item, tile }, score };
    }
  }
  return best?.item;
}
