import { type CompiledContent, resolveText } from '@cx/content';
import {
  type Action,
  atWar,
  relation,
  attackProblem,
  attackTargets,
  type CombatPreview as Preview,
  developCandidates,
  distance,
  type EngineContext,
  findPath,
  fogOfWar,
  formatFixed,
  type GameEvent,
  type GameSetup,
  type GameState,
  scoreOf,
  teamOf,
  improvementsFor,
  celebrationThreshold,
  nodeCost,
  playerEra,
  type PlayerId,
  pantheonOf,
  policySlots,
  previewAttack,
  previewStrike,
  purchasableTiles,
  settlementMaxHealth,
  type SettlementState,
  SLOT_KINDS,
  strikeTargets,
  targetAt,
  targetOwner,
  tilePurchaseCost,
  tilesWithin,
  type TreeKind,
  unitDef,
  unitIds,
  type UnitState,
  wallsMax,
  warKey,
  workableTiles,
} from '@cx/engine';
import { type GameHandle, LocalGame, makeSave, RemoteGame } from '@cx/host';
import { Icon, Rich } from '../ui/Icon';
import { ScreenButton } from '../ui/ScreenButton';
import type { SeatInfo } from '@cx/protocol';
import { createAiRunner } from './aiRunner';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TileCard } from '../components/TileCard';
import { MapView } from '../map/MapView';
import type { MapRenderer, PathView, Quality, TileHighlight } from '../map/renderer';
import { World3D } from '../map3d/World3D';
import { CombatPreview, type Side } from './CombatPreview';
import { CaptureDialog, GameOver, PlayerPanel, WarPrompt } from './Diplomacy';
import { AUTOSAVE, ONLINE_AUTOSAVE, storeSave } from './storage';
import {
  civName,
  cssColor,
  empireSummary,
  itemName,
  nextAction,
  perTurn,
  placementChoices,
  playerColors,
  religionNameOf,
  settlementViews,
  showTurns,
  territoryView,
  turnsFor,
  unitViews,
  whole,
} from './model';
import { GovernmentScreen } from './GovernmentScreen';
import { GreatPeopleScreen } from './GreatPeopleScreen';
import { ReligionScreen } from './ReligionScreen';
import { CityStatesScreen } from './CityStatesScreen';
import { VictoriesScreen } from './VictoriesScreen';
import { GraphsScreen, HistoryChart } from './GraphsScreen';
import { HelpScreen } from './HelpScreen';
import { HINTS, hintFor, hintsOn, markSeen, seenHints, setHints } from './hints';
import { type Lens, LENSES, lensFor } from './lenses';
import { LeaderIntro, LeaderSpeech, type SpeechLine } from './LeaderSpeech';
import { Minimap } from './Minimap';
import { music, play, type Sfx } from '../audio';
import { LeaderHead } from '../ui/LeaderCard';
import { type PanelMode, type Placing, SettlementPanel } from './SettlementPanel';
import { TreeScreen } from './TreeScreen';
import { UnitPanel } from './UnitPanel';

type Selection = { kind: 'unit'; id: string } | { kind: 'settlement'; id: string } | null;

function toPathView(steps: ReturnType<typeof findPath>): PathView | null {
  if (!steps) return null;
  return {
    steps: steps.map((s, i) => ({
      tile: s.tile,
      turn: s.turn,
      endsTurn: i < steps.length - 1 && steps[i + 1]!.turn > s.turn,
    })),
  };
}

/** A notification for the viewer, or undefined if the event isn't worth one. */
/** The sound for an event, as the viewer hears it (docs/06-ui-ux.md, "Music and sound"). */
function soundFor(e: GameEvent, me: PlayerId, s: GameState): Sfx | null {
  switch (e.type) {
    case 'settlement_founded':
      return e.owner === me ? 'found' : null;
    case 'item_completed':
      return e.owner === me ? 'build' : null;
    case 'item_bought':
      return 'buy';
    case 'tech_researched':
      return e.player === me ? 'research' : null;
    case 'civic_completed':
      return e.player === me ? 'civic' : null;
    case 'boost_earned':
      return e.player === me ? 'boost' : null;
    case 'settlement_grew':
      return s.settlements[e.settlement]?.owner === me ? 'grow' : null;
    case 'border_grew':
      return null;
    case 'combat': {
      // Guns and cannon from the age of gunpowder on; blades and arrows before.
      const type = e.attacker.kind === 'unit' ? e.attacker.unitType : '';
      if (/cannon|artillery|bombard|frigate|ironclad|destroyer|privateer/.test(type))
        return 'cannon';
      if (
        /musket|infantry|rifle|machine_gun|guard|pike_and_shot|at_crew|cavalry|rough_rider/.test(
          type,
        )
      )
        return 'gun';
      return e.mode === 'ranged' ? 'ranged' : 'melee';
    }
    case 'unit_killed':
      return 'killed';
    case 'settlement_captured':
    case 'civilian_captured':
      return 'captured';
    case 'unit_promoted':
      return 'promote';
    case 'war_declared':
      return e.target === me || e.by === me ? 'war' : null;
    case 'peace_made':
      return e.players.includes(me) ? 'peace' : null;
    case 'deal_accepted':
      return e.from === me || e.to === me ? 'deal' : null;
    case 'wonder_completed':
      return e.owner === me ? 'wonder' : 'notify';
    case 'great_person_born':
    case 'great_person_activated':
      return 'great_person';
    case 'religion_founded':
    case 'pantheon_founded':
      return 'religion';
    case 'government_changed':
      return e.player === me ? 'government' : null;
    case 'turn_started':
      return 'turn';
    case 'unit_moved': {
      if (e.owner !== me) return null;
      const type = s.units[e.unit]?.type ?? '';
      if (/galley|caravel|frigate|privateer|ironclad|destroyer|ship|boat/.test(type))
        return 'move_ship';
      if (/horse|cavalry|knight|chariot|keshig|companion|mandekalu|rough_rider/.test(type))
        return 'move_horse';
      return 'move';
    }
    case 'settlement_razing':
      return 'burning';
    case 'game_ended':
      return e.winner === me ? 'victory' : 'defeat';
    default:
      return null;
  }
}

function noticeFor(
  content: CompiledContent,
  state: GameState,
  e: GameEvent,
  ME: PlayerId,
): string | undefined {
  const name = (id: string) => state.settlements[id]?.name ?? 'A settlement';
  switch (e.type) {
    case 'turn_started':
      return `Turn ${e.turn}`;
    case 'settlement_founded':
      return e.owner === ME
        ? `${e.name} founded`
        : `${civName(content, state, e.owner)} founded ${e.name}`;
    case 'settlement_grew':
      return e.owner === ME ? `${name(e.settlement)} grew to ${e.population}` : undefined;
    case 'settlement_starved':
      return e.owner === ME ? `${name(e.settlement)} is starving` : undefined;
    case 'item_completed':
      return e.owner === ME
        ? `${name(e.settlement)} finished ${itemName(content, e.item)}`
        : undefined;
    case 'town_upgraded':
      return e.owner === ME ? `${name(e.settlement)} is now a city` : undefined;
    case 'tech_researched':
      return `Researched ${resolveText(content, content.entities.tech[e.tech]?.name ?? e.tech)}`;
    case 'civic_completed':
      return `${resolveText(content, content.entities.civic[e.civic]?.name ?? e.civic)} completed: change policies free this turn`;
    case 'boost_earned': {
      const node = e.kind === 'tech' ? content.entities.tech[e.id] : content.entities.civic[e.id];
      return `Boost! ${resolveText(content, node?.name ?? e.id)} +${content.rules.progress.boostPercent}%`;
    }
    case 'celebration_started':
      return `Your people celebrate! (${e.turns} turns)`;
    case 'celebration_ended':
      return 'The celebration is over';
    case 'government_changed':
      return e.player === ME
        ? `New government: ${resolveText(content, content.entities.government[e.government]?.name ?? e.government)}`
        : undefined;
    case 'unit_disbanded':
      return e.reason === 'no_gold' ? 'Out of gold: a unit was disbanded' : undefined;
    case 'wonder_completed': {
      const wonder = resolveText(content, content.entities.wonder[e.wonder]?.name ?? e.wonder);
      return e.owner === ME
        ? `${name(e.settlement)} built ${wonder}!`
        : `${civName(content, state, e.owner)} built ${wonder}`;
    }
    case 'wonder_lost': {
      const wonder = resolveText(content, content.entities.wonder[e.wonder]?.name ?? e.wonder);
      return e.owner === ME
        ? `${wonder} was built elsewhere: ${name(e.settlement)} got ${Math.floor(e.gold / 100)} gold back`
        : undefined;
    }
    case 'war_declared':
      return e.target === ME
        ? `${civName(content, state, e.by)} declared war on you!`
        : e.by === ME
          ? `You declared war on ${civName(content, state, e.target)}`
          : `${civName(content, state, e.by)} declared war on ${civName(content, state, e.target)}`;
    case 'peace_offered':
      return e.to === ME
        ? `${civName(content, state, e.from)} offers peace (open their name above to accept)`
        : `You offered peace to ${civName(content, state, e.to)}`;
    case 'deal_proposed':
      return e.to === ME
        ? `${civName(content, state, e.from)} offers you a deal (open their name above)`
        : undefined;
    case 'deal_accepted': {
      const pact = e.alliance ? 'an alliance' : e.friendship ? 'a friendship' : undefined;
      if (e.from === ME || e.to === ME) {
        const them = civName(content, state, e.from === ME ? e.to : e.from);
        return e.from === ME ? `${them} accepted your deal` : `Deal signed with ${them}`;
      }
      return pact
        ? `${civName(content, state, e.from)} and ${civName(content, state, e.to)} signed ${pact}`
        : undefined;
    }
    case 'deal_declined':
      return e.from === ME ? `${civName(content, state, e.to)} declined your deal` : undefined;
    case 'deal_expired':
      return e.from === ME ? `Your offer to ${civName(content, state, e.to)} expired` : undefined;
    case 'deal_broken':
      return e.by === ME
        ? `You couldn't pay ${civName(content, state, e.to)}: the deal is broken`
        : e.to === ME
          ? `${civName(content, state, e.by)} stopped paying you: the deal is broken`
          : `${civName(content, state, e.by)} broke a deal with ${civName(content, state, e.to)}`;
    case 'pact_ended': {
      const [a, b] = e.players;
      const them = civName(content, state, a === ME ? b : a);
      return `Your ${e.kind} with ${them} has ended`;
    }
    case 'trade_route_started':
      return e.owner === ME
        ? `Trade route from ${name(e.from)} to ${name(e.to)} started`
        : state.settlements[e.to]?.owner === ME
          ? `${civName(content, state, e.owner)} opened a trade route to ${name(e.to)}`
          : undefined;
    case 'trade_route_ended':
      return e.owner === ME
        ? `Your trader from ${name(e.from)} is home: send it out again`
        : undefined;
    case 'great_person_born': {
      const gp = content.entities.greatPerson[e.person];
      const who = gp ? resolveText(content, gp.name) : 'A great person';
      return e.player === ME
        ? `${who} joins you! Activate them in one of your settlements`
        : `${who} was born in ${civName(content, state, e.player)}`;
    }
    case 'great_person_activated':
      return undefined;
    case 'pantheon_founded': {
      const b = resolveText(content, content.entities.belief[e.belief]?.name ?? e.belief);
      return e.player === ME
        ? `Your people now follow the pantheon ${b}`
        : `${civName(content, state, e.player)} took the pantheon ${b}`;
    }
    case 'religion_founded': {
      const r = state.religions[e.religion]?.name ?? 'A religion';
      return e.player === ME
        ? `You founded ${r}! ${name(e.settlement)} is its holy city`
        : `${civName(content, state, e.player)} founded ${r}`;
    }
    case 'settlement_converted': {
      const r = e.religion ? (state.religions[e.religion]?.name ?? 'a religion') : 'no religion';
      if (e.owner === ME) return `${name(e.settlement)} now follows ${r}`;
      return e.religion && state.religions[e.religion]?.founder === ME
        ? `${name(e.settlement)} (${civName(content, state, e.owner)}) converted to ${r}`
        : undefined;
    }
    case 'religion_preached':
      return undefined;
    case 'space_project': {
      const project = resolveText(content, content.entities.project[e.project]?.name ?? e.project);
      const who = e.player === ME ? 'You' : civName(content, state, e.player);
      return e.arrives !== null
        ? `${who} launched the ${project}: it arrives on turn ${e.arrives}`
        : `${who} finished ${project}`;
    }
    case 'unit_upgraded':
      return undefined;
    case 'city_state_met':
      return e.player === ME
        ? `You found the city-state ${civName(content, state, e.cityState)}${e.envoys > 0 ? `: first to arrive, +${e.envoys} envoy` : ''}`
        : undefined;
    case 'envoy_sent':
      return undefined;
    case 'suzerain_changed': {
      const cs = civName(content, state, e.cityState);
      if (e.to === ME) return `You are now the suzerain of ${cs}`;
      if (e.from === ME)
        return e.to
          ? `${civName(content, state, e.to)} took over ${cs} from you`
          : `You are no longer the suzerain of ${cs}`;
      return undefined;
    }
    case 'city_state_quest':
      return e.player === ME
        ? `${civName(content, state, e.cityState)} thanks you: ${e.quest} (+${content.rules.cityStates.questEnvoys} envoy)`
        : undefined;
    case 'commander_retreated':
      return e.owner === ME
        ? `Your commander fell back to a settlement (back in action on turn ${e.until})`
        : undefined;
    case 'denounced':
      return e.target === ME
        ? `${civName(content, state, e.by)} denounced you!`
        : e.by === ME
          ? `You denounced ${civName(content, state, e.target)}`
          : `${civName(content, state, e.by)} denounced ${civName(content, state, e.target)}`;
    case 'peace_made': {
      const [a, b] = e.players;
      return a === ME || b === ME
        ? `Peace with ${civName(content, state, a === ME ? b : a)}`
        : `${civName(content, state, a)} and ${civName(content, state, b)} made peace`;
    }
    case 'unit_killed': {
      const unitName = resolveText(content, content.entities.unit[e.unitType]?.name ?? e.unitType);
      return e.owner === ME
        ? `Your ${unitName} was destroyed`
        : e.by === ME
          ? `You destroyed a ${unitName}`
          : undefined;
    }
    case 'civilian_captured': {
      const unitName = resolveText(content, content.entities.unit[e.unitType]?.name ?? e.unitType);
      return e.from === ME
        ? `Your ${unitName} was captured!`
        : e.by === ME
          ? `You captured a ${unitName}`
          : undefined;
    }
    case 'settlement_captured':
      return e.by === ME
        ? `You took ${e.name}!`
        : e.from === ME
          ? `${e.name} fell to ${civName(content, state, e.by)}!`
          : `${civName(content, state, e.by)} took ${e.name}`;
    case 'settlement_razed':
      return `${e.name} was razed`;
    case 'settlement_razing':
      return `${e.name} is being razed: gone in ${e.turns} turn${e.turns === 1 ? '' : 's'}`;
    case 'settlement_liberated':
      return `${e.name} was liberated and returned to ${civName(content, state, e.to)}`;
    case 'capital_moved':
      return e.player === ME ? `Your capital moved to ${name(e.settlement)}` : undefined;
    case 'camp_cleared':
      return e.by === ME
        ? `Hostile camp cleared: +${Math.floor(e.gold / 100)} gold`
        : `${civName(content, state, e.by)} cleared a hostile camp`;
    case 'player_defeated':
      return e.player === ME
        ? 'Your civilization has fallen'
        : `${civName(content, state, e.player)} has been defeated`;
    default:
      return undefined;
  }
}

/** A fight's sides as the preview shows them. */
function unitSide(ctx: EngineContext, state: GameState, u: UnitState, ME: PlayerId): Side {
  const name = resolveText(ctx.content, unitDef(ctx, u).name);
  return {
    name: u.owner === ME ? name : `${name} (${civName(ctx.content, state, u.owner)})`,
    health: u.health,
    maxHealth: ctx.content.rules.combat.maxHealth,
  };
}

function settlementSide(ctx: EngineContext, s: SettlementState): Side {
  return {
    name: s.name,
    health: s.health,
    maxHealth: settlementMaxHealth(ctx, s.kind),
    walls: s.walls,
    wallsMax: wallsMax(ctx, s),
  };
}

function targetSide(ctx: EngineContext, state: GameState, p: Preview, viewer: PlayerId): Side {
  const t = p.target;
  if (t.kind === 'unit') return unitSide(ctx, state, t.unit, viewer);
  if (t.kind === 'settlement') return settlementSide(ctx, t.settlement);
  return unitSide(ctx, state, t.units[0]!, viewer);
}

/** A game to start: a new one from a setup, or a saved one from its state. */
export type GameStart =
  | { id: string; setup: GameSetup }
  | { id: string; state: GameState }
  /** An online game: hosted here (`OnlineHost.handle()`) or joined (`RemoteGame`). */
  | { id: string; handle: GameHandle };

interface Props {
  content: CompiledContent;
  start: GameStart;
  mode: '3d' | '2d';
  quality: Quality;
  /** Called once the game exists (the app saves it from there). */
  onGame?: (game: GameHandle) => void;
  /** Something covers the game (the title screen, setup, a dialog): leader screens wait. */
  covered?: boolean;
  /** Leaves the game for the home screen (an online game that ended or lost its host). */
  onExit?: () => void;
}

/** The main game view: the map, your units and settlements, and the controls to play a turn. */
export function GameScreen({ content, start, mode, quality, onGame, onExit, covered }: Props) {
  const ctx: EngineContext = useMemo(() => ({ content }), [content]);
  // One background worker for the slow part of each turn (End Turn and the AI seats).
  const runner = useMemo(() => createAiRunner(), []);
  const game: GameHandle = useMemo(
    () =>
      'handle' in start
        ? start.handle
        : new LocalGame('state' in start ? start.state : start.setup, ctx, runner),
    [start, ctx, runner],
  );
  const [busy, setBusy] = useState(game.busy);
  useEffect(() => onGame?.(game), [game, onGame]);
  // Whose eyes the screen shows: the only human, or (hotseat) whoever holds the device now.
  const [viewer, setViewer] = useState<PlayerId>(
    () => game.nextHuman() ?? game.humans()[0] ?? game.state.playerOrder[0]!,
  );
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;
  // Hotseat: the device is being passed to this player (a screen hides the map until they're
  // ready), and what each human saw happen since their last turn.
  const hotseat = game.humans().length > 1;
  const [passTo, setPassTo] = useState<PlayerId | null>(() => (hotseat ? viewer : null));
  const summaries = useRef<Record<PlayerId, string[]>>({});
  const [summary, setSummary] = useState<string[] | null>(null);
  const [state, setState] = useState<GameState>(game.state);
  const busyRef = useRef(game.busy);
  const [selection, setSelection] = useState<Selection>(null);
  const selectionRef = useRef<Selection>(null);
  selectionRef.current = selection;
  const [hover, setHover] = useState<number>();
  const [pinned, setPinned] = useState<number | null>(null);
  const [inspect, setInspect] = useState<number>();
  const [panelMode, setPanelMode] = useState<PanelMode>('citizens');
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]);
  const [fps, setFps] = useState(0);
  const [overlay, setOverlay] = useState<
    | { kind: 'tree'; tree: TreeKind }
    | { kind: 'government' }
    | { kind: 'greatPeople' }
    | { kind: 'religion'; prophet?: string }
    | { kind: 'cityStates' }
    | { kind: 'victories' }
    | { kind: 'graphs' }
    | { kind: 'help' }
    | null
  >(null);
  // First-game hints (hints.ts): kept in this browser, re-read when the help screen closes.
  const [hintsSeen, setHintsSeen] = useState(seenHints);
  const [hintsEnabled, setHintsEnabled] = useState(hintsOn);
  const [policiesSeenBy, setPoliciesSeenBy] = useState<Record<PlayerId, number>>({});
  const policiesSeen = policiesSeenBy[viewer] ?? 0;
  const setPoliciesSeen = (turn: number) =>
    setPoliciesSeenBy((seen) => ({ ...seen, [viewerRef.current]: turn }));
  const [playerPanel, setPlayerPanel] = useState<PlayerId | null>(null);
  const [warPrompt, setWarPrompt] = useState<{
    target: PlayerId;
    unit: string;
    tile: number;
  } | null>(null);
  const [striking, setStriking] = useState(false);
  const [gameOverSeen, setGameOverSeen] = useState(false);
  // Leader screens: your leader's intro at the start, rivals speaking at war, peace and defeat.
  const [introSeen, setIntroSeen] = useState<Set<PlayerId>>(() => new Set());
  const [speech, setSpeech] = useState<{ player: PlayerId; line: SpeechLine } | null>(null);

  /** Hotseat: the next player took the device. Their view, their summary, their capital. */
  const beginTurn = (player: PlayerId) => {
    setViewer(player);
    viewerRef.current = player;
    setPassTo(null);
    setSelection(null);
    setOverlay(null);
    setPlayerPanel(null);
    setInspect(undefined);
    setPinned(null);
    setPlacing(null);
    setStriking(false);
    setPanelMode('citizens');
    const lines = summaries.current[player] ?? [];
    summaries.current[player] = [];
    setSummary(lines.length > 0 ? lines : null);
    const s = game.state;
    const capital = s.players[player]?.capital;
    const tile = capital
      ? s.settlements[capital]?.tile
      : Object.values(s.units).find((u) => u.owner === player)?.tile;
    if (tile !== undefined) viewRef.current?.focusTile(tile);
  };
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapRenderer>(undefined);
  const pendingMoves = useRef<{ unit: string; path: number[] }[]>([]);
  const noticeId = useRef(0);

  const notify = useCallback((text: string) => {
    const id = ++noticeId.current;
    setNotices((n) => [...n.slice(-2), { id, text }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 2600);
  }, []);

  // Online: who's connected, refusals from the host, and a lost connection.
  const online = game.online;
  const [seats, setSeats] = useState<SeatInfo[]>(() => online?.seats() ?? []);
  const [cutOff, setCutOff] = useState<string | null>(null);
  useEffect(() => {
    if (!online) return;
    if (game instanceof RemoteGame) game.onRefused = notify;
    const update = () => {
      setSeats(online.seats());
      if (game instanceof RemoteGame && game.ended) setCutOff(game.ended);
    };
    update();
    return online.onChange(update);
  }, [game, online, notify]);
  const away = seats.filter(
    (x) =>
      !x.online &&
      x.player &&
      state.players[x.player]?.alive &&
      !state.players[x.player]!.turnEnded,
  );

  const colors = useMemo(() => playerColors(content, state), [content, state.playerOrder]);
  const fog = useMemo(() => fogOfWar(ctx, state, viewer), [ctx, state, viewer]);
  const units = useMemo(
    () => unitViews(ctx, state, viewer, fog, colors),
    [ctx, state, fog, colors, viewer],
  );
  const territory = useMemo(() => territoryView(ctx, state, fog), [ctx, state, fog]);
  const settlements = useMemo(
    () => settlementViews(ctx, state, viewer, territory, colors),
    [ctx, state, territory, colors, viewer],
  );
  const empire = useMemo(() => empireSummary(ctx, state, viewer), [ctx, state, viewer]);
  const unit = selection?.kind === 'unit' ? state.units[selection.id] : undefined;
  const settlement = selection?.kind === 'settlement' ? state.settlements[selection.id] : undefined;
  const next = nextAction(
    ctx,
    state,
    viewer,
    selection?.kind === 'unit' ? selection.id : null,
    policiesSeen,
  );
  const me = state.players[viewer]!;
  const era = playerEra(ctx, me);
  // The music follows your era and your civ's culture.
  const architecture = ctx.content.entities.civ[me.civ]?.architecture ?? 'mediterranean';
  useEffect(() => {
    music.setEra(era?.order ?? 1, architecture);
  }, [era?.order, architecture]);
  // A hint counts as seen when it first shows, and stays up until dismissed or the turn ends.
  const [hintNow, setHintNow] = useState<{ id: string; turn: number } | null>(null);
  const hintsFree =
    hintsEnabled && !busy && !passTo && overlay === null && state.status === 'playing';
  const nextHint =
    hintsFree && hintNow === null ? hintFor({ ctx, state, viewer, next }, hintsSeen) : undefined;
  useEffect(() => {
    if (!nextHint) return;
    markSeen(nextHint.id);
    setHintsSeen(seenHints());
    setHintNow({ id: nextHint.id, turn: state.turn });
  }, [nextHint, state.turn]);
  useEffect(() => {
    if (hintNow && state.turn > hintNow.turn) setHintNow(null);
  }, [hintNow, state.turn]);
  const hint = hintsFree && hintNow ? HINTS.find((h) => h.id === hintNow.id) : undefined;
  const captured = Object.values(state.settlements).find(
    (x) => x.owner === viewer && x.captureChoice,
  );
  const openGovernment = useCallback(() => {
    setOverlay({ kind: 'government' });
    setPoliciesSeen(game.state.turn);
  }, [game]);

  // Renderer lifecycle (recreated when switching 2D/3D).
  useEffect(() => {
    const view: MapRenderer =
      mode === '3d' ? new World3D(hostRef.current!) : new MapView(hostRef.current!);
    view.onFps = setFps;
    viewRef.current = view;
    view.setFog(fog);
    void view
      .setData(
        { map: game.state.map, content, starts: {}, playerOrder: game.state.playerOrder },
        { grid: false, yields: false, viewer: null, quality },
      )
      .then(() => {
        view.setUnits(units);
        view.setSettlements(settlements, territory);
        view.setHighlights(highlights);
        const mine = Object.values(game.state.units).find((u) => u.owner === viewerRef.current);
        if (mine) view.focusTile(mine.tile, true);
      });
    return () => view.destroy();
  }, [game, mode]);

  useEffect(() => {
    void viewRef.current?.setOptions({ grid: false, yields: false, viewer: null, quality });
  }, [quality]);

  // `?debug` exposes the game and the map view to the browser console (and the screenshot
  // scripts): `cx.game.load(state)` swaps in any state, `cx.view.focusTile(tile, true)` zooms in.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return;
    (window as unknown as { cx: unknown }).cx = {
      game,
      ctx,
      get view() {
        return viewRef.current;
      },
      select: (kind: 'unit' | 'settlement', id: string) => select({ kind, id }, true),
      hex: { distance, tilesWithin },
    };
  });

  useEffect(() => {
    const off = game.subscribe((s, events) => {
      pendingMoves.current.push(
        ...events.flatMap((e) =>
          e.type === 'unit_moved' &&
          (e.visibleTo === 'all' || e.visibleTo.includes(viewerRef.current))
            ? [{ unit: e.unit, path: e.path }]
            : [],
        ),
      );
      const view = viewRef.current;
      const viewer = viewerRef.current;
      // Hotseat: everyone else gets what they could see for their turn summary. When the turn
      // was just processed, the device is about to be passed, so the last player gets theirs
      // in the summary too.
      const newTurn = events.some((e) => e.type === 'turn_started');
      for (const h of game.humans()) {
        if (h === viewer && !(newTurn && game.humans().length > 1)) continue;
        for (const e of events) {
          if (e.type === 'turn_started') continue;
          if (e.visibleTo !== 'all' && !e.visibleTo.includes(h)) continue;
          const text = noticeFor(content, s, e, h);
          if (text) (summaries.current[h] ??= []).push(text);
        }
      }
      if (events.some((e) => e.type === 'turn_started')) {
        // An online game's host keeps its own autosave (resumed online); clients only see a view.
        if (game.saves)
          void storeSave(
            game.online ? ONLINE_AUTOSAVE : AUTOSAVE,
            makeSave(s, `${game.online ? 'Online autosave' : 'Autosave'} · turn ${s.turn}`),
          ).catch(() => {});
      }
      for (const e of events) {
        if (e.visibleTo !== 'all' && !e.visibleTo.includes(viewer)) continue;
        const text = noticeFor(content, s, e, viewerRef.current);
        if (text) notify(text);
        const cue = soundFor(e, viewer, s);
        if (cue) play(cue);
        if (cue === 'wonder' || cue === 'victory' || cue === 'defeat' || cue === 'era')
          music.duck(4);
        const ai = (p: PlayerId) => s.players[p]?.kind === 'ai';
        if (e.type === 'war_declared' && e.target === viewer && ai(e.by))
          setSpeech({ player: e.by, line: 'war' });
        else if (e.type === 'war_declared' && e.by === viewer && ai(e.target))
          setSpeech({ player: e.target, line: 'war' });
        else if (e.type === 'peace_made' && e.players.includes(viewer)) {
          const other = e.players[0] === viewer ? e.players[1] : e.players[0];
          if (ai(other)) setSpeech({ player: other, line: 'peace' });
        } else if (e.type === 'player_defeated' && e.by === viewer && ai(e.player))
          setSpeech({ player: e.player, line: 'defeat' });
        if (!view) continue;
        if (e.type === 'combat') {
          view.animateAttack(
            e.attacker.kind === 'unit' ? e.attacker.unit : null,
            e.from,
            e.tile,
            e.mode,
          );
          view.flash(e.tile, `−${e.dealt}`, 'damage');
          if (e.taken > 0) view.flash(e.from, `−${e.taken}`, 'damage');
        } else if (e.type === 'unit_killed') {
          view.flash(e.tile, 'Destroyed', e.owner === viewer ? 'damage' : 'good');
        } else if (e.type === 'civilian_captured' || e.type === 'settlement_captured') {
          view.flash(e.tile, 'Captured!', e.by === viewer ? 'good' : 'damage');
        }
      }
      setState(s);
      // Rivals finished moving: hotseat passes the device to whoever plays first now.
      if (busyRef.current && !game.busy && game.humans().length > 1) {
        const first = game.nextHuman();
        if (first) setPassTo(first);
      }
      busyRef.current = game.busy;
      setBusy(game.busy);
    });
    // In case the rivals finished before this subscribed.
    busyRef.current = game.busy;
    setBusy(game.busy);
    setState(game.state);
    return off;
  }, [game, content, notify]);

  useEffect(() => {
    viewRef.current?.setFog(fog);
  }, [fog]);
  useEffect(() => {
    viewRef.current?.setUnits(units, pendingMoves.current.splice(0));
  }, [units]);
  useEffect(() => {
    viewRef.current?.setSettlements(settlements, territory);
  }, [settlements, territory]);

  // Keep the selection valid.
  useEffect(() => {
    if (selection?.kind === 'unit' && !state.units[selection.id]) setSelection(null);
    if (selection?.kind === 'settlement' && !state.settlements[selection.id]) setSelection(null);
  }, [state, selection]);

  // The planned path to the hovered (or pinned) tile.
  const pathTarget = pinned ?? hover;
  const path = useMemo(() => {
    if (!unit || unit.owner !== viewer || pathTarget === undefined || pathTarget === unit.tile)
      return null;
    return toPathView(findPath(ctx, state, unit, pathTarget));
  }, [ctx, state, unit, pathTarget, viewer]);
  useEffect(() => {
    viewRef.current?.setSelected(selection?.kind === 'unit' ? selection.id : null);
  }, [selection, units]);
  // A sound when you pick something: a soldier's clink, a civilian's pluck, a city's bell.
  const selectedKey = selection ? `${selection.kind}:${selection.id}` : '';
  useEffect(() => {
    if (!selection) return;
    if (selection.kind === 'unit') {
      const u = game.state.units[selection.id];
      const layer = u ? ctx.content.entities.unitClass[unitDef(ctx, u).class]?.layer : undefined;
      play(layer === 'civilian' ? 'select_civilian' : 'select');
    } else play('open');
  }, [selectedKey]);
  useEffect(() => {
    viewRef.current?.setPath(path, unit?.tile ?? null);
  }, [path, unit?.tile]);

  // Combat: what the selected unit (or a settlement striking) can hit, and a preview of the
  // hovered target.
  const myUnit = unit && unit.owner === viewer ? unit : undefined;
  const targets = useMemo(
    () => (myUnit ? attackTargets(ctx, state, myUnit) : []),
    [ctx, state, myUnit],
  );
  const strikes = useMemo(
    () =>
      striking && settlement && settlement.owner === viewer
        ? strikeTargets(ctx, state, settlement)
        : [],
    [ctx, state, settlement, striking, viewer],
  );
  /** A rival on `tile` that `u` could attack if they were at war, and that hypothetical war. */
  const peaceTarget = useCallback(
    (s: GameState, u: UnitState, tile: number) => {
      const t = targetAt(ctx, s, u.owner, tile);
      if (!t) return undefined;
      const owner = targetOwner(t);
      if (atWar(s, u.owner, owner)) return undefined;
      const hypothetical = { ...s, wars: [...s.wars, warKey(u.owner, owner)] };
      return attackProblem(ctx, hypothetical, u, tile) ? undefined : { owner, hypothetical };
    },
    [ctx],
  );
  const combat = useMemo(() => {
    if (hover === undefined) return null;
    if (striking && settlement && strikes.includes(hover)) {
      const p = previewStrike(ctx, state, settlement, hover)!;
      return {
        preview: p,
        attacker: settlementSide(ctx, settlement),
        defender: targetSide(ctx, state, p, viewer),
        hint: 'Click to strike',
        warning: undefined,
      };
    }
    if (!myUnit) return null;
    if (targets.includes(hover)) {
      const p = previewAttack(ctx, state, myUnit, hover)!;
      return {
        preview: p,
        attacker: unitSide(ctx, state, myUnit, viewer),
        defender: targetSide(ctx, state, p, viewer),
        hint: p.mode === 'capture' ? 'Click to capture' : 'Click to attack',
        warning: undefined,
      };
    }
    const rival = peaceTarget(state, myUnit, hover);
    if (!rival) return null;
    const p = previewAttack(ctx, rival.hypothetical, myUnit, hover)!;
    return {
      preview: p,
      attacker: unitSide(ctx, state, myUnit, viewer),
      defender: targetSide(ctx, state, p, viewer),
      hint: 'Click to declare war and attack',
      warning: `You're at peace with ${civName(content, state, rival.owner)}`,
    };
  }, [
    ctx,
    content,
    state,
    hover,
    myUnit,
    targets,
    striking,
    strikes,
    settlement,
    peaceTarget,
    viewer,
  ]);

  // Placement choices for the selected settlement (district, wonder or project waiting for a tile).
  const choices = useMemo(
    () =>
      placing && settlement && settlement.owner === viewer
        ? placementChoices(ctx, state, settlement, placing.item)
        : [],
    [ctx, state, settlement, placing, viewer],
  );

  // Tiles to mark for the selected settlement: placement or growth choices, tiles to buy, worked
  // tiles and planned districts.
  // Map lenses (L cycles them): what each tile yields, where to settle, who follows what.
  const [lens, setLens] = useState<Lens>('none');
  const lensHighlights = useMemo(
    () => lensFor(ctx, state, viewer, fog, lens),
    [ctx, state, viewer, fog, lens],
  );
  const choiceHighlights = useMemo((): TileHighlight[] => {
    if (myUnit) {
      return targets.map((tile) => {
        const p = previewAttack(ctx, state, myUnit, tile);
        const loss = p?.split?.health ?? p?.toDefender ?? [0, 0];
        const walls = p?.split?.walls ?? [0, 0];
        const avg = ([lo, hi]: [number, number]) => Math.round((lo + hi) / 2);
        return {
          tile,
          tone: 'attack' as const,
          label:
            p?.mode === 'capture'
              ? 'Capture'
              : avg(loss) === 0 && avg(walls) > 0
                ? `⚔ walls −${avg(walls)}`
                : `⚔ −${avg(loss)}`,
        };
      });
    }
    if (!settlement || settlement.owner !== viewer) return [];
    const out: TileHighlight[] = [{ tile: settlement.tile, tone: 'selected' }];
    if (striking) {
      for (const tile of strikes) out.push({ tile, tone: 'attack', label: '🎯' });
      return out;
    }
    if (placing) {
      for (const c of choices) out.push({ tile: c.tile, tone: 'place', label: c.label });
      return out;
    }
    if (settlement.pendingDevelop > 0) {
      for (const tile of developCandidates(ctx, state, settlement)) {
        const imp = content.entities.improvement[improvementsFor(ctx, state, tile)[0]!]!;
        const gain = Object.entries(imp.yields)
          .map(([y, v]) => `+${v}${content.entities.yield[y]?.icon ?? ''}`)
          .join(' ');
        out.push({ tile, tone: 'develop', label: `${resolveText(content, imp.name)} ${gain}` });
      }
      return out;
    }
    if (panelMode === 'buy') {
      for (const tile of purchasableTiles(ctx, state, settlement)) {
        const cost = tilePurchaseCost(ctx, state, settlement, tile);
        out.push({ tile, tone: 'buy', label: `💰 ${formatFixed(cost)}` });
      }
      return out;
    }
    for (const tile of settlement.worked) {
      out.push({ tile, tone: 'worked', label: settlement.locked.includes(tile) ? '📌' : '●' });
    }
    for (const q of settlement.queue) {
      if (q.tile !== undefined)
        out.push({ tile: q.tile, tone: 'planned', label: itemName(content, q) });
    }
    return out;
  }, [
    ctx,
    content,
    state,
    settlement,
    panelMode,
    placing,
    choices,
    myUnit,
    targets,
    striking,
    strikes,
    viewer,
  ]);
  const highlights = useMemo(
    () => [...lensHighlights, ...choiceHighlights],
    [lensHighlights, choiceHighlights],
  );
  useEffect(() => {
    viewRef.current?.setHighlights(highlights);
  }, [highlights]);

  const act = useCallback(
    (action: Action) => {
      const r = game.act(action);
      if (!r.ok) notify(r.error.message);
      return r.ok;
    },
    [game, notify],
  );

  /** Queues the item being placed on a tile (first if it was "Place", last if "+"). */
  const place = useCallback(
    (tile: number) => {
      if (!placing || !settlement) return;
      const item = { ...placing.item, tile };
      const queue = placing.front
        ? [item, ...settlement.queue.slice(1)]
        : [...settlement.queue, item];
      if (
        act({
          type: 'set_queue',
          player: viewer,
          settlement: settlement.id,
          queue: queue.slice(0, 8),
        })
      )
        setPlacing(null);
    },
    [placing, settlement, act, viewer],
  );

  const select = useCallback(
    (next: Selection, focus = false) => {
      setSelection(next);
      setPinned(null);
      setPanelMode('citizens');
      setPlacing(null);
      setStriking(false);
      if (!next || !focus) return;
      const tile =
        next.kind === 'unit'
          ? game.state.units[next.id]?.tile
          : game.state.settlements[next.id]?.tile;
      if (tile !== undefined) viewRef.current?.focusTile(tile);
    },
    [game],
  );

  const doNext = useCallback(() => {
    if (game.busy) return;
    const n = nextAction(
      ctx,
      game.state,
      viewer,
      selection?.kind === 'unit' ? selection.id : null,
      policiesSeen,
    );
    if (n.kind === 'unit') select({ kind: 'unit', id: n.id }, true);
    else if (n.kind === 'develop' || n.kind === 'production' || n.kind === 'capture')
      select({ kind: 'settlement', id: n.id }, true);
    else if (n.kind === 'research') setOverlay({ kind: 'tree', tree: 'tech' });
    else if (n.kind === 'civic') setOverlay({ kind: 'tree', tree: 'civic' });
    else if (n.kind === 'policies') openGovernment();
    else if (n.kind === 'end') {
      act({ type: 'end_turn', player: viewer });
      select(null);
      // Hotseat: the next human who hasn't played this turn (or, once rivals have moved, the
      // first one of the new turn).
      const next = game.nextHuman();
      if (hotseat && next && !game.busy) setPassTo(next);
    }
  }, [ctx, game, selection, select, act, policiesSeen, openGovernment, viewer, hotseat]);

  /** After a unit is done for the turn: on to the next unit, like Civ's auto-cycling (D32). */
  const selectNextUnit = useCallback(
    (after: string) => {
      const n = nextAction(ctx, game.state, viewer, after);
      if (n.kind === 'unit') select({ kind: 'unit', id: n.id }, true);
      else select(null);
    },
    [ctx, game, select, viewer],
  );

  const skip = useCallback(
    (id: string) => {
      act({ type: 'skip_unit', player: viewer, unit: id });
      selectNextUnit(id);
    },
    [act, selectNextUnit, viewer],
  );

  const found = useCallback(
    (id: string) => {
      const tile = game.state.units[id]?.tile;
      if (!act({ type: 'found_settlement', player: viewer, unit: id })) return;
      const s = Object.values(game.state.settlements).find((x) => x.tile === tile);
      if (s) select({ kind: 'settlement', id: s.id }, true);
    },
    [game, act, select, viewer],
  );

  const moveTo = useCallback(
    (tile: number) => {
      if (!unit || unit.owner !== viewer) return;
      if (!act({ type: 'move_unit', player: viewer, unit: unit.id, to: tile })) return;
      setPinned(null);
      const after = game.state.units[unit.id];
      if (!after || after.moves === 0 || after.orders) selectNextUnit(unit.id);
    },
    [game, unit, act, selectNextUnit, viewer],
  );

  /** Attacks with the selected unit; afterwards the next unit is up if this one is done. */
  const attack = useCallback(
    (u: UnitState, tile: number) => {
      if (!act({ type: 'attack', player: viewer, unit: u.id, tile })) return;
      setPinned(null);
      const after = game.state.units[u.id];
      // Let the hit play out on screen before the camera moves on to the next unit (unless
      // the player has picked something else meanwhile).
      if (!after || after.moves === 0) {
        setTimeout(() => {
          const now = selectionRef.current;
          if (now === null || (now.kind === 'unit' && now.id === u.id)) selectNextUnit(u.id);
        }, 1100);
      }
    },
    [game, act, selectNextUnit, viewer],
  );

  /** A click or right-click on a tile the selected unit or striking settlement can hit. */
  const combatClick = (tile: number): boolean => {
    const s = game.state;
    if (striking && settlement && strikes.includes(tile)) {
      act({ type: 'strike', player: viewer, settlement: settlement.id, tile });
      setStriking(false);
      return true;
    }
    if (!myUnit || myUnit.moves <= 0) return false;
    if (targets.includes(tile)) {
      attack(myUnit, tile);
      return true;
    }
    const rival = peaceTarget(s, myUnit, tile);
    if (rival) {
      setWarPrompt({ target: rival.owner, unit: myUnit.id, tile });
      return true;
    }
    return false;
  };

  // Map input.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.onHover = setHover;
    view.onSelect = (tile) => {
      if (tile === undefined) return;
      const s = game.state;
      if (combatClick(tile)) return;
      // A choice the selected settlement is making takes the click first.
      if (settlement && settlement.owner === viewer) {
        if (placing) {
          if (choices.some((c) => c.tile === tile)) place(tile);
          return;
        }
        if (settlement.pendingDevelop > 0 && developCandidates(ctx, s, settlement).includes(tile)) {
          const improvement = improvementsFor(ctx, s, tile)[0]!;
          act({
            type: 'develop_tile',
            player: viewer,
            settlement: settlement.id,
            tile,
            improvement,
          });
          return;
        }
        if (panelMode === 'buy' && purchasableTiles(ctx, s, settlement).includes(tile)) {
          act({ type: 'buy_tile', player: viewer, settlement: settlement.id, tile });
          return;
        }
      }
      // Cycle through your units on the tile, then the settlement there.
      const here = s.map.tiles[tile]!;
      const center = Object.values(s.settlements).find((x) => x.tile === tile);
      const cycle: Selection[] = [
        ...unitIds(s)
          .filter((id) => s.units[id]!.owner === viewer && s.units[id]!.tile === tile)
          .map((id) => ({ kind: 'unit' as const, id })),
        ...(center ? [{ kind: 'settlement' as const, id: center.id }] : []),
      ];
      const planning = unit !== undefined && unit.owner === viewer && unit.tile !== tile;
      if (cycle.length > 0 && !(planning && pinned === tile)) {
        const i = cycle.findIndex((c) => c?.kind === selection?.kind && c?.id === selection?.id);
        select(cycle[(i + 1) % cycle.length]!);
        setInspect(undefined);
        return;
      }
      if (planning) {
        if (pinned === tile) moveTo(tile);
        else setPinned(tile);
        return;
      }
      if (
        settlement &&
        settlement.owner === viewer &&
        here.settlement === settlement.id &&
        workableTiles(ctx, s, settlement).includes(tile)
      ) {
        act({
          type: 'lock_tile',
          player: viewer,
          settlement: settlement.id,
          tile,
          locked: !settlement.locked.includes(tile),
        });
        return;
      }
      setInspect(tile);
      select(null);
    };
    view.onCommand = (tile) => {
      if (combatClick(tile)) return;
      if (unit && unit.owner === viewer) moveTo(tile);
    };
  });

  // Keyboard shortcuts (Civ-like).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, select, textarea')) return;
      if (passTo) {
        if (e.key === 'Enter') beginTurn(passTo);
        return;
      }
      if (overlay) return; // the open screen handles its own keys
      if (e.key === 'Enter') doNext();
      else if (e.key === 't') setOverlay({ kind: 'tree', tree: 'tech' });
      else if (e.key === 'c') setOverlay({ kind: 'tree', tree: 'civic' });
      else if (e.key === 'g') openGovernment();
      else if (e.key === 'p') setOverlay({ kind: 'greatPeople' });
      else if (e.key === 'r') setOverlay({ kind: 'religion' });
      else if (e.key === 'i') setOverlay({ kind: 'cityStates' });
      else if (e.key === 'v') setOverlay({ kind: 'victories' });
      else if (e.key === 'h') setOverlay({ kind: 'graphs' });
      else if (e.key === '?') setOverlay({ kind: 'help' });
      else if (e.key === 'l') setLens((l) => LENSES[(LENSES.indexOf(l) + 1) % LENSES.length]!);
      else if (e.key === 'Escape') {
        if (placing) setPlacing(null);
        else if (striking) setStriking(false);
        else select(null);
      } else if (!unit || unit.owner !== viewer) return;
      else if (e.key === ' ') {
        e.preventDefault();
        skip(unit.id);
      } else if (e.key === 'z') act({ type: 'sleep_unit', player: viewer, unit: unit.id });
      else if (e.key === 'f') act({ type: 'fortify_unit', player: viewer, unit: unit.id });
      else if (e.key === 'b') found(unit.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    unit,
    act,
    doNext,
    select,
    skip,
    found,
    overlay,
    openGovernment,
    placing,
    striking,
    viewer,
    passTo,
  ]);

  const inspected = selection?.kind === 'settlement' ? undefined : (pathTarget ?? inspect);

  return (
    <div className="game">
      <div
        className="lab-canvas"
        ref={hostRef}
        aria-label="Map. Drag to pan, scroll or pinch to zoom."
      />

      <header className="topbar">
        <ul className="empire-yields" aria-label="Your empire">
          <li title="Science per turn">
            <Icon name="science" size={22} />
            <span className="mono val science">{perTurn(empire.science)}</span>
          </li>
          <li title="Culture per turn">
            <Icon name="culture" size={22} />
            <span className="mono val culture">{perTurn(empire.culture)}</span>
          </li>
          <li title="Gold (per turn)">
            <Icon name="gold" size={22} />
            <span className="mono val gold">{whole(empire.gold)}</span>
            <span className="delta mono">({perTurn(empire.goldPerTurn)})</span>
          </li>
          <li title="Faith (per turn)">
            <Icon name="faith" size={22} />
            <span className="mono val faith">{whole(empire.faith)}</span>
            <span className="delta mono">({perTurn(empire.faithPerTurn)})</span>
          </li>
          <li title="Influence (per turn): spent on friendships, alliances and denouncing">
            <Icon name="influence" size={22} />
            <span className="mono val">{whole(empire.influence)}</span>
            <span className="delta mono">({perTurn(empire.influencePerTurn)})</span>
          </li>
          <li
            className={me.celebration.turnsLeft > 0 ? 'celebrating' : ''}
            title="Happiness surplus builds toward a celebration: a bonus wildcard policy slot and +10% production"
          >
            <Icon name="happiness" size={22} />
            <span className="mono val">
              {me.celebration.turnsLeft > 0
                ? `Celebrating · ${me.celebration.turnsLeft}`
                : `${me.celebration.store}/${celebrationThreshold(ctx, me)}`}
            </span>
          </li>
        </ul>
        <div className="topbar-right">
          <nav className="screen-buttons" aria-label="Screens">
            <ScreenButton
              icon="research"
              label="Technologies (T)"
              onClick={() => setOverlay({ kind: 'tree', tree: 'tech' })}
            />
            <ScreenButton
              icon="civic"
              label="Civics (C)"
              onClick={() => setOverlay({ kind: 'tree', tree: 'civic' })}
            />
            <ScreenButton
              icon="government"
              label={`${resolveText(content, content.entities.government[me.government]?.name ?? 'Government')} (G)`}
              badge={(() => {
                const filled = SLOT_KINDS.reduce((n, k) => n + me.policies[k].length, 0);
                const slots = SLOT_KINDS.reduce(
                  (n, k) => n + policySlots(ctx, state, viewer)[k],
                  0,
                );
                return filled < slots ? `${filled}/${slots}` : undefined;
              })()}
              onClick={openGovernment}
            />
            <ScreenButton
              icon="greatPeople"
              label="Great people (P)"
              onClick={() => setOverlay({ kind: 'greatPeople' })}
            />
            <ScreenButton
              icon="religion"
              label={`${
                me.religion
                  ? (state.religions[me.religion]?.name ?? 'Religion')
                  : pantheonOf(ctx, state, viewer)
                    ? 'Religion'
                    : 'Pantheon'
              } (R)`}
              onClick={() => setOverlay({ kind: 'religion' })}
            />
            {Object.keys(state.cityStates).length > 0 && (
              <ScreenButton
                icon="cityStates"
                label={`City-states (I)${me.envoys > 0 ? `: ${me.envoys} envoys to send` : ''}`}
                badge={me.envoys > 0 ? String(me.envoys) : undefined}
                onClick={() => setOverlay({ kind: 'cityStates' })}
              />
            )}
            <ScreenButton
              icon="victory"
              label="Victories (V)"
              onClick={() => setOverlay({ kind: 'victories' })}
            />
            <ScreenButton
              icon="graphs"
              label="Graphs (H)"
              onClick={() => setOverlay({ kind: 'graphs' })}
            />
            <ScreenButton
              icon="help"
              label="Help and shortcuts (?)"
              onClick={() => setOverlay({ kind: 'help' })}
            />
          </nav>
          <div className="turn-pill" aria-live="polite">
            <span className="turn-label">Turn</span>
            <span className="turn-number">{state.turn}</span>
            <span className="era">{era ? `${resolveText(content, era.name)} Era` : ''}</span>
            <span className="fps">{fps} fps</span>
          </div>
        </div>
      </header>

      <div className="players">
        {state.playerOrder.map((p) => {
          const pl = state.players[p]!;
          const war = atWar(state, viewer, p);
          const rel = p === viewer ? null : relation(state, viewer, p);
          const offer =
            state.peaceOffers.includes(`${p}>${viewer}`) ||
            state.diplomacy.proposals.some((x) => x.from === p && x.to === viewer);
          return (
            <button
              type="button"
              key={p}
              className={`player-chip ${pl.turnEnded ? 'done' : ''} ${war ? 'war' : ''} ${pl.alive ? '' : 'dead'} ${offer ? 'offer' : ''}`}
              title={`${pl.name} · score ${scoreOf(ctx, state, p).total}${war ? ' · at war' : ''}${rel === 'allies' ? ' · allies' : rel === 'friends' ? ' · friends' : ''}${offer ? ' · has an offer for you' : ''}${pl.turnEnded ? ' (turn ended)' : ''}`}
              onClick={() => setPlayerPanel(playerPanel === p ? null : p)}
            >
              <span className="chip-head" style={{ borderColor: cssColor(colors[p]!.main) }}>
                <LeaderHead content={content} leader={pl.leader} civ={pl.civ} size={24} />
              </span>
              {(hotseat || online) && pl.kind === 'human'
                ? `${p === viewer ? '▸ ' : ''}${pl.name} · ${civName(content, state, p)}`
                : p === viewer
                  ? `You · ${civName(content, state, p)}`
                  : civName(content, state, p)}
              {war && (
                <span className="war-mark" aria-label="at war">
                  ⚔
                </span>
              )}
              {(rel === 'allies' || rel === 'friends') && (
                <span className="pact-mark" aria-label={rel}>
                  {rel === 'allies' ? '🤝' : '🙂'}
                </span>
              )}
              {offer && (
                <span className="offer-mark" aria-label="has an offer for you">
                  ✉
                </span>
              )}
              {online && seats.some((x) => x.player === p && !x.online) && (
                <span className="away-mark" aria-label="away">
                  ⏸
                </span>
              )}
            </button>
          );
        })}
      </div>
      {online && (away.length > 0 || cutOff) && (
        <div className="online-bar" role="status">
          {cutOff ? (
            <>
              {cutOff}
              {onExit && (
                <button type="button" className="small" onClick={onExit}>
                  Main menu
                </button>
              )}
            </>
          ) : (
            away.map((x) => (
              <span key={x.player}>
                {x.name} is away
                {online.endTurnFor && (
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => online.endTurnFor!(x.player!)}
                  >
                    End their turn
                  </button>
                )}
              </span>
            ))
          )}
        </div>
      )}
      {playerPanel && (
        <PlayerPanel
          ctx={ctx}
          state={state}
          viewer={viewer}
          other={playerPanel}
          colors={colors[playerPanel]!}
          act={act}
          onClose={() => setPlayerPanel(null)}
        />
      )}

      <div className="trackers">
        {(['tech', 'civic'] as const).map((k) => {
          const track = k === 'tech' ? me.techs : me.civics;
          const id = track.current;
          const def = id
            ? k === 'tech'
              ? content.entities.tech[id]
              : content.entities.civic[id]
            : undefined;
          const cost = id ? nodeCost(ctx, state, k, id) : 0;
          const progress = id ? (track.progress[id] ?? 0) : 0;
          const perTurnAmount = k === 'tech' ? empire.science : empire.culture;
          const pct = def ? Math.min(100, (progress / cost) * 100) : 0;
          return (
            <button
              key={k}
              type="button"
              className={`tracker ${k} ${id ? '' : 'idle'}`}
              onClick={() => setOverlay({ kind: 'tree', tree: k })}
              title={k === 'tech' ? 'Technologies (T)' : 'Civics (C)'}
            >
              <span className="tracker-ring" style={{ '--pct': `${pct}%` } as React.CSSProperties}>
                <Icon name={k === 'tech' ? 'research' : 'civic'} size={34} />
              </span>
              <span className="tracker-text">
                <span className="tracker-kind">{k === 'tech' ? 'Research' : 'Civic'}</span>
                <span className="tracker-name">
                  {def
                    ? resolveText(content, def.name)
                    : k === 'tech'
                      ? 'Choose research'
                      : 'Choose a civic'}
                </span>
              </span>
              {def && (
                <span className="tracker-turns mono">
                  {showTurns(turnsFor(cost, progress, perTurnAmount))}
                  <small>turns</small>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {hint && (
        <aside className={`hint-card ${selection ? 'behind-panel' : ''}`} aria-label="Hint">
          <p>{hint.text(ctx)}</p>
          <div className="hint-actions">
            <button type="button" className="small" onClick={() => setHintNow(null)}>
              Got it
            </button>
            <button
              type="button"
              className="ghost small"
              onClick={() => {
                setHints(false);
                setHintsEnabled(false);
                setHintNow(null);
              }}
            >
              No more hints
            </button>
          </div>
        </aside>
      )}

      <div className="notices" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className="notice">
            <Rich text={n.text} />
          </div>
        ))}
      </div>

      {unit && (
        <UnitPanel
          key={unit.id}
          ctx={ctx}
          state={state}
          viewer={viewer}
          unit={unit}
          colors={colors[unit.owner]!}
          planned={pinned !== null ? { reachable: path !== null } : null}
          targets={unit.owner === viewer ? targets.length : 0}
          act={(a) => {
            if (a.type !== 'found_settlement') return act(a);
            found(a.unit);
            return true;
          }}
          onSkip={() => skip(unit.id)}
          onFoundReligion={() => setOverlay({ kind: 'religion', prophet: unit.id })}
        />
      )}

      {settlement && (
        <SettlementPanel
          ctx={ctx}
          state={state}
          viewer={viewer}
          id={settlement.id}
          mode={panelMode}
          onMode={(m) => {
            setPanelMode(m);
            setPlacing(null);
          }}
          act={act}
          onClose={() => select(null)}
          onFocusTile={(t) => setHover(t)}
          placing={placing}
          choices={choices}
          onChoose={place}
          onPlace={(p) => {
            setPlacing(p);
            if (p) setPanelMode('citizens');
          }}
          striking={striking}
          onStrike={(on) => {
            setStriking(on);
            if (on) setPlacing(null);
          }}
        />
      )}

      {combat && (
        <CombatPreview
          preview={combat.preview}
          attacker={combat.attacker}
          defender={combat.defender}
          hint={combat.hint}
          warning={combat.warning}
        />
      )}

      {inspected !== undefined && fog[inspected] !== 0 && (
        <div className="game-tile">
          <TileCard
            content={content}
            map={state.map}
            tile={inspected}
            pinned={inspect !== undefined && pinned === null && hover === undefined}
            onClose={() => setInspect(undefined)}
          />
        </div>
      )}

      <div className="corner">
        <button
          type="button"
          className={`next-action ${next.kind === 'end' ? 'end' : ''} ${busy ? 'busy' : ''}`}
          onClick={doNext}
          disabled={next.kind === 'waiting' || busy}
        >
          <Icon
            name={next.kind === 'end' ? 'next' : next.kind === 'unit' ? 'movement' : 'check'}
            size={34}
          />
          <span className="next-label">{busy ? 'Rivals are moving…' : next.label}</span>
          <kbd>Enter</kbd>
        </button>
        <Minimap
          ctx={ctx}
          state={state}
          viewer={viewer}
          fog={fog}
          colors={colors}
          lens={lens}
          onLens={setLens}
          onPick={(tile) => viewRef.current?.focusTile(tile)}
        />
      </div>

      {overlay?.kind === 'tree' && (
        <TreeScreen
          ctx={ctx}
          state={state}
          viewer={viewer}
          kind={overlay.tree}
          perTurn={overlay.tree === 'tech' ? empire.science : empire.culture}
          act={act}
          onKind={(tree) => setOverlay({ kind: 'tree', tree })}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'greatPeople' && (
        <GreatPeopleScreen
          ctx={ctx}
          state={state}
          viewer={viewer}
          act={act}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'religion' && (
        <ReligionScreen
          ctx={ctx}
          state={state}
          viewer={viewer}
          act={(a) => {
            const ok = act(a);
            if (ok && a.type === 'found_religion') setOverlay({ kind: 'religion' });
            return ok;
          }}
          prophet={overlay.prophet}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'victories' && (
        <VictoriesScreen
          ctx={ctx}
          state={state}
          viewer={viewer}
          onGraphs={() => setOverlay({ kind: 'graphs' })}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'help' && (
        <HelpScreen
          onClose={() => {
            setOverlay(null);
            setHintsEnabled(hintsOn());
            setHintsSeen(seenHints());
          }}
        />
      )}
      {overlay?.kind === 'graphs' && (
        <GraphsScreen ctx={ctx} state={state} viewer={viewer} onClose={() => setOverlay(null)} />
      )}
      {overlay?.kind === 'cityStates' && (
        <CityStatesScreen
          ctx={ctx}
          state={state}
          viewer={viewer}
          act={act}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'government' && (
        <GovernmentScreen
          ctx={ctx}
          state={state}
          viewer={viewer}
          act={act}
          onClose={() => setOverlay(null)}
        />
      )}
      {warPrompt && (
        <WarPrompt
          name={civName(content, state, warPrompt.target)}
          minTurns={content.rules.combat.minWarTurns}
          onCancel={() => setWarPrompt(null)}
          onDeclare={() => {
            setWarPrompt(null);
            if (!act({ type: 'declare_war', player: viewer, target: warPrompt.target })) return;
            const u = game.state.units[warPrompt.unit];
            if (u) attack(u, warPrompt.tile);
          }}
        />
      )}
      {captured && (
        <CaptureDialog ctx={ctx} state={state} viewer={viewer} id={captured.id} act={act} />
      )}
      {summary && !passTo && (
        <aside className="turn-summary" aria-label="Since your last turn">
          <header>
            <h3>Since your last turn</h3>
            <button
              type="button"
              className="close"
              onClick={() => setSummary(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </header>
          <ul>
            {summary.slice(-16).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </aside>
      )}
      {!gameOverSeen && !passTo && (!me.alive || state.status === 'ended') && (
        <GameOver
          won={
            state.result?.winner !== null &&
            state.result?.winner !== undefined &&
            teamOf(state, viewer).includes(state.result.winner)
          }
          title={
            state.result?.winner
              ? `${civName(content, state, state.result.winner)} wins`
              : !me.alive
                ? 'Defeat'
                : 'Game over'
          }
          text={
            !me.alive && state.status !== 'ended'
              ? 'Your last settlement has fallen. Your civilization is no more.'
              : state.result?.reason === 'domination'
                ? 'A domination victory: every rival original capital is held.'
                : state.result?.reason === 'science'
                  ? 'A science victory: their expedition reached another star.'
                  : state.result?.reason === 'culture'
                    ? 'A culture victory: their visitors outnumber every other civilization’s own tourists.'
                    : state.result?.reason === 'religion'
                      ? `A religious victory: ${religionNameOf(state, state.result.winner ?? null)} is followed in most settlements of every other civilization.`
                      : state.result?.reason === 'conquest'
                        ? 'A conquest victory: the last civilization standing.'
                        : 'A score victory: the highest score at the turn limit.'
          }
          scores={state.playerOrder
            .map((p) => ({
              name: civName(content, state, p),
              player: state.players[p]!.name,
              score: scoreOf(ctx, state, p).total,
              alive: state.players[p]!.alive,
            }))
            .sort((a, b) => b.score - a.score)}
          chart={<HistoryChart ctx={ctx} state={state} viewer={viewer} measure="score" />}
          onGraphs={() => {
            setGameOverSeen(true);
            setOverlay({ kind: 'graphs' });
          }}
          onClose={() => setGameOverSeen(true)}
        />
      )}
      {!covered && !passTo && state.turn <= 1 && me.alive && !introSeen.has(viewer) && (
        <LeaderIntro
          ctx={ctx}
          state={state}
          player={viewer}
          onBegin={() => setIntroSeen((seen) => new Set(seen).add(viewer))}
        />
      )}
      {speech && !covered && !passTo && state.players[speech.player] && (
        <LeaderSpeech
          ctx={ctx}
          state={state}
          player={speech.player}
          line={speech.line}
          onClose={() => setSpeech(null)}
        />
      )}
      {passTo && (
        <div className="pass-screen" role="dialog" aria-label="Pass the device">
          <div className="pass-card">
            <p className="pass-turn">Turn {state.turn}</p>
            <h2>
              <span
                className="swatch big"
                style={{ background: cssColor(colors[passTo]?.main ?? 0x8d9db6) }}
              />{' '}
              {state.players[passTo]!.name}
            </h2>
            <p className="muted">
              {civName(content, state, passTo)}. Pass the device to {state.players[passTo]!.name};
              everyone else, look away.
            </p>
            <button type="button" className="primary big" onClick={() => beginTurn(passTo)}>
              Start my turn <kbd>Enter</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
