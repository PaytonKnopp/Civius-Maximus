import { type CompiledContent, resolveText } from '@cx/content';
import type { EngineContext, GameSetup, GameState } from '@cx/engine';
import { type GameHandle, OnlineHost, RemoteGame } from '@cx/host';
import { isJoinCode, normalizeCode, type SeatInfo } from '@cx/protocol';
import { useEffect, useRef, useState } from 'react';
import { createAiRunner } from '../game/aiRunner';
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
  };
  turnLimit?: number | null;
}

const RULES: [keyof NonNullable<OnlineOptions['rules']>, string][] = [
  ['camps', 'Hostile camps'],
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
];

interface Props {
  content: CompiledContent;
  ctx: EngineContext;
  net: Network;
  /** Open on Join with this code (from an invite link). */
  joinCode?: string;
  /** Open on Host with this game to resume (an online game's autosave). */
  resume?: GameState;
  makeSetup: (names: string[], o: OnlineOptions) => GameSetup;
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
    },
    turnLimit: null,
  });
  const [friends, setFriends] = useState(1);
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
      const c = newCode();
      const line = await openHost(net, c);
      const h = new OnlineHost(line, ctx, c, who, resume ? 7 : friends);
      if (resume) {
        h.resume(resume, createAiRunner());
        onGame(h.handle());
      } else setHost(h);
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
      setRemote(new RemoteGame(line, ctx, c, name.trim() || 'Friend'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const leave = () => {
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
            Turn {resume.turn}. Friends rejoin with the new code and get their seat back by using
            the same name.
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
          </>
        )}

        {lobby && (
          <Lobby
            code={host ? host.code : remote!.online.code}
            net={net}
            seats={seats}
            open={host ? friends : null}
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
                host.start((names) => makeSetup(names, o), createAiRunner());
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

/** The code to share and who's in so far. */
function Lobby({
  code,
  net,
  seats,
  open,
}: {
  code: string;
  net: Network;
  seats: SeatInfo[];
  /** The host's view: how many friends the game takes. */
  open: number | null;
}) {
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
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`open-${i}`} className="muted">
            <span className="dot" aria-hidden="true" />
            Waiting for a friend…
          </li>
        ))}
      </ul>
      <p className="hint">
        {open === null
          ? 'Waiting for the host to start the game.'
          : 'Send the code or the link to your friends. Start whenever you’re ready: seats nobody took are left out.'}
      </p>
    </div>
  );
}
