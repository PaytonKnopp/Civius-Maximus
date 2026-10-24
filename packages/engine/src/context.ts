import type { CompiledContent, UnitClassDef, UnitDef } from '@cx/content';
import type { Draft } from 'immer';
import type { GameEvent } from './events';
import type { GameState, UnitState } from './state';

/** The fixed inputs to every rules call: compiled content and (later) enabled modules. */
export interface EngineContext {
  content: CompiledContent;
}

export type RuleError = { code: string; message: string };
export type Emit = (event: GameEvent) => void;

export interface ActionHandler<A> {
  /** Returns why the action isn't allowed, or undefined if it is. Must not modify anything. */
  validate(state: GameState, action: A, ctx: EngineContext): RuleError | undefined;
  apply(draft: Draft<GameState>, action: A, ctx: EngineContext, emit: Emit): void;
}

export function unitDef(ctx: EngineContext, unit: Pick<UnitState, 'type'>): UnitDef {
  const def = ctx.content.entities.unit[unit.type];
  if (!def) throw new Error(`Unknown unit type "${unit.type}"`);
  return def;
}

export function unitClassOf(ctx: EngineContext, unit: Pick<UnitState, 'type'>): UnitClassDef {
  const def = unitDef(ctx, unit);
  return ctx.content.entities.unitClass[def.class]!;
}

/** Unit ids in creation order (`u2` before `u10`), for deterministic iteration. */
export function unitIds(state: Pick<GameState, 'units'>): string[] {
  return Object.keys(state.units).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export function warKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The owner of hostile camps' raiders: at war with everyone, never in the turn order. */
export const HOSTILE = 'hostile';

export function atWar(state: Pick<GameState, 'wars'>, a: string, b: string): boolean {
  if (a === b) return false;
  if (a === HOSTILE || b === HOSTILE) return true;
  return state.wars.includes(warKey(a, b));
}
