import { resolveText } from '@cx/content';
import {
  type Action,
  atWar,
  befriendProblem,
  distance,
  cityStateDef,
  cityStateIds,
  cityStateType,
  type EngineContext,
  envoysOf,
  type GameState,
  levyCost,
  levyProblem,
  levySoldiers,
  type PlayerId,
  questsOf,
  validateAction,
} from '@cx/engine';
import { useEffect } from 'react';
import { civName, whole } from './model';
import { Icon } from '../ui/Icon';

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  act: (action: Action) => boolean;
  onClose: () => void;
}

/** Every city-state you've met: what envoys there give you, who leads it, its quests. */
export function CityStatesScreen({ ctx, state, viewer, act, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const me = state.players[viewer]!;
  const ids = cityStateIds(state);
  const met = ids.filter((id) => state.cityStates[id]!.met.includes(viewer));
  const rules = ctx.content.rules.cityStates;
  return (
    <div className="screen" role="dialog" aria-label="City-states">
      <header className="screen-head">
        <h2>
          <Icon name="cityStates" size={30} />
          City-states
        </h2>
        <p className="screen-sub">
          {me.envoys > 0
            ? `You have ${me.envoys} free envoy${me.envoys === 1 ? '' : 's'} to send. `
            : `An envoy costs ${rules.envoyInfluence} influence (you have ${whole(me.influence)}). `}
          Envoys unlock bonuses at 1, 3 and 6; the most envoys (at least {rules.suzerainEnvoys})
          makes you suzerain.
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="gp-grid">
        {met.map((id) => (
          <CityStateCard key={id} ctx={ctx} state={state} viewer={viewer} id={id} act={act} />
        ))}
      </div>
      <Camps ctx={ctx} state={state} viewer={viewer} act={act} />
      <p className="hint cs-unmet">
        {met.length === 0
          ? 'Explore to find city-states: the first to reach one gets a free envoy there.'
          : ''}{' '}
        {ids.length - met.length > 0 &&
          `${ids.length - met.length} city-state${ids.length - met.length === 1 ? '' : 's'} not found yet.`}
      </p>
    </div>
  );
}

/** One city-state: its kind and bonuses, envoys, suzerain, quests, and sending an envoy. */
export function CityStateCard({
  ctx,
  state,
  viewer,
  id,
  act,
}: {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  id: PlayerId;
  act: (action: Action) => boolean;
}) {
  const { content } = ctx;
  const t = (text: string) => resolveText(content, text);
  const cs = state.cityStates[id]!;
  const def = cityStateDef(ctx, cs);
  const type = cityStateType(ctx, cs);
  const alive = state.players[id]?.alive ?? false;
  const mine = envoysOf(state, id, viewer);
  const me = state.players[viewer]!;
  const send: Action = { type: 'send_envoy', player: viewer, cityState: id };
  const levyWhy = levyProblem(ctx, state, viewer, id);
  const why = validateAction(state, send, ctx)?.message;
  const peace: Action = { type: 'offer_peace', player: viewer, target: id };
  const war = atWar(state, viewer, id);
  const envoys = Object.entries(cs.envoys).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const done = cs.quests[viewer] ?? [];
  return (
    <section className="gp-card cs-card" style={{ borderTopColor: type.color }}>
      <h3>
        <span aria-hidden="true">{type.icon}</span> {t(def.name)}{' '}
        <span className="muted">({t(type.name)})</span>
      </h3>
      {!alive ? (
        <p className="hint">Conquered. Free it to bring it back.</p>
      ) : (
        <>
          <p className="gp-text">
            Suzerain:{' '}
            <strong>{cs.suzerain ? civName(content, state, cs.suzerain) : 'nobody'}</strong>
            {envoys.length > 0 && (
              <span className="muted">
                {' '}
                · Envoys:{' '}
                {envoys
                  .map(([p, n]) => `${p === viewer ? 'you' : civName(content, state, p)} ${n}`)
                  .join(' · ')}
              </span>
            )}
          </p>
          <ul className="cs-tiers">
            {type.tiers.map((tier) => (
              <li key={tier.envoys} className={mine >= tier.envoys ? 'on' : ''}>
                <span className="mono">{tier.envoys}</span> {t(tier.description)}
              </li>
            ))}
            <li className={cs.suzerain === viewer ? 'on' : ''}>
              <span className="mono">★</span> <strong>{t(def.suzerain.name)}</strong>:{' '}
              {t(def.suzerain.description)}
            </li>
          </ul>
          <ul className="cs-quests">
            {questsOf(ctx, state, id).map((q) => (
              <li key={q.id} className={done.includes(q.id) ? 'on' : ''}>
                {done.includes(q.id) ? '✓' : '◇'} {q.text} (+
                {ctx.content.rules.cityStates.questEnvoys} envoy)
              </li>
            ))}
          </ul>
          <div className="row-inline">
            <button type="button" disabled={!!why} title={why} onClick={() => act(send)}>
              Send envoy ({mine}){' '}
              {me.envoys > 0 ? '· free' : `· 🤝 ${ctx.content.rules.cityStates.envoyInfluence}`}
            </button>
            {cs.suzerain === viewer && (
              <button
                type="button"
                disabled={!!levyWhy}
                title={
                  levyWhy?.message ??
                  `Command its ${levySoldiers(ctx, state, id).length} soldier${levySoldiers(ctx, state, id).length === 1 ? '' : 's'} for ${ctx.content.rules.cityStates.levyTurns} turns (it keeps paying for them)`
                }
                onClick={() => act({ type: 'levy_military', player: viewer, cityState: id })}
              >
                Levy soldiers <Icon name="gold" size={16} />
                {whole(levyCost(ctx, state, id))}
              </button>
            )}
            {war && (
              <button
                type="button"
                disabled={!!validateAction(state, peace, ctx)}
                title={
                  validateAction(state, peace, ctx)?.message ?? 'City-states always take peace'
                }
                onClick={() => act(peace)}
              >
                Make peace
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Hostile camps you've found: befriend one with influence over a few turns (Civ VII), and the
 * first civ to finish turns it into a city-state with its envoys there.
 */
function Camps({ ctx, state, viewer, act }: Omit<Props, 'onClose'>) {
  const rules = ctx.content.rules.cityStates;
  const known = Object.values(state.camps).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (known.length === 0 || state.settings.cityStates === false) return null;
  /** "6 tiles from Roma": the nearest settlement you know of, or "in the wilds". */
  const where = (tile: number) => {
    const s = Object.values(state.settlements).sort(
      (a, b) =>
        distance(state.map, a.tile, tile) - distance(state.map, b.tile, tile) ||
        (a.id < b.id ? -1 : 1),
    )[0];
    return s && distance(state.map, s.tile, tile) <= 10
      ? `${distanceLabel(state, s.tile, tile)} from ${s.name}`
      : 'in the wilds';
  };
  return (
    <section className="cs-camps">
      <h3>Hostile camps</h3>
      <p className="hint">
        Spend {rules.befriendInfluence} influence a turn for {rules.befriendTurns} turns to befriend
        a camp: the first civ to finish turns it into a city-state, with {rules.befriendEnvoys}{' '}
        envoys there. Or clear it with soldiers for gold.
      </p>
      <ul className="cs-camp-list">
        {known.map((c) => {
          const why = befriendProblem(ctx, state, viewer, c.id);
          const mine = c.befriend?.[viewer]?.turns ?? 0;
          const rivals = Object.entries(c.befriend ?? {}).filter(
            ([p, b]) => p !== viewer && b.turns > 0,
          );
          return (
            <li key={c.id}>
              <div>
                <strong>Camp {where(c.tile)}</strong>
                <span>
                  {mine > 0
                    ? `Befriending: ${mine} of ${rules.befriendTurns} turns`
                    : 'Not befriended'}
                  {rivals.length > 0 &&
                    ` · also courted by ${rivals.map(([p]) => civName(ctx.content, state, p)).join(', ')}`}
                </span>
              </div>
              <button
                type="button"
                disabled={!!why}
                title={why?.message ?? 'Spend influence toward befriending it this turn'}
                onClick={() => act({ type: 'befriend_camp', player: viewer, camp: c.id })}
              >
                Befriend · 🤝 {rules.befriendInfluence}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function distanceLabel(state: GameState, from: number, to: number) {
  const d = distance(state.map, from, to);
  return `${d} tile${d === 1 ? '' : 's'}`;
}
