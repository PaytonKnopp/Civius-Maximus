import { resolveText } from '@cx/content';
import {
  type Action,
  type EngineContext,
  type GameState,
  missionChance,
  missionProblem,
  type PlayerId,
  spiesOf,
  spyCapacity,
  spyTargets,
  travelTurns,
} from '@cx/engine';
import { useEffect } from 'react';
import { Icon } from '../ui/Icon';
import { civName } from './model';

/**
 * Espionage (docs/04-advanced-systems.md, "Espionage"): your spies, where they are and what
 * they're doing; send one somewhere, pick a mission (its chance shown), or call it home.
 */
export function EspionageScreen({
  ctx,
  state,
  viewer,
  act,
  onClose,
}: {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  act: (action: Action) => boolean;
  onClose: () => void;
}) {
  const { content } = ctx;
  const t = (text: string) => resolveText(content, text);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const spies = spiesOf(state, viewer);
  const capacity = spyCapacity(ctx, state, viewer);
  const targets = spyTargets(state, viewer);
  const p = state.players[viewer]!;
  const nextCivic = content.rules.espionage.capacityCivics.find((c) => !p.civics.done.includes(c));
  const owner = (id: PlayerId) => (id === viewer ? 'yours' : civName(content, state, id));

  return (
    <div className="screen espionage-screen" role="dialog" aria-label="Espionage">
      <header className="screen-head">
        <h2>
          <Icon name="spy" size={30} />
          Espionage
        </h2>
        <p className="screen-sub">
          {spies.length} {spies.length === 1 ? 'spy' : 'spies'} (room for {capacity}).{' '}
          {nextCivic
            ? `${t(content.entities.civic[nextCivic]?.name ?? nextCivic)} brings another.`
            : 'You have every spy you can.'}
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="espionage-body">
        {spies.length === 0 && (
          <p className="hint">
            No spies yet. Your first comes with{' '}
            {t(
              content.entities.civic[content.rules.espionage.capacityCivics[0] ?? '']?.name ??
                'a civic',
            )}
            . Spies guard your settlements or work against others: stealing gold and plans,
            sabotage, stirring unrest. Each mission shows its chance; a spy whose mission fails may
            be caught, and a caught spy angers its victim.
          </p>
        )}
        {spies.map(([id, spy]) => {
          const s = spy.at ? state.settlements[spy.at] : undefined;
          const arrived = spy.arrives <= state.turn;
          const def = spy.mission ? content.entities.spyMission[spy.mission.id] : undefined;
          const status = !s
            ? arrived
              ? 'At home, ready'
              : `Coming home (turn ${spy.arrives})`
            : !arrived
              ? `On the way to ${s.name} (arrives turn ${spy.arrives})`
              : def
                ? def.turns === 0
                  ? `${t(def.name)} in ${s.name}`
                  : `${t(def.name)} in ${s.name}: done turn ${spy.mission!.done}`
                : `In ${s.name}, waiting for orders`;
          return (
            <article key={id} className="spy-card">
              <header>
                <Icon name="spy" size={36} />
                <div>
                  <h3>{spy.name}</h3>
                  <p className="spy-rank">
                    Rank {spy.rank} · {spy.successes} mission{spy.successes === 1 ? '' : 's'} done
                  </p>
                </div>
              </header>
              <p className="spy-status">{status}</p>
              <label className="setup-field">
                <span>Send to</span>
                <select
                  value=""
                  onChange={(e) =>
                    e.target.value &&
                    act({ type: 'send_spy', player: viewer, spy: id, settlement: e.target.value })
                  }
                >
                  <option value="">Choose a settlement…</option>
                  {targets
                    .filter((x) => x.id !== spy.at)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} ({owner(x.owner)}) · {travelTurns(ctx, state, viewer, x)} turn
                        {travelTurns(ctx, state, viewer, x) === 1 ? '' : 's'}
                      </option>
                    ))}
                </select>
              </label>
              {s && arrived && (
                <ul className="spy-missions">
                  {content.ids.spyMission.map((m) => {
                    const mission = content.entities.spyMission[m]!;
                    if ((mission.target === 'own') !== (s.owner === viewer)) return null;
                    const problem = missionProblem(ctx, state, viewer, id, m);
                    const chance = missionChance(ctx, state, spy, mission, s);
                    return (
                      <li key={m} className={problem ? 'locked' : 'open'}>
                        <div>
                          <strong>{t(mission.name)}</strong>
                          <span>{t(mission.description)}</span>
                          <small>
                            {mission.turns === 0
                              ? 'Ongoing'
                              : `${mission.turns} turns · ${chance}% chance`}
                            {problem ? ` · ${problem.message}` : ''}
                          </small>
                        </div>
                        <button
                          type="button"
                          className="ghost small"
                          disabled={!!problem}
                          onClick={() =>
                            act({ type: 'start_spy_mission', player: viewer, spy: id, mission: m })
                          }
                        >
                          Start
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {s && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => act({ type: 'recall_spy', player: viewer, spy: id })}
                >
                  Call home
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
