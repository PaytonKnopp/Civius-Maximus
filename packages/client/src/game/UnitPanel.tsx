import { resolveText } from '@cx/content';
import {
  type Action,
  activateProblem,
  worksToMake,
  availablePromotions,
  commandOf,
  distance,
  type EngineContext,
  foundingProblem,
  type GameState,
  MP,
  nextPromotionXp,
  packableUnits,
  type PlayerId,
  religionFoundingProblem,
  routesOf,
  tradeCapacity,
  tradeDestinations,
  traderOrigin,
  promotionsOf,
  type UnitState,
  unitClassOf,
  unitDef,
  obsoletedBy,
  upgradeCost,
  upgradeProblem,
  upgradeTarget,
  validateAction,
} from '@cx/engine';
import { Icon } from '../ui/Icon';
import { ICONS } from '../ui/icons';
import { useState } from 'react';
import { civName, type Colors, cssColor, whole } from './model';

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
  /** Opens the religion screen to found a religion with this great prophet. */
  onFoundReligion: () => void;
  /** Nuclear weapons: whether it's picking a target, and toggling that. */
  nuking?: boolean;
  onNuke?: () => void;
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
  onFoundReligion,
  nuking = false,
  onNuke,
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
  const command = commandOf(ctx, unit);
  const person = unit.person ? ctx.content.entities.greatPerson[unit.person] : undefined;
  const activateBlocked = person ? activateProblem(state, unit.id, viewer, ctx) : undefined;
  const works = person ? worksToMake(person, unit) : undefined;
  const prophet = !!person && !!ctx.content.entities.greatPersonClass[person.class]?.foundsReligion;
  const religionBlocked = prophet
    ? religionFoundingProblem(ctx, state, viewer, unit.id)
    : undefined;
  const religion = unit.religion ? state.religions[unit.religion] : undefined;
  const preachIn = religion
    ? Object.values(state.settlements)
        .filter((s) => distance(state.map, unit.tile, s.tile) <= 1)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
    : [];
  const upgradeTo = mine
    ? (obsoletedBy(ctx, state, viewer, unit.type) ?? upgradeTarget(ctx, state, viewer, unit.type))
    : undefined;
  const upgradeBlocked = upgradeTo ? upgradeProblem(ctx, state, viewer, unit.id) : undefined;
  const recovering = (unit.recovering ?? 0) > state.turn;
  const room = command ? command.capacity - (unit.cargo?.length ?? 0) : 0;
  const packable = command ? packableUnits(ctx, state, unit).slice(0, Math.max(0, room)) : [];
  const pack: Action | undefined =
    packable.length > 0
      ? { type: 'pack_units', player: viewer, commander: unit.id, units: packable }
      : undefined;
  const unpackAction: Action = { type: 'unpack_units', player: viewer, commander: unit.id };
  const why = (a: Action | undefined) =>
    a
      ? validateAction(state, a, ctx)?.message
      : 'No soldiers on or next to the commander can be packed';
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
          {ICONS[def.model] ? <Icon name={def.model} variant="glyph" size={30} /> : def.icon}
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
          <dt>
            <Icon name="movement" size={16} /> Moves
          </dt>
          <dd>
            {unit.moves / MP}/{def.movement}
          </dd>
        </div>
        <div>
          <dt>
            <Icon name="strength" size={16} /> Strength
          </dt>
          <dd>{def.strength || '—'}</dd>
        </div>
        {def.rangedStrength > 0 && (
          <div>
            <dt>
              <Icon name="ranged" size={16} /> Ranged
            </dt>
            <dd title={`Range ${def.range}`}>
              {def.rangedStrength} · {def.range}
            </dd>
          </div>
        )}
        <div>
          <dt>
            <Icon name="scout" size={16} /> Sight
          </dt>
          <dd>{def.sight}</dd>
        </div>
        <div>
          <dt>
            <Icon name="health" size={16} /> Health
          </dt>
          <dd className={unit.health < maxHealth ? 'hurt' : ''}>
            {unit.health}/{maxHealth}
          </dd>
        </div>
        {cls.combat && (
          <div>
            <dt>
              <Icon name="promote" size={16} /> XP
            </dt>
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
      {command && (
        <section className="command" aria-label="Command">
          <p className="hint">
            Command radius {command.radius} · +{command.strength + command.attack} attacking, +
            {command.strength + command.defense} defending
            {command.heal > 0 ? ` · heals +${command.heal}` : ''} · carries{' '}
            {unit.cargo?.length ?? 0}/{command.capacity}
          </p>
          {recovering && (
            <p className="hint bad">Recovering from a retreat until turn {unit.recovering}.</p>
          )}
          {(unit.cargo?.length ?? 0) > 0 && (
            <p className="hint">
              Packed:{' '}
              {unit.cargo!.map((u) => resolveText(ctx.content, unitDef(ctx, u).name)).join(', ')}
            </p>
          )}
        </section>
      )}
      {def.nuke && unit.owner === viewer && onNuke && (
        <section className="great-person" aria-label="Nuclear weapon">
          <p>
            Strikes a tile up to <strong>{def.nuke.range}</strong> tiles away; the blast reaches{' '}
            {def.nuke.radius} tile{def.nuke.radius === 1 ? '' : 's'} around it. Only at war.
          </p>
          <button type="button" className={nuking ? 'ghost' : 'primary danger'} onClick={onNuke}>
            {nuking ? 'Cancel (Esc)' : 'Choose a target'}
          </button>
          {nuking && <p className="hint">Click a marked tile to aim; the blast shows as ☢.</p>}
        </section>
      )}
      {person && (
        <section className="great-person" aria-label={resolveText(ctx.content, person.name)}>
          <p>
            <strong>{resolveText(ctx.content, person.name)}</strong>:{' '}
            {resolveText(ctx.content, person.description)}
          </p>
          {mine && (
            <button
              type="button"
              className="primary"
              disabled={!!activateBlocked}
              title={
                activateBlocked?.message ??
                (works
                  ? `Create ${resolveText(ctx.content, works.next)} here`
                  : 'Use them here (they are used up)')
              }
              onClick={() => act({ type: 'activate_great_person', player: viewer, unit: unit.id })}
            >
              {works ? `Create a great work (${works.left} left)` : 'Activate'}
            </button>
          )}
          {mine && activateBlocked?.code === 'no_slot' && (
            <p className="hint">{activateBlocked.message}.</p>
          )}
          {mine && prophet && (
            <button
              type="button"
              disabled={!!religionBlocked}
              title={religionBlocked?.message ?? 'Name a religion and pick its beliefs'}
              onClick={onFoundReligion}
            >
              Found a religion
            </button>
          )}
        </section>
      )}
      {religion && (
        <section className="great-person" aria-label="Missionary">
          <p>
            Spreads <strong>{religion.name}</strong>: {unit.charges ?? 0} more times. Preach on or
            next to a settlement to win it over.
          </p>
          {mine &&
            preachIn.map((s) => {
              const action: Action = {
                type: 'spread_religion',
                player: viewer,
                unit: unit.id,
                settlement: s.id,
              };
              const blocked = validateAction(state, action, ctx);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!!blocked}
                  title={blocked?.message}
                  onClick={() => act(action)}
                >
                  Preach in {s.name}
                </button>
              );
            })}
          {mine && preachIn.length === 0 && (
            <p className="hint">Walk next to a settlement that doesn&apos;t follow it yet.</p>
          )}
        </section>
      )}
      {mine && def.actions.includes('trade_route') && (
        <section className="trade" aria-label="Trade routes">
          <h4>
            Trade routes {routesOf(state, viewer).length}/{tradeCapacity(ctx, state, viewer)}
          </h4>
          {!traderOrigin(state, unit) ? (
            <p className="hint">Move the trader into one of your settlements to send it.</p>
          ) : (
            <ul className="items">
              {tradeDestinations(ctx, state, unit)
                .sort((a, b) => Number(!!a.problem) - Number(!!b.problem))
                .slice(0, 12)
                .map((d) => (
                  <li key={d.settlement.id} title={d.problem?.message}>
                    <span className="item-name">
                      {d.settlement.name}
                      {d.settlement.owner !== viewer &&
                        ` (${civName(ctx.content, state, d.settlement.owner)})`}
                      <span className="muted mono">
                        {' '}
                        {Object.entries(d.yields.origin)
                          .filter(([, v]) => v > 0)
                          .map(([y, v]) => `+${v / 100}${ctx.content.entities.yield[y]?.icon ?? y}`)
                          .join(' ')}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={!!d.problem}
                      onClick={() =>
                        act({
                          type: 'start_trade_route',
                          player: viewer,
                          unit: unit.id,
                          to: d.settlement.id,
                        })
                      }
                    >
                      Send
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <p className="hint">
            A route runs {ctx.content.rules.trade.routeTurns} turns, builds a road, then the trader
            comes home.
          </p>
        </section>
      )}
      {mine && (
        <div className="unit-actions">
          {upgradeTo && (
            <button
              type="button"
              disabled={!!upgradeBlocked}
              title={
                upgradeBlocked?.message ??
                `Upgrade to ${resolveText(ctx.content, unitDef(ctx, { type: upgradeTo }).name)}`
              }
              onClick={() => act({ type: 'upgrade_unit', player: viewer, unit: unit.id })}
            >
              <Icon name="upgrade" size={18} />{' '}
              {resolveText(ctx.content, unitDef(ctx, { type: upgradeTo }).name)}{' '}
              <Icon name="gold" size={16} />
              {whole(upgradeCost(ctx, state, unit.type, upgradeTo))}
            </button>
          )}
          {command && (
            <>
              <button
                type="button"
                disabled={!!why(pack)}
                title={
                  why(pack) ??
                  'Pack the soldiers on and next to the commander: they travel inside it'
                }
                onClick={() => pack && act(pack)}
              >
                Pack {packable.length > 0 ? `(${packable.length})` : ''}
              </button>
              <button
                type="button"
                disabled={!!why(unpackAction)}
                title={
                  why(unpackAction) ??
                  (unit.moves > 0
                    ? 'Put the packed units around the commander, ready to act'
                    : 'Put the packed units around the commander (they act next turn)')
                }
                onClick={() => act(unpackAction)}
              >
                Unpack
              </button>
            </>
          )}
          {def.actions.includes('found_settlement') && (
            <button
              type="button"
              className="found"
              disabled={foundBlocked !== undefined}
              title={foundBlocked ?? 'Found a settlement here'}
              onClick={() => act(found)}
            >
              <Icon name="found" size={18} /> Found settlement <kbd>B</kbd>
            </button>
          )}
          <button type="button" onClick={onSkip}>
            <Icon name="skip" size={18} /> Skip <kbd>Space</kbd>
          </button>
          {unit.orders ? (
            <button type="button" onClick={() => act({ type: 'wake_unit', ...ref })}>
              {unit.orders.kind === 'move' ? 'Cancel move' : 'Wake'}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => act({ type: 'sleep_unit', ...ref })}>
                <Icon name="sleep" size={18} /> Sleep <kbd>Z</kbd>
              </button>
              {cls.combat && (
                <button type="button" onClick={() => act({ type: 'fortify_unit', ...ref })}>
                  <Icon name="fortify" size={18} /> Fortify <kbd>F</kbd>
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
