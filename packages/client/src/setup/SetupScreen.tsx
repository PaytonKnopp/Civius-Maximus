import { type CompiledContent, resolveText } from '@cx/content';
import { useEffect, useMemo, useState } from 'react';
import { Kit } from '../game/Diplomacy';
import { Icon } from '../ui/Icon';
import { LeaderCard, LeaderHead, leaderArt } from '../ui/LeaderCard';
import {
  loadPresets,
  type NewGameOptions,
  PRESETS,
  type Preset,
  randomSeed,
  savePresets,
  type SeatPick,
} from './options';

/**
 * The game setup screen (docs/02-multiplayer.md, "Game setup"), like Civ's: Basic for a quick
 * start (your leader, the map, difficulty, speed, rivals) and Advanced for everything (every
 * seat's leader, team and difficulty; the map; start era; every rule; presets). Rivals left on
 * "Random" get a leader nobody else picked.
 */

interface Props {
  content: CompiledContent;
  initial: NewGameOptions;
  onCancel: () => void;
  onStart: (o: NewGameOptions) => void;
}

function byOrder<T extends { id: string; order: number }>(map: Record<string, T>): T[] {
  return Object.values(map).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

export function SetupScreen({ content, initial, onCancel, onStart }: Props) {
  const [o, setO] = useState<NewGameOptions>({ ...initial, seed: randomSeed() });
  const [tab, setTab] = useState<'basic' | 'advanced'>('basic');
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [presetName, setPresetName] = useState('');
  const [picking, setPicking] = useState<number | null>(null);
  const t = (text: string) => resolveText(content, text);
  const e = content.entities;
  const leaders = useMemo(
    () =>
      Object.keys(e.leader).sort((a, b) =>
        t(e.leader[a]!.name).localeCompare(t(e.leader[b]!.name)),
      ),
    [content],
  );
  const sizes = byOrder(e.mapSize);
  const speeds = byOrder(e.gameSpeed);
  const difficulties = byOrder(e.difficulty);
  const eras = byOrder(e.era);
  const seats = o.humans.length + o.rivals;
  const pick = (i: number): SeatPick => o.picks?.[i] ?? {};
  const setPick = (i: number, patch: { [K in keyof SeatPick]?: SeatPick[K] | undefined }) => {
    const merged: Record<string, unknown> = { ...pick(i), ...patch };
    for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
    setO({ ...o, picks: { ...o.picks, [i]: merged as SeatPick } });
  };
  const takenBy = (leader: string) =>
    Object.entries(o.picks ?? {}).find(([i, p]) => p.leader === leader && Number(i) < seats)?.[0];
  const mine = pick(0).leader;
  const canStart = seats >= 2 && seats <= 16;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      if (picking !== null) setPicking(null);
      else onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, picking]);

  const applyPreset = (p: Preset) =>
    setO({ ...o, ...p.options, humans: p.options.humans ?? o.humans, seed: randomSeed() });

  const select = <K extends keyof NewGameOptions>(
    key: K,
    label: string,
    options: [string, string][],
  ) => (
    <label className="setup-field">
      <span>{label}</span>
      <select
        value={String(o[key] ?? '')}
        onChange={(ev) => setO({ ...o, [key]: ev.target.value })}
        aria-label={label}
      >
        {options.map(([v, name]) => (
          <option key={v} value={v}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  const toggle = (key: keyof NewGameOptions, label: string, hint: string) => (
    <label className="check setup-check" title={hint}>
      <input
        type="checkbox"
        checked={o[key] === true}
        onChange={(ev) => setO({ ...o, [key]: ev.target.checked })}
      />
      <span>
        {label}
        <small>{hint}</small>
      </span>
    </label>
  );

  const scriptDesc = e.mapScript[o.script]?.description;
  const diff = e.difficulty[o.difficulty];
  const speed = e.gameSpeed[o.speed];

  return (
    <div className="screen setup-screen" role="dialog" aria-label="New game">
      <header className="screen-head">
        <h2>
          <Icon name="settings" size={30} />
          New Game
        </h2>
        <div className="segmented tabs" role="tablist">
          {(['basic', 'advanced'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={tab === k ? 'on' : ''}
              onClick={() => setTab(k)}
            >
              {k === 'basic' ? 'Basic' : 'Advanced'}
            </button>
          ))}
        </div>
        <p className="screen-sub">
          {o.humans.length > 1
            ? `Hotseat: ${o.humans.length} players pass the device`
            : 'Single player'}{' '}
          · {seats} civilizations
        </p>
        <button type="button" className="close" onClick={onCancel} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="setup-body">
        <aside className="setup-leader">
          <h3>Your leader</h3>
          {mine ? (
            <LeaderCard content={content} leader={mine} size={200} />
          ) : (
            <div className="random-leader">
              <span>?</span>
              <strong>Random leader</strong>
            </div>
          )}
          <button type="button" onClick={() => setPicking(0)}>
            Choose leader…
          </button>
          {mine && <Kit ctx={{ content }} civ={e.leader[mine]!.civ} leader={mine} open />}
        </aside>

        <section className="setup-main">
          {tab === 'basic' ? (
            <>
              <div className="setup-grid">
                {select(
                  'script',
                  'Map type',
                  content.ids.mapScript.map((id) => [id, t(e.mapScript[id]!.name)]),
                )}
                <label className="setup-field">
                  <span>Map size</span>
                  <select
                    value={o.size}
                    onChange={(ev) =>
                      setO({
                        ...o,
                        size: ev.target.value,
                        rivals: Math.max(1, e.mapSize[ev.target.value]!.players - o.humans.length),
                      })
                    }
                  >
                    {sizes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {t(s.name)} ({s.players} civs)
                      </option>
                    ))}
                  </select>
                </label>
                {select(
                  'difficulty',
                  'Difficulty',
                  difficulties.map((d) => [d.id, t(d.name)]),
                )}
                {select(
                  'speed',
                  'Game speed',
                  speeds.map((s) => [s.id, t(s.name)]),
                )}
                <label className="setup-field">
                  <span>AI rivals</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={o.rivals}
                    onChange={(ev) =>
                      setO({
                        ...o,
                        rivals: Math.max(0, Math.min(15, Number(ev.target.value) || 0)),
                      })
                    }
                  />
                </label>
                {select(
                  'startEra',
                  'Start era',
                  eras.map((era) => [era.id, t(era.name)]),
                )}
              </div>
              <ul className="setup-notes">
                {scriptDesc && <li>{t(scriptDesc)}</li>}
                {diff?.description && (
                  <li>
                    <strong>{t(diff.name)}:</strong> {t(diff.description)}
                  </li>
                )}
                {speed?.description && (
                  <li>
                    <strong>{t(speed.name)}:</strong> {t(speed.description)}
                  </li>
                )}
              </ul>
              <h4>Presets</h4>
              <div className="preset-list">
                {[...PRESETS, ...presets].map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="preset"
                    onClick={() => applyPreset(p)}
                    title={p.description}
                  >
                    <strong>{p.name}</strong>
                    <small>{p.description}</small>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h4>Players</h4>
              <table className="seats">
                <thead>
                  <tr>
                    <th>Seat</th>
                    <th>Leader</th>
                    <th>Team</th>
                    <th>Difficulty</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: seats }, (_, i) => {
                    const human = i < o.humans.length;
                    const p = pick(i);
                    return (
                      <tr key={i}>
                        <td>
                          {human ? (
                            <input
                              aria-label={`Player ${i + 1} name`}
                              value={o.humans[i]}
                              maxLength={24}
                              onChange={(ev) =>
                                setO({
                                  ...o,
                                  humans: o.humans.map((n, k) => (k === i ? ev.target.value : n)),
                                })
                              }
                            />
                          ) : (
                            <span className="muted">AI {i - o.humans.length + 1}</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="seat-leader"
                            onClick={() => setPicking(i)}
                          >
                            {p.leader ? (
                              <>
                                <LeaderHead content={content} leader={p.leader} size={26} />
                                {t(e.leader[p.leader]!.name)}
                              </>
                            ) : (
                              'Random'
                            )}
                          </button>
                        </td>
                        <td>
                          <select
                            aria-label={`Seat ${i + 1} team`}
                            value={p.team ?? ''}
                            onChange={(ev) =>
                              setPick(i, {
                                team: ev.target.value === '' ? undefined : Number(ev.target.value),
                              })
                            }
                          >
                            <option value="">None</option>
                            {[1, 2, 3, 4].map((n) => (
                              <option key={n} value={n}>
                                Team {n}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {human ? (
                            <span className="muted">—</span>
                          ) : (
                            <select
                              aria-label={`Seat ${i + 1} difficulty`}
                              value={p.difficulty ?? ''}
                              onChange={(ev) =>
                                setPick(i, { difficulty: ev.target.value || undefined })
                              }
                            >
                              <option value="">Game ({t(diff?.name ?? '')})</option>
                              {difficulties.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {t(d.name)}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td>
                          {(human ? o.humans.length > 1 : true) && (
                            <button
                              type="button"
                              className="ghost small"
                              aria-label={`Remove seat ${i + 1}`}
                              onClick={() => {
                                // Shift later seats' picks down by one.
                                const picks: Record<number, SeatPick> = {};
                                for (let k = 0; k < seats; k++) {
                                  if (k === i) continue;
                                  const v = o.picks?.[k];
                                  if (v) picks[k > i ? k - 1 : k] = v;
                                }
                                setO(
                                  human
                                    ? { ...o, humans: o.humans.filter((_, k) => k !== i), picks }
                                    : { ...o, rivals: o.rivals - 1, picks },
                                );
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="seat-actions">
                <button
                  type="button"
                  className="ghost small"
                  disabled={seats >= 16}
                  onClick={() => {
                    // A new human goes after the other humans: AI picks move down one.
                    const picks: Record<number, SeatPick> = {};
                    for (let k = 0; k < seats; k++) {
                      const v = o.picks?.[k];
                      if (v) picks[k >= o.humans.length ? k + 1 : k] = v;
                    }
                    setO({ ...o, humans: [...o.humans, `Player ${o.humans.length + 1}`], picks });
                  }}
                >
                  + Human (hotseat)
                </button>
                <button
                  type="button"
                  className="ghost small"
                  disabled={seats >= 16}
                  onClick={() => setO({ ...o, rivals: o.rivals + 1 })}
                >
                  + AI rival
                </button>
              </div>

              <h4>Map</h4>
              <div className="setup-grid">
                {select(
                  'script',
                  'Map type',
                  content.ids.mapScript.map((id) => [id, t(e.mapScript[id]!.name)]),
                )}
                {select(
                  'size',
                  'Map size',
                  sizes.map((s) => [s.id, `${t(s.name)} (${s.players} civs)`]),
                )}
                {select('resources', 'Resources', [
                  ['sparse', 'Sparse'],
                  ['standard', 'Standard'],
                  ['abundant', 'Abundant'],
                ])}
                {select('age', 'World age', [
                  ['standard', 'Standard'],
                  ['new', 'New (more mountains and hills)'],
                  ['old', 'Old (worn down, flatter)'],
                ])}
                {select('temperature', 'Temperature', [
                  ['standard', 'Temperate'],
                  ['cool', 'Cool (more tundra and snow)'],
                  ['hot', 'Hot (more desert and jungle)'],
                ])}
                {select('rainfall', 'Rainfall', [
                  ['standard', 'Standard'],
                  ['arid', 'Arid (dry, fewer woods)'],
                  ['wet', 'Wet (lush, more woods and marsh)'],
                ])}
                {select('seaLevel', 'Sea level', [
                  ['standard', 'Standard'],
                  ['low', 'Low (more land)'],
                  ['high', 'High (more ocean)'],
                ])}
                {select('startBalance', 'Start positions', [
                  ['normal', 'Standard'],
                  ['balanced', 'Balanced (fair starts)'],
                ])}
                <label className="setup-field">
                  <span>Map seed</span>
                  <span className="seed-row">
                    <input
                      value={o.seed}
                      onChange={(ev) => setO({ ...o, seed: ev.target.value })}
                      aria-label="Map seed"
                    />
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => setO({ ...o, seed: randomSeed() })}
                    >
                      New
                    </button>
                  </span>
                </label>
              </div>
              {toggle('wrapX', 'Wrap east–west', 'The map is a cylinder, like a globe.')}

              <h4>Rules</h4>
              <div className="setup-grid">
                {select(
                  'difficulty',
                  'Difficulty',
                  difficulties.map((d) => [d.id, t(d.name)]),
                )}
                {select(
                  'speed',
                  'Game speed',
                  speeds.map((s) => [s.id, t(s.name)]),
                )}
                {select(
                  'startEra',
                  'Start era',
                  eras.map((era) => [era.id, t(era.name)]),
                )}
                <label className="setup-field">
                  <span>Turn limit</span>
                  <select
                    value={o.turnLimit ?? ''}
                    onChange={(ev) =>
                      setO({ ...o, turnLimit: ev.target.value ? Number(ev.target.value) : null })
                    }
                  >
                    <option value="">None</option>
                    {[60, 100, 150, 200, 250, 330, 500].map((n) => (
                      <option key={n} value={n}>
                        {n} turns
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="setup-toggles">
                {toggle('camps', 'Hostile camps', 'Raider camps that spawn units until cleared.')}
                {toggle('cityStates', 'City-states', 'Minor powers to win over with envoys.')}
                {toggle('domination', 'Domination victory', "Hold every rival's original capital.")}
                {toggle(
                  'religion',
                  'Religious victory',
                  'Your religion followed in most settlements of every other civ.',
                )}
                {toggle(
                  'science',
                  'Science victory',
                  'Build a spaceport and finish the space projects.',
                )}
                {toggle(
                  'culture',
                  'Culture victory',
                  'Attract more visiting tourists than any civ has at home.',
                )}
                {toggle(
                  'diplomatic',
                  'Diplomatic victory',
                  'Win the most diplomatic victory points in the World Congress.',
                )}
                {toggle(
                  'congress',
                  'World Congress',
                  'Sessions every few turns vote on resolutions; favor buys votes.',
                )}
                {toggle(
                  'disasters',
                  'Climate and disasters',
                  'Floods, storms, droughts and eruptions; emissions raise the seas.',
                )}
                {toggle(
                  'nukes',
                  'Nuclear weapons',
                  'Atomic Bombs and Nuclear Missiles in the late game.',
                )}
                {toggle(
                  'espionage',
                  'Espionage',
                  'Spies that guard your settlements or work against others.',
                )}
                {toggle(
                  'loyalty',
                  'Loyalty',
                  'Settlements far from home and close to a rival can break away as free cities.',
                )}
              </div>

              <h4>Presets</h4>
              <div className="preset-list">
                {[...PRESETS, ...presets].map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="preset"
                    onClick={() => applyPreset(p)}
                    title={p.description}
                  >
                    <strong>{p.name}</strong>
                    <small>{p.description}</small>
                  </button>
                ))}
              </div>
              <div className="seed-row">
                <input
                  placeholder="Name this setup…"
                  value={presetName}
                  maxLength={32}
                  onChange={(ev) => setPresetName(ev.target.value)}
                  aria-label="Preset name"
                />
                <button
                  type="button"
                  disabled={!presetName.trim()}
                  onClick={() => {
                    const rest: Partial<NewGameOptions> = { ...o };
                    delete rest.seed;
                    const next = [
                      ...presets.filter((p) => p.name !== presetName.trim()),
                      { name: presetName.trim(), description: 'Saved setup', options: rest },
                    ];
                    setPresets(next);
                    savePresets(next);
                    setPresetName('');
                  }}
                >
                  Save preset
                </button>
              </div>
            </>
          )}
          <div className="setup-start">
            {!canStart && <span className="muted">A game needs 2–16 civilizations.</span>}
            <button
              type="button"
              className="primary big"
              disabled={!canStart}
              onClick={() => onStart(o)}
            >
              Start game
            </button>
          </div>
        </section>
      </div>

      {picking !== null && (
        <div
          className="modal-backdrop leader-backdrop"
          role="presentation"
          onClick={() => setPicking(null)}
        >
          <div
            className="leader-picker"
            role="dialog"
            aria-label="Choose a leader"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3>Choose a leader{picking > 0 ? ` for seat ${picking + 1}` : ''}</h3>
            <div className="leader-grid">
              <button
                type="button"
                className={`leader-option ${pick(picking).leader ? '' : 'on'}`}
                onClick={() => {
                  setPick(picking, { leader: undefined });
                  setPicking(null);
                }}
              >
                <span className="random-head">?</span>
                <strong>Random</strong>
                <small>Any leader nobody picked</small>
              </button>
              {leaders.map((id) => {
                const art = leaderArt(content, id);
                const taken = takenBy(id);
                const busy = taken !== undefined && Number(taken) !== picking;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`leader-option ${pick(picking).leader === id ? 'on' : ''}`}
                    disabled={busy}
                    title={busy ? `Seat ${Number(taken) + 1} has this leader` : art.title}
                    onClick={() => {
                      setPick(picking, { leader: id });
                      setPicking(null);
                    }}
                  >
                    <LeaderHead content={content} leader={id} size={64} />
                    <strong>{art.name}</strong>
                    <small>{art.civName}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
