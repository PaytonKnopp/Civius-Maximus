import {
  cultureProgress,
  dominationProgress,
  domesticTourists,
  type EngineContext,
  type GameState,
  type PlayerId,
  religiousProgress,
  scoreOf,
  spaceProgress,
} from '@cx/engine';
import { useEffect } from 'react';
import { civName, perTurn } from './model';

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  onGraphs: () => void;
  onClose: () => void;
}

/** Everyone's progress toward each way to win, side by side. */
export function VictoriesScreen({ ctx, state, viewer, onGraphs, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const { content } = ctx;
  const s = state.settings;
  const players = state.playerOrder.filter((p) => state.players[p]!.alive);
  return (
    <div className="screen" role="dialog" aria-label="Victories">
      <header className="screen-head">
        <h2>Victories</h2>
        <p className="screen-sub">
          {s.turnLimit !== null
            ? `At turn ${s.turnLimit} the highest score wins. `
            : 'No turn limit. '}
          The last civilization standing always wins.
        </p>
        <button type="button" className="ghost small" onClick={onGraphs} title="Graphs (H)">
          Graphs
        </button>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="victory-body">
        <table className="religion-table victory-table">
          <thead>
            <tr>
              <th>Civilization</th>
              <th>Score</th>
              {s.domination !== false && <th title="Rival original capitals held">Domination</th>}
              {s.science !== false && <th title="Space projects done">Science</th>}
              {s.culture !== false && (
                <th title="Civs whose own tourists you outnumber with visitors">Culture</th>
              )}
              {s.religion !== false && (
                <th title="Civs where your religion is followed in most settlements">Religion</th>
              )}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const dom = dominationProgress(state, p);
              const space = spaceProgress(ctx, state, p);
              const culture = cultureProgress(ctx, state, p);
              const ahead = culture.filter((c) => c.visiting > c.domestic).length;
              const religion = state.players[p]!.religion;
              const faith = religion ? religiousProgress(state, religion) : [];
              const won = faith.filter((x) => x.following >= x.needed).length;
              return (
                <tr key={p} className={p === viewer ? 'mine' : ''}>
                  <td>
                    <strong>{civName(content, state, p)}</strong>
                  </td>
                  <td className="mono">{scoreOf(ctx, state, p).total}</td>
                  {s.domination !== false && (
                    <td className="mono">
                      {dom.held}/{dom.needed}
                    </td>
                  )}
                  {s.science !== false && (
                    <td className="mono">
                      {space.done}/{space.total}
                      {space.arrives !== null && ` · arrives turn ${space.arrives}`}
                    </td>
                  )}
                  {s.culture !== false && (
                    <td
                      className="mono"
                      title={[
                        `${domesticTourists(ctx, state, p)} domestic tourists, tourism ${perTurn(state.players[p]!.tourismRate)}`,
                        ...culture.map(
                          (c) =>
                            `${civName(content, state, c.player)}: ${c.visiting} visiting vs ${c.domestic} at home`,
                        ),
                      ].join('\n')}
                    >
                      {ahead}/{culture.length}
                    </td>
                  )}
                  {s.religion !== false && (
                    <td className="mono">
                      {religion
                        ? `${won}/${faith.length} · ${state.religions[religion]?.name ?? ''}`
                        : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <ul className="hint victory-notes">
          {s.domination !== false && <li>Domination: hold every rival’s original capital.</li>}
          {s.science !== false && (
            <li>
              Science: build a Spaceport and finish the space projects in order; the last one
              arrives {ctx.content.rules.science.travelTurns} turns later.
            </li>
          )}
          {s.culture !== false && (
            <li>
              Culture: tourism (from wonders, museums, broadcast centers…) brings visitors from
              every civ you’ve met; win when they outnumber each civ’s own tourists (its culture
              ever earned). Hover a number for details.
            </li>
          )}
          {s.religion !== false && (
            <li>Religion: your religion followed in most settlements of every other civ.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
