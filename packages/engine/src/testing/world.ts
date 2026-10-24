import type { CompiledContent } from '@cx/content';
import { compileFromDirs } from '@cx/content/node';
import { emptyBits, encodeBits, setBit } from '../bitset';
import type { EngineContext } from '../context';
import { applyAction } from '../game';
import { tileIndex } from '../map/hex';
import type { MapTile } from '../map/types';
import { createRng } from '../rng';
import type { GameState, UnitState } from '../state';
import { newProgress } from '../progress/sources';
import { emptyDiplomacy } from '../diplomacy/rules';
import { MP } from '../units/movement';

/** Test helpers: hand-drawn maps and shortcuts for driving the engine (tests only). */

/** The base content with every civ's and leader's ability effects. */
export const kitCtx: EngineContext = { content: compileFromDirs().content! };

/**
 * The base content without civ and leader ability effects, so rule tests aren't skewed by
 * whichever civs the test players have (kit tests use `kitCtx`).
 */
export const ctx: EngineContext = { content: withoutAbilities(compileFromDirs().content!) };

function withoutAbilities(content: CompiledContent): CompiledContent {
  for (const civ of Object.values(content.entities.civ)) if (civ.ability) civ.ability.effects = [];
  for (const leader of Object.values(content.entities.leader)) leader.ability.effects = [];
  return content;
}

/**
 * A hand-drawn map, one character per tile (odd rows are shifted half a tile right):
 * `.` grassland, `p` plains, `h` grassland hills, `w` woods, `H` wooded hills, `m` mountain,
 * `~` coast, `o` ocean, `d` desert.
 */
export function testState(rows: string[], opts: { explored?: boolean } = {}): GameState {
  const width = rows[0]!.length;
  const tiles: MapTile[] = rows
    .join('')
    .split('')
    .map((ch) => {
      const t: MapTile = {
        terrain: 'grassland',
        feature: null,
        elevation: 'flat',
        resource: null,
        river: 0,
        owner: null,
        settlement: null,
        improvement: null,
        district: null,
        wonder: null,
      };
      if (ch === 'p') t.terrain = 'plains';
      if (ch === 'd') t.terrain = 'desert';
      if (ch === 'h' || ch === 'H') t.elevation = 'hills';
      if (ch === 'w' || ch === 'H') t.feature = 'woods';
      if (ch === 'm') t.elevation = 'mountain';
      if (ch === '~') t.terrain = 'coast';
      if (ch === 'o') t.terrain = 'ocean';
      return t;
    });
  const all = emptyBits(tiles.length);
  if (opts.explored !== false) for (let i = 0; i < tiles.length; i++) setBit(all, i);
  const player = (id: string) => ({
    id,
    name: id,
    kind: 'human' as const,
    team: null,
    alive: true,
    turnEnded: false,
    startTile: 0,
    explored: encodeBits(all),
    canEmbark: false,
    civ: id === 'p1' ? 'civ_rome' : 'civ_egypt',
    leader: id === 'p1' ? 'leader_caesar' : 'leader_cleopatra',
    gold: 0,
    influence: 0,
    faith: 0,
    capital: null,
    settlementsFounded: 0,
    kills: 0,
    declaredWarTurn: null,
    ...newProgress(ctx),
  });
  return {
    stateVersion: 1,
    gameId: 'test',
    contentHash: ctx.content.hash,
    settings: {
      seed: 's',
      turnLimit: null,
      map: {
        script: 'continents',
        size: 'duel',
        wrapX: false,
        resources: 'standard',
        startBalance: 'normal',
      },
    },
    status: 'playing',
    result: null,
    turn: 1,
    rng: createRng('s'),
    players: { p1: player('p1'), p2: player('p2') },
    playerOrder: ['p1', 'p2'],
    nextEntityId: 1,
    map: { width, height: rows.length, wrapX: false, tiles },
    units: {},
    wars: [],
    warStarted: {},
    peaceOffers: [],
    warSupport: {},
    camps: {},
    settlements: {},
    diplomacy: emptyDiplomacy(),
    roads: encodeBits(emptyBits(tiles.length)),
    routes: [],
  };
}

export const at = (s: GameState, col: number, row: number) => tileIndex(s.map, col, row);

export function addUnit(
  s: GameState,
  owner: string,
  type: string,
  tile: number,
  moves?: number,
): UnitState {
  const id = `u${s.nextEntityId++}`;
  const def = ctx.content.entities.unit[type]!;
  const unit: UnitState = {
    id,
    owner,
    type,
    tile,
    moves: moves ?? def.movement * MP,
    health: 100,
    xp: 0,
    orders: null,
    skippedTurn: null,
    promotions: [],
  };
  s.units = { ...s.units, [id]: unit };
  return unit;
}

export function act(s: GameState, action: Parameters<typeof applyAction>[1], c = ctx) {
  const r = applyAction(s, action, c);
  if (!r.ok) throw new Error(`${action.type}: ${r.error.message}`);
  return r;
}

export const endTurn = (s: GameState, c = ctx) =>
  s.playerOrder.reduce((st, p) => act(st, { type: 'end_turn', player: p }, c).state, s);
