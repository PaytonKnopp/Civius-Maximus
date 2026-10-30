import { type CompiledContent, resolveText } from '@cx/content';
import type { EngineContext, GameSetup, GameState } from '@cx/engine';
import { type GameHandle, OnlineHost, RemoteGame } from '@cx/host';
import { isJoinCode, normalizeCode, type SeatInfo } from '@cx/protocol';
import { useEffect, useRef, useState } from 'react';
import { cloud, type PublicLobby } from '../cloud/cloud';
import { createAiRunner } from '../game/aiRunner';
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

const RULES: [keyof NonNullable<OnlineOptions['rules']>, string][] = [
  ['camps', 'Hostile camps'],
  ['huts', 'Tribal villages'],
  ['cityStates', 'City-states'],
  ['domination', 'Domination victory'],
  ['religion', 'Religious victory'],
  ['science', 'Science victory'],
  ['culture', 'Culture victory'],
  ['loyalty', 'Loyalty'],
  ['espionage', 'Espionage'],
  ['congress', 'World Congress'],
  ['diplomatic', 'Diplomatic victory'],
  ['disasters', 'Climate and disasters'],
  ['nukes', 'Nuclear weapons'],
  ['theologicalCombat', 'Theological combat'],
];

interface Props {
  content: CompiledContent;
  ctx: EngineContext;
  net: Network;
  /** Open on Join with this code (from an invite link). */
  joinCode?: string;
  /** Open on Host with this game to resume (an online game's autosave). */
  resume?: GameState;
  makeSetup: (names: string[], o: OnlineOptions, leaders: (string | null)[]) => GameSetup;
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
  const maxPlayers = content.entities.mapSize[o.size]?.players ?? 8;

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
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog online-dialog" role="dialog" aria-labelledby="online-title">
        <h2 id="online-title">{resume ? 'Host your online game again' : 'Play online'}</h2>
        {!lobby && !resume && (
          <div className="segmented" role="group" aria-label="Host or join">
            {(['host', 'join'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={mode === m ? 'on' : ''}
                onClick={() => setMode(m)}
              >
                {m === 'host' ? 'Host a game' : 'Join with a code'}
              </button>
            ))}
          </div>
        )}

        {!lobby && (
          <>
            <label htmlFor="online-name">Your name</label>
            <input
              id="online-name"
              value={name}
              maxLength={24}
              placeholder={mode === 'host' ? 'Host' : 'Friend'}
              onChange={(e) => setName(e.target.value)}
            />
          </>
        )}

        {!lobby && mode === 'host' && !resume && (
          <>
            <div className="row">
              <div>
                <label htmlFor="online-friends">Friends</label>
                <select
                  id="online-friends"
                  value={friends}
                  onChange={(e) => setFriends(Number(e.target.value))}
                >
                  {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n} disabled={n + 1 > maxPlayers}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="online-rivals">AI rivals</label>
                <select
                  id="online-rivals"
                  value={o.rivals}
                  onChange={(e) => setO({ ...o, rivals: Number(e.target.value) })}
                >
                  {Array.from({ length: 7 }, (_, i) => i).map((n) => (
                    <option key={n} value={n} disabled={n + friends + 1 > maxPlayers}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row">
              <div>
                <label htmlFor="online-script">Map type</label>
                <select
                  id="online-script"
                  value={o.script}
                  onChange={(e) => setO({ ...o, script: e.target.value })}
                >
                  {content.ids.mapScript.map((id) => (
                    <option key={id} value={id}>
                      {content.entities.mapScript[id]!.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="online-size">Map size</label>
                <select
                  id="online-size"
                  value={o.size}
                  onChange={(e) => setO({ ...o, size: e.target.value })}
                >
                  {sizes.map((id) => (
                    <option key={id} value={id}>
                      {content.entities.mapSize[id]!.name} (up to{' '}
                      {content.entities.mapSize[id]!.players})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row">
              <div>
                <label htmlFor="online-speed">Game speed</label>
                <select
                  id="online-speed"
                  value={o.speed}
                  onChange={(e) => setO({ ...o, speed: e.target.value })}
                >
                  {Object.values(content.entities.gameSpeed)
                    .sort((a, b) => a.order - b.order)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {resolveText(content, x.name)}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor="online-difficulty">AI difficulty</label>
                <select
                  id="online-difficulty"
                  value={o.difficulty}
                  onChange={(e) => setO({ ...o, difficulty: e.target.value })}
                >
                  {Object.values(content.entities.difficulty)
                    .sort((a, b) => a.order - b.order)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {resolveText(content, x.name)}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <details className="online-rules">
              <summary>More rules</summary>
              <div className="row">
                <div>
                  <label htmlFor="online-era">Start era</label>
                  <select
                    id="online-era"
                    value={o.startEra ?? 'era_ancient'}
                    onChange={(e) => setO({ ...o, startEra: e.target.value })}
                  >
                    {Object.values(content.entities.era)
                      .sort((a, b) => a.order - b.order)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {resolveText(content, x.name)}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="online-timer">Turn timer</label>
                  <select
                    id="online-timer"
                    value={o.turnSeconds ?? ''}
                    onChange={(e) =>
                      setO({ ...o, turnSeconds: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">Off</option>
                    {[60, 90, 120, 180, 300].map((n) => (
                      <option key={n} value={n}>
                        {n < 120 ? `${n} seconds` : `${n / 60} minutes`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="online-absent">If a friend drops</label>
                  <select
                    id="online-absent"
                    value={o.absent ?? 'wait'}
                    onChange={(e) => setO({ ...o, absent: e.target.value as 'wait' | 'ai' })}
                  >
                    <option value="wait">Wait (you can end their turn)</option>
                    <option value="ai">An AI plays until they’re back</option>
                  </select>
                </div>
                {remoteCloud?.signedIn && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={listPublicly}
                      onChange={(e) => setListPublicly(e.target.checked)}
                    />
                    List this game publicly
                  </label>
                )}
                <div>
                  <label htmlFor="online-limit">Turn limit</label>
                  <select
                    id="online-limit"
                    value={o.turnLimit ?? ''}
                    onChange={(e) =>
                      setO({ ...o, turnLimit: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">None</option>
                    {[100, 150, 250, 330, 500].map((n) => (
                      <option key={n} value={n}>
                        {n} turns
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {RULES.map(([key, label]) => (
                <label key={key} className="check">
                  <input
                    type="checkbox"
                    checked={o.rules?.[key] ?? true}
                    onChange={(e) =>
                      setO({ ...o, rules: { ...o.rules!, [key]: e.target.checked } })
                    }
                  />
                  {label}
                </label>
              ))}
            </details>
          </>
        )}

        {!lobby && resume && (
          <p className="hint">
            Turn {resume.turn}. Friends who are still in the game reconnect by themselves; others
            rejoin with the code from the device they played on and get their seat back. Someone on
            a new device: free their seat (in the bar at the top of the map) and they join with the
            same name.
          </p>
        )}

        {!lobby && mode === 'join' && (
          <>
            <label htmlFor="online-code">Code</label>
            <input
              id="online-code"
              className="code-input"
              value={code}
              placeholder="ABC123"
              autoCapitalize="characters"
              onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, 6))}
            />
            {remoteCloud && (
              <div className="public-games">
                <h3>Public games</h3>
                {publicGames === null ? (
                  <p className="hint">Looking…</p>
                ) : publicGames.length === 0 ? (
                  <p className="hint">No public games open right now.</p>
                ) : (
                  <ul className="save-list">
                    {publicGames.map((g) => (
                      <li key={g.code}>
                        <span className="save-name">
                          <strong>{g.hostName}’s game</strong>
                          <span className="muted small-text">
                            {g.openSeats} seat{g.openSeats === 1 ? '' : 's'} ·{' '}
                            {String(g.info.size ?? '')} {String(g.info.script ?? '')}
                          </span>
                        </span>
                        <button type="button" className="small" onClick={() => setCode(g.code)}>
                          Use code {g.code}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
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
            onPick={(leader) => {
              setMyLeader(leader);
              if (host) host.pickForHost(leader);
              else remote?.online.pick(leader);
            }}
          />
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {net === 'peer' && !lobby && (
          <p className="hint">
            Browsers connect directly to the host; a free public service only introduces them. The
            host’s browser runs the game, so it needs to stay open.
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={leave}>
            {lobby ? 'Leave' : 'Cancel'}
          </button>
          {!lobby && mode === 'host' && (
            <button type="button" className="primary" disabled={connecting} onClick={openLobby}>
              {connecting ? 'Opening…' : resume ? 'Host it' : 'Open the lobby'}
            </button>
          )}
          {!lobby && mode === 'join' && (
            <button type="button" className="primary" disabled={connecting} onClick={join}>
              {connecting ? 'Connecting…' : 'Join'}
            </button>
          )}
          {host && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                unlist();
                host.start((names, leaders) => makeSetup(names, o, leaders), createAiRunner());
                onGame(host.handle());
              }}
            >
              Start the game
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The code to share, who's in so far, and the leader each wants. */
function Lobby({
  content,
  code,
  net,
  seats,
  open,
  onRemove,
  myLeader,
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
  onPick: (leader: string | null) => void;
}) {
  const leaderName = (id: string | null | undefined) => {
    const l = id ? content.entities.leader[id] : undefined;
    if (!l) return 'random leader';
    const civ = content.entities.civ[l.civ];
    return `${resolveText(content, l.name)}${civ ? ` (${resolveText(content, civ.name)})` : ''}`;
  };
  const leaders = [...content.ids.leader].sort((a, b) =>
    leaderName(a).localeCompare(leaderName(b)),
  );
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(inviteLink(code, net))
      .then(() => setCopied(true))
      .catch(() => {});
  };
  const empty = open === null ? 0 : Math.max(0, open + 1 - seats.length);
  return (
    <div className="lobby">
      <p className="lobby-label">Join code</p>
      <p className="join-code" aria-label={`Join code ${code.split('').join(' ')}`}>
        {code}
      </p>
      <button type="button" className="ghost small" onClick={copy}>
        {copied ? 'Invite link copied' : 'Copy invite link'}
      </button>
      <ul className="seats" aria-label="Players">
        {seats.map((s, i) => (
          <li key={`${s.name}-${i}`}>
            <span className={`dot ${s.online ? 'on' : ''}`} aria-hidden="true" />
            {s.name}
            {s.host && <span className="muted"> · host</span>}
            <span className="muted"> · {leaderName(s.leader)}</span>
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
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`open-${i}`} className="muted">
            <span className="dot" aria-hidden="true" />
            Waiting for a friend…
          </li>
        ))}
      </ul>
      <label htmlFor="online-leader">Your leader</label>
      <select
        id="online-leader"
        value={myLeader ?? ''}
        onChange={(e) => onPick(e.target.value || null)}
      >
        <option value="">Random</option>
        {leaders.map((id) => (
          <option key={id} value={id}>
            {leaderName(id)}
          </option>
        ))}
      </select>
      <p className="hint">
        {open === null
          ? 'Waiting for the host to start the game.'
          : 'Send the code or the link to your friends. Start whenever you’re ready: seats nobody took are left out.'}
      </p>
    </div>
  );
}
