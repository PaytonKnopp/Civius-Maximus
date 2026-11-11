import { settlementMaxHealth, wallsMax } from './combat/strength';
import { type EngineContext, FREE, HOSTILE, unitClassOf, warKey } from './context';
import { policySlots, SLOT_KINDS } from './progress/sources';
import type { GameState, PlayerId, UnitState } from './state';
import { canTraverse } from './units/movement';
import { scoreOf } from './victory';

/**
 * Everything that must be true of a game state at any moment, whatever was played to reach it
 * (docs/01-architecture.md, "Testing strategy"): every id points at something that exists,
 * units and settlements stand where the rules let them, tiles and settlements agree on who owns
 * what, and nothing that can't go below zero has. Returns one line per broken rule (none for a
 * sound state).
 *
 * It only reads the state, so checking never changes a game. `pnpm cx soak` runs it after every
 * turn of its games, and the action and save fuzzers after everything they do.
 */
export function checkInvariants(ctx: EngineContext, state: GameState): string[] {
  const { content } = ctx;
  const e = content.entities;
  const out: string[] = [];
  const bad = (line: string) => {
    if (out.length < 200) out.push(line);
  };
  const tiles = state.map.tiles;
  const isTile = (t: unknown): t is number =>
    typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < tiles.length;
  const isPlayer = (id: unknown): id is PlayerId => typeof id === 'string' && id in state.players;
  /** A real number that isn't NaN or infinite (rules math is whole numbers and hundredths). */
  const num = (v: unknown, what: string, min = -Infinity) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${what} is not a number (${v})`);
    else if (v < min) bad(`${what} is ${v}, below ${min}`);
  };
  const whole = (v: unknown, what: string, min = -Infinity) => {
    num(v, what, min);
    if (typeof v === 'number' && Number.isFinite(v) && !Number.isInteger(v))
      bad(`${what} is ${v}, not a whole number`);
  };

  // --- The game itself -----------------------------------------------------------------------
  whole(state.turn, 'turn', 1);
  if (state.status === 'ended' && !state.result) bad('the game ended without a result');
  if (state.status === 'playing' && state.result && !state.afterVictory)
    bad('the game has a result but is still being played');
  if (state.result?.winner && !isPlayer(state.result.winner))
    bad(`the winner ${state.result.winner} is not a player`);
  for (const id of state.playerOrder)
    if (!isPlayer(id)) bad(`playerOrder names ${id}, who is not a player`);
  if (new Set(state.playerOrder).size !== state.playerOrder.length)
    bad('playerOrder repeats a player');

  // --- Players -------------------------------------------------------------------------------
  for (const [id, p] of Object.entries(state.players)) {
    const who = `player ${id}`;
    if (p.id !== id) bad(`${who} is stored under another id (${p.id})`);
    const civ = p.kind === 'human' || p.kind === 'ai';
    if (civ) {
      if (!e.civ[p.civ]) bad(`${who} has no such civ ${p.civ}`);
      if (!e.leader[p.leader]) bad(`${who} has no such leader ${p.leader}`);
      if (!state.playerOrder.includes(id)) bad(`${who} is not in the turn order`);
    }
    num(p.gold, `${who} gold`, 0);
    num(p.faith, `${who} faith`, 0);
    num(p.influence, `${who} influence`, 0);
    whole(p.envoys, `${who} envoys`, 0);
    whole(p.kills, `${who} kills`, 0);
    num(p.lifetimeCulture, `${who} lifetime culture`, 0);
    num(p.scienceRate, `${who} science rate`);
    num(p.cultureRate, `${who} culture rate`);
    num(p.tourismRate, `${who} tourism rate`, 0);
    if (p.favor !== undefined) whole(p.favor, `${who} favor`, 0);
    if (p.diploPoints !== undefined) whole(p.diploPoints, `${who} diplomatic points`, 0);
    whole(p.celebration.store, `${who} celebration store`, 0);
    whole(p.celebration.count, `${who} celebrations`, 0);
    whole(p.celebration.turnsLeft, `${who} celebration turns`, 0);
    if (!isTile(p.startTile)) bad(`${who} starts on tile ${p.startTile}, which is off the map`);
    for (const [r, n] of Object.entries(p.resources ?? {})) {
      if (!e.resource[r]) bad(`${who} stockpiles ${r}, which is not a resource`);
      whole(n, `${who} stockpile of ${r}`, 0);
    }
    if (p.capital !== null) {
      const s = state.settlements[p.capital];
      if (!s) bad(`${who}'s capital ${p.capital} does not exist`);
      else if (s.owner !== id) bad(`${who}'s capital ${p.capital} belongs to ${s.owner}`);
    }
    if (p.religion !== null && !state.religions[p.religion])
      bad(`${who} founded ${p.religion}, which does not exist`);
    for (const b of p.beliefs) if (!e.belief[b]) bad(`${who} holds no such belief ${b}`);
    for (const g of p.greatPeople)
      if (!e.greatPerson[g]) bad(`${who} used no such great person ${g}`);
    for (const x of p.spaceProjects)
      if (!e.project[x]) bad(`${who} finished no such space project ${x}`);
    if (civ || p.kind === 'cityState') {
      if (p.government && !e.government[p.government])
        bad(`${who} has no such government ${p.government}`);
      for (const kind of ['tech', 'civic'] as const) {
        const track = kind === 'tech' ? p.techs : p.civics;
        const defs = kind === 'tech' ? e.tech : e.civic;
        const known = (x: string) => !!defs[x];
        for (const x of track.done) if (!known(x)) bad(`${who} finished no such ${kind} ${x}`);
        if (new Set(track.done).size !== track.done.length) bad(`${who} finished a ${kind} twice`);
        if (track.current !== null) {
          if (!known(track.current)) bad(`${who} works on no such ${kind} ${track.current}`);
          else if (track.done.includes(track.current) && !defs[track.current]!.repeatable)
            bad(`${who} works on ${track.current}, which is already done`);
        }
        for (const x of track.queue) if (!known(x)) bad(`${who} queued no such ${kind} ${x}`);
        for (const [x, v] of Object.entries(track.progress)) {
          if (!known(x)) bad(`${who} has progress on no such ${kind} ${x}`);
          num(v, `${who} progress on ${x}`, 0);
        }
        for (const x of track.boosted) if (!known(x)) bad(`${who} boosted no such ${kind} ${x}`);
        num(track.stored, `${who} stored ${kind} progress`, 0);
      }
    }
    if (civ && p.alive) {
      const slots = policySlots(ctx, state, id);
      const seen = new Set<string>();
      for (const kind of SLOT_KINDS) {
        const cards = p.policies[kind] ?? [];
        for (const c of cards) {
          if (!e.policy[c]) bad(`${who} slots no such policy ${c}`);
          if (seen.has(c)) bad(`${who} slots the policy ${c} twice`);
          seen.add(c);
        }
        if (cards.length > slots[kind])
          bad(`${who} has ${cards.length} ${kind} policies in ${slots[kind]} slots`);
      }
    }
    for (const [g, gs] of Object.entries(p.governors ?? {})) {
      if (!e.governor[g]) bad(`${who} appointed no such governor ${g}`);
      if (gs.settlement !== null) {
        const s = state.settlements[gs.settlement];
        if (!s) bad(`${who}'s governor ${g} serves ${gs.settlement}, which does not exist`);
        else if (s.owner !== id)
          bad(`${who}'s governor ${g} serves ${gs.settlement}, which belongs to ${s.owner}`);
      }
    }
    if (p.ages) {
      if (!e.era[p.ages.era]) bad(`${who} is in no such era ${p.ages.era}`);
      if (!e.age[p.ages.age]) bad(`${who} is in no such age ${p.ages.age}`);
      for (const d of p.ages.dedications)
        if (!e.dedication[d]) bad(`${who} chose no such dedication ${d}`);
      whole(p.ages.pending, `${who} dedications to choose`, 0);
    }
    if (civ) {
      const score = scoreOf(ctx, state, id);
      num(score.total, `${who} score`, 0);
      const sum = score.lines.reduce((a, l) => a + l.amount, 0);
      if (sum !== score.total) bad(`${who}'s score ${score.total} is not its lines' sum ${sum}`);
    }
  }

  // --- The map -------------------------------------------------------------------------------
  if (tiles.length !== state.map.width * state.map.height)
    bad(`the map has ${tiles.length} tiles for ${state.map.width} x ${state.map.height}`);
  const wonderTiles = new Map<string, number>();
  for (let t = 0; t < tiles.length; t++) {
    const tile = tiles[t]!;
    if (!e.terrain[tile.terrain]) bad(`tile ${t} has no such terrain ${tile.terrain}`);
    if (tile.feature !== null && !e.feature[tile.feature])
      bad(`tile ${t} has no such feature ${tile.feature}`);
    if (tile.resource !== null && !e.resource[tile.resource])
      bad(`tile ${t} has no such resource ${tile.resource}`);
    if (tile.improvement !== null && !e.improvement[tile.improvement])
      bad(`tile ${t} has no such improvement ${tile.improvement}`);
    if (tile.district !== null && !e.district[tile.district])
      bad(`tile ${t} has no such district ${tile.district}`);
    if (tile.wonder !== null) {
      if (!e.wonder[tile.wonder]) bad(`tile ${t} has no such wonder ${tile.wonder}`);
      const first = wonderTiles.get(tile.wonder);
      if (first !== undefined) bad(`the wonder ${tile.wonder} stands on tiles ${first} and ${t}`);
      wonderTiles.set(tile.wonder, t);
    }
    if (tile.settlement !== null) {
      const s = state.settlements[tile.settlement];
      if (!s) bad(`tile ${t} belongs to ${tile.settlement}, which does not exist`);
      else if (tile.owner !== s.owner)
        bad(`tile ${t} is owned by ${tile.owner} but its settlement ${s.id} by ${s.owner}`);
    } else if (tile.owner !== null) bad(`tile ${t} is owned by ${tile.owner} with no settlement`);
  }

  // --- Settlements ---------------------------------------------------------------------------
  const centers = new Map<number, string>();
  const builtWonders = new Map<string, string>();
  for (const [id, s] of Object.entries(state.settlements)) {
    const who = `settlement ${id} (${s.name})`;
    if (s.id !== id) bad(`${who} is stored under another id`);
    if (!isPlayer(s.owner)) bad(`${who} belongs to ${s.owner}, who is not a player`);
    if (!isPlayer(s.founder)) bad(`${who} was founded by ${s.founder}, who is not a player`);
    if (s.capturedFrom !== null && !isPlayer(s.capturedFrom))
      bad(`${who} was taken from ${s.capturedFrom}, who is not a player`);
    if (!isTile(s.tile)) {
      bad(`${who} stands on tile ${s.tile}, which is off the map`);
      continue;
    }
    const other = centers.get(s.tile);
    if (other) bad(`${who} and ${other} share tile ${s.tile}`);
    centers.set(s.tile, id);
    const center = tiles[s.tile]!;
    if (center.settlement !== id) bad(`${who}'s center tile belongs to ${center.settlement}`);
    if (e.terrain[center.terrain]?.water) bad(`${who} stands on water`);
    whole(s.population, `${who} population`, s.razing ? 0 : 1);
    num(s.food, `${who} food`, 0);
    num(s.culture, `${who} culture`, 0);
    whole(s.pendingDevelop, `${who} growth choices`, 0);
    whole(s.tilesAcquired, `${who} tiles acquired`, 0);
    num(s.health, `${who} health`, 0);
    if (s.health > settlementMaxHealth(ctx, s.kind))
      bad(`${who} has ${s.health} health of ${settlementMaxHealth(ctx, s.kind)}`);
    num(s.walls, `${who} walls`, 0);
    if (s.walls > wallsMax(ctx, s)) bad(`${who} has ${s.walls} walls of ${wallsMax(ctx, s)}`);
    if (s.loyalty !== undefined) {
      num(s.loyalty, `${who} loyalty`, 0);
      if (s.loyalty > content.rules.loyalty.max) bad(`${who} has ${s.loyalty} loyalty`);
    }
    for (const b of s.buildings) if (!e.building[b]) bad(`${who} has no such building ${b}`);
    if (new Set(s.buildings).size !== s.buildings.length) bad(`${who} has a building twice`);
    for (const d of s.districts) {
      if (!e.district[d.id]) bad(`${who} has no such district ${d.id}`);
      if (!isTile(d.tile)) bad(`${who}'s ${d.id} is on tile ${d.tile}, off the map`);
      else if (tiles[d.tile]!.district !== d.id)
        bad(`${who}'s ${d.id} is on tile ${d.tile}, which holds ${tiles[d.tile]!.district}`);
      else if (tiles[d.tile]!.settlement !== id)
        bad(`${who}'s ${d.id} is on tile ${d.tile}, which belongs to ${tiles[d.tile]!.settlement}`);
    }
    for (const w of s.wonders) {
      if (!e.wonder[w]) bad(`${who} has no such wonder ${w}`);
      const first = builtWonders.get(w);
      if (first) bad(`the wonder ${w} is in both ${first} and ${id}`);
      builtWonders.set(w, id);
    }
    for (const q of s.queue) {
      const defs = e[q.kind] as Record<string, unknown> | undefined;
      if (!defs?.[q.id]) bad(`${who} queues no such ${q.kind} ${q.id}`);
      if (q.tile !== undefined && !isTile(q.tile))
        bad(`${who} queues ${q.id} on a tile off the map`);
    }
    for (const [key, v] of Object.entries(s.progress)) num(v, `${who} progress on ${key}`, 0);
    if (new Set(s.worked).size !== s.worked.length) bad(`${who} works a tile twice`);
    for (const t of s.worked) {
      if (!isTile(t)) bad(`${who} works tile ${t}, which is off the map`);
      else if (tiles[t]!.settlement !== id)
        bad(`${who} works tile ${t}, which belongs to ${tiles[t]!.settlement}`);
    }
    const specialists = Object.values(s.specialists).reduce((a, n) => a + n, 0);
    if (s.worked.length + specialists > s.population)
      bad(
        `${who} has ${s.worked.length} worked tiles and ${specialists} specialists for ${s.population} citizens`,
      );
    for (const [d, n] of Object.entries(s.specialists)) {
      whole(n, `${who} specialists in ${d}`, 0);
      if (n > 0 && !s.districts.some((x) => x.id === d))
        bad(`${who} has specialists in ${d}, which it has not built`);
    }
    if (s.specialization !== null && !e.specialization[s.specialization])
      bad(`${who} has no such specialization ${s.specialization}`);
    if (s.religion !== null && !state.religions[s.religion])
      bad(`${who} follows ${s.religion}, which does not exist`);
    for (const [r, v] of Object.entries(s.pressure)) {
      if (!state.religions[r]) bad(`${who} feels pressure from ${r}, which does not exist`);
      num(v, `${who} pressure from ${r}`, 0);
    }
    if (s.capital && isPlayer(s.owner) && state.players[s.owner]!.capital !== id)
      bad(
        `${who} is marked a capital, but its owner's capital is ${state.players[s.owner]!.capital}`,
      );
  }

  // --- Units ---------------------------------------------------------------------------------
  const maxHealth = content.rules.combat.maxHealth;
  const byTile = new Map<number, UnitState[]>();
  const checkUnit = (u: UnitState, where: string, onMap: boolean) => {
    const who = `unit ${u.id} (${u.type}, ${u.owner})${where}`;
    if (!e.unit[u.type]) {
      bad(`${who} is no such unit`);
      return;
    }
    if (!isPlayer(u.owner)) bad(`${who} belongs to no player`);
    num(u.health, `${who} health`, 1);
    if (u.health > maxHealth) bad(`${who} has ${u.health} health of ${maxHealth}`);
    num(u.moves, `${who} moves`, 0);
    num(u.xp, `${who} experience`, 0);
    for (const x of u.promotions) if (!e.promotion[x]) bad(`${who} has no such promotion ${x}`);
    if (new Set(u.promotions).size !== u.promotions.length) bad(`${who} has a promotion twice`);
    if (u.person !== undefined && !e.greatPerson[u.person])
      bad(`${who} is no such great person ${u.person}`);
    if (u.religion !== undefined && !state.religions[u.religion])
      bad(`${who} preaches ${u.religion}, which does not exist`);
    if (u.charges !== undefined) whole(u.charges, `${who} charges`, 0);
    if (u.orders?.kind === 'move' && !isTile(u.orders.target))
      bad(`${who} is ordered to tile ${u.orders.target}, which is off the map`);
    if (u.levied && !isPlayer(u.levied.from)) bad(`${who} was levied from no player`);
    if (!onMap) return;
    if (!isTile(u.tile)) {
      bad(`${who} stands on tile ${u.tile}, which is off the map`);
      return;
    }
    if (isPlayer(u.owner) && !canTraverse(ctx, state, u, u.tile))
      bad(`${who} stands on tile ${u.tile} (${tiles[u.tile]!.terrain}), where it cannot be`);
    const list = byTile.get(u.tile) ?? [];
    list.push(u);
    byTile.set(u.tile, list);
    for (const c of u.cargo ?? []) checkUnit(c, ` inside ${u.id}`, false);
  };
  for (const [id, u] of Object.entries(state.units)) {
    if (u.id !== id) bad(`unit ${id} is stored under another id (${u.id})`);
    checkUnit(u, '', true);
  }
  const stacking = content.rules.units.stacking;
  for (const [t, list] of byTile) {
    const owners = new Set(list.map((u) => u.owner));
    if (owners.size > 1)
      bad(
        `tile ${t} holds units of ${[...owners].join(' and ')} (${list.map((u) => u.id).join(', ')})`,
      );
    const layers: Record<string, number> = {};
    for (const u of list) {
      const layer = unitClassOf(ctx, u).layer;
      layers[layer] = (layers[layer] ?? 0) + 1;
    }
    for (const [layer, n] of Object.entries(layers))
      if (n > (stacking[layer as keyof typeof stacking] ?? 1))
        bad(`tile ${t} holds ${n} ${layer} units (${list.map((u) => u.id).join(', ')})`);
  }

  // --- Wars, deals and the rest --------------------------------------------------------------
  const pair = (key: string, what: string) => {
    const [a, b] = key.split('|');
    if (!isPlayer(a) || !isPlayer(b)) bad(`${what} ${key} names someone who is not a player`);
    else if (warKey(a, b) !== key) bad(`${what} ${key} is not in its sorted form`);
  };
  for (const w of state.wars) {
    pair(w, 'war');
    if (state.warStarted[w] === undefined) bad(`war ${w} has no starting turn`);
  }
  if (new Set(state.wars).size !== state.wars.length) bad('a war is listed twice');
  for (const offer of state.peaceOffers) {
    const [from, to] = offer.split('>');
    if (!isPlayer(from) || !isPlayer(to)) bad(`peace offer ${offer} names no player`);
  }
  const d = state.diplomacy;
  for (const key of Object.keys(d.friends)) pair(key, 'friendship');
  for (const key of Object.keys(d.alliances)) pair(key, 'alliance');
  for (const key of Object.keys(d.openBorders ?? {})) pair(key, 'open borders');
  for (const key of Object.keys(d.research ?? {})) pair(key, 'research agreement');
  for (const x of d.proposals) {
    if (!isPlayer(x.from) || !isPlayer(x.to)) bad(`deal ${x.id} names someone who is not a player`);
    for (const t of [x.give, x.get]) {
      whole(t.gold, `deal ${x.id} gold`, 0);
      whole(t.goldPerTurn, `deal ${x.id} gold a turn`, 0);
      for (const [r, n] of Object.entries(t.resources ?? {})) {
        if (!e.resource[r]) bad(`deal ${x.id} trades ${r}, which is not a resource`);
        whole(n, `deal ${x.id} ${r}`, 1);
      }
    }
  }
  for (const x of d.payments) {
    if (!isPlayer(x.from) || !isPlayer(x.to)) bad('a payment names someone who is not a player');
    whole(x.gold, 'a payment', 1);
  }
  for (const x of d.trades ?? []) {
    if (!isPlayer(x.from) || !isPlayer(x.to)) bad('a resource trade names no player');
    if (!e.resource[x.resource]) bad(`a trade sends ${x.resource}, which is not a resource`);
    whole(x.amount, 'a resource trade', 1);
  }
  for (const r of state.routes) {
    if (!isPlayer(r.owner)) bad(`trade route ${r.id} belongs to no player`);
    if (!state.settlements[r.from]) bad(`trade route ${r.id} starts at ${r.from}, which is gone`);
    if (!state.settlements[r.to]) bad(`trade route ${r.id} ends at ${r.to}, which is gone`);
    if (!e.unit[r.unit]) bad(`trade route ${r.id} is run by no such unit ${r.unit}`);
    for (const t of r.path) if (!isTile(t)) bad(`trade route ${r.id} runs off the map`);
  }
  for (const [id, r] of Object.entries(state.religions)) {
    if (r.id !== id) bad(`religion ${id} is stored under another id`);
    if (!isPlayer(r.founder)) bad(`religion ${id} was founded by no player`);
    for (const b of r.beliefs) if (!e.belief[b]) bad(`religion ${id} holds no such belief ${b}`);
  }
  for (const [id, cs] of Object.entries(state.cityStates)) {
    const p = state.players[id];
    if (!p) bad(`city-state ${id} is not a player`);
    else if (p.kind !== 'cityState') bad(`city-state ${id} is a ${p.kind} player`);
    if (!e.cityState[cs.def]) bad(`city-state ${id} is no such city-state ${cs.def}`);
    for (const [who, n] of Object.entries(cs.envoys)) {
      if (!isPlayer(who)) bad(`city-state ${id} has envoys from ${who}, who is not a player`);
      whole(n, `city-state ${id} envoys from ${who}`, 0);
    }
    if (cs.suzerain !== null) {
      if (!isPlayer(cs.suzerain)) bad(`city-state ${id} is led by no player`);
      else {
        const mine = cs.envoys[cs.suzerain] ?? 0;
        if (mine < content.rules.cityStates.suzerainEnvoys)
          bad(`city-state ${id}'s suzerain ${cs.suzerain} has only ${mine} envoys`);
        for (const [who, n] of Object.entries(cs.envoys))
          if (who !== cs.suzerain && n > mine)
            bad(
              `city-state ${id} is led by ${cs.suzerain} (${mine}) though ${who} has ${n} envoys`,
            );
      }
    }
  }
  for (const [id, c] of Object.entries(state.camps)) {
    if (!isTile(c.tile)) bad(`camp ${id} is off the map`);
    for (const u of c.units) {
      const unit = state.units[u];
      if (!unit) bad(`camp ${id} counts raider ${u}, which is gone`);
      else if (unit.owner !== HOSTILE)
        bad(`camp ${id} counts ${u}, which belongs to ${unit.owner}`);
    }
  }
  for (const [g, who] of Object.entries(state.greatPeople.claimed)) {
    if (!e.greatPerson[g]) bad(`no such great person ${g} was claimed`);
    if (!isPlayer(who)) bad(`great person ${g} was claimed by no player`);
  }
  for (const [who, classes] of Object.entries(state.greatPeople.points)) {
    if (!isPlayer(who)) bad(`great person points are kept for ${who}, who is not a player`);
    for (const [c, v] of Object.entries(classes)) {
      if (!e.greatPersonClass[c]) bad(`great person points are kept for no such class ${c}`);
      num(v, `${who}'s ${c} points`, 0);
    }
  }
  for (const [id, w] of Object.entries(state.greatWorks ?? {})) {
    const s = state.settlements[w.settlement];
    if (!s) bad(`great work ${id} hangs in ${w.settlement}, which is gone`);
    else if (!s.buildings.includes(w.holder) && !s.wonders.includes(w.holder))
      bad(`great work ${id} hangs in ${w.holder}, which ${s.id} does not have`);
    if (!isPlayer(w.by)) bad(`great work ${id} was made for no player`);
  }
  for (const [id, spy] of Object.entries(state.espionage?.spies ?? {})) {
    if (!isPlayer(spy.owner)) bad(`spy ${id} belongs to no player`);
    if (spy.at !== null && !state.settlements[spy.at])
      bad(`spy ${id} is in ${spy.at}, which is gone`);
    if (spy.mission && !e.spyMission[spy.mission.id])
      bad(`spy ${id} is on no such mission ${spy.mission.id}`);
  }
  if (state.congress) {
    for (const r of state.congress.session?.agenda ?? [])
      if (!e.resolution[r]) bad(`the Congress votes on no such resolution ${r}`);
    for (const who of Object.keys(state.congress.votes))
      if (!isPlayer(who)) bad(`the Congress has a ballot from ${who}, who is not a player`);
    for (const x of state.congress.passed) {
      if (!e.resolution[x.resolution]) bad(`no such resolution ${x.resolution} is in force`);
      if (x.target !== null && !isPlayer(x.target))
        bad(`resolution ${x.resolution} targets no player`);
    }
  }
  for (const [from, towards] of Object.entries(state.tourism)) {
    if (!isPlayer(from)) bad(`tourism is kept for ${from}, who is not a player`);
    for (const [to, v] of Object.entries(towards)) {
      if (!isPlayer(to)) bad(`tourism is kept toward ${to}, who is not a player`);
      num(v, `tourism from ${from} toward ${to}`, 0);
    }
  }
  let last = 0;
  for (const h of state.history) {
    if (h.turn <= last) bad(`history goes from turn ${last} to turn ${h.turn}`);
    last = h.turn;
  }
  // Free cities and raiders are players too, and never in the turn order.
  for (const special of [HOSTILE, FREE])
    if (state.playerOrder.includes(special)) bad(`${special} is in the turn order`);
  return out;
}
