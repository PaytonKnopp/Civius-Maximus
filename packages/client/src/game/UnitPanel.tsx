import { resolveText } from '@cx/content';
import {
  type Action,
  availablePromotions,
  type EngineContext,
  foundingProblem,
  type GameState,
  MP,
  nextPromotionXp,
  type PlayerId,
  promotionsOf,
  type UnitState,
  unitClassOf,
  unitDef,
} from '@cx/engine';
import { useState } from 'react';
import { type Colors, cssColor } from './model';

const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  unit: UnitState;
  colors: Colors;
  /** A move is planned to a tile (first tap); whether it can be reached. */
  planned: { reachable: boolean } | null;
  /** Tiles this unit can attack now. */
  targets: number;
  act: (action: Action) => boolean;
  onSkip: () => void;
}

export function UnitPanel({
  ctx,
  state,
  viewer,
  unit,
  colors,
  planned,
  targets,
  act,
  onSkip,
}: Props) {
  const [confirmDisband, setConfirmDisband] = useState(false);
  const def = unitDef(ctx, unit);
  const { fortify, maxHealth } = ctx.content.rules.combat;
  const promotable = availablePromotions(ctx, unit);
  const cls = unitClassOf(ctx, unit);
  const mine = unit.owner === viewer;
  const status =
    unit.orders?.kind === 'move'
      ? 'Moving'
      : unit.orders?.kind === 'sleep'
        ? 'Asleep'
        : unit.orders?.kind === 'fortify'
          ? unit.orders.turns > 0
            ? `Fortified (+${fortify[Math.min(unit.orders.turns, fortify.length) - 1]})`
            : 'Fortifying'
          : unit.moves === 0
            ? 'Out of moves'
            : 'Ready';
  const found: Action = { type: 'found_settlement', player: viewer, unit: unit.id };
  const foundBlocked =
    unit.moves <= 0
      ? 'No moves left this turn'
      : foundingProblem(ctx, state, viewer, unit.tile)?.message;
  const ref = { player: viewer, unit: unit.id };

  return (
    <aside className="unit-panel" aria-label={`${resolveText(ctx.content, def.name)} unit`}>
      <div className="unit-head">
        <span
          className="unit-icon"
          style={{ background: cssColor(colors.main), color: cssColor(colors.accent) }}
        >
          {def.icon}
        </span>
        <div>
          <h3>{resolveText(ctx.content, def.name)}</h3>
          <p className="unit-sub">
            {resolveText(ctx.content, cls.name)} · {status}
          </p>
        </div>
        {mine &&
          (confirmDisband ? (
            <button
              type="button"
              className="disband danger"
              onClick={() => {
                act({ type: 'disband_unit', ...ref });
                setConfirmDisband(false);
              }}
            >
              Confirm disband
            </button>
          ) : (
            <button
              type="button"
              className="disband"
              title="Disband this unit"
              onClick={() => setConfirmDisband(true)}
            >
              Disband
            </button>
          ))}
      </div>
      <dl className="unit-stats">
        <div>
          <dt>Moves</dt>
          <dd>
            {unit.moves / MP}/{def.movement}
          </dd>
        </div>
        <div>
          <dt>Strength</dt>
          <dd>{def.strength || '—'}</dd>
        </div>
        {def.rangedStrength > 0 && (
          <div>
            <dt>Ranged</dt>
            <dd title={`Range ${def.range}`}>
              {def.rangedStrength} · {def.range}
            </dd>
          </div>
        )}
        <div>
          <dt>Sight</dt>
          <dd>{def.sight}</dd>
        </div>
        <div>
          <dt>Health</dt>
          <dd className={unit.health < maxHealth ? 'hurt' : ''}>
            {unit.health}/{maxHealth}
          </dd>
        </div>
        {cls.combat && (
          <div>
            <dt>XP</dt>
            <dd title="Experience toward the next promotion">
              {unit.xp}/{nextPromotionXp(ctx, unit)}
            </dd>
          </div>
        )}
      </dl>
      {unit.promotions.length > 0 && (
        <ul className="promotions" aria-label="Promotions">
          {promotionsOf(ctx, unit).map((p) => (
            <li key={p.id} title={resolveText(ctx.content, p.description)}>
              ★ {resolveText(ctx.content, p.name)}
            </li>
          ))}
        </ul>
      )}
      {mine && promotable.length > 0 && (
        <section className="promote" aria-label="Promote">
          <h4>★ Promotion ready</h4>
          <p className="hint">Promoting heals the unit fully and ends its turn.</p>
          <ul className="choices">
            {promotable.map((id) => {
              const p = ctx.content.entities.promotion[id]!;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() =>
                      act({ type: 'promote_unit', player: viewer, unit: unit.id, promotion: id })
                    }
                  >
                    <span>{resolveText(ctx.content, p.name)}</span>
                    <span className="muted small-text">
                      {resolveText(ctx.content, p.description)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {mine && (
        <div className="unit-actions">
          {def.actions.includes('found_settlement') && (
            <button
              type="button"
              className="found"
              disabled={foundBlocked !== undefined}
              title={foundBlocked ?? 'Found a settlement here'}
              onClick={() => act(found)}
            >
              Found settlement <kbd>B</kbd>
            </button>
          )}
          <button type="button" onClick={onSkip}>
            Skip <kbd>Space</kbd>
          </button>
          {unit.orders ? (
            <button type="button" onClick={() => act({ type: 'wake_unit', ...ref })}>
              {unit.orders.kind === 'move' ? 'Cancel move' : 'Wake'}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => act({ type: 'sleep_unit', ...ref })}>
                Sleep <kbd>Z</kbd>
              </button>
              {cls.combat && (
                <button type="button" onClick={() => act({ type: 'fortify_unit', ...ref })}>
                  Fortify <kbd>F</kbd>
                </button>
              )}
            </>
          )}
        </div>
      )}
      {mine && (
        <p className="hint">
          {targets > 0 && !planned
            ? `${targets} target${targets === 1 ? '' : 's'} in reach: click a red tile to attack.`
            : planned
              ? planned.reachable
                ? 'Tap the marked tile again to move there.'
                : "Can't get there."
              : foundBlocked && def.actions.includes('found_settlement') && unit.moves > 0
                ? foundBlocked
                : coarsePointer
                  ? 'Tap a tile to plan a move, then tap it again to go.'
                  : 'Right-click a tile to move there, or click it twice.'}
        </p>
      )}
    </aside>
  );
}
