import {
  cityStateDef,
  cityStateIds,
  cityStateType,
  envoyProblem,
  envoysOf,
} from '../citystates/rules';
import { befriendProblem, levyCost, levyProblem } from '../citystates/befriend';
import { toFixed } from '../fixed';
import { distance } from '../map/hex';
import type { PlayerId } from '../state';
import type { Turn } from './turn';
import { effectValue } from './values';

/**
 * Envoys: free ones go out at once; influence buys more once there's a reserve for pacts. Each
 * goes where it unlocks the most: the next bonus tier, taking (or keeping) a suzerainty. A camp
 * being befriended comes first; at war, a suzerain with gold to spare levies its soldiers.
 */
export function manageCityStates(t: Turn) {
  const rules = t.ctx.content.rules.cityStates;
  const reserve = toFixed(rules.envoyInfluence + 20 + t.me.diplomacy * 4);
  // A new city-state of our own is worth more than another envoy: befriending comes first.
  befriend(t, true);
  if (t.p.influence >= Math.floor(reserve / 2) + toFixed(rules.befriendInfluence))
    befriend(t, false);
  for (let sent = 0; sent < 8; sent++) {
    if (t.p.envoys === 0 && t.p.influence < reserve) break;
    const target = bestTarget(t);
    if (!target || !t.act({ type: 'send_envoy', player: t.player, cityState: target })) break;
  }
  levy(t);
}

/**
 * Spend a turn befriending a camp near home: only one already under way when `started`, else
 * the nearest found camp within 10 tiles of a settlement.
 */
function befriend(t: Turn, started: boolean) {
  const homes = t.mySettlements().map((s) => s.tile);
  const near = (tile: number) => Math.min(99, ...homes.map((h) => distance(t.state.map, h, tile)));
  const camp = Object.values(t.state.camps)
    .filter(
      (c) =>
        (!started || (c.befriend?.[t.player]?.turns ?? 0) > 0) &&
        near(c.tile) <= 10 &&
        !befriendProblem(t.ctx, t.state, t.player, c.id),
    )
    .sort((a, b) => near(a.tile) - near(b.tile) || (a.id < b.id ? -1 : 1))[0];
  if (camp) t.act({ type: 'befriend_camp', player: t.player, camp: camp.id });
}

/** At war, levy a city-state's soldiers when the gold for it is well spare. */
function levy(t: Turn) {
  if (!t.state.wars.some((w) => w.split('|').includes(t.player))) return;
  for (const id of cityStateIds(t.state)) {
    if (levyProblem(t.ctx, t.state, t.player, id)) continue;
    if (t.p.gold < levyCost(t.ctx, t.state, id) * 2 + toFixed(100)) continue;
    t.act({ type: 'levy_military', player: t.player, cityState: id });
  }
}

function bestTarget(t: Turn): PlayerId | undefined {
  const rules = t.ctx.content.rules.cityStates;
  let best: { id: PlayerId; value: number } | undefined;
  for (const id of cityStateIds(t.state)) {
    if (envoyProblem(t.ctx, t.state, t.player, id)) continue;
    const cs = t.state.cityStates[id]!;
    const mine = envoysOf(t.state, id, t.player);
    const rival = Math.max(
      0,
      ...Object.entries(cs.envoys)
        .filter(([p]) => p !== t.player)
        .map(([, n]) => n),
    );
    let value = 5;
    const tier = cityStateType(t.ctx, cs).tiers.find((x) => x.envoys === mine + 1);
    for (const e of tier?.effects ?? []) value += effectValue(t, e);
    const suzerain = cityStateDef(t.ctx, cs).suzerain.effects.reduce(
      (sum, e) => sum + effectValue(t, e),
      30,
    );
    if (cs.suzerain !== t.player && mine + 1 >= rules.suzerainEnvoys && mine + 1 > rival)
      value += suzerain;
    else if (cs.suzerain === t.player && mine - rival <= 1) value += Math.floor(suzerain / 2);
    if (!best || value > best.value) best = { id, value };
  }
  return best?.id;
}
