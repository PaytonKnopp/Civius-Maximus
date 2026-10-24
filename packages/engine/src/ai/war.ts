import { peaceProblem } from '../combat/handlers';
import { warKey } from '../context';
import { denounceProblem, isSurpriseWar, opinionOf, warBlock } from '../diplomacy/rules';
import { distance } from '../map/hex';
import { warWeariness } from '../settlements/rules';
import type { PlayerId } from '../state';
import { armyPlan } from './cities';
import { jitter, type Turn } from './turn';

/**
 * War and peace: answer peace offers, offer peace when a war goes badly or drags on, and start
 * wars against weaker neighbors (how often and how readily depends on the leader's aggression).
 */
export function manageWar(t: Turn) {
  for (const offer of t.state.peaceOffers) {
    const [from, to] = offer.split('>') as [PlayerId, PlayerId];
    if (to === t.player && wantsPeace(t, from, true))
      t.act({ type: 'accept_peace', player: t.player, from });
  }
  for (const enemy of t.civWars()) {
    if (peaceProblem(t.ctx, t.state, t.player, enemy)) continue;
    if (wantsPeace(t, enemy, false))
      t.act({ type: 'offer_peace', player: t.player, target: enemy });
  }
  maybeDeclareWar(t);
}

export function wantsPeace(t: Turn, enemy: PlayerId, accepting: boolean): boolean {
  const mine = t.power(t.player);
  const theirs = t.power(enemy);
  const length = t.state.turn - (t.state.warStarted[warKey(t.player, enemy)] ?? t.state.turn);
  const losing = mine * 100 < theirs * 80;
  const winning = mine * 100 > theirs * (130 + (10 - t.me.aggression) * 4) && pressing(t, enemy);
  const tired = length > 20 + t.me.aggression * 4;
  const weary = warWeariness(t.ctx, t.state, t.player) > 0;
  if (winning && !tired) return false;
  if (accepting) return true;
  return losing || weary || tired;
}

/** Our soldiers are near one of their settlements. */
function pressing(t: Turn, enemy: PlayerId): boolean {
  const map = t.state.map;
  const theirs = t.knownSettlements().filter((s) => s.owner === enemy);
  return t.myUnits().some((u) => theirs.some((s) => distance(map, s.tile, u.tile) <= 3));
}

function maybeDeclareWar(t: Turn) {
  const me = t.me;
  if (t.civWars().length > 0 || me.aggression <= 1) return;
  if (t.state.turn < 25 + (10 - me.aggression) * 6) return;
  // Not every turn: the more aggressive (and the less diplomatic), the sooner.
  const chance = 3 + me.aggression * 3 - Math.floor(me.diplomacy / 2);
  if (jitter(t.state.gameId, t.player, t.state.turn, 'war') >= chance) return;
  const army = armyPlan(t);
  if (army.have < Math.max(4, t.mySettlements().length + 1)) return;
  const map = t.state.map;
  const mine = t.power(t.player);
  const p = t.p;
  let best: { id: PlayerId; score: number } | undefined;
  for (const rival of t.metRivals()) {
    const r = t.state.players[rival]!;
    if (p.team !== null && p.team === r.team) continue;
    if (warBlock(t.state, t.player, rival)) continue;
    // Not on players it likes.
    const opinion = opinionOf(t.ctx, t.state, t.player, rival).total;
    if (opinion >= 10) continue;
    const near = t
      .knownSettlements()
      .filter((s) => s.owner === rival)
      .map((s) => Math.min(99, ...t.mySettlements().map((m) => distance(map, m.tile, s.tile))))
      .sort((a, b) => a - b)[0];
    if (near === undefined || near > 12) continue;
    const theirs = t.power(rival);
    if (mine * 100 < theirs * (160 - me.aggression * 8)) continue;
    const score = near * 10 + Math.floor((theirs * 100) / Math.max(1, mine)) + opinion * 3;
    if (!best || score < best.score) best = { id: rival, score };
  }
  if (!best) return;
  // Diplomatic leaders denounce first, so the war isn't a surprise (they declare a few turns on).
  if (
    t.me.diplomacy >= 4 &&
    isSurpriseWar(t.ctx, t.state, t.player, best.id) &&
    !denounceProblem(t.ctx, t.state, t.player, best.id)
  ) {
    t.act({ type: 'denounce', player: t.player, target: best.id });
    return;
  }
  t.act({ type: 'declare_war', player: t.player, target: best.id });
}
