import { type CompiledContent, resolveText } from '@cx/content';
import { useMemo, useState } from 'react';
import { Emblem } from '../ui/Emblem';
import { LeaderDetail, LeaderPicker } from '../ui/LeaderPicker';
import { LeaderHead, leaderArt } from '../ui/LeaderCard';
import { Choice, MenuScreen, Row, Section, Switch } from '../ui/Menu';
import { MapPreview } from './MapPreview';
import {
  loadPresets,
  type NewGameOptions,
  PRESETS,
  type Preset,
  randomSeed,
  savePresets,
  type SeatPick,
} from './options';
import { CLASH, colorDistance, colorName, PALETTE } from './palette';

/**
 * The game setup (docs/02-multiplayer.md, "Game setup"), like Civ's but easier to read: three
 * pages. Players: every seat's leader (with what makes them special), color, team and difficulty.
 * World: the map type and size with a live preview of the exact map. Rules: pace, victories and
 * the systems in play. A bar at the bottom always shows the game you are about to start.
 */

interface Props {
  content: CompiledContent;
  initial: NewGameOptions;
  onCancel: () => void;
  onStart: (o: NewGameOptions) => void;
}

type Page = 'players' | 'world' | 'rules';

const MAX_SEATS = 16;
const TEAMS = [1, 2, 3, 4];
const TEAM_COLORS = ['#d9b232', '#3f9fdc', '#c4429d', '#2f9a55'];

function byOrder<T extends { id: string; order: number }>(map: Record<string, T>): T[] {
  return Object.values(map).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

export function SetupScreen({ content, initial, onCancel, onStart }: Props) {
  const [o, setO] = useState<NewGameOptions>({ ...initial, seed: randomSeed() });
  const [page, setPage] = useState<Page>('players');
  const [selected, setSelected] = useState(0);
  const [picking, setPicking] = useState<number | null>(null);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [presetName, setPresetName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // The map is being made for the latest settings (it checks the map can fit every civ).
  const [checking, setChecking] = useState(true);
  const t = (text: string) => resolveText(content, text);
  const e = content.entities;
  const sizes = byOrder(e.mapSize);
  const speeds = byOrder(e.gameSpeed);
  const difficulties = byOrder(e.difficulty);
  const eras = byOrder(e.era);
  const seats = o.humans.length + o.rivals;
  const humanCount = o.humans.length;
  const pick = (i: number): SeatPick => o.picks?.[i] ?? {};
  const setPick = (i: number, patch: { [K in keyof SeatPick]?: SeatPick[K] | undefined }) => {
    const merged: Record<string, unknown> = { ...pick(i), ...patch };
    for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
    setO((cur) => ({ ...cur, picks: { ...cur.picks, [i]: merged as SeatPick } }));
  };
  const sel = Math.min(selected, seats - 1);
  const seatName = (i: number) =>
    i < humanCount ? o.humans[i]!.trim() || `Player ${i + 1}` : `AI ${i - humanCount + 1}`;

  // Which seat has each leader, and every seat's color as it will look.
  const takenBy = (except: number) => {
    const out: Record<string, string> = {};
    for (let i = 0; i < seats; i++) {
      const l = pick(i).leader;
      if (l && i !== except) out[l] = seatName(i);
    }
    return out;
  };
  const colorOfSeat = (i: number): string | null => {
    const p = pick(i);
    if (p.color) return p.color;
    return p.leader ? leaderArt(content, p.leader).primary : null;
  };
  const seatColors = useMemo(
    () => Array.from({ length: seats }, (_, i) => colorOfSeat(i)),
    [o.picks, seats, content],
  );
  const clashes = useMemo(() => {
    const out = new Map<number, number>();
    for (let i = 0; i < seats; i++)
      for (let j = 0; j < i; j++) {
        const a = seatColors[i];
        const b = seatColors[j];
        if (a && b && colorDistance(a, b) < CLASH && !out.has(i)) out.set(i, j);
      }
    return out;
  }, [seatColors, seats]);
  const fixColors = () => {
    const used: string[] = [];
    const picks: Record<number, SeatPick> = { ...o.picks };
    for (let i = 0; i < seats; i++) {
      const own = seatColors[i];
      if (own && !used.some((u) => colorDistance(u, own) < CLASH)) {
        used.push(own);
        continue;
      }
      const free = PALETTE.find((p) => !used.some((u) => colorDistance(u, p.color) < CLASH));
      if (free) {
        picks[i] = { ...(picks[i] ?? {}), color: free.color };
        used.push(free.color);
      } else if (own) used.push(own);
    }
    setO({ ...o, picks });
  };

  const canStart = seats >= 2 && seats <= MAX_SEATS && !problem && !checking;
  const applyPreset = (p: Preset) =>
    setO({ ...o, ...p.options, humans: p.options.humans ?? o.humans, seed: randomSeed() });

  const size = e.mapSize[o.size];
  const diff = e.difficulty[o.difficulty];
  const speed = e.gameSpeed[o.speed];
  const victories = [o.domination, o.science, o.culture, o.religion, o.diplomatic].filter(Boolean);

  const removeSeat = (i: number) => {
    const human = i < humanCount;
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
    setSelected(Math.max(0, Math.min(sel, seats - 2)));
  };
  const addHuman = () => {
    const picks: Record<number, SeatPick> = {};
    for (let k = 0; k < seats; k++) {
      const v = o.picks?.[k];
      if (v) picks[k >= humanCount ? k + 1 : k] = v;
    }
    setO({ ...o, humans: [...o.humans, `Player ${humanCount + 1}`], picks });
    setSelected(humanCount);
  };
  const addRival = () => {
    setO({ ...o, rivals: o.rivals + 1 });
    setSelected(seats);
  };

  const mapSettings = {
    script: o.script,
    size: o.size,
    wrapX: o.wrapX,
    resources: o.resources,
    startBalance: o.startBalance ?? 'normal',
    ...(o.age && o.age !== 'standard' ? { age: o.age } : {}),
    ...(o.temperature && o.temperature !== 'standard' ? { temperature: o.temperature } : {}),
    ...(o.rainfall && o.rainfall !== 'standard' ? { rainfall: o.rainfall } : {}),
    ...(o.seaLevel && o.seaLevel !== 'standard' ? { seaLevel: o.seaLevel } : {}),
  };

  const tog = (key: keyof NewGameOptions, label: string, hint: string) => (
    <Switch
      label={label}
      hint={hint}
      checked={o[key] === true}
      onChange={(on) => setO({ ...o, [key]: on })}
    />
  );

  // --- Pages ---------------------------------------------------------------------------------

  const playersPage = (
    <div className="mx-players">
      <div className="mx-seats">
        <div className="mx-seats-head">
          <h3>Civilizations</h3>
          <span className={`mx-chip ${seats > (size?.players ?? 99) ? '' : 'gold'}`}>
            {seats} of {size?.players ?? '?'} for a {size ? t(size.name) : ''} map
          </span>
        </div>
        <ul className="mx-seat-list">
          {Array.from({ length: seats }, (_, i) => {
            const p = pick(i);
            const human = i < humanCount;
            const art = p.leader ? leaderArt(content, p.leader) : null;
            const color = seatColors[i];
            return (
              <li key={i}>
                <button
                  type="button"
                  className={`mx-seat ${i === sel ? 'on' : ''}`}
                  style={{ ['--seat' as string]: color ?? '#59687a' }}
                  onClick={() => setSelected(i)}
                  aria-current={i === sel}
                >
                  {art ? (
                    <LeaderHead content={content} leader={p.leader!} size={46} />
                  ) : (
                    <span className="mx-random-head small">?</span>
                  )}
                  <span className="mx-seat-text">
                    <strong>{seatName(i)}</strong>
                    <small>
                      {art ? `${art.name} · ${art.civName}` : 'Random leader'}
                      {!human && ' · AI'}
                    </small>
                  </span>
                  {p.team !== undefined && (
                    <span
                      className="mx-team"
                      style={{ background: TEAM_COLORS[(p.team - 1) % TEAM_COLORS.length] }}
                      title={`Team ${p.team}: teammates share a victory`}
                    >
                      {p.team}
                    </span>
                  )}
                  {clashes.has(i) && (
                    <span
                      className="mx-warn"
                      title={`This color looks a lot like ${seatName(clashes.get(i)!)}’s`}
                    >
                      !
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mx-seat-actions">
          <button type="button" disabled={seats >= MAX_SEATS} onClick={addRival}>
            + AI rival
          </button>
          <button
            type="button"
            className="ghost"
            disabled={seats >= MAX_SEATS}
            onClick={addHuman}
            title="Another person on this device: players take turns"
          >
            + Human (hotseat)
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setO({ ...o, picks: {} })}
            title="Back to random leaders, colors and teams for everyone"
          >
            Reset seats
          </button>
        </div>
        {clashes.size > 0 && (
          <p className="mx-clash">
            Some colors look alike on the map.{' '}
            <button type="button" className="ghost small" onClick={fixColors}>
              Fix the colors
            </button>
          </p>
        )}
      </div>

      <div className="mx-seat-detail">
        <SeatDetail
          key={sel}
          content={content}
          seat={sel}
          name={seatName(sel)}
          human={sel < humanCount}
          editableName={sel < humanCount ? o.humans[sel]! : undefined}
          pick={pick(sel)}
          seatColor={seatColors[sel] ?? null}
          difficultyName={diff ? t(diff.name) : ''}
          difficulties={difficulties.map((d) => ({ id: d.id, name: t(d.name) }))}
          canRemove={sel < humanCount ? humanCount > 1 : true}
          onName={(name) => setO({ ...o, humans: o.humans.map((n, k) => (k === sel ? name : n)) })}
          onChange={(patch) => setPick(sel, patch)}
          onChooseLeader={() => setPicking(sel)}
          onRemove={() => removeSeat(sel)}
        />
      </div>
    </div>
  );

  const worldPage = (
    <div className="mx-world">
      <div className="mx-world-main">
        <Section title="Map type" hint={t(e.mapScript[o.script]?.description ?? '')}>
          <div className="mx-cards">
            {content.ids.mapScript.map((id) => (
              <button
                key={id}
                type="button"
                className={`mx-card ${o.script === id ? 'on' : ''}`}
                aria-pressed={o.script === id}
                onClick={() => setO({ ...o, script: id })}
                title={t(e.mapScript[id]!.description ?? '')}
              >
                <strong>{t(e.mapScript[id]!.name)}</strong>
              </button>
            ))}
          </div>
        </Section>
        <Section
          title="Map size"
          hint={
            size
              ? `${size.width} × ${size.height} tiles, room for about ${size.players} civilizations and ${size.cityStates} city-states.`
              : undefined
          }
        >
          <Choice
            label="Map size"
            value={o.size}
            options={sizes.map((s) => ({
              value: s.id,
              label: (
                <>
                  {t(s.name)} <small>{s.players}</small>
                </>
              ),
              title: `${t(s.name)}: ${s.width} × ${s.height}, about ${s.players} civilizations`,
            }))}
            onChange={(id) =>
              setO({
                ...o,
                size: id,
                rivals: Math.max(1, (e.mapSize[id]?.players ?? 4) - humanCount),
              })
            }
          />
        </Section>
        <Section title="The world">
          <Row label="Resources" hint="How many strategic and luxury resources the map holds.">
            <Choice
              label="Resources"
              value={o.resources}
              options={[
                { value: 'sparse', label: 'Sparse' },
                { value: 'standard', label: 'Standard' },
                { value: 'abundant', label: 'Abundant' },
              ]}
              onChange={(resources) => setO({ ...o, resources })}
            />
          </Row>
          <Row label="Start positions" hint="Balanced gives every civ a similar start.">
            <Choice
              label="Start positions"
              value={o.startBalance ?? 'normal'}
              options={[
                { value: 'normal', label: 'Standard' },
                { value: 'balanced', label: 'Balanced' },
              ]}
              onChange={(startBalance) => setO({ ...o, startBalance })}
            />
          </Row>
          <Row label="World age" hint="New: more mountains and hills. Old: worn down and flatter.">
            <Choice
              label="World age"
              value={o.age ?? 'standard'}
              options={[
                { value: 'new', label: 'New' },
                { value: 'standard', label: 'Standard' },
                { value: 'old', label: 'Old' },
              ]}
              onChange={(age) => setO({ ...o, age })}
            />
          </Row>
          <Row label="Temperature" hint="Cool: more tundra and snow. Hot: more desert and jungle.">
            <Choice
              label="Temperature"
              value={o.temperature ?? 'standard'}
              options={[
                { value: 'cool', label: 'Cool' },
                { value: 'standard', label: 'Temperate' },
                { value: 'hot', label: 'Hot' },
              ]}
              onChange={(temperature) => setO({ ...o, temperature })}
            />
          </Row>
          <Row label="Rainfall" hint="Arid: dry, fewer woods. Wet: lush, more woods and marsh.">
            <Choice
              label="Rainfall"
              value={o.rainfall ?? 'standard'}
              options={[
                { value: 'arid', label: 'Arid' },
                { value: 'standard', label: 'Standard' },
                { value: 'wet', label: 'Wet' },
              ]}
              onChange={(rainfall) => setO({ ...o, rainfall })}
            />
          </Row>
          <Row label="Sea level" hint="Low: more land. High: more ocean.">
            <Choice
              label="Sea level"
              value={o.seaLevel ?? 'standard'}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'standard', label: 'Standard' },
                { value: 'high', label: 'High' },
              ]}
              onChange={(seaLevel) => setO({ ...o, seaLevel })}
            />
          </Row>
          {tog(
            'wrapX',
            'Wrap east–west',
            'The map is a cylinder, like a globe: sail off one edge and arrive at the other.',
          )}
        </Section>
      </div>
      <aside className="mx-world-side">
        <div className="mx-panel">
          <div className="mx-preview-head">
            <h3>Preview</h3>
            <span className="mx-chip">Seed {o.seed}</span>
          </div>
          <MapPreview
            content={content}
            settings={mapSettings}
            seed={o.seed}
            seatColors={seatColors}
            onProblem={setProblem}
            onBusy={setChecking}
          />
          {problem && (
            <p className="mx-problem" role="alert">
              {problem}
            </p>
          )}
          <div className="mx-preview-tools">
            <button type="button" onClick={() => setO({ ...o, seed: randomSeed() })}>
              <span aria-hidden="true">↻</span> New world
            </button>
            <input
              aria-label="Map seed"
              value={o.seed}
              maxLength={32}
              spellCheck={false}
              onChange={(ev) => setO({ ...o, seed: ev.target.value })}
            />
          </div>
          <p className="mx-section-hint">
            Dots are where each civilization starts. The same seed always makes the same world, so
            share it with a friend to play the same map.
          </p>
        </div>
      </aside>
    </div>
  );

  const rulesPage = (
    <div className="mx-rules">
      <Section title="Pace and challenge">
        <Row
          label="Difficulty"
          hint={diff?.description ? t(diff.description) : 'How strong the AI rivals are.'}
        >
          <Choice
            label="Difficulty"
            className="wrap"
            value={o.difficulty}
            options={difficulties.map((d) => ({
              value: d.id,
              label: t(d.name),
              title: d.description ? t(d.description) : '',
            }))}
            onChange={(difficulty) => setO({ ...o, difficulty })}
          />
        </Row>
        <Row
          label="Game speed"
          hint={speed?.description ? t(speed.description) : 'How long everything takes.'}
        >
          <Choice
            label="Game speed"
            className="wrap"
            value={o.speed}
            options={speeds.map((s) => ({
              value: s.id,
              label: t(s.name),
              title: s.description ? t(s.description) : '',
            }))}
            onChange={(speedId) => setO({ ...o, speed: speedId })}
          />
        </Row>
        <Row
          label="Start era"
          hint="Begin later in history, with that era’s technologies and units already yours."
        >
          <select
            aria-label="Start era"
            value={o.startEra ?? 'era_ancient'}
            onChange={(ev) => setO({ ...o, startEra: ev.target.value })}
          >
            {eras.map((era) => (
              <option key={era.id} value={era.id}>
                {t(era.name)}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Turn limit" hint="The game ends on this turn and the highest score wins.">
          <select
            aria-label="Turn limit"
            value={o.turnLimit ?? ''}
            onChange={(ev) =>
              setO({ ...o, turnLimit: ev.target.value ? Number(ev.target.value) : null })
            }
          >
            <option value="">No limit (the speed’s own)</option>
            {[60, 100, 150, 200, 250, 330, 500].map((n) => (
              <option key={n} value={n}>
                {n} turns
              </option>
            ))}
          </select>
        </Row>
      </Section>
      <Section
        title="Ways to win"
        hint={`${victories.length} of 5 on. With all of them off, the game runs to the turn limit and the best score wins.`}
      >
        {tog('domination', 'Domination', 'Hold every rival’s original capital.')}
        {tog('science', 'Science', 'Build a spaceport and finish the space projects.')}
        {tog('culture', 'Culture', 'Attract more visiting tourists than any civ has at home.')}
        {tog(
          'religion',
          'Religion',
          'Your religion followed in most settlements of every other civ.',
        )}
        {tog(
          'diplomatic',
          'Diplomacy',
          'Win the most diplomatic victory points in the World Congress.',
        )}
      </Section>
      <Section title="The world around you">
        {tog('cityStates', 'City-states', 'Minor powers to win over with envoys.')}
        {tog('camps', 'Hostile camps', 'Raider camps that spawn units until cleared.')}
        {tog('huts', 'Tribal villages', 'The first unit to reach one finds a gift.')}
        {tog(
          'disasters',
          'Climate and disasters',
          'Floods, storms, droughts and eruptions; emissions raise the seas.',
        )}
      </Section>
      <Section title="Systems">
        {tog(
          'congress',
          'World Congress',
          'Sessions every few turns vote on resolutions; favor buys votes.',
        )}
        {tog('espionage', 'Espionage', 'Spies that guard your settlements or work against others.')}
        {tog(
          'loyalty',
          'Loyalty',
          'Settlements far from home and close to a rival can break away.',
        )}
        {tog('nukes', 'Nuclear weapons', 'Atomic bombs and nuclear missiles in the late game.')}
        {tog(
          'theologicalCombat',
          'Theological combat',
          'Apostles and other religious units can fight rival faiths.',
        )}
      </Section>
      <Section title="Presets" hint="One click sets a whole style of game.">
        <div className="mx-cards presets">
          {[...PRESETS, ...presets].map((p) => (
            <button
              key={p.name}
              type="button"
              className="mx-card preset"
              onClick={() => applyPreset(p)}
              title={p.description}
            >
              <strong>{p.name}</strong>
              <small>{p.description}</small>
            </button>
          ))}
        </div>
        <div className="mx-save-preset">
          <input
            placeholder="Name this setup to keep it…"
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
                { name: presetName.trim(), description: 'Your saved setup', options: rest },
              ];
              setPresets(next);
              savePresets(next);
              setPresetName('');
            }}
          >
            Save
          </button>
          {presets.length > 0 && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setPresets([]);
                savePresets([]);
              }}
            >
              Forget saved
            </button>
          )}
        </div>
      </Section>
    </div>
  );

  return (
    <MenuScreen
      title="New game"
      icon="settings"
      sub={
        humanCount > 1
          ? `Hotseat: ${humanCount} players share this device`
          : 'Single player against the AI'
      }
      onClose={onCancel}
      closeLabel="Cancel"
      className="mx-setup"
    >
      <nav className="mx-steps" aria-label="Setup pages">
        {(
          [
            ['players', 'Players', `${seats}`],
            ['world', 'World', size ? t(size.name) : ''],
            ['rules', 'Rules', diff ? t(diff.name) : ''],
          ] as const
        ).map(([id, name, badge], i) => (
          <button
            key={id}
            type="button"
            className={page === id ? 'on' : ''}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => setPage(id)}
          >
            <b>{i + 1}</b>
            {name}
            <small>{badge}</small>
          </button>
        ))}
      </nav>
      <div className="mx-setup-scroll">
        {page === 'players' && playersPage}
        {page === 'world' && worldPage}
        {page === 'rules' && rulesPage}
        {page !== 'world' && (
          // The same check off the World page, so a change anywhere is caught.
          <div hidden>
            <MapPreview
              content={content}
              settings={mapSettings}
              seed={o.seed}
              seatColors={seatColors}
              onProblem={setProblem}
              onBusy={setChecking}
            />
          </div>
        )}
      </div>
      <footer className="mx-start-bar">
        <ul className="mx-summary" aria-label="Your game">
          <li className="mx-chip">{t(e.mapScript[o.script]?.name ?? '')}</li>
          <li className="mx-chip">
            {size ? t(size.name) : ''} · {seats} civs
          </li>
          <li className="mx-chip">{diff ? t(diff.name) : ''}</li>
          <li className="mx-chip">{speed ? t(speed.name) : ''}</li>
          <li className="mx-chip">{victories.length} victories</li>
        </ul>
        {problem ? (
          <span className="mx-problem">{problem}</span>
        ) : seats < 2 || seats > MAX_SEATS ? (
          <span className="mx-problem">A game needs 2–{MAX_SEATS} civilizations.</span>
        ) : checking ? (
          <span className="muted">Checking the map…</span>
        ) : null}
        <div className="mx-start-actions">
          {page !== 'rules' ? (
            <button type="button" onClick={() => setPage(page === 'players' ? 'world' : 'rules')}>
              Next
            </button>
          ) : null}
          <button
            type="button"
            className="primary big"
            disabled={!canStart}
            onClick={() => onStart(o)}
          >
            Start game
          </button>
        </div>
      </footer>

      {picking !== null && (
        <LeaderPicker
          content={content}
          value={pick(picking).leader ?? null}
          seatLabel={seatName(picking)}
          takenBy={takenBy(picking)}
          onClose={() => setPicking(null)}
          onPick={(leader) => {
            setPick(picking, { leader: leader ?? undefined });
            setPicking(null);
          }}
        />
      )}
    </MenuScreen>
  );
}

/** One seat: its leader in full, and its name, color, team and difficulty. */
function SeatDetail({
  content,
  seat,
  name,
  human,
  editableName,
  pick,
  seatColor,
  difficultyName,
  difficulties,
  canRemove,
  onName,
  onChange,
  onChooseLeader,
  onRemove,
}: {
  content: CompiledContent;
  seat: number;
  name: string;
  human: boolean;
  editableName: string | undefined;
  pick: SeatPick;
  seatColor: string | null;
  difficultyName: string;
  difficulties: { id: string; name: string }[];
  canRemove: boolean;
  onName: (name: string) => void;
  onChange: (patch: { [K in keyof SeatPick]?: SeatPick[K] | undefined }) => void;
  onChooseLeader: () => void;
  onRemove: () => void;
}) {
  const art = pick.leader ? leaderArt(content, pick.leader) : null;
  const civColor = art?.primary ?? null;
  return (
    <div className="mx-panel mx-seat-panel">
      <div className="mx-seat-head">
        {editableName !== undefined ? (
          <input
            aria-label={`Player ${seat + 1} name`}
            className="mx-name"
            value={editableName}
            maxLength={24}
            placeholder={`Player ${seat + 1}`}
            onChange={(ev) => onName(ev.target.value)}
          />
        ) : (
          <h3 className="mx-seat-title">
            {name} <span className="mx-chip">AI</span>
          </h3>
        )}
        <div className="mx-seat-head-actions">
          <button type="button" className="primary" onClick={onChooseLeader}>
            {pick.leader ? 'Change leader' : 'Choose leader'}
          </button>
          {pick.leader && (
            <button type="button" className="ghost" onClick={() => onChange({ leader: undefined })}>
              Random
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              className="ghost danger"
              onClick={onRemove}
              aria-label={`Remove ${name}`}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="mx-seat-options">
        <div className="mx-field">
          <span className="mx-field-label">
            Color
            <small>
              {pick.color
                ? colorName(pick.color)
                : civColor
                  ? 'Their civilization’s'
                  : 'By civilization'}
            </small>
          </span>
          <div className="mx-swatches" role="radiogroup" aria-label="Color">
            <button
              type="button"
              role="radio"
              aria-checked={!pick.color}
              className={`mx-swatch auto ${pick.color ? '' : 'on'}`}
              title="Their civilization’s own colors"
              onClick={() => onChange({ color: undefined })}
            >
              {civColor ? (
                <span style={{ background: civColor }} />
              ) : (
                <span className="unknown">A</span>
              )}
            </button>
            {PALETTE.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={pick.color === p.color}
                aria-label={p.name}
                title={p.name}
                className={`mx-swatch ${pick.color === p.color ? 'on' : ''}`}
                onClick={() => onChange({ color: p.color })}
              >
                <span style={{ background: p.color }} />
              </button>
            ))}
          </div>
        </div>
        <div className="mx-field">
          <span className="mx-field-label">
            Team
            <small>Teammates share a victory and see each other’s borders</small>
          </span>
          <Choice
            label="Team"
            value={pick.team ?? 0}
            options={[
              { value: 0, label: 'None' },
              ...TEAMS.map((n) => ({
                value: n,
                label: (
                  <>
                    <i
                      className="mx-team-dot"
                      style={{ background: TEAM_COLORS[(n - 1) % TEAM_COLORS.length] }}
                    />
                    {n}
                  </>
                ),
                title: `Team ${n}`,
              })),
            ]}
            onChange={(n) => onChange({ team: n === 0 ? undefined : n })}
          />
        </div>
        {!human && (
          <div className="mx-field">
            <span className="mx-field-label">
              Difficulty
              <small>This rival only</small>
            </span>
            <select
              aria-label={`${name} difficulty`}
              value={pick.difficulty ?? ''}
              onChange={(ev) => onChange({ difficulty: ev.target.value || undefined })}
            >
              <option value="">Same as the game ({difficultyName})</option>
              {difficulties.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {pick.leader ? (
        <div className="mx-seat-leader" style={{ ['--seat' as string]: seatColor ?? undefined }}>
          <LeaderDetail content={content} leader={pick.leader} />
        </div>
      ) : (
        <div className="mx-seat-random">
          <div className="mx-random-head big">?</div>
          <div>
            <strong>Random leader</strong>
            <p>
              {human
                ? 'A leader nobody else picked is drawn when the game starts.'
                : 'This rival gets a leader nobody else picked, drawn when the game starts.'}{' '}
              Choose one to see their abilities, unique units and how they play.
            </p>
            <button type="button" className="primary" onClick={onChooseLeader}>
              Browse leaders
            </button>
          </div>
        </div>
      )}
      <span className="mx-seat-emblem" aria-hidden="true">
        {art && (
          <Emblem
            symbol={art.emblem}
            primary={seatColor ?? art.primary}
            secondary={art.secondary}
            size={28}
          />
        )}
      </span>
    </div>
  );
}
