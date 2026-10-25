import {
  cityStateDef,
  cityStateIds,
  cityStateType,
  envoyProblem,
  envoysOf,
} from '../citystates/rules';
import { toFixed } from '../fixed';
import type { PlayerId } from '../state';
import type { Turn } from './turn';
import { effectValue } from './values';

/**
 * Envoys: free ones go out at once; influence buys more once there's a reserve for pacts. Each
 * goes where it unlocks the most: the next bonus tier, taking (or keeping) a suzerainty.
 */
export function manageCityStates(t: Turn) {
  const rules = t.ctx.content.rules.cityStates;
  const reserve = toFixed(rules.envoyInfluence + 20 + t.me.diplomacy * 4);
  for (let sent = 0; sent < 8; sent++) {
    if (t.p.envoys === 0 && t.p.influence < reserve) return;
    const target = bestTarget(t);
    if (!target || !t.act({ type: 'send_envoy', player: t.player, cityState: target })) return;
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
