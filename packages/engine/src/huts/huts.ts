import { castDraft, type Draft } from 'immer';
import { decodeBits, encodeBits, setBit } from '../bitset';
import type { EngineContext, Emit } from '../context';
import { view } from '../draft';
import { toFixed } from '../fixed';
import { distance, tilesWithin } from '../map/hex';
import type { Random } from '../map/random';
import { availableNodes } from '../progress/rules';
import { grantBoost } from '../progress/handlers';
import { nextRange } from '../rng';
import { refreshCitizens, spawnUnit } from '../settlements/handlers';
import { scaleCost } from '../speed';
import type { GameState, PlayerId } from '../state';
import { isWater, landCost, unitsOn } from '../units/movement';

/**
 * Tribal villages (docs/04-advanced-systems.md, "Tribal villages"), with the `huts` setting:
 * placed in the wilds at the start; the first civ unit to step on one takes a reward picked by
 * weight (gold, faith, a boost, people, a unit, a map of the land around).
 */

type Reward = NonNullable<EngineContext['content']['rules']['huts']>['rewards'][number];

export const hutsOn = (ctx: EngineContext, state: Pick<GameState, 'settings'>) =>
  !!ctx.content.rules.huts && state.settings.huts !== false;

/** At game creation (after the camps and city-states): the villages. */
export function placeHuts(draft: Draft<GameState>, ctx: EngineContext, random: Random) {
  const r = ctx.content.rules.huts;
  if (!r || !hutsOn(ctx, draft)) return;
  const snap = view(draft);
  const map = snap.map;
  const land = map.tiles.filter((_, i) => !isWater(ctx, snap, i)).length;
  const count = Math.floor(land / r.landTilesPerHut);
  if (count === 0) return;
  const avoid = [
    ...snap.playerOrder.map((p) => snap.players[p]!.startTile),
    ...Object.values(snap.camps).map((c) => c.tile),
    ...Object.values(snap.settlements).map((s) => s.tile),
  ];
  const sites: number[] = [];
  for (let t = 0; t < map.tiles.length; t++) {
    const tile = map.tiles[t]!;
    if (tile.owner !== null || isWater(ctx, snap, t) || landCost(ctx, snap, t) === null) continue;
    if (unitsOn(snap, t).length > 0) continue;
    if (avoid.some((a) => distance(map, a, t) < r.minDistance)) continue;
    sites.push(t);
  }
  const placed: number[] = [];
  for (const t of random.shuffle(sites)) {
    if (placed.length >= count) break;
    if (placed.some((p) => distance(map, p, t) < r.minDistance)) continue;
    placed.push(t);
  }
  for (const t of placed) draft.map.tiles[t]!.hut = true;
}

/** The settlement of this player's nearest to a tile, if any. */
function nearestOwn(state: GameState, player: PlayerId, tile: number) {
  return Object.values(state.settlements)
    .filter((s) => s.owner === player)
    .sort(
      (a, b) =>
        distance(state.map, a.tile, tile) - distance(state.map, b.tile, tile) ||
        Number(a.id.slice(1)) - Number(b.id.slice(1)),
    )[0];
}

/** Rewards that could be given to this player now. */
function openRewards(ctx: EngineContext, state: GameState, player: PlayerId): Reward[] {
  const p = state.players[player]!;
  return (ctx.content.rules.huts?.rewards ?? []).filter(
    (r) =>
      r.fromTurn <= state.turn &&
      (r.population === 0 || !!nearestOwn(state, player, 0)) &&
      (!r.boost ||
        availableNodes(ctx, p, r.boost).some(
          (id) => !(r.boost === 'tech' ? p.techs : p.civics).boosted.includes(id),
        )),
  );
}

/** A civ's unit stepped on these tiles: any villages there are taken. */
export function takeHuts(
  draft: Draft<GameState>,
  ctx: EngineContext,
  unitId: string,
  tiles: number[],
  emit: Emit,
) {
  const unit = draft.units[unitId];
  if (!unit || !draft.playerOrder.includes(unit.owner)) return;
  const owner = unit.owner;
  for (const tile of tiles) {
    if (!draft.map.tiles[tile]!.hut) continue;
    delete draft.map.tiles[tile]!.hut;
    const choices = openRewards(ctx, view(draft), owner);
    if (choices.length === 0) continue;
    const total = choices.reduce((n, r) => n + r.weight, 0);
    const [roll, rng] = nextRange(draft.rng as GameState['rng'], 1, total);
    draft.rng = castDraft(rng);
    let left = roll;
    const reward = choices.find((r) => (left -= r.weight) <= 0)!;
    const p = draft.players[owner]!;
    let detail: string | undefined;
    if (reward.gold > 0) p.gold += scaleCost(ctx, draft, toFixed(reward.gold));
    if (reward.faith > 0) p.faith += scaleCost(ctx, draft, toFixed(reward.faith));
    if (reward.boost) detail = grantBoost(draft, ctx, owner, emit, reward.boost);
    if (reward.population > 0) {
      const s = nearestOwn(view(draft), owner, tile)!;
      draft.settlements[s.id]!.population += reward.population;
      refreshCitizens(draft, ctx, s.id);
      detail = s.id;
    }
    if (reward.unit && spawnUnit(draft, ctx, owner, reward.unit, tile)) detail = reward.unit;
    if (reward.reveal > 0) {
      const bits = decodeBits(p.explored, draft.map.tiles.length);
      for (const t of tilesWithin(draft.map, tile, reward.reveal)) setBit(bits, t);
      p.explored = encodeBits(bits);
    }
    emit({
      type: 'hut_found',
      player: owner,
      unit: unitId,
      tile,
      reward: reward.id,
      ...(detail ? { detail } : {}),
      visibleTo: [owner],
    });
  }
}
