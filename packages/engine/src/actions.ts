import { z } from 'zod';

const PlayerRef = z.string().min(1).max(64);
const UnitRef = z.string().regex(/^u\d+$/);
const TileRef = z.int().min(0).max(1_000_000);
const SettlementRef = z.string().regex(/^s\d+$/);
const ContentRef = z.string().regex(/^[a-z][a-z0-9_]*$/);
const BuildItem = z.strictObject({
  kind: z.enum(['unit', 'building', 'district', 'wonder', 'project']),
  id: ContentRef,
  /** Districts, wonders and projects go on a tile. */
  tile: TileRef.optional(),
});
const DealRef = z.string().regex(/^d\d+$/);
/** One side of a deal. */
const Terms = z
  .strictObject({
    gold: z.int().min(0).max(1_000_000).default(0),
    goldPerTurn: z.int().min(0).max(10_000).default(0),
    maps: z.boolean().default(false),
  })
  .default({ gold: 0, goldPerTurn: 0, maps: false });
const Focus = z.enum(['balanced', 'food', 'production', 'gold', 'science', 'culture', 'faith']);

/**
 * Everything a player can ask the engine to do. Actions arrive from the network, so they are
 * parsed with this schema before the engine sees them; the engine then checks they're legal.
 */
export const Action = z.discriminatedUnion('type', [
  /** Simultaneous turns: "I'm done". The turn advances once every living player is done. */
  z.strictObject({ type: z.literal('end_turn'), player: PlayerRef }),
  /** Take back End Turn while others are still playing. */
  z.strictObject({ type: z.literal('unend_turn'), player: PlayerRef }),
  /** Move toward a tile; long journeys continue automatically on later turns. */
  z.strictObject({ type: z.literal('move_unit'), player: PlayerRef, unit: UnitRef, to: TileRef }),
  /** "Not this turn": the unit stops asking for orders until next turn. */
  z.strictObject({ type: z.literal('skip_unit'), player: PlayerRef, unit: UnitRef }),
  z.strictObject({ type: z.literal('sleep_unit'), player: PlayerRef, unit: UnitRef }),
  z.strictObject({ type: z.literal('fortify_unit'), player: PlayerRef, unit: UnitRef }),
  /** Clears sleep, fortify or a queued move. */
  z.strictObject({ type: z.literal('wake_unit'), player: PlayerRef, unit: UnitRef }),
  z.strictObject({ type: z.literal('disband_unit'), player: PlayerRef, unit: UnitRef }),
  /** A settler founds a settlement where it stands (and is used up). */
  z.strictObject({ type: z.literal('found_settlement'), player: PlayerRef, unit: UnitRef }),
  /** Replaces a city's production queue (the first item is built first). */
  z.strictObject({
    type: z.literal('set_queue'),
    player: PlayerRef,
    settlement: SettlementRef,
    queue: z.array(BuildItem).max(8),
  }),
  /** Buy a unit or building with gold (or faith, where an ability allows); it's finished at once. */
  z.strictObject({
    type: z.literal('buy_item'),
    player: PlayerRef,
    settlement: SettlementRef,
    item: BuildItem,
    currency: z.enum(['gold', 'faith']).optional(),
  }),
  /** Spend a growth choice: put an improvement on a tile (claiming it if unowned). */
  z.strictObject({
    type: z.literal('develop_tile'),
    player: PlayerRef,
    settlement: SettlementRef,
    tile: TileRef,
    improvement: ContentRef,
  }),
  z.strictObject({
    type: z.literal('set_focus'),
    player: PlayerRef,
    settlement: SettlementRef,
    focus: Focus,
  }),
  /** Pin (or unpin) a tile so a citizen always works it. */
  z.strictObject({
    type: z.literal('lock_tile'),
    player: PlayerRef,
    settlement: SettlementRef,
    tile: TileRef,
    locked: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('buy_tile'),
    player: PlayerRef,
    settlement: SettlementRef,
    tile: TileRef,
  }),
  /** Pay gold to turn a town into a city. */
  z.strictObject({ type: z.literal('upgrade_town'), player: PlayerRef, settlement: SettlementRef }),
  /** Research toward a tech (and the path of prerequisites to it). */
  z.strictObject({ type: z.literal('set_research'), player: PlayerRef, tech: ContentRef }),
  /** Work toward a civic (and the path of prerequisites to it). */
  z.strictObject({ type: z.literal('set_civic'), player: PlayerRef, civic: ContentRef }),
  z.strictObject({ type: z.literal('set_government'), player: PlayerRef, government: ContentRef }),
  /** Replace the policy cards in every slot. */
  z.strictObject({
    type: z.literal('set_policies'),
    player: PlayerRef,
    policies: z.strictObject({
      military: z.array(ContentRef).max(8),
      economic: z.array(ContentRef).max(8),
      diplomatic: z.array(ContentRef).max(8),
      wildcard: z.array(ContentRef).max(8),
    }),
  }),
  /** Pick (or change, for gold) a town's specialization; null clears it. */
  z.strictObject({
    type: z.literal('set_specialization'),
    player: PlayerRef,
    settlement: SettlementRef,
    specialization: ContentRef.nullable(),
  }),
  z.strictObject({
    type: z.literal('rename_settlement'),
    player: PlayerRef,
    settlement: SettlementRef,
    name: z.string().trim().min(1).max(40),
  }),

  // Combat and war (M9)
  /** Melee or ranged attack on a tile (moving onto lone civilians captures them). */
  z.strictObject({ type: z.literal('attack'), player: PlayerRef, unit: UnitRef, tile: TileRef }),
  /** A settlement's once-a-turn ranged strike. */
  z.strictObject({
    type: z.literal('strike'),
    player: PlayerRef,
    settlement: SettlementRef,
    tile: TileRef,
  }),
  z.strictObject({ type: z.literal('declare_war'), player: PlayerRef, target: PlayerRef }),
  z.strictObject({ type: z.literal('offer_peace'), player: PlayerRef, target: PlayerRef }),
  /** Accept a peace offer from `from`. */
  z.strictObject({ type: z.literal('accept_peace'), player: PlayerRef, from: PlayerRef }),
  /** Spend XP on a promotion (heals the unit fully and ends its turn). */
  z.strictObject({
    type: z.literal('promote_unit'),
    player: PlayerRef,
    unit: UnitRef,
    promotion: ContentRef,
  }),
  /** After taking a settlement: keep it, raze it, or give it back to its founder. */
  z.strictObject({
    type: z.literal('capture_choice'),
    player: PlayerRef,
    settlement: SettlementRef,
    choice: z.enum(['keep', 'raze', 'liberate']),
  }),

  // Diplomacy (M15)
  /** Offer a deal; it waits for the other player's answer. */
  z.strictObject({
    type: z.literal('propose_deal'),
    player: PlayerRef,
    to: PlayerRef,
    give: Terms,
    get: Terms,
    /** How long per-turn payments run. */
    turns: z.int().min(1).max(100).default(20),
    friendship: z.boolean().default(false),
    alliance: z.boolean().default(false),
    peace: z.boolean().default(false),
  }),
  /** Accept or decline a deal offered to you. */
  z.strictObject({
    type: z.literal('answer_deal'),
    player: PlayerRef,
    deal: DealRef,
    accept: z.boolean(),
  }),
  /** Take back a deal you offered. */
  z.strictObject({ type: z.literal('withdraw_deal'), player: PlayerRef, deal: DealRef }),
  /** Publicly denounce a player (costs influence; a war soon after isn't a surprise). */
  z.strictObject({ type: z.literal('denounce'), player: PlayerRef, target: PlayerRef }),
]);
export type Action = z.infer<typeof Action>;
export type ActionType = Action['type'];

/** Parses untrusted input into an action, or explains what's wrong with it. */
export function parseAction(
  input: unknown,
): { ok: true; action: Action } | { ok: false; message: string } {
  const result = Action.safeParse(input);
  if (result.success) return { ok: true, action: result.data };
  const issue = result.error.issues[0];
  return {
    ok: false,
    message: `${issue?.path.join('.') || 'action'}: ${issue?.message ?? 'invalid'}`,
  };
}
