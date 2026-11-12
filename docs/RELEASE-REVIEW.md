# Release review (the last pass before playtesting, November 2026)

The log of the final release pass: what was checked, how, what was found, what was fixed and
what was left. Written phase by phase as the work went. **A session that picks this up again
should read this file first and continue from the first phase without a "Done" mark.**

## Where this stands

Updated with every commit, so this table is always the current position.

| Phase | State | What is left |
|---|---|---|
| 0 Baseline | Done | |
| 1 Every screen | Most of it done | One more capture of every screen on the final build at every size; the special states (game over, incoming deal, capture dialog, promotion, hotseat pass) |
| 2 Reliability | Done, soak still running | The soak's totals on the final code |
| 3 Online | Done | What only real devices can show is in "Could not verify" |
| 4 Performance and compatibility | Started | Bundle, browser fallbacks, workflows, update flow |
| 5 Audio | Not started | Offline analysis of levels and cue coverage |
| 6 Writing and originality | Most of it done | Credits and licenses, hard-coded strings, the Help screen against the real keys |
| 7 First hour and defaults | Started | The first 30 turns played through; accessibility checks |
| 8 Release hygiene | Not started | README, guides, changelog, CLAUDE.md, PLAYTEST.md |
| Finish | Not started | Final re-run of everything, the summary |

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

## Phase 1: Integration review of every screen — in progress

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

The session was interrupted twice by the machine restarting (running servers and background
games are lost each time, files are not), so work is committed in smaller parts than one per
phase, and `cx soak --out` carries on from the games already played.

## Phase 2: Reliability — in progress (started early: the soak ran beside the screen review)

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

## Phase 3: Online and multiplayer — in progress

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

## Phase 6: Writing, content and originality — in progress (started while screens were captured)

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

## Phase 7: First hour, defaults and accessibility — in progress

- **The frame rate counter was on by default** (bottom corner of every screenshot and of every
  new player's first game). It is off now, like the developer aid it is; Options still has it
  (D128, open: default built). The screenshot scripts used its number to know the first frame
  had been drawn; they read a mark on the game screen instead (`data-drawn`).

