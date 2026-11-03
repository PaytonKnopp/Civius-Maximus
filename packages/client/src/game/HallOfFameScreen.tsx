import { type CompiledContent, resolveText } from '@cx/content';
import { useMemo, useState } from 'react';
import { Emblem } from '../ui/Emblem';
import { LeaderHead, leaderArt } from '../ui/LeaderCard';
import { Choice, MenuScreen } from '../ui/Menu';
import { ago } from '../menu/saveInfo';
import { type FameEntry, hallOfFame, removeFromHallOfFame } from './hallOfFame';
import { ReplayView } from './ReplayView';

const REASONS: Record<string, string> = {
  score: 'Score',
  conquest: 'Conquest',
  domination: 'Domination',
  religion: 'Religion',
  science: 'Science',
  culture: 'Culture',
  diplomatic: 'Diplomacy',
};

type Result = 'all' | 'won' | 'lost';
type Order = 'new' | 'score' | 'fast' | 'long';

/**
 * The Hall of Fame (docs/06-ui-ux.md): your record across every game finished in this browser,
 * how you won and lost, and a replay of the newest games. Filter, sort, and forget games.
 */
export function HallOfFameScreen({
  content,
  onClose,
}: {
  content?: CompiledContent;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<FameEntry[]>(hallOfFame);
  const [open, setOpen] = useState<FameEntry | null>(null);
  const [result, setResult] = useState<Result>('all');
  const [reason, setReason] = useState('');
  const [order, setOrder] = useState<Order>('new');
  const [confirm, setConfirm] = useState<string | null>(null);

  // The entries keep a leader's name; find the leader to draw them.
  const leaderIds = useMemo(() => {
    const map = new Map<string, string>();
    if (content)
      for (const id of content.ids.leader)
        map.set(resolveText(content, content.entities.leader[id]!.name), id);
    return map;
  }, [content]);

  const stats = useMemo(() => {
    const won = entries.filter((e) => e.won);
    const byReason = new Map<string, number>();
    for (const e of won) byReason.set(e.reason, (byReason.get(e.reason) ?? 0) + 1);
    const played = new Map<string, number>();
    for (const e of entries) played.set(e.leader, (played.get(e.leader) ?? 0) + 1);
    const favourite = [...played].sort((a, b) => b[1] - a[1])[0];
    return {
      games: entries.length,
      won: won.length,
      rate: entries.length ? Math.round((won.length / entries.length) * 100) : 0,
      best: entries.reduce((m, e) => Math.max(m, e.score), 0),
      fastest: won.length ? Math.min(...won.map((e) => e.turn)) : 0,
      byReason: [...byReason].sort((a, b) => b[1] - a[1]),
      favourite: favourite?.[0] ?? '',
      favouriteGames: favourite?.[1] ?? 0,
    };
  }, [entries]);

  const list = useMemo(() => {
    const l = entries.filter(
      (e) => (result === 'all' || (result === 'won') === e.won) && (!reason || e.reason === reason),
    );
    const by: Record<Order, (a: FameEntry, b: FameEntry) => number> = {
      new: (a, b) => (a.date < b.date ? 1 : -1),
      score: (a, b) => b.score - a.score,
      fast: (a, b) => a.turn - b.turn,
      long: (a, b) => b.turn - a.turn,
    };
    return l.sort(by[order]);
  }, [entries, result, reason, order]);
  const reasons = [...new Set(entries.map((e) => e.reason))];

  const art = (e: FameEntry) => {
    const id = leaderIds.get(e.leader);
    return content && id ? leaderArt(content, id) : null;
  };

  if (open?.replay) {
    return (
      <MenuScreen
        title={`${open.leader} of ${open.civ}`}
        icon="trophy"
        sub={`${open.won ? 'Victory' : 'Defeat'} by ${(REASONS[open.reason] ?? open.reason).toLowerCase()} on turn ${open.turn} · ${open.map} · ${open.difficulty}`}
        closeLabel="All games"
        onClose={() => setOpen(null)}
        className="mx-fame"
      >
        <div className="fame-body">
          <ReplayView replay={open.replay} />
        </div>
      </MenuScreen>
    );
  }

  const stat = (n: string | number, label: string, sub?: string) => (
    <div className={`mx-stat ${typeof n === 'string' && n.length > 7 ? 'long' : ''}`}>
      <b>{n}</b>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );

  return (
    <MenuScreen
      title="Hall of Fame"
      icon="trophy"
      sub="Every game you finished in this browser. The newest keep a replay."
      onClose={onClose}
      className="mx-fame"
    >
      <div className="mx-fame-scroll">
        {entries.length === 0 ? (
          <div className="mx-empty">
            <strong>No finished games yet</strong>
            <p>
              Win (or lose) a game and it is remembered here, with its score, how it ended and a
              replay of the world turn by turn.
            </p>
          </div>
        ) : (
          <>
            <section className="mx-stats" aria-label="Your record">
              {stat(stats.games, 'games played')}
              {stat(`${stats.won}`, 'victories', `${stats.rate}% won`)}
              {stat(stats.best, 'best score')}
              {stat(stats.fastest || '—', 'fastest win', stats.fastest ? 'turns' : undefined)}
              {stat(
                stats.favourite || '—',
                'most played',
                stats.favourite ? `${stats.favouriteGames} games` : undefined,
              )}
            </section>
            {stats.byReason.length > 0 && (
              <section className="mx-ways" aria-label="How you won">
                <span className="home-kicker">Victories by kind</span>
                <div>
                  {stats.byReason.map(([r, n]) => (
                    <span key={r} className="mx-chip gold">
                      {REASONS[r] ?? r} · {n}
                    </span>
                  ))}
                </div>
              </section>
            )}
            <div className="mx-fame-tools">
              <Choice
                label="Show"
                value={result}
                options={[
                  { value: 'all', label: `All ${entries.length}` },
                  { value: 'won', label: `Victories ${stats.won}` },
                  { value: 'lost', label: `Defeats ${stats.games - stats.won}` },
                ]}
                onChange={setResult}
              />
              <select
                aria-label="Kind of ending"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Any ending</option>
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {REASONS[r] ?? r}
                  </option>
                ))}
              </select>
              <select
                aria-label="Sort"
                value={order}
                onChange={(e) => setOrder(e.target.value as Order)}
              >
                <option value="new">Newest first</option>
                <option value="score">Highest score</option>
                <option value="fast">Shortest game</option>
                <option value="long">Longest game</option>
              </select>
            </div>
            <ul className="mx-games">
              {list.map((e) => {
                const a = art(e);
                const id = leaderIds.get(e.leader);
                return (
                  <li key={e.id} className={`mx-game ${e.won ? 'won' : 'lost'}`}>
                    <div className="mx-game-who">
                      {content && id ? (
                        <LeaderHead content={content} leader={id} size={56} />
                      ) : (
                        <span className="mx-random-head small">{e.leader.charAt(0)}</span>
                      )}
                      {a && (
                        <Emblem
                          className="mx-game-emblem"
                          symbol={a.emblem}
                          primary={a.primary}
                          secondary={a.secondary}
                          size={22}
                        />
                      )}
                    </div>
                    <div className="mx-game-text">
                      <strong>
                        {e.leader} <span className="muted">of {e.civ}</span>
                      </strong>
                      <span className="mx-game-result">
                        {e.won ? 'Victory' : 'Defeat'} ·{' '}
                        {(REASONS[e.reason] ?? e.reason).toLowerCase()}
                        {!e.won && e.winner ? ` (${e.winner} won)` : ''} · turn {e.turn}
                      </span>
                      <small>
                        {e.map} · {e.difficulty} · {e.speed} · {e.players} civs · {ago(e.date)}
                      </small>
                    </div>
                    <div className="mx-game-score">
                      <b>{e.score}</b>
                      <span>score</span>
                    </div>
                    <div className="mx-game-actions">
                      {e.replay && (
                        <button type="button" className="primary" onClick={() => setOpen(e)}>
                          Replay
                        </button>
                      )}
                      {confirm === e.id ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            removeFromHallOfFame(e.id);
                            setEntries(hallOfFame());
                            setConfirm(null);
                          }}
                        >
                          Forget it
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ghost"
                          aria-label={`Forget ${e.leader}’s game`}
                          title="Forget this game"
                          onClick={() => setConfirm(e.id)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
              {list.length === 0 && <li className="mx-empty">No games match.</li>}
            </ul>
          </>
        )}
      </div>
    </MenuScreen>
  );
}
