import { resolveText } from '@cx/content';
import type { EngineContext, GameState } from '@cx/engine';
import { readSave, type SaveFile } from '@cx/host';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cloud } from './cloud/cloud';
import { newestAutosave } from './cloud/autosave';
import { CONCEPTS } from './game/concepts';
import { hallOfFame } from './game/hallOfFame';
import { AUTOSAVE, loadSave, ONLINE_AUTOSAVE } from './game/storage';
import { isFullscreen, toggleFullscreen } from './settings';
import { Emblem } from './ui/Emblem';
import { Icon } from './ui/Icon';
import { LeaderCard, leaderArt } from './ui/LeaderCard';
import { ago, describeSave as describe } from './menu/saveInfo';
import { newVersionOut, versionLabel } from './update';

interface Props {
  ctx: EngineContext;
  /** Keys work only while no other screen is open over this one. */
  active: boolean;
  /** Play the game that's already set up behind this screen. */
  onPlay: () => void;
  onNewGame: () => void;
  onLoadGame: () => void;
  onContinue: (state: GameState) => void;
  onMapLab: () => void;
  onOnline: () => void;
  onHallOfFame: () => void;
  onAccount: () => void;
  onOptions: () => void;
  /** Opens the Civilopedia (on an article, when given). */
  onPedia: (article?: string) => void;
  /** Host the online game this browser hosted last (from its autosave). */
  onResumeOnline: (state: GameState) => void;
}

/**
 * The title screen, over the live map: continue where you left off, start a game, find a game
 * (load, online), and everything else (Hall of Fame, Civilopedia, Options, Account). Letters on
 * the keyboard jump to an entry; the arrows move between them.
 */
export function HomeScreen(props: Props) {
  const { ctx, active, onPlay, onNewGame, onLoadGame, onContinue, onOnline } = props;
  const [autosave, setAutosave] = useState<SaveFile | null>(null);
  const [onlineSave, setOnlineSave] = useState<SaveFile | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    // The browser's autosave shows at once; a newer one in the cloud (another device) replaces it.
    const read = async (id: string, set: (s: SaveFile) => void) => {
      let local: SaveFile | null = null;
      try {
        const save = await loadSave(id);
        const r = save ? readSave(JSON.stringify(save), ctx) : undefined;
        if (r?.ok && r.save.state.status === 'playing') local = r.save;
      } catch {
        // No browser storage: the cloud may still have one.
      }
      if (live && local) set(local);
      const newest = await newestAutosave(id, local, ctx);
      if (live && newest && newest !== local) set(newest);
    };
    void Promise.all([read(AUTOSAVE, setAutosave), read(ONLINE_AUTOSAVE, setOnlineSave)]).then(
      () => live && setLoaded(true),
    );
    return () => {
      live = false;
    };
  }, [ctx]);

  // A newer build on the website (this page was open a while, or it's the desktop app offline).
  const [updateOut, setUpdateOut] = useState(false);
  useEffect(() => {
    const check = () => void newVersionOut().then((out) => out && setUpdateOut(true));
    check();
    const timer = setInterval(check, 10 * 60_000);
    return () => clearInterval(timer);
  }, []);

  const record = useMemo(() => {
    const games = hallOfFame();
    const wins = games.filter((g) => g.won);
    const counts = new Map<string, number>();
    for (const g of games) counts.set(g.leader, (counts.get(g.leader) ?? 0) + 1);
    const fav = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      games: games.length,
      wins: wins.length,
      best: games.reduce((m, g) => Math.max(m, g.score), 0),
      fav: fav?.[0] ?? '',
    };
  }, []);
  const tip = useMemo(() => {
    const c = CONCEPTS[Math.floor(Math.random() * CONCEPTS.length)]!;
    return { id: c.id, title: c.title, text: c.paragraphs(ctx.content)[0] ?? '' };
  }, [ctx]);

  const signedIn = cloud()?.session?.name;
  const info = autosave ? describe(ctx, autosave) : null;
  const [full, setFull] = useState(isFullscreen);
  const menu = useRef<HTMLElement>(null);

  type Entry = {
    key: string;
    hot: string;
    icon: string;
    label: string;
    sub: string;
    run: () => void;
    primary?: boolean;
  };
  const entries: Entry[] = [
    ...(autosave
      ? [
          {
            key: 'continue',
            hot: 'c',
            icon: 'next',
            label: 'Continue',
            sub: `Turn ${autosave.turn} · ${ago(autosave.savedAt)}`,
            run: () => onContinue(autosave.state),
            primary: true,
          },
        ]
      : []),
    {
      key: 'quick',
      hot: 'q',
      icon: 'war',
      label: 'Quick game',
      sub: 'You and three rivals, small map',
      run: onPlay,
      primary: !autosave,
    },
    {
      key: 'new',
      hot: 'n',
      icon: 'settler',
      label: 'New game',
      sub: 'Leaders, colors, map and rules',
      run: onNewGame,
    },
    {
      key: 'online',
      hot: 'o',
      icon: 'diplomacy',
      label: 'Play online',
      sub: 'Host a game or join with a code',
      run: onOnline,
    },
    {
      key: 'load',
      hot: 'l',
      icon: 'check',
      label: 'Load game',
      sub: 'Saves, cloud saves and files',
      run: onLoadGame,
    },
    {
      key: 'fame',
      hot: 'h',
      icon: 'trophy',
      label: 'Hall of Fame',
      sub:
        record.games > 0
          ? `${record.games} game${record.games === 1 ? '' : 's'} · ${record.wins} won`
          : 'Your finished games',
      run: props.onHallOfFame,
    },
    {
      key: 'pedia',
      hot: 'p',
      icon: 'pedia',
      label: 'Civilopedia',
      sub: 'Every unit, leader, wonder and rule',
      run: () => props.onPedia(),
    },
    {
      key: 'options',
      hot: ',',
      icon: 'settings',
      label: 'Options',
      sub: 'Sound, graphics, interface, controls',
      run: props.onOptions,
    },
  ];

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          e.key === 'ArrowDown'
            ? buttons[(i + 1) % buttons.length]
            : buttons[(i <= 0 ? buttons.length : i) - 1];
        next?.focus();
        return;
      }
      const hit = entries.find((x) => x.hot === e.key.toLowerCase());
      if (hit && !e.repeat) {
        e.preventDefault();
        hit.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The first entry has focus, so Enter and the arrows work at once.
  useEffect(() => {
    if (active && loaded) menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [active, loaded]);

  const stat = (n: number | string, label: string) => (
    <div>
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );

  return (
    <div className="home" role="dialog" aria-label="Civius Maximus" hidden={!active}>
      <div className="home-top">
        <button
          type="button"
          className="ghost home-chip"
          onClick={props.onAccount}
          title={
            signedIn ? 'Your account and cloud saves' : 'Sign in for cloud saves and public games'
          }
        >
          <Icon name="influence" size={18} />
          {signedIn ? signedIn : 'Sign in'}
        </button>
        <button
          type="button"
          className="ghost home-chip icon"
          aria-label={full ? 'Leave full screen' : 'Full screen'}
          title={full ? 'Leave full screen' : 'Full screen'}
          onClick={() => {
            toggleFullscreen();
            setTimeout(() => setFull(isFullscreen()), 250);
          }}
        >
          ⛶
        </button>
        <button
          type="button"
          className="ghost home-chip icon"
          aria-label="Options"
          title="Options (,)"
          onClick={props.onOptions}
        >
          <Icon name="settings" size={18} />
        </button>
      </div>

      <div className="home-stage">
        <section className="home-brand" aria-label="Civius Maximus">
          <div className="home-crest" aria-hidden="true">
            <Emblem symbol="crown" primary="#7a1f2b" secondary="#f0d48c" size={68} />
          </div>
          <h1 className="home-title">Civius Maximus</h1>
          <p className="home-sub">Build an empire to stand the test of time.</p>

          <nav className="home-menu" aria-label="Main menu" ref={menu}>
            {entries.map((x) => (
              <button
                key={x.key}
                type="button"
                className={`home-entry ${x.primary ? 'primary' : ''}`}
                onClick={x.run}
              >
                <Icon name={x.icon} size={26} />
                <span className="home-entry-text">
                  <strong>{x.label}</strong>
                  <small>{x.sub}</small>
                </span>
                <kbd aria-hidden="true">{x.hot.toUpperCase()}</kbd>
              </button>
            ))}
          </nav>
        </section>

        <aside className="home-side" aria-label="Your games">
          {autosave && info ? (
            <article className="home-card home-continue">
              <header>
                <span className="home-kicker">Continue</span>
                <span className="mx-chip">{ago(autosave.savedAt)}</span>
              </header>
              <div className="home-continue-body">
                <LeaderCard content={ctx.content} leader={info.leader} size={150} />
                <div className="home-continue-text">
                  <h2>{leaderArt(ctx.content, info.leader).civName}</h2>
                  <p>
                    Turn <b>{autosave.turn}</b>
                    {info.era && <> · {info.era}</>}
                  </p>
                  <ul className="home-facts">
                    <li>{info.settlements} settlements</li>
                    <li>Score {info.score}</li>
                    <li>
                      {info.civs} civs{info.humans > 1 ? ` · ${info.humans} players` : ''}
                    </li>
                    {info.map && <li>{resolveText(ctx.content, info.map)}</li>}
                    {info.difficulty && <li>{resolveText(ctx.content, info.difficulty)}</li>}
                  </ul>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => onContinue(autosave.state)}
                  >
                    Continue game
                  </button>
                </div>
              </div>
            </article>
          ) : loaded ? (
            <article className="home-card home-welcome">
              <span className="home-kicker">Welcome</span>
              <h2>No game in progress</h2>
              <p>
                A quick game drops you in against three rivals on a small map. Your game saves
                itself every turn, and Continue brings it back here.
              </p>
              <button type="button" className="primary" onClick={onPlay}>
                Start a quick game
              </button>
            </article>
          ) : null}

          {onlineSave && (
            <article className="home-card home-resume">
              <span className="home-kicker">Your online game</span>
              <p>
                Turn {onlineSave.turn} · {ago(onlineSave.savedAt)}. Friends reconnect by themselves.
              </p>
              <button type="button" onClick={() => props.onResumeOnline(onlineSave.state)}>
                Host it again
              </button>
            </article>
          )}

          {record.games > 0 && (
            <article className="home-card home-record">
              <header>
                <span className="home-kicker">Your record</span>
                <button type="button" className="ghost small" onClick={props.onHallOfFame}>
                  Hall of Fame
                </button>
              </header>
              <div className="home-stats">
                {stat(record.games, 'games')}
                {stat(record.wins, 'victories')}
                {stat(record.best, 'best score')}
              </div>
              {record.fav && <p className="muted">Most played: {record.fav}</p>}
            </article>
          )}

          <article className="home-card home-tip">
            <header>
              <span className="home-kicker">How to play</span>
              <button
                type="button"
                className="ghost small"
                onClick={() => props.onPedia(`concept:${tip.id}`)}
              >
                Read more
              </button>
            </header>
            <h3>{tip.title}</h3>
            <p>{tip.text}</p>
          </article>
        </aside>
      </div>

      <footer className="home-foot-bar">
        <span className="home-version">{versionLabel()}</span>
        <span className="home-saves">
          Your game saves itself every turn
          {cloud()?.signedIn ? ', here and to your account' : ' in this browser'}.
        </span>
        {updateOut && (
          <button
            type="button"
            className="home-update"
            onClick={() => location.reload()}
            title="Everyone playing together needs the same version: reload between games."
          >
            A new version is out · <strong>Reload</strong>
          </button>
        )}
        <button type="button" className="ghost small" onClick={props.onMapLab}>
          Map Lab
        </button>
      </footer>
    </div>
  );
}
