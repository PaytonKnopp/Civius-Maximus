import {
  atWar,
  distance,
  type EngineContext,
  type GameState,
  goldPerTurn,
  happinessOf,
  loyaltyOf,
  loyaltyOn,
  militaryStrength,
  opinionOf,
  type PlayerId,
  routesOf,
  settlementLimit,
  settlementYields,
  tradeCapacity,
  unitClassOf,
} from '@cx/engine';

/**
 * Advisors (docs/06-ui-ux.md): a few short tips each turn about what's going on in your empire,
 * like the advisors of the Civ games. Each looks at the state only (no memory), so the same turn
 * gives the same tips. Turned off with one click, and back on from the Help screen.
 */

export interface Tip {
  id: string;
  advisor: 'Military' | 'Economic' | 'Science' | 'Culture' | 'Faith' | 'Foreign';
  icon: string;
  text: string;
  /** Higher shows first. */
  urgency: number;
}

const whole = (fixed: number) => Math.floor(fixed / 100);

export function adviceFor(ctx: EngineContext, state: GameState, viewer: PlayerId): Tip[] {
  const p = state.players[viewer];
  if (!p?.alive || state.status !== 'playing') return [];
  const tips: Tip[] = [];
  const mine = Object.values(state.settlements).filter((s) => s.owner === viewer);
  const add = (t: Tip) => tips.push(t);

  // Military: enemies at the gates, or a small army next to big neighbors.
  const enemies = Object.values(state.units).filter(
    (u) => u.owner !== viewer && atWar(state, viewer, u.owner) && unitClassOf(ctx, u).combat,
  );
  for (const s of mine) {
    const near = enemies.filter((u) => distance(state.map, u.tile, s.tile) <= 3).length;
    if (near > 0) {
      add({
        id: `danger:${s.id}`,
        advisor: 'Military',
        icon: 'war',
        text: `${near} enemy unit${near === 1 ? ' is' : 's are'} near ${s.name}. Walls, a ranged unit in the city or a counterattack would help.`,
        urgency: 90 + near,
      });
      break;
    }
  }
  const mineArmy = militaryStrength(ctx, state, viewer);
  const rivals = state.playerOrder.filter((q) => q !== viewer && state.players[q]!.alive);
  const strongest = Math.max(0, ...rivals.map((q) => militaryStrength(ctx, state, q)));
  if (state.turn > 30 && strongest > mineArmy * 2 && strongest > 0)
    add({
      id: 'weak-army',
      advisor: 'Military',
      icon: 'military',
      text: 'Your army is less than half the size of the strongest rival’s. Weakness invites attack.',
      urgency: 40,
    });

  // Economy: losing gold, or sitting on a pile of it.
  const gpt = goldPerTurn(ctx, state, viewer);
  if (gpt < 0)
    add({
      id: 'losing-gold',
      advisor: 'Economic',
      icon: 'gold',
      text: `You're losing ${whole(-gpt)} gold a turn${p.gold < -gpt * 10 ? ', and the treasury won’t last long' : ''}. Disband old units, or build markets and trade routes.`,
      urgency: p.gold < -gpt * 10 ? 80 : 50,
    });
  else if (whole(p.gold) >= 300 + state.turn * 2)
    add({
      id: 'rich',
      advisor: 'Economic',
      icon: 'gold',
      text: `You have ${whole(p.gold)} gold. Buying a building, a unit or a tile now beats saving it.`,
      urgency: 25,
    });
  const free = tradeCapacity(ctx, state, viewer) - routesOf(state, viewer).length;
  const traders = Object.values(state.units).filter(
    (u) => u.owner === viewer && ctx.content.entities.unit[u.type]?.actions.includes('trade_route'),
  ).length;
  if (free - traders > 0)
    add({
      id: 'trade',
      advisor: 'Economic',
      icon: 'trade',
      text: `You could run ${free - traders} more trade route${free - traders === 1 ? '' : 's'}. Train a trader.`,
      urgency: 30,
    });

  // Settlements: unhappy, starving, or room to expand.
  for (const s of mine) {
    const h = happinessOf(ctx, state, s);
    if (h.balance < 0) {
      add({
        id: `unhappy:${s.id}`,
        advisor: 'Culture',
        icon: 'happiness',
        text: `${s.name} is unhappy (${h.balance}). Luxuries, an Entertainment Complex or fewer buildings to maintain would help.`,
        urgency: 60 - h.balance,
      });
      break;
    }
  }
  for (const s of mine) {
    if (settlementYields(ctx, state, s).surplus < 0) {
      add({
        id: `starving:${s.id}`,
        advisor: 'Economic',
        icon: 'food',
        text: `${s.name} is starving. Work more food tiles or develop a farm.`,
        urgency: 70,
      });
      break;
    }
  }
  if (state.turn < 120 && mine.length < settlementLimit(ctx, state, viewer)) {
    const settlers = Object.values(state.units).some(
      (u) =>
        u.owner === viewer &&
        ctx.content.entities.unit[u.type]?.actions.includes('found_settlement'),
    );
    if (!settlers && state.turn > 10)
      add({
        id: 'expand',
        advisor: 'Economic',
        icon: 'settler',
        text: `You have room for ${settlementLimit(ctx, state, viewer) - mine.length} more settlement${settlementLimit(ctx, state, viewer) - mine.length === 1 ? '' : 's'} before happiness suffers. A settler now pays off for the rest of the game.`,
        urgency: 35,
      });
  }

  // Loyalty.
  if (loyaltyOn(state)) {
    for (const s of mine) {
      const l = loyaltyOf(ctx, state, s);
      if (!l.steadfast && l.change < 0 && l.loyalty < 60) {
        add({
          id: `loyalty:${s.id}`,
          advisor: 'Culture',
          icon: 'capital',
          text: `${s.name} is losing loyalty (${l.loyalty}, ${l.change} a turn). Post a governor there, or grow your cities nearby.`,
          urgency: 75,
        });
        break;
      }
    }
  }

  // Foreign: someone who really dislikes you, and envoys to send.
  for (const q of rivals) {
    if (atWar(state, viewer, q)) continue;
    const o = opinionOf(ctx, state, q, viewer).total;
    if (o <= -15) {
      add({
        id: `hostile:${q}`,
        advisor: 'Foreign',
        icon: 'diplomacy',
        text: `${state.players[q]!.name} thinks very poorly of you (${o}). Watch your border with them.`,
        urgency: 45,
      });
      break;
    }
  }
  if (p.envoys > 0)
    add({
      id: 'envoys',
      advisor: 'Foreign',
      icon: 'envoy',
      text: `You have ${p.envoys} envoy${p.envoys === 1 ? '' : 's'} to send to city-states (I).`,
      urgency: 30,
    });

  return tips.sort((a, b) => b.urgency - a.urgency || (a.id < b.id ? -1 : 1));
}

const OFF = 'cx.advisors.off';
export function advisorsOn(): boolean {
  try {
    return localStorage.getItem(OFF) !== '1';
  } catch {
    return true;
  }
}
export function setAdvisors(on: boolean) {
  try {
    if (on) localStorage.removeItem(OFF);
    else localStorage.setItem(OFF, '1');
  } catch {
    // Storage blocked: the setting lasts for this visit.
  }
}
