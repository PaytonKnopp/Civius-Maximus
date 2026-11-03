import type { EngineContext, GameSetup, GameState } from '@cx/engine';
import type { GameHandle } from '@cx/host';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadContent } from './content';
import { HomeScreen } from './HomeScreen';
import { AccountDialog } from './cloud/AccountDialog';
import { CivilopediaScreen } from './game/CivilopediaScreen';
import { HallOfFameScreen } from './game/HallOfFameScreen';
import { type GameStart, GameScreen } from './game/GameScreen';
import { Gallery } from './Gallery';
import { GameErrorBoundary } from './ui/ErrorBoundary';
import {
  DEFAULT_OPTIONS,
  loadLastOptions,
  makeSetup,
  type NewGameOptions,
  randomSeed,
  sanitize,
  saveLastOptions,
} from './setup/options';
import { SetupScreen } from './setup/SetupScreen';
import { OptionsScreen } from './menu/OptionsScreen';
import { SavesScreen } from './menu/SavesScreen';
import { hasWebGL2, setSettings, useSettings } from './settings';
import { MapLab } from './lab/MapLab';
import { Icon } from './ui/Icon';
import type { Quality } from './map/renderer';
import { inviteLink, OnlineDialog, type OnlineOptions } from './online/OnlineDialog';
import { networkFromUrl } from './online/transports';

let nextStart = 0;
const startId = () => `start-${++nextStart}`;

/** A new online game: the humans (host first, with their lobby leader picks) and AI rivals. */
function makeOnlineSetup(
  names: string[],
  o: OnlineOptions,
  leaders: (string | null)[] = [],
  colors: (string | null)[] = [],
): GameSetup {
  const rules = o.rules;
  return makeSetup({
    ...DEFAULT_OPTIONS,
    script: o.script,
    size: o.size,
    humans: names,
    rivals: o.rivals,
    seed: randomSeed(),
    camps: rules?.camps ?? true,
    domination: rules?.domination ?? true,
    religion: rules?.religion ?? true,
    cityStates: rules?.cityStates ?? true,
    science: rules?.science ?? true,
    culture: rules?.culture ?? true,
    loyalty: rules?.loyalty ?? true,
    espionage: rules?.espionage ?? true,
    congress: rules?.congress ?? true,
    diplomatic: rules?.diplomatic ?? true,
    disasters: rules?.disasters ?? true,
    nukes: rules?.nukes ?? true,
    theologicalCombat: rules?.theologicalCombat ?? false,
    huts: rules?.huts ?? true,
    turnLimit: o.turnLimit ?? null,
    speed: o.speed,
    difficulty: o.difficulty,
    ...(o.startEra ? { startEra: o.startEra } : {}),
    picks: Object.fromEntries(
      leaders.flatMap((leader, i) => {
        const color = colors[i];
        return leader || color
          ? [[i, { ...(leader ? { leader } : {}), ...(color ? { color } : {}) }]]
          : [];
      }),
    ),
  });
}

/** `#join=ABC123` (an invite link) opens the Join screen with the code. */
const joinCodeFromUrl = () => /^#join=(\w+)$/.exec(location.hash)?.[1];

export function App() {
  const content = useMemo(loadContent, []);
  const ctx: EngineContext = useMemo(() => ({ content }), [content]);
  // `#lab` opens the Map Lab directly (handy for sharing a map, and for the screenshot scripts).
  // `#gallery` shows every leader portrait and civ emblem.
  const [screen, setScreenState] = useState<'game' | 'lab' | 'gallery'>(() =>
    location.hash === '#lab' ? 'lab' : location.hash === '#gallery' ? 'gallery' : 'game',
  );
  const setScreen = (s: 'game' | 'lab') => {
    history.replaceState(null, '', s === 'lab' ? '#lab' : location.pathname + location.search);
    setScreenState(s);
  };
  // The setup screen opens on the last setup used; a quick game always uses the defaults.
  const [options, setOptions] = useState<NewGameOptions>(() =>
    sanitize(content, { ...DEFAULT_OPTIONS, ...loadLastOptions(), seed: randomSeed() }),
  );
  const [start, setStartState] = useState<GameStart>(() => ({
    id: startId(),
    setup: makeSetup({ ...DEFAULT_OPTIONS, seed: randomSeed() }),
  }));
  // The game behind the title screen is a quick game nobody has played yet (true), or the
  // player's own game, which the title screen then offers to return to.
  const [fresh, setFresh] = useState(true);
  const setStart = useCallback((s: GameStart, isFresh = false) => {
    setStartState(s);
    setFresh(isFresh);
  }, []);
  const quickGame = (): GameStart => ({
    id: startId(),
    setup: makeSetup({ ...DEFAULT_OPTIONS, seed: randomSeed() }),
  });
  // Screens over the title screen and the game: setup, saves, Hall of Fame, Civilopedia...
  const [dialog, setDialog] = useState<
    'new' | 'saves' | 'account' | 'options' | 'fame' | 'pedia' | null
  >(null);
  const [pediaArticle, setPediaArticle] = useState<string | undefined>();
  // Online play: the host/join dialog, opened from the home screen or an invite link.
  const [online, setOnline] = useState<{ joinCode?: string; resume?: GameState } | null>(() => {
    const code = joinCodeFromUrl();
    return code ? { joinCode: code } : null;
  });
  // The title screen at startup (`#play` skips it, for scripts and links straight into a game).
  const [home, setHome] = useState(() => location.hash !== '#play' && !joinCodeFromUrl());
  // The map view and its quality are options (settings.ts), also changed from the game's menu.
  const settings = useSettings();
  const mode: '3d' | '2d' = hasWebGL2() ? settings.view : '2d';
  const setMode = (view: '3d' | '2d') => setSettings({ view });
  const quality: Quality = settings.quality;
  const setQuality = (q: Quality) => setSettings({ quality: q });
  const game = useRef<GameHandle>(undefined);
  const onGame = useCallback((g: GameHandle) => {
    game.current = g;
  }, []);
  const onOnlineGame = useCallback(
    (handle: GameHandle) => {
      history.replaceState(null, '', location.pathname + location.search);
      setStart({ id: startId(), handle });
      setOnline(null);
      setHome(false);
    },
    [setStart],
  );
  // A finished game goes back to the title screen, over a new quick game.
  const backHome = useCallback(() => {
    setStart({ id: startId(), setup: makeSetup({ ...DEFAULT_OPTIONS, seed: randomSeed() }) }, true);
    setHome(true);
  }, [setStart]);
  // Leaving an online game any way (a new game, a load, the menu) closes its connections.
  useEffect(() => () => ('handle' in start ? start.handle.online?.leave() : undefined), [start]);

  if (screen === 'lab') return <MapLab content={content} onBack={() => setScreen('game')} />;
  if (screen === 'gallery') return <Gallery content={content} onBack={() => setScreen('game')} />;

  return (
    <div className="app">
      <GameErrorBoundary key={start.id} onReset={backHome}>
        <GameScreen
          key={start.id}
          content={content}
          start={start}
          mode={mode}
          quality={quality}
          onGame={onGame}
          onExit={backHome}
          covered={home || dialog !== null || online !== null}
        />
      </GameErrorBoundary>
      {home && !online && (
        <HomeScreen
          ctx={ctx}
          active={dialog === null}
          {...(fresh ? {} : { onResume: () => setHome(false) })}
          onPlay={() => {
            // The quick game behind the title screen, or a new one if that's your own game.
            if (!fresh) setStart(quickGame());
            else setFresh(false);
            setHome(false);
          }}
          onNewGame={() => setDialog('new')}
          onLoadGame={() => setDialog('saves')}
          onContinue={(state) => {
            setStart({ id: startId(), state });
            setHome(false);
          }}
          onMapLab={() => setScreen('lab')}
          onOnline={() => setOnline({})}
          onHallOfFame={() => setDialog('fame')}
          onAccount={() => setDialog('account')}
          onOptions={() => setDialog('options')}
          onPedia={(article) => {
            setPediaArticle(article);
            setDialog('pedia');
          }}
          onResumeOnline={(state) => setOnline({ resume: state })}
        />
      )}
      {online && (
        <OnlineDialog
          content={content}
          ctx={ctx}
          net={networkFromUrl()}
          {...(online.joinCode ? { joinCode: online.joinCode } : {})}
          {...(online.resume ? { resume: online.resume } : {})}
          makeSetup={makeOnlineSetup}
          onGame={onOnlineGame}
          onCancel={() => {
            history.replaceState(null, '', location.pathname + location.search);
            setOnline(null);
            setHome(true);
          }}
        />
      )}
      <header className="game-bar">
        <div className="bar-actions">
          {'handle' in start && start.handle.online && (
            <OnlineCode code={start.handle.online.code} />
          )}
          <GameMenu
            onNewGame={() => setDialog('new')}
            onSaves={() => setDialog('saves')}
            onAccount={() => setDialog('account')}
            onOptions={() => setDialog('options')}
            onPedia={() => {
              setPediaArticle(undefined);
              setDialog('pedia');
            }}
            onMapLab={() => setScreen('lab')}
            onHome={() => setHome(true)}
            quality={mode === '3d' ? quality : null}
            onQuality={setQuality}
          />
          <div className="segmented compact" role="group" aria-label="View">
            {(['3d', '2d'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={mode === m ? 'on' : ''}
                onClick={() => setMode(m)}
              >
                {m === '3d' ? '3D' : '2D'}
              </button>
            ))}
          </div>
        </div>
      </header>
      {dialog === 'new' && (
        <SetupScreen
          content={content}
          initial={options}
          onCancel={() => setDialog(null)}
          onStart={(o) => {
            setOptions(o);
            saveLastOptions(o);
            setStart({ id: startId(), setup: makeSetup(o) });
            setDialog(null);
            setHome(false);
          }}
        />
      )}
      {dialog === 'account' && <AccountDialog onClose={() => setDialog(null)} />}
      {dialog === 'options' && <OptionsScreen onClose={() => setDialog(null)} />}
      {dialog === 'fame' && <HallOfFameScreen content={content} onClose={() => setDialog(null)} />}
      {dialog === 'pedia' && (
        <CivilopediaScreen
          content={content}
          initial={pediaArticle}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'saves' && (
        <SavesScreen
          ctx={ctx}
          current={() => (!home && game.current?.saves ? game.current.state : undefined)}
          onClose={() => setDialog(null)}
          onLoad={(state) => {
            setStart({ id: startId(), state });
            setDialog(null);
            setHome(false);
          }}
        />
      )}
    </div>
  );
}

/** The ☰ menu at the top right: new game, saves, Map Lab, the title screen. */
function GameMenu(props: {
  onNewGame: () => void;
  onSaves: () => void;
  onAccount: () => void;
  onOptions: () => void;
  onPedia: () => void;
  onMapLab: () => void;
  onHome: () => void;
  /** The 3D view's graphics quality (null in the 2D view). */
  quality: Quality | null;
  onQuality: (q: Quality) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="game-menu">
      <button
        type="button"
        className="menu-button"
        aria-expanded={open}
        aria-label="Menu"
        title="Menu"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="menu" size={30} />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={pick(props.onNewGame)}>
            New game…
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onSaves)}>
            Save / Load…
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onOptions)}>
            Options…
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onPedia)}>
            Civilopedia
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onAccount)}>
            Account…
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onMapLab)}>
            Map Lab
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onHome)}>
            Title screen
          </button>
          {props.quality && (
            <div className="menu-section">
              <h4>Graphics</h4>
              <div className="segmented" role="group" aria-label="Graphics quality">
                {(['low', 'medium', 'high'] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    aria-pressed={props.quality === q}
                    className={props.quality === q ? 'on' : ''}
                    onClick={() => props.onQuality(q)}
                  >
                    {q === 'low' ? 'Low' : q === 'medium' ? 'Medium' : 'High'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The online game's join code; a click copies the invite link. */
function OnlineCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ghost small online-chip"
      title="Online game: copy the invite link"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(inviteLink(code, networkFromUrl()))
          .then(() => setCopied(true))
          .catch(() => {});
      }}
    >
      {copied ? 'Link copied' : `🌐 ${code}`}
    </button>
  );
}
