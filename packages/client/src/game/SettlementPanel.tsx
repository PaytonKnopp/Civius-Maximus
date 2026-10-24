import { resolveText } from '@cx/content';
import {
  type Action,
  availableItems,
  type BuildItem,
  type CitizenFocus,
  developCandidates,
  type EngineContext,
  formatFixed,
  type GameState,
  happinessOf,
  improvementsFor,
  itemCost,
  itemKey,
  type Line,
  type PlayerId,
  productionToward,
  purchaseCost,
  townUpgradeCost,
  validateAction,
} from '@cx/engine';
import { itemName, settlementSummary, showTurns, tileName, turnsFor, whole } from './model';

export type PanelMode = 'citizens' | 'buy';

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
                <li key={`${itemKey(q)}:${i}`}>
                  {itemName(content, q)}
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
        </section>
      )}

      {mine && (
        <section aria-label={s.kind === 'city' ? 'Build or buy' : 'Buy'}>
          <h4>{s.kind === 'city' ? 'Build or buy' : 'Buy'}</h4>
          <ul className="items">
            {availableItems(ctx, state, s).map((item) => {
              const cost = itemCost(ctx, item);
              const progress = s.progress[itemKey(item)] ?? 0;
              const buy: Action = { type: 'buy_item', player: viewer, settlement: id, item };
              return (
                <li key={itemKey(item)}>
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
                      <button type="button" onClick={() => build(item)} title="Build this next">
                        Build
                      </button>
                      <button
                        type="button"
                        onClick={() => enqueue(item)}
                        title="Add to the queue"
                        aria-label={`Queue ${itemName(content, item)}`}
                      >
                        +
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={!can(buy)}
                    title={
                      why(buy) ??
                      `Buy now for ${whole(purchaseCost(ctx, state, viewer, item))} gold`
                    }
                    onClick={() => act(buy)}
                  >
                    {icon('gold')} {whole(purchaseCost(ctx, state, viewer, item))}
                  </button>
                </li>
              );
            })}
          </ul>
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
