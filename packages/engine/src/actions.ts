import { z } from 'zod';

const PlayerRef = z.string().min(1).max(64);

/**
 * Everything a player can ask the engine to do. Actions arrive from the network, so they are
 * parsed with this schema before the engine sees them; the engine then checks they're legal.
 */
export const Action = z.discriminatedUnion('type', [
  /** Simultaneous turns: "I'm done". The turn advances once every living player is done. */
  z.strictObject({ type: z.literal('end_turn'), player: PlayerRef }),
  /** Take back End Turn while others are still playing. */
  z.strictObject({ type: z.literal('unend_turn'), player: PlayerRef }),
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
