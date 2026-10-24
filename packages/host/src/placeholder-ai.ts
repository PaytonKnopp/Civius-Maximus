import {
  type Action,
  atWar,
  attackTargets,
  availablePromotions,
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
  previewAttack,
  SLOT_KINDS,
  settlementsOf,
  strikeTargets,
  trackOf,
  tilesWithin,
  unitClassOf,
  unitDef,
  unitIds,
  visibleTiles,
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
  // Peace offers: taken (they can only be made once a war has run its minimum length).
  for (const offer of state.peaceOffers) {
    const [from, to] = offer.split('>');
    if (to === player) actions.push({ type: 'accept_peace', player, from: from! });
  }
  // Fight whoever is at war with us, raiders included; spend XP on promotions.
  actions.push(...fight(ctx, state, player));
  for (const id of unitIds(state)) {
    const u = state.units[id]!;
    const pick = u.owner === player ? availablePromotions(ctx, u)[0] : undefined;
    if (pick) actions.push({ type: 'promote_unit', player, unit: id, promotion: pick });
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

/** At war: attack where the odds are good, strike from settlements, train defenders. */
function fight(ctx: EngineContext, state: GameState, player: PlayerId): Action[] {
  const out: Action[] = [];
  const seen = visibleTiles(ctx, state, player);
  for (const id of unitIds(state)) {
    const u = state.units[id]!;
    if (u.owner !== player || u.moves <= 0) continue;
    let best: { tile: number; score: number } | undefined;
    for (const tile of attackTargets(ctx, state, u, seen)) {
      const p = previewAttack(ctx, state, u, tile)!;
      // Sums of the low and high rolls (twice the average), to stay in whole numbers.
      const dealt = p.toDefender[0] + p.toDefender[1];
      const taken = p.toAttacker[0] + p.toAttacker[1];
      if (taken >= u.health * 2) continue;
      const left =
        p.target.kind === 'unit'
          ? p.target.unit.health
          : p.target.kind === 'settlement'
            ? p.target.settlement.health
            : 0;
      const score =
        p.mode === 'capture'
          ? 1000
          : p.toDefender[0] >= left && (p.target.kind === 'unit' || p.captures)
            ? 500
            : dealt - taken;
      if (score > 0 && (!best || score > best.score)) best = { tile, score };
    }
    if (best) out.push({ type: 'attack', player, unit: id, tile: best.tile });
  }
  for (const s of settlementsOf(state, player)) {
    const target = strikeTargets(ctx, state, s)
      .map((tile) => ({ tile, health: unitsHealthOn(state, tile) }))
      .sort((a, b) => a.health - b.health || a.tile - b.tile)[0];
    if (target) out.push({ type: 'strike', player, settlement: s.id, tile: target.tile });
    // A threatened city trains its best soldier first.
    if (s.kind !== 'city') continue;
    const head = s.queue[0];
    if (head?.kind === 'unit' && unitClassOf(ctx, { type: head.id }).combat) continue;
    const threat = tilesWithin(state.map, s.tile, 4).some((t) =>
      Object.values(state.units).some(
        (e) =>
          e.tile === t &&
          e.owner !== player &&
          atWar(state, e.owner, player) &&
          unitClassOf(ctx, e).combat,
      ),
    );
    if (!threat) continue;
    const soldier = availableItems(ctx, state, s)
      .filter(
        (i) =>
          i.kind === 'unit' &&
          ctx.content.entities.unitClass[unitDef(ctx, { type: i.id }).class]!.captures,
      )
      .sort(
        (a, b) => unitDef(ctx, { type: b.id }).strength - unitDef(ctx, { type: a.id }).strength,
      )[0];
    if (soldier) {
      out.push({
        type: 'set_queue',
        player,
        settlement: s.id,
        queue: [soldier, ...s.queue].slice(0, 8),
      });
    }
  }
  return out;
}

function unitsHealthOn(state: GameState, tile: number): number {
  return Object.values(state.units)
    .filter((u) => u.tile === tile)
    .reduce((a, u) => a + u.health, 0);
}
