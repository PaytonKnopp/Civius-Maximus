import type { SlotKind } from '@cx/content';
import type { MapSettings, MapState } from './map/types';
import type { RngState } from './rng';

export type PlayerId = string;

/** Everything about one game, as plain JSON. Nothing outside this object affects the rules. */
export interface GameState {
  /** Bumped when the state shape changes incompatibly, so old saves can be migrated. */
  stateVersion: 1;
  gameId: string;
  /** Hash of the compiled content (base + mods) this game was started with. */
  contentHash: string;
  settings: GameSettings;
  status: 'playing' | 'ended';
  /** How the game ended, once it has. */
  result: {
    reason: 'score' | 'conquest' | 'domination' | 'religion' | 'science' | 'culture' | 'diplomatic';
    winner: PlayerId | null;
  } | null;
  /** Starts at 1. */
  turn: number;
  rng: RngState;
  players: Record<PlayerId, PlayerState>;
  /** Player IDs in processing order (sorted when the game is created, never reordered). */
  playerOrder: PlayerId[];
  /** Counter for IDs of things created during play (units, settlements...). */
  nextEntityId: number;
  map: MapState;
  /** Every unit on the map, by id (`u1`, `u2`...). Iterate with `unitIds()` for a stable order. */
  units: Record<UnitId, UnitState>;
  /** Pairs of players at war, as sorted `"a|b"` keys (see `warKey`). */
  wars: string[];
  /** The turn each current war began, by war key. */
  warStarted: Record<string, number>;
  /** Peace offers waiting for an answer, as `"from>to"`. */
  peaceOffers: string[];
  /** War support per war (by war key), per side. The side behind loses happiness. */
  warSupport: Record<string, Record<PlayerId, number>>;
  /** Hostile camps, by id (`c4`...). Their raiders belong to `HOSTILE`. */
  camps: Record<string, CampState>;
  /** Every settlement, by id (`s3`...). Iterate with `settlementIds()` for a stable order. */
  settlements: Record<SettlementId, SettlementState>;
  /** Friendships, alliances, treaties, deals and what AIs remember (docs/04, "Diplomacy"). */
  diplomacy: DiplomacyState;
  /** Tiles with a road (base64 bitset, see bitset.ts). Trade routes build them. */
  roads: string;
  /** Trade routes running now. */
  routes: TradeRoute[];
  /** Religions founded so far, by id. */
  religions: Record<string, Religion>;
  /** City-states, by the id of the player that is each one (outside the turn order). */
  cityStates: Record<PlayerId, CityStateState>;
  /** Tourism each player has sent toward each other player so far (culture victory). */
  tourism: Record<PlayerId, Record<PlayerId, number>>;
  /** Each civ's numbers at the end of every turn, for graphs (docs/06-ui-ux.md, "Graphs"). */
  history: HistoryEntry[];
  /** World-first historic moments already claimed (`moment:key`, e.g. the first into an era). */
  worldMoments?: string[];
  /** Great works, by id (`gw3`...). See greatworks/greatworks.ts. */
  greatWorks?: Record<string, GreatWorkState>;
  /** Climate change (with the disasters setting): world emissions so far and the phase reached. */
  climate?: { emissions: number; phase: number; submerged?: number };
  /** The latest natural disasters, newest last (a short history for the screens). */
  disasterLog?: { turn: number; disaster: string; tile: number }[];
  /** The World Congress, once it has formed. See congress/congress.ts. */
  congress?: CongressState;
  /** Spies, by id (`spy5`...), and how many names have been handed out. See espionage/. */
  espionage?: { spies: Record<string, SpyState>; named: number };
  /** The great people race (docs/04-advanced-systems.md, "Great people"). */
  greatPeople: {
    /** Points per player, per great person class. */
    points: Record<PlayerId, Record<string, number>>;
    /** Great people already earned (or bought), and by whom. */
    claimed: Record<string, PlayerId>;
  };
}

/** One turn of the graphs: each living civ's numbers then. */
export interface HistoryEntry {
  turn: number;
  stats: Record<PlayerId, TurnStats>;
}

/** Yields per turn are whole numbers here (not hundredths). */
export interface TurnStats {
  score: number;
  science: number;
  culture: number;
  tourism: number;
  military: number;
  citizens: number;
  settlements: number;
}

/** A city-state (docs/04-advanced-systems.md, "Independent powers"). */
export interface CityStateState {
  /** Its `cityState` content id. */
  def: string;
  /** Envoys each player has there. */
  envoys: Record<PlayerId, number>;
  /** Who leads it: the most envoys, at least `suzerainEnvoys`. */
  suzerain: PlayerId | null;
  /** Players who have met it (seen its settlement), in the order they did. */
  met: PlayerId[];
  /** Quests each player has finished there. */
  quests: Record<PlayerId, string[]>;
}

/** A religion (docs/04-advanced-systems.md, "Religion"). */
export interface Religion {
  id: string;
  name: string;
  founder: PlayerId;
  holyCity: SettlementId;
  /** Its founder and follower `belief` ids. */
  beliefs: string[];
  founded: number;
}

/** A trader on its route: it's off the map until the route ends and it comes home. */
export interface TradeRoute {
  id: string;
  owner: PlayerId;
  /** The trader's `unit` content id (it comes back as one). */
  unit: string;
  from: SettlementId;
  to: SettlementId;
  /** Turns left; the trader comes home when it reaches 0. */
  turnsLeft: number;
  /** Tiles the route runs along (for drawing it). */
  path: number[];
}

/** Pairs of players are keyed like wars: sorted `"a|b"` (see `warKey`). */
export interface DiplomacyState {
  /** Declared friendships: the turn each ends. */
  friends: Record<string, number>;
  /** Alliances: the turn each ends. */
  alliances: Record<string, number>;
  /** Peace treaties: no war between the pair before this turn. */
  peaceUntil: Record<string, number>;
  /** The turn each pair's last war started or ended. */
  lastWar: Record<string, number>;
  /** Denouncements, as `"by>target"`: the turn it happened. */
  denounced: Record<string, number>;
  /** Gold one player pays another every turn, until a turn. */
  payments: Payment[];
  /** Deals waiting for an answer. */
  proposals: Proposal[];
  /** What every AI remembers for a while: surprise wars, broken deals, razed settlements. */
  incidents: Incident[];
}

export interface Payment {
  from: PlayerId;
  to: PlayerId;
  /** Whole gold each turn. */
  gold: number;
  /** The last turn it's paid. */
  until: number;
}

/** What one side of a deal puts on the table. */
export interface DealTerms {
  /** Whole gold, paid once. */
  gold: number;
  /** Whole gold paid every turn, for the deal's `turns`. */
  goldPerTurn: number;
  /** Share the map: the other side learns every tile this side has explored. */
  maps: boolean;
}

export interface Proposal {
  id: string;
  from: PlayerId;
  to: PlayerId;
  /** The turn it was made. */
  turn: number;
  /** What `from` gives and what `from` asks for. */
  give: DealTerms;
  get: DealTerms;
  /** How long per-turn payments run. */
  turns: number;
  /** Mutual parts: declare friendship, form an alliance, make peace. */
  friendship: boolean;
  alliance: boolean;
  peace: boolean;
}

export interface Incident {
  kind: 'surprise_war' | 'broke_deal' | 'razed' | 'spied' | 'nuked';
  by: PlayerId;
  against: PlayerId;
  turn: number;
}

export type SettlementId = string;

/** A hostile camp: it trains raiders until a player's military unit moves onto it. */
export interface CampState {
  id: string;
  tile: number;
  /** Raiders it trained that are still alive. */
  units: UnitId[];
  /** The turn it trains its next raider. */
  nextUnit: number;
}

/** Something a city can produce. */
export interface BuildItem {
  kind: 'unit' | 'building' | 'district' | 'wonder' | 'project';
  /** A content id of that kind. */
  id: string;
  /** Where it goes (districts, wonders and projects). */
  tile?: number | undefined;
}

/** Which yield auto-assign favors when picking tiles for citizens. */
export type CitizenFocus =
  'balanced' | 'food' | 'production' | 'gold' | 'science' | 'culture' | 'faith';

/** A town or city (docs/03-core-mechanics.md, section 3). Amounts are fixed-point hundredths. */
export interface SettlementState {
  id: SettlementId;
  owner: PlayerId;
  name: string;
  /** The center tile. */
  tile: number;
  kind: 'town' | 'city';
  capital: boolean;
  founded: number;
  population: number;
  /** Food stored toward the next citizen. */
  food: number;
  /** Culture stored toward the next border tile. */
  culture: number;
  /** Tiles gained by border growth or purchase (raises the cost of the next one). */
  tilesAcquired: number;
  /** Production put into each item started, keyed `unit:unit_warrior` / `building:...`. */
  progress: Record<string, number>;
  /** Cities only: what to build, first item first. */
  queue: BuildItem[];
  /** `building` content ids, in the order they were finished. */
  buildings: string[];
  /** Tiles the citizens work (the center is always worked and isn't listed). */
  worked: number[];
  /** Tiles the player pinned so auto-assign keeps them worked. */
  locked: number[];
  focus: CitizenFocus;
  /** Growth choices waiting: each lets the player develop one tile with an improvement. */
  pendingDevelop: number;
  /** Districts built, in the order they were finished. */
  districts: { id: string; tile: number }[];
  /** World wonders built here. */
  wonders: string[];
  /** Citizens working as specialists, per district id. */
  specialists: Record<string, number>;
  /** Towns: a `specialization` content id. */
  specialization: string | null;
  /** How many times the specialization was chosen (the first is free). */
  specializationChanges: number;
  /** Hit points (full: `rules.combat.settlement.cityHealth` or `townHealth`). */
  health: number;
  /** Outer defense left (full: the `walls` of its buildings). */
  walls: number;
  /** The last turn it was attacked (it doesn't heal that turn). */
  attackedTurn: number | null;
  /** The last turn it made its ranged strike (one a turn). */
  struckTurn: number | null;
  /** Who founded it (liberating returns it to them). */
  founder: PlayerId;
  /** It was founded as its founder's capital (can't be razed). */
  originalCapital: boolean;
  /** Who it was taken from, if it was captured. */
  capturedFrom: PlayerId | null;
  /** Just captured: the new owner chooses keep, raze or liberate (keep, if they end the turn). */
  captureChoice: boolean;
  /** Being razed: it loses a citizen each turn, and produces nothing, until it's gone. */
  razing?: boolean;
  /** Soldiers trained here (some abilities count them). */
  unitsTrained: number;
  /** The religion most of its people follow, if any. */
  religion: string | null;
  /** Religious pressure built up toward each religion (it converts at `convertAt`). */
  pressure: Record<string, number>;
  /** Loyalty, 0 to `rules.loyalty.max` (full when absent). See loyalty/loyalty.ts. */
  loyalty?: number;
}

export type UnitId = string;

export type UnitOrders =
  /** Keep moving toward `target`, continuing automatically on later turns. */
  | { kind: 'move'; target: number }
  /** Asleep until woken (or an enemy comes into view, later). */
  | { kind: 'sleep' }
  /** Dug in for a defense bonus that grows over the first turns (`turns` fortified so far). */
  | { kind: 'fortify'; turns: number };

export interface UnitState {
  id: UnitId;
  owner: PlayerId;
  /** A `unit` content id. */
  type: string;
  tile: number;
  /** Movement points left this turn, in hundredths (200 = 2 MP). */
  moves: number;
  health: number;
  xp: number;
  orders: UnitOrders | null;
  /** Turn on which the player chose "skip" for this unit, so it stops asking for orders. */
  skippedTurn: number | null;
  /** `promotion` content ids, in the order they were taken. */
  promotions: string[];
  /** A great person: which one (a `greatPerson` content id). */
  person?: string;
  /** Missionaries: the religion they spread, and how many more times they can. */
  religion?: string;
  charges?: number;
  /** Commanders: the units packed inside (off the map until unpacked). */
  cargo?: UnitState[];
  /** Commanders: out of action after a retreat until this turn. */
  recovering?: number;
}

export interface Ballot {
  resolution: string;
  option: string;
  /** For a resolution with a target: the civ voted for. */
  target: PlayerId | null;
  /** 1 free, the rest bought with favor. */
  votes: number;
}

export interface CongressState {
  /** The turn the next session meets. */
  nextSession: number;
  /** The session meeting now (players vote this turn), or null between sessions. */
  session: { turn: number; agenda: string[] } | null;
  /** This session's ballots, by player. */
  votes: Record<PlayerId, Ballot[]>;
  /** What the last session decided (in force until the next). */
  passed: { resolution: string; option: string; target: PlayerId | null }[];
}

export interface SpyState {
  owner: PlayerId;
  name: string;
  /** 1 to `rules.espionage.rankAt.length + 1`. */
  rank: number;
  /** Missions that worked. */
  successes: number;
  /** Where it is (or is going): a settlement, or null for at home and free. */
  at: SettlementId | null;
  /** The turn it gets there (or back home); it can start a mission from then. */
  arrives: number;
  /** A `spyMission` id, and the turn it finishes (0 for ongoing, like counterspying). */
  mission: { id: string; done: number } | null;
}

export interface GreatWorkState {
  /** Its title (text, or a string key). */
  name: string;
  kind: 'writing' | 'art' | 'music' | 'relic';
  /** The great person who made it. */
  creator: string;
  /** Who it was made for (works change hands with the settlement they're in). */
  by: PlayerId;
  turn: number;
  /** Where it's displayed: a settlement, and the building or wonder in it with the slot. */
  settlement: SettlementId;
  holder: string;
}

export interface GameSettings {
  seed: string;
  /** The game ends after this turn (score victory). `null` = no limit. */
  turnLimit: number | null;
  map: MapSettings;
  /** Hostile camps (on unless false). */
  camps?: boolean | undefined;
  /** Domination victory (on unless false). */
  domination?: boolean | undefined;
  /** Religious victory (on unless false). */
  religion?: boolean | undefined;
  /** City-states on the map (on unless false). */
  cityStates?: boolean | undefined;
  /** Science and culture victories (on unless false). */
  science?: boolean | undefined;
  culture?: boolean | undefined;
  /** A `gameSpeed` content id (standard when absent): scales every cost. */
  speed?: string | undefined;
  /** A `difficulty` content id for AI players (no bonuses when absent). */
  difficulty?: string | undefined;
  /** An `era` content id to start in (the first era when absent): see `era.start`. */
  startEra?: string | undefined;
  /** Loyalty: settlements can break away and change sides (on unless false). */
  loyalty?: boolean | undefined;
  /** Espionage: spies and their missions (on unless false). */
  espionage?: boolean | undefined;
  /** Nuclear weapons can be built and used (on unless false). */
  nukes?: boolean | undefined;
  /** Natural disasters and climate change (on unless false). */
  disasters?: boolean | undefined;
  /** World Congress: favor, sessions and resolutions (on unless false). */
  congress?: boolean | undefined;
  /** Diplomatic victory, through the World Congress (on unless false). */
  diplomatic?: boolean | undefined;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  /** `hostile`: the owner of camp raiders, outside the turn order (see `HOSTILE`). */
  /** `cityState`: one of the city-states (outside the turn order, like `hostile`). */
  kind: 'human' | 'ai' | 'hostile' | 'cityState';
  /** AI players: the `difficulty` whose bonuses they get (D53). */
  handicap?: string;
  /** Team number; players on the same team share victory. `null` = no team. */
  team: number | null;
  alive: boolean;
  /** Simultaneous turns: true once the player clicked End Turn this turn. */
  turnEnded: boolean;
  /** Tile index where the player starts (their first settler appears here). */
  startTile: number;
  /** Tiles this player has ever seen (base64 bitset, see bitset.ts). */
  explored: string;
  /** Land units may embark onto water (from rules now, from a tech in M7). */
  canEmbark: boolean;
  /** A `civ` content id. */
  civ: string;
  /** A `leader` content id ('' for the raiders' owner). */
  leader: string;
  /** Treasury, in hundredths. */
  gold: number;
  /** Influence for diplomacy, in hundredths. */
  influence: number;
  /** Great people this player has activated (their lasting effects apply). */
  greatPeople: string[];
  /** Their pantheon and founder `belief` ids (their effects apply to this player). */
  beliefs: string[];
  /** The religion they founded, if any. */
  religion: string | null;
  /** Envoys they can send to city-states for free. */
  envoys: number;
  /** Culture earned over the whole game (their domestic tourists), in hundredths. */
  lifetimeCulture: number;
  /** Science, culture and tourism their settlements made last turn, in hundredths. */
  scienceRate: number;
  cultureRate: number;
  tourismRate: number;
  /** Space projects finished, in order (science victory). */
  spaceProjects: string[];
  /** The turn their last space project arrives (and they win), once it's launched. */
  expeditionArrives: number | null;
  /** Faith stored, in hundredths (spent from M13). */
  faith: number;
  capital: SettlementId | null;
  /** How many settlements this player has founded (picks the next name). */
  settlementsFounded: number;
  /** Enemy units destroyed (for score). */
  kills: number;
  /** The last turn this player declared a war (some abilities last a while after). */
  declaredWarTurn: number | null;
  /** Era score and the age (absent for city-states and raiders). */
  ages?: AgeState;
  /** Appointed governors, by `governor` content id. */
  governors?: Record<string, GovernorState>;
  /** World Congress: favor (whole points), diplomatic victory points earned, and the
   * resolutions in force for this player (until the next session). */
  favor?: number;
  diploPoints?: number;
  resolutions?: { resolution: string; option: string }[];
  /** The tech tree (paid with science) and the civics tree (paid with culture). */
  techs: Track;
  civics: Track;
  /** A `government` content id. */
  government: string;
  /** Policy cards in each kind of slot. */
  policies: Record<SlotKind, string[]>;
  /** Changing policies and government is free this turn (right after finishing a civic). */
  policyWindow: boolean;
  celebration: {
    /** Happiness surplus saved toward the next celebration. */
    store: number;
    /** Celebrations so far (each makes the next one cost more). */
    count: number;
    /** Turns left in the current celebration (0 = not celebrating). */
    turnsLeft: number;
  };
}

/** Progress through one tree. Amounts are in hundredths. */
/** A player's era score and age (docs/04-advanced-systems.md, "Eras and ages"). */
export interface AgeState {
  /** The era this age covers (an `era` content id). */
  era: string;
  /** An `age` content id. */
  age: string;
  /** `dedication` content ids chosen for this era. */
  dedications: string[];
  /** Dedications still to choose. */
  pending: number;
  /** Era score earned in this era. */
  score: number;
  /** Moments counted this era, by `moment` id (for caps). */
  counts: Record<string, number>;
  /** Once-per-player moments already earned. */
  once: string[];
  /** Natural wonders (feature ids) this player has found. */
  seen: string[];
  /** Every moment earned, oldest first. */
  timeline: { turn: number; moment: string; score: number; era: string }[];
  /** The age each past era had: era id → age id. */
  history: Record<string, string>;
}

/** One appointed governor (docs/04-advanced-systems.md, "Governors"). */
export interface GovernorState {
  /** Promotion ids taken. */
  promotions: string[];
  /** The settlement it serves, or null while unassigned. */
  settlement: SettlementId | null;
  /** The turn it becomes established in that settlement. */
  activeOn: number;
  /** Established: its effects apply. */
  established: boolean;
}

export interface Track {
  /** Finished, in the order they were finished. */
  done: string[];
  /** Being worked on now. */
  current: string | null;
  /** What comes after `current` (a path chosen through the tree). */
  queue: string[];
  /** Progress on each started node. */
  progress: Record<string, number>;
  /** Nodes whose boost has been earned. */
  boosted: string[];
  /** Earned while nothing was chosen; goes to the next choice. */
  stored: number;
}
