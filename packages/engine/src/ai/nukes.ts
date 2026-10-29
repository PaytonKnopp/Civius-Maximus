import { atWar, unitDef } from '../context';
import { nukeProblem, nukesOn } from '../nukes/nukes';
import type { Turn } from './turn';

/**
 * Nuclear weapons, Civ-style and sparingly: only aggressive leaders build them, only during a
 * war with another civ, and at most one or two. They strike a big enemy settlement (or a
 * capital) when one is in range and the blast falls only on enemy or unowned land.
 */

/** Whether this AI wants (another) nuclear weapon now. */
export function wantsNuke(t: Turn): boolean {
  if (!nukesOn(t.state) || t.me.aggression < 6 || t.civWars().length === 0) return false;
  const have = t.myUnits().filter((u) => unitDef(t.ctx, u).nuke).length;
  return have < (t.me.aggression >= 8 ? 2 : 1);
}

/** Launch each ready weapon at the most valuable enemy settlement it can safely reach. */
export function useNukes(t: Turn) {
  if (!nukesOn(t.state)) return;
  for (const u of t.myUnits()) {
    if (!unitDef(t.ctx, u).nuke) continue;
    let best: { tile: number; value: number } | undefined;
    for (const s of t.knownSettlements()) {
      if (!t.state.playerOrder.includes(s.owner) || !atWar(t.state, t.player, s.owner)) continue;
      if (nukeProblem(t.ctx, t.state, t.player, u.id, s.tile)) continue;
      const capital = t.state.players[s.owner]!.capital === s.id;
      const value = s.population * 10 + (capital ? 40 : 0);
      if (!best || value > best.value) best = { tile: s.tile, value };
    }
    // Not worth the world's anger for a village.
    if (best && best.value >= 60)
      t.act({ type: 'launch_nuke', player: t.player, unit: u.id, tile: best.tile });
  }
}
