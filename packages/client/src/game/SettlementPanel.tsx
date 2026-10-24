import { resolveText } from '@cx/content';
import {
  type Action,
  availableItems,
  type BuildItem,
  type CitizenFocus,
  developCandidates,
  districtLimit,
  districtYields,
  type EngineContext,
  formatFixed,
  type GameState,
  happinessOf,
  improvementsFor,
  itemCost,
  itemKey,
  canBuyWithFaith,
  isBuyable,
  type Line,
  needsTile,
  type PlayerId,
  productionToward,
  purchaseCost,
  settlementMaxHealth,
  settlementStrength,
  strikeTargets,
  townUpgradeCost,
  validateAction,
  wallsMax,
} from '@cx/engine';
import {
  itemName,
  settlementSummary,
  showTurns,
  tileName,
  turnsFor,
  whole,
  yieldLabel,
} from './model';

export type PanelMode = 'citizens' | 'buy';

/** A district, wonder or project waiting for its tile; `front` builds it next. */
export interface Placing {
  item: BuildItem;
  front: boolean;
}

const GROUPS: { kind: BuildItem['kind']; title: string }[] = [
  { kind: 'unit', title: 'Units' },
  { kind: 'building', title: 'Buildings' },
  { kind: 'district', title: 'Districts' },
  { kind: 'wonder', title: 'Wonders' },
  { kind: 'project', title: 'Projects' },
];

const YIELDS = ['food', 'production', 'gold', 'science', 'culture', 'faith'];
const FOCUSES: CitizenFocus[] = [
  'balanced',
  'food',
  'production',
  'gold',
  'science',
  'culture',
  'faith',
];

const explain = (lines: Line[] | undefined, fixed = true) =>
  (lines ?? []).map((l) => `${l.label}: ${fixed ? formatFixed(l.amount) : l.amount}`).join('\n');

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  id: string;
  mode: PanelMode;
  onMode: (mode: PanelMode) => void;
  act: (action: Action) => boolean;
  onClose: () => void;
  onFocusTile: (tile: number) => void;
  placing: Placing | null;
  onPlace: (placing: Placing | null) => void;
  /** Where the item being placed could go, best first. */
  choices: { tile: number; label: string }[];
  onChoose: (tile: number) => void;
  /** Picking a target for the settlement's ranged strike. */
  striking: boolean;
  onStrike: (on: boolean) => void;
}

/** The settlement screen: growth, yields, happiness, production, growth choices and citizens. */
export function SettlementPanel({
  ctx,
  state,
  viewer,
  id,
  mode,
  onMode,
  act,
  onClose,
  onFocusTile,
  placing,
  onPlace,
  choices,
  onChoose,
  striking,
  onStrike,
}: Props) {
  const { content } = ctx;
  const s = state.settlements[id]!;
  const mine = s.owner === viewer;
  const sum = settlementSummary(ctx, state, s);
  const happiness = happinessOf(ctx, state, s);
  const icon = (y: string) => content.entities.yield[y]?.icon ?? '';
  const name = (y: string) => resolveText(content, content.entities.yield[y]?.name ?? y);
  const production = sum.yields.total.production ?? 0;
  const gold = state.players[viewer]!.gold;
  const can = (action: Action) => !validateAction(state, action, ctx);
  const why = (action: Action) => validateAction(state, action, ctx)?.message;

  const setQueue = (queue: BuildItem[]) =>
    act({ type: 'set_queue', player: viewer, settlement: id, queue });
  const build = (item: BuildItem) =>
    setQueue(
      [
        item,
        ...s.queue.slice(1).filter((q) => itemKey(q) !== itemKey(item) || q.kind === 'unit'),
      ].slice(0, 8),
    );
  const enqueue = (item: BuildItem) => setQueue([...s.queue, item].slice(0, 8));
  const items = availableItems(ctx, state, s);
  const isSpecialty = (id: string) => content.entities.district[id]?.specialty ?? false;
  const specialtyCount =
    s.districts.filter((d) => isSpecialty(d.id)).length +
    s.queue.filter((q) => q.kind === 'district' && isSpecialty(q.id)).length;
  const spec = content.rules.settlements.specialization;
  const defense = settlementStrength(ctx, state, s);
  const maxHealth = settlementMaxHealth(ctx, s.kind);
  const fullWalls = wallsMax(ctx, s);
  const strikeCount = mine ? strikeTargets(ctx, state, s).length : 0;
  const specialists = Object.entries(s.specialists).filter(([, n]) => n > 0);

  const foodPct = Math.min(100, Math.max(0, (s.food / sum.foodNeeded) * 100));
  const growthText =
    sum.growth < 0
      ? 'Starving'
      : Number.isFinite(sum.growthTurns)
        ? `Grows in ${sum.growthTurns} turn${sum.growthTurns === 1 ? '' : 's'}`
        : 'Not growing';

  return (
    <aside className="settlement-panel" aria-label={`${s.name} settlement`}>
      <div className="settlement-head">
        <span className="pop" title="Population">
          {s.population}
        </span>
        <div>
          <h3>
            {s.capital && (
              <span className="capital-star" aria-label="Capital">
                ★{' '}
              </span>
            )}
            {s.name}
          </h3>
          <p className="unit-sub">
            {s.kind === 'city' ? 'City' : 'Town'} · {growthText}
          </p>
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="bar" title={`Food ${whole(s.food)} / ${whole(sum.foodNeeded)}`}>
        <span className="bar-fill food" style={{ width: `${foodPct}%` }} />
        <span className="bar-text">
          {icon('food')} {whole(s.food)}/{whole(sum.foodNeeded)} ({sum.growth >= 0 ? '+' : ''}
          {formatFixed(sum.growth)})
        </span>
      </div>

      <ul className="yield-row">
        {YIELDS.map((y) => (
          <li key={y} title={`${name(y)}\n${explain(sum.yields.lines[y])}`}>
            <span aria-hidden="true">{icon(y)}</span>
            <span className="mono">{formatFixed(sum.yields.total[y] ?? 0)}</span>
          </li>
        ))}
        <li
          className={`mood ${happiness.mood}`}
          title={`Happiness\n${explain(happiness.lines, false)}`}
        >
          <span aria-hidden="true">{icon('happiness')}</span>
          <span className="mono">
            {happiness.balance >= 0 ? '+' : ''}
            {happiness.balance}
          </span>
        </li>
      </ul>
      <p className={`mood-line ${happiness.mood}`}>
        {happiness.mood === 'thriving'
          ? `Thriving: +${happiness.yieldPercent}% yields`
          : happiness.mood === 'content'
            ? 'Content'
            : `${happiness.mood === 'unrest' ? 'Unrest' : 'Unhappy'}: ${happiness.yieldPercent}% yields`}
      </p>

      <p
        className="defense-line"
        title={`Strength\n${defense.lines.map((l) => `${l.label}: ${l.amount}`).join('\n')}`}
      >
        <span>🛡 {defense.total}</span>
        <span className={s.health < maxHealth ? 'hurt' : ''}>
          ❤ {s.health}/{maxHealth}
        </span>
        {fullWalls > 0 && (
          <span>
            🧱 {s.walls}/{fullWalls}
          </span>
        )}
      </p>
      {mine && (strikeCount > 0 || striking) && (
        <button
          type="button"
          className={`wide strike ${striking ? 'on' : ''}`}
          onClick={() => onStrike(!striking)}
        >
          {striking
            ? 'Cancel strike (pick a marked unit)'
            : `🎯 Ranged strike · ${strikeCount} in range`}
        </button>
      )}

      {mine && s.pendingDevelop > 0 && (
        <section className="develop" aria-label="Develop a tile">
          <h4>{s.name} grew! Develop a tile</h4>
          <p className="hint">Pick a highlighted tile on the map, or one here.</p>
          <ul className="choices">
            {developCandidates(ctx, state, s).flatMap((tile) =>
              improvementsFor(ctx, state, tile).map((imp) => {
                const def = content.entities.improvement[imp]!;
                const terrain = tileName(content, state.map.tiles[tile]!);
                const gain = Object.entries(def.yields)
                  .map(([y, v]) => `+${v}${icon(y)}`)
                  .join(' ');
                return (
                  <li key={`${tile}:${imp}`}>
                    <button
                      type="button"
                      onMouseEnter={() => onFocusTile(tile)}
                      onClick={() =>
                        act({
                          type: 'develop_tile',
                          player: viewer,
                          settlement: id,
                          tile,
                          improvement: imp,
                        })
                      }
                    >
                      <span>
                        {resolveText(content, def.name)} <span className="muted">on {terrain}</span>
                      </span>
                      <span className="mono">{gain}</span>
                    </button>
                  </li>
                );
              }),
            )}
          </ul>
        </section>
      )}

      {mine && s.kind === 'city' && (
        <section aria-label="Production">
          <h4>
            Production {icon('production')} {formatFixed(production)}
          </h4>
          {sum.head ? (
            <div className="bar" title={`${whole(sum.head.progress)} / ${whole(sum.head.cost)}`}>
              <span
                className="bar-fill production"
                style={{ width: `${Math.min(100, (sum.head.progress / sum.head.cost) * 100)}%` }}
              />
              <span className="bar-text">
                {sum.head.name} · {showTurns(sum.head.turns)} turn{sum.head.turns === 1 ? '' : 's'}
              </span>
            </div>
          ) : (
            <p className="callout">Choose something to build.</p>
          )}
          {s.queue.length > 1 && (
            <ol className="queue">
              {s.queue.slice(1).map((q, i) => (
                <li
                  key={`${itemKey(q)}:${i}`}
                  onMouseEnter={() => q.tile !== undefined && onFocusTile(q.tile)}
                >
                  {itemName(content, q)}
                  {q.tile !== undefined && <span className="muted"> 📍</span>}
                  <button
                    type="button"
                    className="link"
                    aria-label={`Remove ${itemName(content, q)} from the queue`}
                    onClick={() => setQueue(s.queue.filter((_, k) => k !== i + 1))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {mine && s.kind === 'town' && (
        <section aria-label="Town">
          <p className="hint">
            Towns turn their production into gold: {icon('gold')} +{formatFixed(sum.townGold)} a
            turn. Upgrade to a city to build things; towns can still buy.
          </p>
          <button
            type="button"
            className="wide"
            disabled={!can({ type: 'upgrade_town', player: viewer, settlement: id })}
            title={why({ type: 'upgrade_town', player: viewer, settlement: id })}
            onClick={() => act({ type: 'upgrade_town', player: viewer, settlement: id })}
          >
            Upgrade to city · {icon('gold')} {whole(townUpgradeCost(ctx, state, viewer))}
          </button>
          <h4>Specialization</h4>
          <p className="hint">
            {s.population < spec.minPopulation
              ? `At ${spec.minPopulation} citizens a town can specialize.`
              : s.specializationChanges > 0
                ? `Changing it costs ${icon('gold')} ${spec.changeCost}.`
                : 'The first choice is free.'}
          </p>
          <ul className="choices specs">
            {content.ids.specialization.map((sid) => {
              const def = content.entities.specialization[sid]!;
              const action: Action = {
                type: 'set_specialization',
                player: viewer,
                settlement: id,
                specialization: sid,
              };
              const on = s.specialization === sid;
              return (
                <li key={sid}>
                  <button
                    type="button"
                    className={on ? 'on' : ''}
                    aria-pressed={on}
                    disabled={!on && !can(action)}
                    title={on ? 'Current specialization' : why(action)}
                    onClick={() => !on && act(action)}
                  >
                    <span>
                      <strong>{resolveText(content, def.name)}</strong>
                      <span className="spec-text">{resolveText(content, def.description)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {mine && (
        <section aria-label={s.kind === 'city' ? 'Build or buy' : 'Buy'}>
          <h4>{s.kind === 'city' ? 'Build or buy' : 'Buy'}</h4>
          {placing && (
            <div className="placement" aria-label="Choose a tile">
              <p className="callout place">
                Pick a highlighted tile for {itemName(content, placing.item)}, or one here.{' '}
                <button type="button" className="link" onClick={() => onPlace(null)}>
                  Cancel
                </button>
              </p>
              <ul className="choices">
                {choices.slice(0, 6).map((c) => (
                  <li key={c.tile}>
                    <button
                      type="button"
                      onMouseEnter={() => onFocusTile(c.tile)}
                      onClick={() => onChoose(c.tile)}
                    >
                      <span>{tileName(content, state.map.tiles[c.tile]!)}</span>
                      <span className="mono">{c.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {GROUPS.map(({ kind, title }) => {
            const group = items.filter((item) => item.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind} className="item-group">
                <h5>
                  {title}
                  {kind === 'district' && (
                    <span
                      className="muted mono"
                      title="Specialty districts built and queued, out of what this size allows"
                    >
                      {' '}
                      {specialtyCount}/{districtLimit(ctx, s)}
                    </span>
                  )}
                </h5>
                <ul className="items">
                  {group.map((item) => {
                    const cost = itemCost(ctx, state, viewer, item, s);
                    const progress = s.progress[itemKey(item)] ?? 0;
                    const buy: Action = { type: 'buy_item', player: viewer, settlement: id, item };
                    const price = whole(purchaseCost(ctx, state, viewer, item, s));
                    const faithBuy: Action | undefined =
                      isBuyable(item) && canBuyWithFaith(ctx, state, viewer, item)
                        ? { ...buy, currency: 'faith' }
                        : undefined;
                    const tiled = needsTile(item);
                    const def =
                      kind === 'district'
                        ? content.entities.district[item.id]
                        : kind === 'wonder'
                          ? content.entities.wonder[item.id]
                          : undefined;
                    const placingThis = placing?.item.id === item.id;
                    return (
                      <li
                        key={itemKey(item)}
                        className={placingThis ? 'placing' : ''}
                        title={def?.description ? resolveText(content, def.description) : undefined}
                      >
                        <span className="item-name">
                          {itemName(content, item)}
                          {s.kind === 'city' && (
                            <span className="muted mono">
                              {' '}
                              {whole(cost)}⚙ ·{' '}
                              {showTurns(
                                turnsFor(
                                  cost,
                                  progress,
                                  productionToward(ctx, state, s, item, production),
                                ),
                              )}
                              t
                            </span>
                          )}
                        </span>
                        {s.kind === 'city' && (
                          <>
                            <button
                              type="button"
                              onClick={() => (tiled ? onPlace({ item, front: true }) : build(item))}
                              title={tiled ? 'Pick a tile, then build it next' : 'Build this next'}
                            >
                              {tiled ? 'Place' : 'Build'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                tiled ? onPlace({ item, front: false }) : enqueue(item)
                              }
                              title={
                                tiled ? 'Pick a tile, then add it to the queue' : 'Add to the queue'
                              }
                              aria-label={`Queue ${itemName(content, item)}`}
                            >
                              +
                            </button>
                          </>
                        )}
                        {isBuyable(item) && (
                          <button
                            type="button"
                            disabled={!can(buy)}
                            title={why(buy) ?? `Buy now for ${price} gold`}
                            onClick={() => act(buy)}
                          >
                            {icon('gold')} {price}
                          </button>
                        )}
                        {faithBuy && (
                          <button
                            type="button"
                            disabled={!can(faithBuy)}
                            title={why(faithBuy) ?? `Buy now for ${price} faith`}
                            onClick={() => act(faithBuy)}
                          >
                            {icon('faith')} {price}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {mine && (
        <section className="citizens" aria-label="Citizens">
          <div className="row-inline">
            <label htmlFor="focus">Focus</label>
            <select
              id="focus"
              value={s.focus}
              onChange={(e) =>
                act({
                  type: 'set_focus',
                  player: viewer,
                  settlement: id,
                  focus: e.target.value as CitizenFocus,
                })
              }
            >
              {FOCUSES.map((f) => (
                <option key={f} value={f}>
                  {f === 'balanced' ? 'Balanced' : name(f)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={mode === 'buy' ? 'on' : ''}
              aria-pressed={mode === 'buy'}
              onClick={() => onMode(mode === 'buy' ? 'citizens' : 'buy')}
            >
              Buy tiles
            </button>
          </div>
          <p className="hint">
            {mode === 'buy'
              ? `You have ${whole(gold)} gold. Pick a marked tile to buy it.`
              : 'Click a tile in the territory to keep a citizen working it.'}
          </p>
          {specialists.length > 0 && (
            <p className="buildings" title="Citizens working as specialists in districts">
              Specialists:{' '}
              {specialists
                .map(
                  ([d, n]) =>
                    `${n} in ${resolveText(content, content.entities.district[d]?.name ?? d)}`,
                )
                .join(' · ')}
            </p>
          )}
          {(s.districts.length > 0 || s.wonders.length > 0) && (
            <ul className="districts">
              {s.districts.map((d) => {
                const def = content.entities.district[d.id]!;
                return (
                  <li
                    key={d.id}
                    onMouseEnter={() => onFocusTile(d.tile)}
                    style={{ borderColor: def.color }}
                  >
                    {resolveText(content, def.name)}{' '}
                    <span className="mono">
                      {yieldLabel(content, districtYields(ctx, state, d.tile, d.id).total)}
                    </span>
                  </li>
                );
              })}
              {s.wonders.map((w) => (
                <li key={w} className="wonder">
                  ✦ {resolveText(content, content.entities.wonder[w]?.name ?? w)}
                </li>
              ))}
            </ul>
          )}
          {s.buildings.length > 0 && (
            <p className="buildings">
              {s.buildings
                .map((b) => resolveText(content, content.entities.building[b]!.name))
                .join(' · ')}
            </p>
          )}
        </section>
      )}
    </aside>
  );
}
