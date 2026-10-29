import { current, type Draft } from 'immer';
import type { Action } from '../actions';
import { killUnit } from '../combat/handlers';
import { settlementMaxHealth } from '../combat/strength';
import { type ActionHandler, atWar, type EngineContext, type RuleError, unitDef } from '../context';
import { disastersOn } from '../disasters/disasters';
import { distance, tilesWithin } from '../map/hex';
import { refreshCitizens } from '../settlements/handlers';
import type { GameState, PlayerId } from '../state';
import { ownedUnit } from '../units/handlers';
import { unitsOn } from '../units/movement';

/**
 * Nuclear weapons (docs/04-advanced-systems.md, "Nukes"), with the `nukes` setting. An Atomic
 * Bomb or Nuclear Missile strikes a tile in its range from where it stands: every unit in the
 * blast is lost, settlements there lose half their people and their defenses, improvements
 * are wrecked and the land yields nothing until the fallout clears. Only a civ you're at war
 * with (or no one) may be hit, and every civ remembers who used one.
 */

export const nukesOn = (state: Pick<GameState, 'settings'>) => state.settings.nukes !== false;

/** The tiles a strike on `tile` would hit with this weapon. */
export function blastTiles(ctx: EngineContext, state: GameState, unitType: string, tile: number) {
  const def = ctx.content.entities.unit[unitType];
  return def?.nuke ? tilesWithin(state.map, tile, def.nuke.radius).sort((a, b) => a - b) : [];
}

/** Why this weapon can't strike that tile now, or undefined. */
export function nukeProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  unitId: string,
  tile: number,
): RuleError | undefined {
  if (!nukesOn(state)) return { code: 'off', message: 'Nuclear weapons are off in this game' };
  const u = ownedUnit(state, player, unitId);
  if ('code' in u) return u;
  const def = unitDef(ctx, u);
  if (!def.nuke) return { code: 'not_a_nuke', message: "That isn't a nuclear weapon" };
  if (tile < 0 || tile >= state.map.tiles.length)
    return { code: 'bad_tile', message: 'No such tile' };
  if (distance(state.map, u.tile, tile) > def.nuke.range)
    return { code: 'out_of_range', message: `Out of range (${def.nuke.range} tiles)` };
  for (const t of blastTiles(ctx, state, u.type, tile)) {
    const owner = state.map.tiles[t]!.owner;
    if (owner === player)
      return { code: 'own_land', message: 'The blast would reach your own land' };
    if (owner !== null && !atWar(state, player, owner))
      return {
        code: 'not_at_war',
        message: `${state.players[owner]?.name ?? owner}'s land is in the blast and you're not at war`,
      };
  }
  return undefined;
}

type LaunchNuke = Extract<Action, { type: 'launch_nuke' }>;

export const nukeHandlers = {
  launch_nuke: {
    validate(state, action, ctx) {
      return nukeProblem(ctx, state, action.player, action.unit, action.tile);
    },
    apply(draft, action, ctx, emit) {
      const r = ctx.content.rules.nukes;
      const snap = current(draft);
      const weapon = snap.units[action.unit]!.type;
      const tiles = blastTiles(ctx, snap, weapon, action.tile);
      delete draft.units[action.unit];
      let units = 0;
      const victims = new Set<PlayerId>();
      const settlements = new Set<string>();
      for (const t of tiles) {
        for (const u of unitsOn(current(draft), t)) {
          victims.add(u.owner);
          killUnit(draft, ctx, u.id, action.player, emit);
          units++;
        }
        const tile = draft.map.tiles[t]!;
        if (tile.owner) victims.add(tile.owner);
        if (tile.improvement) tile.pillaged = draft.turn + 1 + r.falloutTurns;
        tile.fallout = draft.turn + 1 + r.falloutTurns;
        delete tile.fertile;
        if (tile.settlement) settlements.add(tile.settlement);
      }
      for (const id of [...settlements].sort()) {
        const s = draft.settlements[id];
        if (!s || !tiles.includes(s.tile)) continue;
        s.population = Math.max(
          1,
          s.population - Math.floor((s.population * r.populationLoss) / 100),
        );
        s.health = Math.min(s.health, Math.floor(settlementMaxHealth(ctx, s.kind) / 4));
        s.walls = 0;
      }
      for (const id of [...settlements].sort())
        if (draft.settlements[id]) refreshCitizens(draft, ctx, id);
      // Everyone remembers; the victims most of all.
      for (const v of [...victims].sort()) {
        if (v !== action.player && draft.playerOrder.includes(v))
          draft.diplomacy.incidents.push({
            kind: 'nuked',
            by: action.player,
            against: v,
            turn: draft.turn,
          });
      }
      if (![...victims].some((v) => draft.playerOrder.includes(v) && v !== action.player))
        draft.diplomacy.incidents.push({
          kind: 'nuked',
          by: action.player,
          against: '',
          turn: draft.turn,
        });
      if (disastersOn(draft) && r.emissions > 0) {
        const c = (draft.climate ??= { emissions: 0, phase: 0 });
        c.emissions += r.emissions;
      }
      emit({
        type: 'nuke_launched',
        player: action.player,
        weapon,
        tile: action.tile,
        tiles,
        settlements: [...settlements].sort(),
        units,
        visibleTo: 'all',
      });
    },
  } satisfies ActionHandler<LaunchNuke>,
};

/** Turn step: fallout, and damage from disasters, nukes and pillaging, that has run its time clears. */
export function falloutTurn(draft: Draft<GameState>) {
  const next = draft.turn + 1;
  for (const t of draft.map.tiles) {
    if (t.fallout !== undefined && t.fallout <= next) delete t.fallout;
    if (t.pillaged !== undefined && t.pillaged <= next) delete t.pillaged;
  }
}
