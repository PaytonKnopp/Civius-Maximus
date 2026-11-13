import {
  cultureProgress,
  diplomaticOn,
  diplomaticPoints,
  dominationProgress,
  domesticTourists,
  type EngineContext,
  type GameState,
  type PlayerId,
  religiousProgress,
  scoreOf,
  spaceProgress,
} from '@cx/engine';

import { agree, civName, perTurn, turnsLabel } from './model';
import { Icon } from '../ui/Icon';
import { LeaderHead } from '../ui/LeaderCard';
import { Meter } from '../ui/Meter';
import { useEscape } from '../ui/Menu';

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  onGraphs: () => void;
  onClose: () => void;
}

/** One civ's standing in one way to win: how far along (0..1) and how it reads. */
interface Standing {
  player: PlayerId;
  value: number;
  max: number;
  label: string;
  title?: string;
}

interface Victory {
  id: string;
  name: string;
  icon: string;
  tone: string;
  how: string;
  standings: Standing[];
}

/**
 * Victories (docs/06-ui-ux.md, "Victory progress"): a card for each way to win (how to win it,
 * how far you are, who leads it), then every civ's progress side by side.
 */
export function VictoriesScreen({ ctx, state, viewer, onGraphs, onClose }: Props) {
  useEscape(onClose);
  const { content } = ctx;
  const s = state.settings;
  const players = state.playerOrder.filter((p) => state.players[p]!.alive);
  const name = (p: PlayerId) => civName(content, state, p);

  const victories: Victory[] = [];
  if (s.domination !== false)
    victories.push({
      id: 'domination',
      name: 'Domination',
      icon: 'war',
      tone: '#d0614e',
      how: 'Hold every rival’s original capital.',
      standings: players.map((p) => {
        const d = dominationProgress(state, p);
        return {
          player: p,
          value: d.held,
          max: d.needed,
          label: `${d.held}/${d.needed}`,
          title: `${name(p)} ${agree(name(p), 'holds')} ${d.held} of ${d.needed} rival capitals`,
        };
      }),
    });
  if (s.science !== false)
    victories.push({
      id: 'science',
      name: 'Science',
      icon: 'rocket',
      tone: '#5fb8f0',
      how: `Build a Spaceport and finish the space projects in order; the last arrives ${content.rules.science.travelTurns} turns later.`,
      standings: players.map((p) => {
        const sp = spaceProgress(ctx, state, p);
        return {
          player: p,
          value: sp.done,
          max: sp.total,
          label: `${sp.done}/${sp.total}${sp.arrives !== null ? ` · turn ${sp.arrives}` : ''}`,
          title: `${name(p)}: ${sp.done} of ${sp.total} space projects${sp.arrives !== null ? `, arriving on turn ${sp.arrives}` : ''}`,
        };
      }),
    });
  if (s.culture !== false)
    victories.push({
      id: 'culture',
      name: 'Culture',
      icon: 'tourism',
      tone: '#c58be0',
      how: 'Draw more visitors from every civilization than it has tourists of its own.',
      standings: players.map((p) => {
        const c = cultureProgress(ctx, state, p);
        const ahead = c.filter((x) => x.visiting > x.domestic).length;
        return {
          player: p,
          value: ahead,
          max: c.length,
          label: `${ahead}/${c.length}`,
          title: [
            `${name(p)}: ${domesticTourists(ctx, state, p)} domestic tourists, tourism ${perTurn(state.players[p]!.tourismRate)}`,
            ...c.map((x) => `${name(x.player)}: ${x.visiting} visiting vs ${x.domestic} at home`),
          ].join('\n'),
        };
      }),
    });
  if (s.religion !== false)
    victories.push({
      id: 'religion',
      name: 'Religion',
      icon: 'religion',
      tone: '#5fd0c0',
      how: 'Have your religion followed in most settlements of every other civilization.',
      standings: players.map((p) => {
        const religion = state.players[p]!.religion;
        const faith = religion ? religiousProgress(state, religion) : [];
        const won = faith.filter((x) => x.following >= x.needed).length;
        return {
          player: p,
          value: won,
          max: religion ? Math.max(1, faith.length) : 1,
          label: religion ? `${won}/${faith.length}` : 'None',
          title: religion
            ? [
                `${state.religions[religion]?.name ?? 'Their religion'}`,
                ...faith.map(
                  (x) =>
                    `${name(x.player)}: ${x.following}/${x.total} settlements (needs ${x.needed})`,
                ),
              ].join('\n')
            : `${name(p)} ${agree(name(p), 'has')} not founded a religion`,
        };
      }),
    });
  if (diplomaticOn(state))
    victories.push({
      id: 'diplomatic',
      name: 'Diplomatic',
      icon: 'congress',
      tone: '#e2c25e',
      how: `Earn ${content.rules.congress.victoryPoints} diplomatic victory points in the World Congress and from some wonders.`,
      standings: players.map((p) => {
        const pts = diplomaticPoints(ctx, state, p);
        return {
          player: p,
          value: pts,
          max: content.rules.congress.victoryPoints,
          label: `${pts}/${content.rules.congress.victoryPoints}`,
        };
      }),
    });
  const scores = players.map((p) => ({ player: p, score: scoreOf(ctx, state, p).total }));
  const best = Math.max(1, ...scores.map((x) => x.score));
  victories.push({
    id: 'score',
    name: 'Score',
    icon: 'graphs',
    tone: '#d2ac5c',
    how:
      s.turnLimit !== null
        ? `At turn ${s.turnLimit} the highest score wins (${turnsLabel(Math.max(0, s.turnLimit - state.turn))} left).`
        : 'No turn limit: the score only decides a game that has one.',
    standings: scores.map((x) => ({
      player: x.player,
      value: x.score,
      max: best,
      label: String(x.score),
      title: [
        `${name(x.player)}: score ${x.score}`,
        ...scoreOf(ctx, state, x.player).lines.map((l) => `${l.label}: ${l.amount}`),
      ].join('\n'),
    })),
  });

  const head = (p: PlayerId, size: number) => (
    <LeaderHead
      content={content}
      leader={state.players[p]!.leader}
      civ={state.players[p]!.civ}
      size={size}
    />
  );
  const ratio = (x: Standing) => (x.max > 0 ? x.value / x.max : 0);

  return (
    <div className="screen" role="dialog" aria-label="Victories">
      <header className="screen-head">
        <h2>
          <Icon name="victory" size={30} />
          Victories
        </h2>
        <p className="screen-sub">
          {victories.length - 1} ways to win this game. The last civilization standing always wins.
        </p>
        <button type="button" className="ghost small" onClick={onGraphs} title="Graphs (H)">
          <Icon name="graphs" size={18} /> Graphs
        </button>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="screen-scroll">
        <div className="vic-grid">
          {victories.map((v) => {
            const ranked = [...v.standings].sort(
              (a, b) =>
                ratio(b) - ratio(a) ||
                b.value - a.value ||
                state.playerOrder.indexOf(a.player) - state.playerOrder.indexOf(b.player),
            );
            const mine = v.standings.find((x) => x.player === viewer);
            const started = ranked.filter((x) => x.value > 0);
            const myRank = started.findIndex((x) => x.player === viewer) + 1;
            const nobody = started.length === 0;
            return (
              <section
                key={v.id}
                className={`vic-card vic-${v.id}`}
                style={{ '--tone': v.tone } as React.CSSProperties}
                aria-label={`${v.name} victory`}
              >
                <header className="vic-head">
                  <Icon name={v.icon} size={40} />
                  <div>
                    <h3>{v.name}</h3>
                    <p>{v.how}</p>
                  </div>
                </header>
                {mine && (
                  <div className="vic-you" title={mine.title}>
                    <span className="vic-you-label">
                      You{myRank > 0 ? ` · ${ordinal(myRank)}` : ''}
                    </span>
                    <Meter value={mine.value} max={mine.max} tone={v.tone} label={mine.label} />
                  </div>
                )}
                <ol className="vic-rank" aria-label={`${v.name}: leading civilizations`}>
                  {nobody ? (
                    <li className="vic-nobody">No one has made a start yet.</li>
                  ) : (
                    started.slice(0, 3).map((x) => (
                      <li
                        key={x.player}
                        className={x.player === viewer ? 'you' : ''}
                        title={x.title}
                      >
                        {head(x.player, 24)}
                        <span className="vic-rank-name">{name(x.player)}</span>
                        <Meter value={x.value} max={x.max} tone={v.tone} label={x.label} />
                      </li>
                    ))
                  )}
                </ol>
              </section>
            );
          })}
        </div>

        <h3 className="vic-table-title">Every civilization</h3>
        <div className="vic-table-wrap">
          <table className="religion-table victory-table">
            <thead>
              <tr>
                <th>Civilization</th>
                {victories.map((v) => (
                  <th key={v.id} title={v.how}>
                    <span className="vic-th">
                      <Icon name={v.icon} size={16} /> {v.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p} className={p === viewer ? 'mine' : ''}>
                  <td>
                    <span className="civ-cell">
                      {head(p, 34)}
                      <span>
                        <strong>{name(p)}</strong>
                        <small className="muted">{state.players[p]!.name}</small>
                      </span>
                    </span>
                  </td>
                  {victories.map((v) => {
                    const x = v.standings.find((y) => y.player === p)!;
                    return (
                      <td key={v.id} title={x.title}>
                        {v.id === 'score' ? (
                          <span className="score-cell">{x.label}</span>
                        ) : (
                          <Meter value={x.value} max={x.max} tone={v.tone} label={x.label} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
