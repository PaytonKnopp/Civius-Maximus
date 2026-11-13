# Release review (the last pass before playtesting, November 2026)

The log of the final release pass: what was checked, how, what was found, what was fixed and
what was left. Written phase by phase as the work went. **A session that picks this up again
should read this file first and continue from the first phase without a "Done" mark.**

## Where this stands

Updated with every commit, so this table is always the current position.

| Phase | State | What is left |
|---|---|---|
| 0 Baseline | Done | |
| 1 Every screen | Done | |
| 2 Reliability | Done | The long soak is still adding games; its count is under "Verified" |
| 3 Online | Done | What only real devices can show is in "Could not verify" |
| 4 Performance and compatibility | Done | |
| 5 Audio | Done | How it sounds needs ears (checklist in PLAYTEST.md) |
| 6 Writing and originality | Done | |
| 7 First hour and defaults | Done | |
| 8 Release hygiene | Done | |
| Finish | In progress | Final re-run of every check, the summary |

Where it ran: one cloud machine (4 cores, no sound card, no graphics card: the headless browser
draws 3D in software), one browser engine (Chromium). Anything about how the game sounds, how it
feels on a real device, or how it behaves in Safari or Firefox is in "Could not verify" at the
end, with a checklist.

## Phase 0: Baseline — Done

- `pnpm install --frozen-lockfile`: clean.
- `pnpm lint` (9 s), `pnpm format:check` (10 s), `pnpm typecheck` (26 s), `pnpm test` (56 files,
  423 tests, 94 s), `pnpm build` (2 s): all pass with nothing changed.
- `pnpm cx validate`: clean (content hash `3b46228658957095afd349da86`). `pnpm cx schema`: no
  change to `schemas/`.
- Bundle at the start: `index.js` 2,620.80 kB (736.57 kB gzipped), `ai.worker.js` 825.52 kB,
  `index.css` 184.22 kB (36.17 kB gzipped).
- Saves for the review, made with `pnpm cx profile <players> <turns> <seed> <size> <script>
  --save`, each game saved at turns 5, 60, 150, 250 and 300 by carrying the same game on with
  `--from`: 4 civs on a Small Continents map (seed 21), 6 on Standard Pangaea (seed 22), 8 on
  Large Continents (seed 23), 12 on Huge Continents (seed 24).

## Phase 1: Integration review of every screen — Done (see "Could not verify" for what a headless browser can't show)

How: `packages/client/scripts/review-screens.mjs` (new) loads a save as one seat and captures the
whole game screen at each size (HUD, every top-bar tooltip, the city and town cards and each tab,
unit cards, the tile card, every lens with its legend, diplomacy and the deal screen, the game
menu, every full screen with each tab and scrolled to its end), and runs
`packages/client/scripts/audit.mjs` (new) on each state: raw ids and debug text, emoji, grammar
slips, clipped or cut-off text, sideways scrolling, covered buttons, text off the screen,
contrast under 3:1, and touch targets under 44 px. Screenshots were then read by eye.

Found and fixed so far (each re-screenshotted after the fix):

- **Top bar clipped on laptops.** The gameplay pass hid the per-turn changes below 1800 px to
  make room for strategic stockpiles; the design pass, merged after, showed them again at every
  width. Together a celebration plus two stockpiles needed 670 to 756 px where 1280 to 1600 px
  screens had 400 to 550: "Celebrating" was cut mid-word, the stockpiles were out of sight, and
  hovering a number scrolled the first ones away. Now the list never scrolls: it drops detail
  level by level until it fits (`ui/fit.ts`; "Celebrating 9" becomes "9 turns" and stockpiles lose
  their change, then faith and influence lose theirs, then gold (a shrinking treasury turns red),
  then one stockpile with "+N"), the screen buttons keep their compact size up to 1700 px, and the
  two-row bar now runs to 1240 px. Measured on a turn-150 save: everything shows at 1600 px and
  up, 1440 px loses only the word "Celebrating" and the stockpiles' changes, 1280 px keeps every
  number. The turn pill's tooltip now names the age and era score it leaves out on laptops.
- **Lens list taller than a laptop screen.** Thirteen lenses in one column ran under the top bar
  and the civ chips on a 800 px screen ("No lens" and "Yields" could not be clicked). Now two
  columns, never taller than the room above the lens button, above the rest of the HUD while
  open; one scrolling column on phones.
- **Phones: Next could not be tapped in its middle while a lens with a legend was on** (the
  legend's box reached over it). Only the lens button and list take taps now.
- **"What it does" lines showed raw data.** The lines the Civilopedia and the Government screen
  build from the rules read "+5% production toward kind unit, military", "Adjacency: district
  Campus, adjacency {"yield":"science"...}", "Route bonus: international no, origin {...}",
  "With faith: kind Building", "(needs: not units trained below 3)" and so on. `effectText.ts` is
  rewritten: every effect and condition in the base game reads as a sentence ("+5% production
  toward soldiers in every settlement", "Campuses: +1 science for each adjacent Mountain tile",
  "The first soldier trained in every settlement is free"), a building's own-settlement effects no
  longer claim "every settlement", and a new test reads all 400-odd lines for raw values.
  "Eurekas and inspirations" (another game's words) is now "boosts", as everywhere else here.
- **Government legacies counted wrong at other speeds.** The screen said "next in N turns" from
  the Standard number (25) while the rules scale it by game speed; it now uses the rules' own
  number (`legacyTurns` in the engine, the same expression the turn uses), and says "1 turn".
- **Deal screen:** resources, open borders and research agreements had no icon; they do now.
- **Religion screen with a Great Prophet in hand** said "None left", "Ready: use it" and "Build
  a Holy Site to earn Great Prophet points" at once; it now says "Ready" and how to use the prophet.
- **Verb agreement:** "Franks offers you a deal", "Celts wins", "Mongols has fallen" now read
  "offer", "win", "have" for civs named as a people (`agree` in `model.ts`).
- **"1 turns"** in six more places (great people, score victory, deals, spy missions, legacies,
  prophets); per-turn numbers follow the rest (whole from 100 up, a true minus sign).
- **Unit card on short screens** (1280 x 640): a great person's card grew over the research and
  civic cards; it now stops under them and scrolls.
- **Explore was offered to every unit**, settlers, traders and great people included (the first
  turn's settler showed it). Now soldiers and ships only (D127, open: default built).
- **Esc while aiming a nuclear weapon** deselected the unit and left the target marks; the key
  handler was reading a stale value.
- Smaller: the eras timeline stopped at 340 px on a tall screen; tech cards cut "Needs A, B" short
  (now "Needs A +1", all named in the tooltip); "city" in the city card's subtitle; "0 spies...
  brings another".
- Scripts: the screenshot scripts turned hints off with a storage key the game no longer reads,
  so every in-game screenshot had a hint card over the map.
- **Gold per turn left things out.** Checking what the top bar promises against what a turn then
  gives (the soak below does it for every civ every turn) showed the gold figure missed deals
  that pay gold a turn, cities with nothing to build selling their production, and counted in
  full the production a Mining town sends to its city. The engine now has `goldForecast` (the
  turn's own sums, line by line; a test checks it against a real turn) for the top bar, its
  tooltip (new lines: Deals, Cities with nothing to build) and the economic advisor. The plain
  `goldPerTurn` the AI and the deal rules reason with is untouched, so games play out the same
  (state hash unchanged). Science, culture, faith and influence were already what the rules give
  (89 to 97% of civ-turns exactly, the rest a settlement growing in the same turn).

Found on the last capture and fixed:

- **2D city banners hidden behind unit markers.** A soldier standing on the tile below a city
  covered what the city was making. Banners now draw above unit markers; the town itself
  stays under them.
- **Emoji as text.** The game writes yields as its own drawn icons; two lists still printed the
  emoji they stand in for (the tile list when placing a district, and a trader's list of
  destinations).
- **Touch targets.** On a phone the build queue's remove button was 18 x 17 px, the 3D / 2D
  switch 30 x 23 and Disband 57 x 23. Where the pointer is a finger they are now at least 32 px.

**The last capture, on the finished build** (`review-screens.mjs`, the turn-150 save with six
civs, at 1920 x 1080, 1280 x 800 and 390 x 844: 218 screenshots): every screen opens and closes,
no console error, and the audit finds **no clipped or cut text, no sideways scrolling, no raw
id, no emoji and nothing off the screen**. What it still lists: 33 low-contrast notes, all on
tinted cards whose top sheen the audit mistakes for the whole card (read by eye: legible); 34
"covered" notes that are a tooltip or an open list over a button, as intended; and small touch
targets on the phone, the worst of which are fixed above (the screen buttons at 36 px and the
civ chips at 40 px are left as designed).

Special states, captured and read: the game-over screen for a science victory and a religious
victory (desktop and phone, as the loser), the bar the game shows when a rival's turn fails
(forced through the debug hook: five seats failed, each passed, the turn went on, and the bar
offered the save), and the screen shown when drawing the game itself fails.

The session was interrupted many times by the machine restarting (running servers and
background games are lost each time, files are not), so work is committed in smaller parts than
one per phase, and `cx soak --out` carries on from the games already played.

## Phase 2: Reliability — Done

`pnpm cx soak` (new, `packages/tools/src/soak.ts`) plays all-AI games to the end and, after every
turn, runs the engine's new `checkInvariants` (every id points at something that exists; units
and settlements stand where the rules let them; tiles and settlements agree on ownership; no
two owners' units share a tile; nothing that can't go below zero has; a score equals its
lines), saves and loads the game and plays both copies on (the hashes must match), and compares
what the top bar promised each civ with what the turn gave.

Rules bugs the invariants found in the first three games, all fixed with tests:

- **Levied soldiers stayed where they stood when the levy ended.** A city-state's soldier a
  civ had hired went back to the city-state on the spot: on top of that civ's own settler or
  great person, or inside its city (whose own soldiers then could not enter it). The notice
  already said they "have gone home"; now they do, to the city-state's settlement or beside
  it, and one packed in a commander steps out to go.
- **A camp could become a city-state inside a civ's borders or next to a settlement.** The
  check that a city-state could grow on the camp's tile always stopped at "clear the camp
  first" and never reached "not in someone's territory" or "not too close"; the new city-state
  took the tile from the settlement that owned it. The site is now judged without the camp.
- **More policy cards than slots.** A civ kept every card after losing a slot later in the same
  turn's processing (a city-state changing suzerain, a settlement with a slot-giving wonder
  changing sides) or to a capture, for a whole turn or more. Cards are now fitted to slots at
  the end of every turn and when a settlement is captured.
- **A captured settlement kept its old owner's governor listed until the turn ended.** Released
  at once now, as when a settlement changes sides by loyalty.

Not bugs (the checks were too strict): a camp lists a dead raider until its next turn; a great
work whose building is gone (a captured Palace) is "stored" by design.

- **A captured raider stayed on its camp's roster** (found by the last soak, in a game with a
  leader whose soldiers capture what they beat). The camp went on counting the unit as one of
  its own, and when that camp was later befriended, every unit on its roster was disbanded:
  the player's captured soldier with them. A raider that changes sides now leaves the roster
  at once, and only raiders disband. (The reference game is unchanged by it:
  `cx profile 8 120 1 standard` ends on `6002199c44f2766610c04d1fa8` with and without the
  fix. That value is new since the names were replaced, because a game's hash covers the hash
  of its content.)
- **Treasuries below zero for free cities and city-states.** The "free cities" side and a
  city-state pay upkeep like anyone and have no way to sell units, so their gold could sink
  without limit (-393 in one game). Nothing reads it, but it broke the rule that gold never
  goes below zero; both now stop at zero.

### Fuzzing (2.3)

- **Actions** (`packages/engine/src/fuzz.test.ts`, runs with `pnpm test`): actions are generated
  from the action schema itself, so a new action type is fuzzed the day it is added. 6,000
  malformed inputs and 6,000 well-formed random actions against a game at turn 1, turn 11 and
  turn 43: each is refused with a reason (and changes nothing) or applied (and the invariants
  hold after). **One crash found and fixed:** an id that names something every JavaScript object
  has (`{"type":"set_civic","civic":"constructor"}`, also `toString`, `__proto__`) passed the
  "is this a civic" lookup and the engine threw. A friend in an online game could have stopped
  the host's game with one message. Every id in an action is now refused at the door if it is
  such a name (`actions.ts`).
- **Saves** (`packages/host/src/saves.fuzz.test.ts`): a save loaded from its own text plays on
  to the same hash; 13 kinds of not-a-save (empty, cut in half, cut by one character, wrong
  format, newer and older versions, trailing rubbish) each get the right message; a 65 MB file
  is refused without being read; and 400 copies of a real save with one to three random breaks
  (a field removed, replaced by rubbish, an array emptied, a number made NaN or negative) are
  each refused with a reason or load and then play. Before this pass `readSave` checked the
  format, the versions and the content ids and nothing else: a save with its map cut short
  loaded and took the game screen down. It now checks the parts everything stands on (map
  size, players, units and settlements on the map, research, treaties) and that the rules can
  read the whole state, and says "That save is damaged and can't be loaded (a unit is off the
  map)". All 20 review saves (0.6 to 2.0 MB) still load, in 9 to 960 ms on this machine. The
  file picker also refuses anything over 64 MB before reading it.

### When the rules themselves fail (2.6)

No turn has thrown in any soak game so far. If one ever does, the game used to stop for good:

- **A turn that failed in the background worker left "Rivals are moving" up for ever.** The
  page tried the turn itself, failed the same way, and nothing cleared the wait. Now the game
  goes back to where it was (playable, savable), and a bar says "The game hit a problem: This
  turn couldn't be played (...)" with a button that downloads the save to send with a report.
- **One AI seat failing stopped everyone's turn.** It now passes the rest of its turn, the game
  goes on, and the same bar says which civ and why. The result is the same on the page, in the
  worker and on an online host, so games stay in step.
- **An action that makes the rules throw** (from this player or, online, from a friend's
  device) is refused like any other; the host carries on.
- **An autosave that fails** (storage blocked or full) was silent every turn; it is now said
  once ("Couldn't autosave: this browser's storage is blocked or full").
- The crash screen said "This game couldn't start" even at turn 200; it now says the game
  couldn't go on, and that the autosave from the start of the turn is under Load game.

Tests: `packages/host/src/local.test.ts`, "when the rules themselves fail".

### The AI's refused moves (2.4)

The soak counts what the rules refuse the AI: `move_unit:no_path` was by far the most, 337 to
4,181 a game. A trace of who asks (three routines: settlers heading for a site, scouts and
idle soldiers exploring, soldiers gathering) showed it was not noise. The AI ranked every
explored tile, asked for a path to its best three or four, and stood still when those were
refused; paths never cross unexplored tiles, so anything seen across water or mountains was a
dead end it tried again every turn. On a 6-civ Archipelago game, 160 turns: **3,844 refused
moves against 2,111 accepted, and 1,440 unit-turns in which a unit did nothing else**
(settlers 558 of them, while cities trained more settlers for the same unreachable sites).

Fixed in the AI, not the rules (`Turn.canReach`: which stretch of explored, crossable map a
tile is in; worked out again only when the explored tiles change): settlers, scouts and
gathering soldiers rank only what they can reach, and a settler is wanted only if one could
reach a site.

| 6 civs, Small, Online speed | refused moves | unit-turns with only refusals |
|---|---|---|
| Archipelago, 160 turns, before | 3,844 | 1,440 |
| Archipelago, 160 turns, after | 73 | 15 |
| Continents, 200 turns, before | 1,307 | 252 |
| Continents, to its end (194), after | 283 | 37 |

What is left is a path blocked by someone else's units, which the old "try the next one" still
handles. Games in which no unit was ever stuck play out exactly as before: both reference
games keep their final state hash (`88d2a5c6416ba64589a6a5627b` and, for CI's
`cx profile 8 120 1 standard --check`, `ecb41782fb8e700ebc9927a6f4`, which passes). Island
games change: their AIs settle and explore more. Test: `packages/engine/src/ai/reach.test.ts`.

## Phase 3: Online and multiplayer — Done (what one machine can test)

- **Fuzz through the real host and protocol** (`packages/host/src/online.fuzz.test.ts`, runs
  with `pnpm test`): a seated client sends 34 hand-made hostile messages and 3,000 random
  ones (not messages at all, other seats' actions, ids like `constructor`, a 200,000-character
  chat line, pings off the map, a second hello). Nothing but its own legal moves changes the
  game, an honest client still holds exactly its view, and the game goes on. Found and fixed:
  - **A hello with a name that isn't text threw inside the host.** Every field of a client's
    message is now checked where it is used.
  - **One device could take every lobby seat** by saying hello again and again (a stranger
    could fill a public lobby alone, and the seats it left behind had no player). One device
    now holds one seat; a second hello changes nothing.
  - **A client's play-ahead was unguarded.** Actions are played at once on the client's view
    before the host answers; if the rules tripped over a view (it leaves out what the player
    can't see), the action was never sent. It now goes to the host, which decides.
- **Soak through the real host and protocol:** a game played from three devices (the host and
  two clients) plus an AI seat, each seat's actions sent one at a time like clicks, with a drop
  and a rejoin by seat key halfway. After every seat's turn each client must hold exactly its
  view of the host's game and the game must pass the invariants: 12 turns in `pnpm test`, and
  70 turns run by hand (`CX_ONLINE_TURNS=70`), both clean.
- **Public games list:** it showed the map as raw ids ("small island_plates") and whatever
  else a host put there; it now shows the map's names, and only for maps this game knows. The
  open seats it showed never changed after the lobby opened, so strangers were sent to full
  lobbies; a listed lobby now updates its count as friends join and leave.
- **Database review** (`packages/backend/supabase/migrations`, read line by line; nothing here
  can run them, see "Could not verify"): row-level security is on for all three tables; saves
  are readable and writable only by their owner, capped at 8 MB each and 30 a player, and can't
  change hands; lobbies can be listed, changed and closed only by their host, one per host, and
  expire by the server's clock; the trigger functions can't be called through the API; the
  game refuses to hold a secret (`service_role`) key. Nothing to fix.

## Phase 6: Writing, content and originality — Done

- **"How to play" was written before the gameplay pass** and mentioned none of it. All 22
  articles are checked against `rules.json` and rewritten where the rules moved (happiness is
  now 1 per 2 buildings with upkeep, unrest numbers, the settlement limit), and they now cover
  strategic stockpiles and shortages, luxuries reaching the nearest settlements, monopolies,
  the district limit and what is outside it (Neighborhood, Dam, Preserve), buildings sharing
  adjacency, regional buildings, Government Plaza pairs, catch-up research, future techs,
  legacies, ideologies, puppets, support units, war support, fleet commanders, open borders,
  research agreements and resource trades, faith purchases, works that age, emergency sessions
  of the Congress, the culture victory's era, playing on after a win, and the turn's orders
  (Explore, Alert, Repeat, undo, quick save). Two new articles: "Resources, stockpiles and
  monopolies" and "Appeal, parks and resorts". Every number is read from the rules.
- **Unit articles** now show the strategic resources a unit costs and uses up, what a support
  unit does (Battering Ram, Siege Tower, Medic: nothing in the game said), a commander's
  capacity, radius and strength, and "ignores zones of control". **Improvement articles** show
  where the improvement can go and what it yields by appeal (national parks, seaside resorts).
  **Government articles** show the ideology and the legacy bonus.
- **First hint lost.** The quick game behind the title screen showed (and so used up) the
  first hint before anyone had started a game; a player who went through New game never saw
  it. Hints now wait until nothing covers the game and the leader's introduction is closed.
- Menu rows that are lit (the chosen seat, leader or search result, an autosave) had their
  second line under 3:1 contrast; it takes the lighter secondary color there.

### Originality sweep (6.3)

Every name and text in `packages/content/base` (3,107 strings) was checked against the names
Civilization V, VI and VII give their abilities, promotions, beliefs, policy cards, governors,
dedications and spy missions (from memory: there is no list to check against by machine, so a
miss is possible), and every list of names was then read by eye. Almost all of it is the
game's own. **27 names coincided with a Civilization ability name**, several with the same
effect, which the working agreement rules out ("no ability names from Civilization games").
They are renamed (display text only: ids and effects are untouched, so saves keep loading;
D129, open: default built):

| Was | Now | What it is |
|---|---|---|
| The First Emperor | All Under Heaven | Qin Shi Huang's ability (the same name as his in Civilization VI) |
| The Long Count | Calendar Keepers | The Maya's ability (their ability's name in Civilization V) |
| Aksumite Legacy | Keepers of the Ark | Ethiopia's ability (same name and nearly the same effect as in Civilization VI) |
| The Magnanimous | The Scholar Emperor | Pedro II's ability ("Magnanimous" in Civilization VI) |
| Woodsman | Woodcraft | Melee promotion |
| Pursuit | Harrier | Light cavalry promotion |
| Charge, Barding, Breakthrough | Couched Lance, Armored Mounts, Hammer Blow | Heavy cavalry promotions (three of Civilization VI's heavy cavalry promotions) |
| Ambush | Waylay | Recon promotion |
| Helmsman | Steersman | Naval promotion (same name and effect) |
| Assault, Bastion, Logistics, Leadership, Field Medicine | Onslaught, Stand Fast, Baggage Train, Standard Bearers, Camp Surgeons | Commander promotions (four are the names of Civilization VII's commander trees) |
| God of the Forge, Stone Circles | The Smith God, Standing Stones | Pantheons |
| Tithe, Pilgrimage | Temple Dues, Offerings from Afar | Founder beliefs (same names and effects) |
| Choral Music, Fertility Rites | Sacred Song, Blessing of Children | Follower beliefs (same names and effects) |
| Press Gangs, Drill Manuals, Grand Opera, Martial Law | Shipwrights' Guilds, Conscript Rolls, Opera Seasons, Rule by Decree | Policy cards |
| Bram the Steward | Bram the Reeve | Governor title (Magnus is "the Steward" in Civilization VI) |

Not changed, and yours to decide (D130): the vocabulary of the systems themselves, which the
game shares with Civilization VI (the district names, the four ages and "era score",
"diplomatic favor", the World Congress and its emergencies).

Clean: unit, building, wonder, great person and city names are history's own; leader quotes,
introductions, Civilopedia articles, dedications, spy missions, congress resolutions and
governors' names are original; no text from a Civilization game was found.

### Credits and licenses (6.4)

- **The game shipped none of the notices its libraries ask for.** It is built on seven MIT
  libraries (React, React DOM, PixiJS, Three.js, PeerJS, Immer, Zod) and two typefaces under
  the SIL Open Font License (Cinzel, Source Sans 3); both licenses ask that their text travels
  with every copy, and the built files carried none. The build now writes `licenses.txt`
  beside the game, read from the packages themselves so it can't go stale; Options › About
  links to it, and the single-file build carries it inside the file.
- **Options › About said "no sound or image files".** Since the design pass the game does
  ship 15 photographs (ground, surface grain, a canvas weave), all CC0 from Poly Haven and all
  listed in `docs/ART-CREDITS.md`, which matches the files in the repository one for one. The
  sentence now says so.
- **Help** listed every key but the map's own (arrows or W A S D to move it, + and - to zoom);
  it lists them now. Every key Help names is handled, and no handled key is missing.

### Dependencies and secrets (6.5, 6.6)

- `pnpm audit --prod`: no known vulnerabilities in what ships. `pnpm audit`: one moderate
  advisory in `minimatch`, used only by ESLint on the developer's machine; left as it is.
- No secret is tracked in the repository (one test string that looks like one), and the built
  files hold none. The deploy workflows take the database address and key from repository
  **variables** (public by design: the key in a browser game is the public one).
- **A secret key could still have reached a build.** If the secret (`service_role`) key were
  put in `VITE_SUPABASE_ANON_KEY` by mistake, the game refused to use it, but Vite had already
  written it into the JavaScript every player downloads. The build now stops with a plain
  message instead (`packages/client/vite.config.ts`; tried with both kinds of secret key and
  with a public one).

## Phase 4: Performance and compatibility — Done (what one machine can test)

- `pnpm cx profile 8 120 1 standard --check` (the check CI runs): passes. At turn 121 on this
  machine: 1.2 s of turn processing, 0.55 s for all eight AIs, a 1.0 MB save (45 KB gzipped),
  173 MB of heap, level through the game. Big maps are slower in proportion (12 civs on a Huge
  map: about 2 s a turn late on); `docs/01-architecture.md`, "Performance targets", has the
  history and why closing that gap is its own piece of work. The turn runs in a worker, so the
  page does not freeze while it is worked out.
- **What the game does when the browser takes something away**
  (`packages/client/scripts/compat-check.mjs`, new): the game is opened, a city founded and a
  turn played with each of these missing. All seven play the turn with no error:

  | Taken away | What happens |
  |---|---|
  | Nothing | The baseline |
  | Storage (`localStorage` and IndexedDB refuse everything, as in some private modes) | Plays on its defaults; says once that it can't autosave |
  | Web Workers | The AI plays on the page |
  | Workers that fail to load (a browser without module workers) | The turn falls back to the page |
  | WebGL altogether | The 2D map, drawn without it |
  | The 2D map's graphics context, lost and restored mid-game | Draws again |
  | The 3D map's graphics context, lost and restored mid-game | Draws again |

- **Browser features the styles lean on** (read through, not run: only Chromium was here):
  `:has()`, `dvh` units and `color-mix()` need Safari 16.2 or later and Firefox 121 or later;
  the scripts use nothing newer than `structuredClone` and `Object.hasOwn` (Safari 15.4).
  Anything older than those shows the game with some layout rules missing. That and how it
  behaves in Safari and Firefox themselves are in "Could not verify".
- **Bundle:** `index.js` is 2.67 MB (752 KB gzipped), one file; PeerJS loads only when Play
  online is opened. Splitting the 3D view or the Civilopedia out of the first load is possible
  but touches how the title screen starts a game behind itself; left as it is.
- The build warns that `vite.config.ts` imports `./src/version` without a file extension (a
  future Vite default will want it). Harmless today; fixing it needs a TypeScript option
  changed for the whole client, so it is left.

## Phase 5: Audio — Done (what can be measured)

All sound is synthesized, so the real thing can be measured without a sound card:
`packages/client/scripts/audio-check.mjs` (new) runs the built game in a headless browser and
reads its master bus sample by sample, before the output compressor and after an identical
one. It cannot say whether anything sounds good.

- **Nothing clips.** Each of the 39 cues alone peaks between -34 and -6 dBFS; each era's music
  between -21 and -14 dBFS (about -33 dBFS on average); the worst pile-up tried (wonder,
  victory, cannon, war, new era, great person and capture at the same instant, over the
  music) peaks at **-0.9 dBFS** after the compressor. That is under full scale but with
  little to spare: if you ever hear distortion on a very busy turn, a limiter after the
  compressor is the fix.
- **For your ears** (levels as measured, at the default volumes):

  | Loudest cues | Peak | Quietest cues | Peak |
  |---|---|---|---|
  | Religion or pantheon founded | -5.8 dBFS | Footsteps (a unit moves) | -34.1 dBFS |
  | Cannon | -7.9 | Button click | -33.4 |
  | War declared | -8.4 | A ship moves | -31.3 |
  | Victory | -8.8 | Notification | -24.9 |
  | Civic completed | -9.2 | New turn | -24.1 |

  The three quietest peak at or under the music's average level, so they are probably not
  heard while music plays. Founding a pantheon is louder than winning the game, and a civic
  is 3 dB louder than a technology. None of this was changed: it is balance, and yours to
  judge by ear.
- **Cue coverage:** 37 of the 39 cues are played by something. `close` and `border` are
  defined and never played (closing a screen is silent; `border_grew` is mapped to silence on
  purpose). Every event a player can see has a cue or is deliberately silent.
- **Fixed:**
  - *The wrong movement sound.* The cue was chosen by matching words in the unit's id: six
    ships (the Dromon, the Quadrireme, the fleet commander, both submarines, the missile
    cruiser) marched on foot and five kinds of cavalry (the Mamluk, the Cossack, the Courser,
    the Essedarius, the Scara) had no hooves. It now goes by the unit's class and model.
  - *Music piling up after a stall.* Bars are scheduled a little ahead by a timer; when the
    page was busy or asleep for longer than a bar, every bar it had missed was scheduled in
    the past and sounded at once. Measured after a 9 s freeze: the peak jumped 4.3 dB before
    the fix and not at all after it.
  - *A leak.* Stopping the music left the wind's slow oscillator running, one more each time.
- Not checked, because it needs ears: whether it sounds good, the balance between music and
  effects, each slider by ear, real speakers. Checklist in [PLAYTEST.md](PLAYTEST.md).

## Phase 7: First hour, defaults and accessibility — Done

- **The frame rate counter was on by default** (bottom corner of every screenshot and of every
  new player's first game). It is off now, like the developer aid it is; Options still has it
  (D128, open: default built). The screenshot scripts used its number to know the first frame
  had been drawn; they read a mark on the game screen instead (`data-drawn`).
- **The first 30 turns, through the real interface** (`TURNS=30 screenshot-game.mjs`, in the 3D
  view): the leader's introduction, founding the capital, every "choose" the game asks for
  (production, research, a civic, policies, a dedication, a tile to develop, where to put a
  district), unit orders and End Turn, then each lens, the 2D view and a phone-sized window.
  Turn 30 reached with no dead end and no error; no sideways scrolling on the phone.
- **Defaults** as a new player gets them: 3D view where the browser has WebGL 2 (2D
  otherwise), Medium quality, autosave on, sound on at master 80%, music 45%, effects 70%,
  hints on, advisors on, the frame counter off.
- **Accessibility, read from the code:** every dialog has a role and a name; icon-only buttons
  have labels; images have alternative text; focus is visible (`:focus-visible` rules, and no
  outline is removed without a replacement); the system's "reduce motion" setting is honored
  as well as the game's own switch; Options has larger text. Not tried with a screen reader.

## Phase 8: Release hygiene — Done

- `README.md` points at this review, the playtest kit and the changelog; `CLAUDE.md` lists the
  new commands and check scripts; `CHANGELOG.md` is new; `docs/PLAYTEST.md` is refreshed with
  checklists for everything only a person with a device can check; the design docs are
  updated in the same commits as the changes they describe.
- **Reporting a bug:** the save is the report (it holds the seed and the whole game). Game
  menu › Save and load › Export file downloads it; when the game itself hits a problem, the
  bar that says so has "Save a copy to send".
- **A slow test:** `units.test.ts`, "replays a game with moves to the same hash", takes a few
  seconds and timed out once at the default 5 s when the machine was busy. It has 30 s now.
- **Dead code:** five exported names are used nowhere (`ENGINE_VERSION`, `emptyTerms`,
  `EFFECT_TYPES`, `SURFACE_LAYER`, `AIR_MODELS`). Left: they are a line each and cost nothing.
- **Text in code:** the interface's own words are written in the components (English only);
  only names and descriptions of game content live in content files. Translating the game
  would start with pulling those out. Not a defect; noted for when it matters.

## Verified, with numbers

- **Checks:** `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (61 files, 455
  tests) and `pnpm build` pass on the last commit. `pnpm cx validate` is clean. CI's
  performance check passes.
- **Soak** (`pnpm cx soak all`, on the final rules): 20 all-AI games played to the end
  with 2 to 12 civs on Duel to Huge maps and twelve map types, 3,386 turns in all. After
  every turn the invariants were checked; 73 times a game was saved, loaded and played
  on beside the original to the same hash. Two rules slips found: the captured raider above,
  fixed, and two soldiers on one tile once in a 12-civ game on a Huge map, which is being
  traced as this is written (see "Left for you" if it is still there). No turn threw. Endings: science 8, culture 6, diplomatic 6. The other speeds, difficulties, starting eras and
  rule switches are the part of the 71-game list the machine's restarts did not leave time
  for; `pnpm cx soak all --out file.jsonl`
  carries on from where a run stopped.
- **Fuzz:** 6,000 malformed and 6,000 well-formed random actions against games at three stages
  (one crash found and fixed); 400 damaged copies of a save and 13 kinds of not-a-save (the
  loader hardened); 3,034 hostile messages from a seated online client (three fixes); a game
  played from three devices through the real host and protocol for 12 turns in every test run
  and 70 turns by hand, each client holding exactly its view after every seat's turn.
- **Screens:** the finished build captured and audited at 1920 x 1080, 1280 x 800 and
  390 x 844 (218 states of the game screen); earlier builds in this pass at six sizes for the
  game screen and seven for the screens before a game. The first 30 turns played through the
  real interface. Game-over, crash and in-game problem states captured.
- **What the browser can take away:** seven cases, all play a turn.
- **Sound:** 39 cues, 9 music styles, the worst pile-up and a stalled page measured; nothing
  clips.
- **Text:** 3,107 strings of content checked for borrowed names; 405 "what it does" lines
  checked by a test for raw values; 24 how-to-play articles checked against the rules.
- **What the top bar promises against what a turn gives** (every civ, every turn of the
  soak): science exact 90% of the time, culture 94%, faith 88%, influence
  90% (the rest within a point or two: a settlement growing the same turn). Gold is exact
  28% of the time and close 42%: the rest are one-off sums no forecast can know
  (a village found, production sold when a wonder is lost, a deal ending).

## Could not verify

One cloud machine, no sound card, no graphics card, one browser engine, no second device, no
real network between devices, no Supabase project. Each of these has a checklist in
[PLAYTEST.md](PLAYTEST.md):

- **How it sounds.** Levels were measured, not heard.
- **Safari and Firefox,** on a Mac, an iPhone, an Android phone. Only Chromium ran. The styles
  use `:has()`, `dvh` and `color-mix()` (Safari 16.2 or later, Firefox 121 or later).
- **Real graphics hardware.** 3D was drawn in software: frame rates here mean nothing, and
  the largest screenshots sometimes showed a frame late. Frame rate at each quality setting,
  a late game on a large map, and the auto-detected quality on a real machine are unchecked.
- **Real networks.** Online play ran over an in-memory network and between tabs of one
  browser, never through the public matchmaking service, a relay, mobile data or a strict
  office network.
- **Accounts and cloud saves.** The database rules were read, not run: there was no project
  to run them on. Sign-up, the cloud autosave, Continue on a second device and public games
  are untested end to end.
- **The desktop app.** Not built here (it needs Windows, macOS and Linux runners).
- **Touch.** Sizes and layouts were checked in a phone-sized window with touch emulated; no
  finger touched it. Notches and home bars rely on the browser's safe-area values.
- **A screen reader.**
- **The version number in a real deploy.** This checkout has no merge history, so builds here
  show 1.0; the deploy workflow fetches the full history and counts merges.

## Open taste calls

Each has its default built; say the word to switch (`docs/DECISIONS.md`):

- **D127** Explore is offered only to soldiers and ships (it was on every unit).
- **D128** The frame rate counter is off unless turned on.
- **D129** 27 names that matched Civilization ability names are replaced; the table of old and
  new is in Phase 6 above. Any of them can be another name, or the old one back.
- **D130** The systems' own vocabulary that the game shares with Civilization VI (district
  names, the four ages, "era score", "diplomatic favor", the World Congress) is kept. Worth
  deciding before a public release.
- D122 to D126 (from the final design pass) are untouched.

Noted for your ear or eye, not changed: the click, footsteps and a ship's move are probably
too quiet to hear under music, and founding a pantheon is the loudest cue in the game; closing
a screen has a cue that nothing plays.

## Left for you

Too big or too much a matter of taste for this pass:

- **Who wins all-AI games.** The mechanics review's larger samples at Standard speed are won
  by science almost every time. In this pass's soak (Online speed, mostly six civs on Small
  maps) the endings were science 8, culture 6, diplomatic 6; domination never won one, and religion won one game out
  of about forty played in the pass. The AI does not yet play for domination or religion well
  enough to win by them.
- **AI navies** do not escort invasions or blockade.
- **Big-map turns** take about 2 s late in a game with 12 civs on a Huge map (1.2 s with 8
  civs on Standard at turn 120, measured here). The turn runs off the page, so nothing
  freezes, but the wait is there. `docs/01-architecture.md` says what closing the gap needs.
- **Art:** painted leader portraits and artist-made 3D models are the biggest upgrade left;
  everything on screen is drawn by code. `docs/guides/art.md` says where the files go.
- **The AI still asks for a few moves it can't make** (a path blocked by someone else's
  units): about 70 to 280 a game, down from 1,300 to 3,800, and it falls back to its next
  choice.
- **Headroom in the sound:** the worst pile-up measured peaks 0.9 dB under full scale. A
  limiter after the compressor would make clipping impossible; it changes the sound a little,
  so it is yours to try.
- **The first download** is one 2.7 MB file (752 KB compressed). Splitting the 3D view and the
  Civilopedia out of it would speed up the first visit.
- **A one-line Vite warning** at build time about an import without a file extension.
- **Translation** would start with moving the interface's words out of the components.

