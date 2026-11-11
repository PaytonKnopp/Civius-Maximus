# Release review (the last pass before playtesting, November 2026)

The log of the final release pass: what was checked, how, what was found, what was fixed and
what was left. Written phase by phase as the work went. **A session that picks this up again
should read this file first and continue from the first phase without a "Done" mark.**

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
