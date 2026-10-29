import { espionageOn, missionChance, missionProblem, spiesOf } from '../espionage/espionage';
import type { SettlementState } from '../state';
import type { Turn } from './turn';

/** Missions worth running against a rival, best first: harm in war, gain in peace. */
const AT_WAR = ['mission_sabotage', 'mission_arm_rebels', 'mission_steal_plans'];
const AT_PEACE = ['mission_steal_plans', 'mission_skim_treasury', 'mission_make_contacts'];

/**
 * Spies (docs/04-advanced-systems.md, "Espionage"): the first guards the capital; the others go
 * to rivals' settlements (enemies first, then capitals and big ones) and run the best mission
 * with a fair chance there, or come home if none has one.
 */
export function manageSpies(t: Turn) {
  if (!espionageOn(t.state)) return;
  const spies = spiesOf(t.state, t.player);
  if (spies.length === 0) return;
  const capital = t.p.capital ? t.state.settlements[t.p.capital] : undefined;
  let guarded = spies.some(([, s]) => capital && s.at === capital.id);
  const targeted = new Set(spies.map(([, s]) => s.at));
  const wars = new Set(t.civWars());
  for (const [id, spy] of spies) {
    if (spy.arrives > t.state.turn || spy.mission) continue;
    if (spy.at === null) {
      if (!guarded && capital) {
        guarded = t.act({ type: 'send_spy', player: t.player, spy: id, settlement: capital.id });
        continue;
      }
      const target = pickTarget(t, targeted, wars);
      if (target && t.act({ type: 'send_spy', player: t.player, spy: id, settlement: target.id }))
        targeted.add(target.id);
      continue;
    }
    const s = t.state.settlements[spy.at];
    if (!s) continue;
    if (s.owner === t.player) {
      t.act({
        type: 'start_spy_mission',
        player: t.player,
        spy: id,
        mission: 'mission_watch_gates',
      });
      continue;
    }
    const options = wars.has(s.owner) ? AT_WAR : AT_PEACE;
    const pick = options.find((m) => {
      const def = t.ctx.content.entities.spyMission[m];
      return (
        def &&
        !missionProblem(t.ctx, t.state, t.player, id, m) &&
        missionChance(t.ctx, t.state, spy, def, s) >= 40
      );
    });
    if (pick) t.act({ type: 'start_spy_mission', player: t.player, spy: id, mission: pick });
    else t.act({ type: 'recall_spy', player: t.player, spy: id });
  }
}

function pickTarget(t: Turn, targeted: Set<string | null>, wars: Set<string>) {
  const civs = new Set(t.state.playerOrder);
  return t
    .knownSettlements()
    .filter((s) => s.owner !== t.player && civs.has(s.owner) && !targeted.has(s.id))
    .sort(
      (a: SettlementState, b: SettlementState) =>
        Number(wars.has(b.owner)) - Number(wars.has(a.owner)) ||
        Number(b.capital) - Number(a.capital) ||
        b.population - a.population ||
        (a.id < b.id ? -1 : 1),
    )[0];
}
