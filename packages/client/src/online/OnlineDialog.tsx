import { type CompiledContent, resolveText } from '@cx/content';
import type { EngineContext, GameSetup, GameState } from '@cx/engine';
import { type GameHandle, OnlineHost, RemoteGame } from '@cx/host';
import { isJoinCode, normalizeCode, type SeatInfo } from '@cx/protocol';
import { useEffect, useRef, useState } from 'react';
import { cloud, type PublicLobby } from '../cloud/cloud';
import { createAiRunner } from '../game/aiRunner';
import { PALETTE } from '../setup/palette';
import { LeaderHead, leaderArt } from '../ui/LeaderCard';
import { LeaderDetail, LeaderPicker } from '../ui/LeaderPicker';
import { Choice, MenuScreen, Row, Section, Switch } from '../ui/Menu';
import { browserSeatKeys, hostedGame, rememberHosted } from './keys';
import { joinHost, type Network, newCode, openHost } from './transports';

/** What the host picks for a new online game. */
export interface OnlineOptions {
  script: string;
  size: string;
  rivals: number;
  speed: string;
  difficulty: string;
  /** An `era` content id to start in. */
  startEra?: string;
  /** Rules (all on unless turned off), as in the setup screen. */
  rules?: {
    camps: boolean;
    cityStates: boolean;
    domination: boolean;
    religion: boolean;
    science: boolean;
    culture: boolean;
    loyalty?: boolean;
    espionage?: boolean;
    congress?: boolean;
    diplomatic?: boolean;
    disasters?: boolean;
    nukes?: boolean;
    theologicalCombat?: boolean;
    huts?: boolean;
  };
  turnLimit?: number | null;
  /** Seconds a turn lasts before everyone still playing is ended (null: no timer). */
  turnSeconds?: number | null;
  /** When a friend drops: wait for them (the host can end their turn), or an AI plays. */
  absent?: 'wait' | 'ai';
}

const RULES: [keyof NonNullable<OnlineOptions['rules']>, string, string][] = [
  ['camps', 'Hostile camps', 'Raider camps that spawn units until cleared.'],
  ['huts', 'Tribal villages', 'The first unit to reach one finds a gift.'],
  ['cityStates', 'City-states', 'Minor powers to win over with envoys.'],
  ['domination', 'Domination victory', 'Hold every rival’s original capital.'],
  [
    'religion',
    'Religious victory',
    'Your religion followed in most settlements of every other civ.',
  ],
  ['science', 'Science victory', 'Build a spaceport and finish the space projects.'],
  ['culture', 'Culture victory', 'Attract more visiting tourists than any civ has at home.'],
  ['loyalty', 'Loyalty', 'Settlements far from home and close to a rival can break away.'],
  ['espionage', 'Espionage', 'Spies that guard your settlements or work against others.'],
  ['congress', 'World Congress', 'Sessions every few turns vote on resolutions.'],
  ['diplomatic', 'Diplomatic victory', 'Win the most diplomatic victory points in the Congress.'],
  ['disasters', 'Climate and disasters', 'Floods, storms, droughts and eruptions.'],
  ['nukes', 'Nuclear weapons', 'Atomic bombs and nuclear missiles in the late game.'],
  ['theologicalCombat', 'Theological combat', 'Religious units can fight rival faiths.'],
];

interface Props {
  content: CompiledContent;
  ctx: EngineContext;
  net: Network;
  /** Open on Join with this code (from an invite link). */
  joinCode?: string;
  /** Open on Host with this game to resume (an online game's autosave). */
  resume?: GameState;
  makeSetup: (
    names: string[],
    o: OnlineOptions,
    leaders: (string | null)[],
    colors: (string | null)[],
  ) => GameSetup;
  onGame: (game: GameHandle) => void;
  onCancel: () => void;
}

const NAME_KEY = 'cx.online.name';
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};
const saveName = (name: string) => {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not remembered; asked again next time.
  }
};

/** An invite link that opens this game's Join screen with the code filled in. */
export const inviteLink = (code: string, net: Network) =>
  `${location.origin}${location.pathname}${net === 'local' ? '?net=local' : ''}#join=${code}`;

/**
 * Host an online game (a new one, or one resumed from its autosave) or join a friend's with a
 * code. The host's browser runs the game; friends connect straight to it.
 */
export function OnlineDialog(props: Props) {
  const { content, ctx, net, joinCode, resume, makeSetup, onGame, onCancel } = props;
  const [mode, setMode] = useState<'host' | 'join'>(joinCode ? 'join' : 'host');
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(joinCode ?? '');
  const [o, setO] = useState<OnlineOptions>({
    script: 'continents',
    size: 'small',
    rivals: 2,
    speed: 'speed_standard',
    difficulty: 'difficulty_prince',
    startEra: 'era_ancient',
    rules: {
      camps: true,
      cityStates: true,
      domination: true,
      religion: true,
      science: true,
      culture: true,
      loyalty: true,
      espionage: true,
      congress: true,
      diplomatic: true,
      disasters: true,
      nukes: true,
      theologicalCombat: false,
      huts: true,
    },
    turnLimit: null,
    turnSeconds: null,
    absent: 'wait',
  });
  const [friends, setFriends] = useState(1);
  const [myLeader, setMyLeader] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<string | null>(null);
  // Public games (cloud/cloud.ts): a signed-in host can list the lobby; anyone can browse.
  const remoteCloud = cloud();
  const [listPublicly, setListPublicly] = useState(false);
  const [publicGames, setPublicGames] = useState<PublicLobby[] | null>(null);
  const listed = useRef<string | null>(null);
  const unlist = () => {
    if (listed.current && remoteCloud) void remoteCloud.closeLobby(listed.current).catch(() => {});
    listed.current = null;
  };
  useEffect(() => {
    if (mode !== 'join' || !remoteCloud) return;
    remoteCloud
      .listLobbies()
      .then(setPublicGames)
      .catch(() => setPublicGames([]));
  }, [mode, remoteCloud]);
  const [error, setError] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [host, setHost] = useState<OnlineHost>();
  const [remote, setRemote] = useState<RemoteGame>();
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  const sizes = [...content.ids.mapSize].sort(
    (a, b) => content.entities.mapSize[a]!.order - content.entities.mapSize[b]!.order,
  );

  // Follow the lobby; a client's game opens with its first view (once).
  const opened = useRef(false);
  useEffect(() => {
    const session = host ?? remote?.online;
    if (!session) return;
    const update = () => {
      setSeats(session.seats());
      if (remote?.ended) setError(remote.ended);
      else if (remote?.ready && !opened.current) {
        opened.current = true;
        onGame(remote);
      }
    };
    update();
    return session.onChange(update);
  }, [host, remote, onGame]);

  const who = name.trim() || 'Host';
  const openLobby = async () => {
    setConnecting(true);
    setError(undefined);
    saveName(name.trim());
    try {
      // A game hosted again keeps its code when it can, so friends' games reconnect by themselves.
      const before = resume ? hostedGame(resume.gameId) : undefined;
      let c = before?.code ?? newCode();
      const line = await openHost(net, c).catch((e: unknown) => {
        if (!before) throw e;
        c = newCode();
        return openHost(net, c);
      });
      const h = new OnlineHost(line, ctx, c, who, resume ? 7 : friends);
      h.turnSeconds = o.turnSeconds ?? null;
      h.aiTakeover = o.absent === 'ai';
      h.onKeys = (gameId, keys) => rememberHosted({ gameId, code: c, keys });
      if (resume) {
        h.resume(resume, createAiRunner(), before?.keys);
        rememberHosted({ gameId: resume.gameId, code: c, keys: before?.keys ?? {} });
        onGame(h.handle());
      } else {
        setHost(h);
        if (listPublicly && remoteCloud?.signedIn) {
          await remoteCloud
            .announceLobby(c, who, friends, { size: o.size, script: o.script, rivals: o.rivals })
            .then(() => (listed.current = c))
            .catch(() => setError('The lobby is open, but listing it publicly failed.'));
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const join = async () => {
    const c = normalizeCode(code);
    if (!isJoinCode(c)) return setError('A code is six letters and digits.');
    setConnecting(true);
    setError(undefined);
    saveName(name.trim());
    try {
      const line = await joinHost(net, c);
      setRemote(
        new RemoteGame(line, ctx, c, name.trim() || 'Friend', {
          keys: browserSeatKeys(),
          reconnect: () => joinHost(net, c),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const leave = () => {
    unlist();
    host?.close();
    remote?.online.leave();
    onCancel();
  };

  const lobby = host ?? remote;
  const size = content.entities.mapSize[o.size];
  const t = (text: string) => resolveText(content, text);
  const e = content.entities;
  const speeds = Object.values(e.gameSpeed).sort((a, b) => a.order - b.order);
  const difficulties = Object.values(e.difficulty).sort((a, b) => a.order - b.order);
  const eras = Object.values(e.era).sort((a, b) => a.order - b.order);
  const rule = (key: keyof NonNullable<OnlineOptions['rules']>) => {
    const [, label, hint] = RULES.find(([k]) => k === key)!;
    return (
      <Switch
        key={key}
        label={label}
        hint={hint}
        checked={o.rules?.[key] ?? true}
        onChange={(on) => setO({ ...o, rules: { ...o.rules!, [key]: on } })}
      />
    );
  };
  const total = friends + 1 + o.rivals;
  const title = lobby
    ? 'Lobby'
    : resume
      ? 'Host your online game again'
      : mode === 'host'
        ? 'Host an online game'
        : 'Join an online game';

  return (
    <MenuScreen
      title={title}
      icon="diplomacy"
      sub={
        lobby
          ? 'Share the code, pick your leader and start when everyone is in'
          : 'Play with friends: your browser runs the game, theirs connect to it'
      }
      onClose={leave}
      closeLabel={lobby ? 'Leave' : 'Back'}
      className="mx-online"
    >
      <div className="mx-online-scroll">
        {!lobby && !resume && (
          <Choice
            label="Host or join"
            className="mx-online-mode"
            value={mode}
            options={[
              { value: 'host', label: 'Host a game' },
              { value: 'join', label: 'Join with a code' },
            ]}
            onChange={setMode}
          />
        )}

        {!lobby && (
          <div className="mx-panel mx-online-name">
            <Row label="Your name" hint="What friends see in the lobby and in the game.">
              <input
                id="online-name"
                value={name}
                maxLength={24}
                placeholder={mode === 'host' ? 'Host' : 'Friend'}
                onChange={(ev) => setName(ev.target.value)}
              />
            </Row>
          </div>
        )}

        {!lobby && mode === 'host' && !resume && (
          <div className="mx-online-grid">
            <div className="mx-panel">
              <Section
                title="Players"
                hint={`${total} civilizations: you, ${friends} friend${friends === 1 ? '' : 's'} and ${o.rivals} AI.${size && total > size.players ? ' That is more than this map is made for.' : ''}`}
              >
                <Row label="Friends" hint="Seats for people who join with the code.">
                  <Choice
                    label="Friends"
                    className="compact"
                    value={friends}
                    options={Array.from({ length: 7 }, (_, i) => i + 1).map((n) => ({
                      value: n,
                      label: n,
                    }))}
                    onChange={setFriends}
                  />
                </Row>
                <Row label="AI rivals" hint="Computer players on top of your friends.">
                  <Choice
                    label="AI rivals"
                    className="compact"
                    value={o.rivals}
                    options={Array.from({ length: 8 }, (_, i) => i).map((n) => ({
                      value: n,
                      label: n,
                    }))}
                    onChange={(rivals) => setO({ ...o, rivals })}
                  />
                </Row>
                <Row label="AI difficulty">
                  <select
                    id="online-difficulty"
                    aria-label="AI difficulty"
                    value={o.difficulty}
                    onChange={(ev) => setO({ ...o, difficulty: ev.target.value })}
                  >
                    {difficulties.map((x) => (
                      <option key={x.id} value={x.id}>
                        {t(x.name)}
                      </option>
                    ))}
                  </select>
                </Row>
              </Section>
              <Section title="Pace">
                <Row label="Game speed" hint={t(e.gameSpeed[o.speed]?.description ?? '')}>
                  <select
                    id="online-speed"
                    aria-label="Game speed"
                    value={o.speed}
                    onChange={(ev) => setO({ ...o, speed: ev.target.value })}
                  >
                    {speeds.map((x) => (
                      <option key={x.id} value={x.id}>
                        {t(x.name)}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Turn timer" hint="When time runs out, everyone still playing is ended.">
                  <select
                    id="online-timer"
                    aria-label="Turn timer"
                    value={o.turnSeconds ?? ''}
                    onChange={(ev) =>
                      setO({ ...o, turnSeconds: ev.target.value ? Number(ev.target.value) : null })
                    }
                  >
                    <option value="">Off</option>
                    {[60, 90, 120, 180, 300].map((n) => (
                      <option key={n} value={n}>
                        {n < 120 ? `${n} seconds` : `${n / 60} minutes`}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="If a friend drops" hint="You can always end their turn yourself.">
                  <select
                    id="online-absent"
                    aria-label="If a friend drops"
                    value={o.absent ?? 'wait'}
                    onChange={(ev) => setO({ ...o, absent: ev.target.value as 'wait' | 'ai' })}
                  >
                    <option value="wait">Wait for them</option>
                    <option value="ai">An AI plays until they’re back</option>
                  </select>
                </Row>
                <Row label="Start era">
                  <select
                    id="online-era"
                    aria-label="Start era"
                    value={o.startEra ?? 'era_ancient'}
                    onChange={(ev) => setO({ ...o, startEra: ev.target.value })}
                  >
                    {eras.map((x) => (
                      <option key={x.id} value={x.id}>
                        {t(x.name)}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Turn limit">
                  <select
                    id="online-limit"
                    aria-label="Turn limit"
                    value={o.turnLimit ?? ''}
                    onChange={(ev) =>
                      setO({ ...o, turnLimit: ev.target.value ? Number(ev.target.value) : null })
                    }
                  >
                    <option value="">None</option>
                    {[100, 150, 250, 330, 500].map((n) => (
                      <option key={n} value={n}>
                        {n} turns
                      </option>
                    ))}
                  </select>
                </Row>
                {remoteCloud?.signedIn && (
                  <Switch
                    label="List this game publicly"
                    hint="Anyone can find it in the Join list."
                    checked={listPublicly}
                    onChange={setListPublicly}
                  />
                )}
              </Section>
            </div>
            <div className="mx-panel">
              <Section title="Map type" hint={t(e.mapScript[o.script]?.description ?? '')}>
                <div className="mx-cards">
                  {content.ids.mapScript.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`mx-card ${o.script === id ? 'on' : ''}`}
                      aria-pressed={o.script === id}
                      onClick={() => setO({ ...o, script: id })}
                    >
                      <strong>{t(e.mapScript[id]!.name)}</strong>
                    </button>
                  ))}
                </div>
              </Section>
              <Section title="Map size">
                <Choice
                  label="Map size"
                  value={o.size}
                  options={sizes.map((id) => ({
                    value: id,
                    label: (
                      <>
                        {t(e.mapSize[id]!.name)} <small>{e.mapSize[id]!.players}</small>
                      </>
                    ),
                  }))}
                  onChange={(s) => setO({ ...o, size: s })}
                />
              </Section>
              <Section title="Victories">
                {rule('domination')}
                {rule('science')}
                {rule('culture')}
                {rule('religion')}
                {rule('diplomatic')}
              </Section>
              <Section title="World and systems">
                {rule('cityStates')}
                {rule('camps')}
                {rule('huts')}
                {rule('disasters')}
                {rule('congress')}
                {rule('espionage')}
                {rule('loyalty')}
                {rule('nukes')}
                {rule('theologicalCombat')}
              </Section>
            </div>
          </div>
        )}

        {!lobby && resume && (
          <div className="mx-panel">
            <p className="hint">
              Turn {resume.turn}. Friends who are still in the game reconnect by themselves; others
              rejoin with the code from the device they played on and get their seat back. Someone
              on a new device: free their seat (in the bar at the top of the map) and they join with
              the same name.
            </p>
          </div>
        )}

        {!lobby && mode === 'join' && (
          <div className="mx-online-grid join">
            <div className="mx-panel">
              <Section
                title="Enter the code"
                hint="Six letters and digits from your friend, or open their invite link."
              >
                <input
                  id="online-code"
                  className="code-input mx-code-input"
                  value={code}
                  placeholder="ABC123"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(ev) => setCode(normalizeCode(ev.target.value).slice(0, 6))}
                  onKeyDown={(ev) => ev.key === 'Enter' && void join()}
                />
              </Section>
            </div>
            {remoteCloud && (
              <div className="mx-panel public-games">
                <Section title="Public games" hint="Games hosts have listed for anyone to join.">
                  {publicGames === null ? (
                    <p className="hint">Looking…</p>
                  ) : publicGames.length === 0 ? (
                    <p className="hint">No public games open right now.</p>
                  ) : (
                    <ul className="mx-save-list">
                      {publicGames.map((g) => (
                        <li key={g.code}>
                          <div className="mx-save-text">
                            <strong>{g.hostName}’s game</strong>
                            <span>
                              {g.openSeats} seat{g.openSeats === 1 ? '' : 's'} open
                            </span>
                            <small>
                              {String(g.info.size ?? '')} {String(g.info.script ?? '')}
                            </small>
                          </div>
                          <div className="mx-save-actions">
                            <button type="button" onClick={() => setCode(g.code)}>
                              Use code {g.code}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>
            )}
          </div>
        )}

        {lobby && (
          <Lobby
            content={content}
            code={host ? host.code : remote!.online.code}
            net={net}
            seats={seats}
            open={host ? friends : null}
            {...(host ? { onRemove: (i: number) => host.removeFromLobby(i) } : {})}
            myLeader={myLeader}
            myColor={myColor}
            onPick={(leader, color) => {
              setMyLeader(leader);
              setMyColor(color);
              if (host) host.pickForHost(leader, color);
              else remote?.online.pick(leader, color);
            }}
          />
        )}

        {error && (
          <p className="mx-problem" role="alert">
            {error}
          </p>
        )}
        {net === 'peer' && !lobby && (
          <p className="hint mx-online-note">
            Browsers connect directly to the host; a free public service only introduces them. The
            host’s browser runs the game, so it needs to stay open.
          </p>
        )}
      </div>

      <footer className="mx-start-bar dialog-actions">
        <span className="mx-summary muted">
          {lobby
            ? host
              ? 'Seats nobody took are left out when you start.'
              : 'Waiting for the host to start the game.'
            : mode === 'host' && !resume
              ? `${total} civilizations · ${size ? t(size.name) : ''} map · ${t(e.mapScript[o.script]?.name ?? '')}`
              : ''}
        </span>
        <div className="mx-start-actions">
          <button type="button" className="ghost" onClick={leave}>
            {lobby ? 'Leave' : 'Cancel'}
          </button>
          {!lobby && mode === 'host' && (
            <button type="button" className="primary big" disabled={connecting} onClick={openLobby}>
              {connecting ? 'Opening…' : resume ? 'Host it' : 'Open the lobby'}
            </button>
          )}
          {!lobby && mode === 'join' && (
            <button type="button" className="primary big" disabled={connecting} onClick={join}>
              {connecting ? 'Connecting…' : 'Join'}
            </button>
          )}
          {host && (
            <button
              type="button"
              className="primary big"
              onClick={() => {
                unlist();
                host.start(
                  (names, leaders, colors) => makeSetup(names, o, leaders, colors),
                  createAiRunner(),
                );
                onGame(host.handle());
              }}
            >
              Start the game
            </button>
          )}
        </div>
      </footer>
    </MenuScreen>
  );
}

/** The code to share, who's in so far, and the leader and color each wants. */
function Lobby({
  content,
  code,
  net,
  seats,
  open,
  onRemove,
  myLeader,
  myColor,
  onPick,
}: {
  content: CompiledContent;
  code: string;
  net: Network;
  seats: SeatInfo[];
  /** The host's view: how many friends the game takes. */
  open: number | null;
  /** The host's view: sends away the friend at this place in the list. */
  onRemove?: (index: number) => void;
  myLeader: string | null;
  myColor: string | null;
  onPick: (leader: string | null, color: string | null) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(inviteLink(code, net))
      .then(() => setCopied(true))
      .catch(() => {});
  };
  const empty = open === null ? 0 : Math.max(0, open + 1 - seats.length);
  const taken: Record<string, string> = {};
  seats.forEach((s, i) => {
    // Mine is whatever I picked; the others' come from the lobby.
    if (s.leader && s.leader !== myLeader) taken[s.leader] = s.name || `Player ${i + 1}`;
  });
  const colorOf = (s: { leader?: string | null; color?: string | null }) =>
    s.color ?? (s.leader ? leaderArt(content, s.leader).primary : null);
  return (
    <div className="lobby mx-lobby">
      <div className="mx-panel mx-lobby-code">
        <p className="lobby-label home-kicker">Join code</p>
        <p className="join-code" aria-label={`Join code ${code.split('').join(' ')}`}>
          {code}
        </p>
        <button type="button" onClick={copy}>
          {copied ? 'Invite link copied' : 'Copy invite link'}
        </button>
        <p className="hint">
          {open === null
            ? 'Waiting for the host to start the game.'
            : 'Send the code or the link to your friends. Start whenever you’re ready.'}
        </p>
      </div>
      <div className="mx-panel">
        <Section title="Players">
          <ul className="seats mx-lobby-seats" aria-label="Players">
            {seats.map((s, i) => {
              const c = colorOf(s);
              return (
                <li key={`${s.name}-${i}`} style={{ ['--seat' as string]: c ?? '#59687a' }}>
                  {s.leader ? (
                    <LeaderHead content={content} leader={s.leader} size={44} />
                  ) : (
                    <span className="mx-random-head small">?</span>
                  )}
                  <span className="mx-seat-text">
                    <strong>
                      <span className={`dot ${s.online ? 'on' : ''}`} aria-hidden="true" />
                      {s.name}
                      {s.host && <span className="muted"> · host</span>}
                    </strong>
                    <small>{s.leader ? leaderArt(content, s.leader).name : 'Random leader'}</small>
                  </span>
                  {onRemove && !s.host && (
                    <button
                      type="button"
                      className="ghost small seat-remove"
                      aria-label={`Remove ${s.name} from the lobby`}
                      title="Remove from the lobby"
                      onClick={() => onRemove(i)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
            {Array.from({ length: empty }, (_, i) => (
              <li key={`open-${i}`} className="muted empty">
                <span className="mx-random-head small">+</span>
                <span className="mx-seat-text">
                  <strong>Waiting for a friend…</strong>
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Your leader and color">
          <div className="mx-lobby-me">
            <button type="button" className="primary" onClick={() => setPicking(true)}>
              {myLeader
                ? `Change leader (${leaderArt(content, myLeader).name})`
                : 'Choose your leader'}
            </button>
            {myLeader && (
              <button type="button" className="ghost" onClick={() => onPick(null, myColor)}>
                Random
              </button>
            )}
          </div>
          <div className="mx-swatches" role="radiogroup" aria-label="Your color">
            <button
              type="button"
              role="radio"
              aria-checked={!myColor}
              className={`mx-swatch auto ${myColor ? '' : 'on'}`}
              title="Your civilization’s own colors"
              onClick={() => onPick(myLeader, null)}
            >
              {myLeader ? (
                <span style={{ background: leaderArt(content, myLeader).primary }} />
              ) : (
                <span className="unknown">A</span>
              )}
            </button>
            {PALETTE.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={myColor === p.color}
                aria-label={p.name}
                title={p.name}
                className={`mx-swatch ${myColor === p.color ? 'on' : ''}`}
                onClick={() => onPick(myLeader, p.color)}
              >
                <span style={{ background: p.color }} />
              </button>
            ))}
          </div>
          {myLeader && (
            <div className="mx-lobby-leader">
              <LeaderDetail content={content} leader={myLeader} />
            </div>
          )}
        </Section>
      </div>
      {picking && (
        <LeaderPicker
          content={content}
          value={myLeader}
          seatLabel="You"
          takenBy={taken}
          onClose={() => setPicking(false)}
          onPick={(leader) => {
            onPick(leader, myColor);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
