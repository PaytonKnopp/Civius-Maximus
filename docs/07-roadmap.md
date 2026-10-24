# 07 — Roadmap

Every milestone ends with a pull request containing tests, plus a short note covering what's new,
how to try it, and any new decisions for you. **🎮 marks a playtest checkpoint.** At those points,
playing decides what changes next.

The order follows one rule: **build foundations that are painful to change later first**
(determinism, N-player support, the content format, host authority, redaction), then add
features on top.

## Phase A — Foundations (no playable game yet, by design)

### M0 · Project skeleton ✅
- pnpm monorepo, strict TypeScript, ESLint/Prettier, Vitest, GitHub Actions CI.
- `CLAUDE.md` with the working agreement for future sessions (fast checks, what CI runs).
- **Done when:** `pnpm lint && pnpm test` pass in CI on the empty packages.

### M1 · Content format and effects core ✅
- Zod schemas for the core content types, the loader (base + mods, load order, patches), and the
  validator CLI.
- Effects/conditions evaluator, with tests. Yield breakdowns ("why?") are built from day one.
- Initial `content/base` covering terrain, features, resources and rules constants.
- **Done when:** `pnpm cx validate` passes on base content, and a test mod with a patch and a
  broken reference produces the expected friendly errors.

### M2 · Engine core: state, actions, determinism ✅
- Game state model for N players (no 2-player assumptions anywhere), the seeded RNG, the action
  pipeline (validate → apply → events), turn processing order, and state hashing.
- Golden-replay test harness.
- **Done when:** a scripted 8-player game of no-op turns replays to an identical hash, and the
  engine has no `Math.random()` or floating-point math in the rules (enforced by a lint rule).

### M3 · World generation ✅
- Hex math (axial coordinates, wrapping, distance, rings, line of sight), plus map scripts:
  Continents, Pangaea, Archipelago and Fractal.
- Climate, rivers on edges, features, resources, start positions with civ bias, and
  balanced starts. (Mirrored maps moved to the backlog: hex grids don't mirror cleanly for 3+
  players, and balanced starts cover most of the need.)
- **Done when:** 1,000 seeded maps per script generate with valid starts (minimum yields, no
  overlapping starts, every start reachable) in under 1 s each.

### M4 · Map renderer (first visible thing) ✅
- PixiJS map: terrain, features, rivers, resources, a wrapping camera, zoom and pan, culling,
  fog states, and a debug "god view".
- Placeholder art (shapes and colors), with an asset pipeline ready for real art.
- **Done when:** a Standard map renders at 60 fps while panning, and you can open a URL and fly
  around generated worlds.
- 🎮 **Checkpoint:** look at the maps. Do they feel like good Civ maps? Tune the generator.

### M4b · 3D painterly renderer (look prototype) ✅ (first version; tuning continues with your feedback)
- Three.js renderer per [10-art-direction.md](10-art-direction.md): sculpted terrain from the hex
  map, painted water with foam, instanced stylized trees and mountains, rivers, Civ VII-style
  cloud fog, tilted camera with zoom, quality presets. The 2D renderer stays as the strategic view.
- **Done when:** the Map Lab has a 3D mode that runs at 60 fps on Medium on integrated graphics,
  and you can compare it side by side with the 2D view.
- 🎮 **Checkpoint:** react to the look (palette, water, trees, fog) before everything else is
  drawn in it.

## Phase B — The core game (local / hotseat)

### M5 · Units and movement ✅
- Unit content plus engine support: movement costs, pathfinding (fewest turns, then most moves
  left), ZOC, stacking, embarking, multi-turn orders, vision with line of sight, fog memory, and
  the scout/warrior/settler basics.
- Client: the game screen (a local game against placeholder rivals who just end their turns),
  selection, path preview with turn markers, the unit panel, Next Action / End Turn, and the
  dark fog of war in both the 3D and 2D views.

### M6 · Settlements ✅
- Founding, towns vs cities (towns sell production for gold, upgrade for gold), workable tiles,
  border growth from culture, citizens with auto-assign, focus and locked tiles, growth that
  develops tiles (8 improvements), starvation, happiness with moods, the settlement limit, the
  production queue with overflow, buying, tile purchases, and the first buildings.
- The 10 roster civs with city names and colors; placeholder AI seats found and build.
- Client: settlements, borders and improvements in 3D and 2D, the settlement screen with yield
  and happiness breakdowns, growth choices on the map, production and buying, the empire bar.
- Moved later: **town specializations** and **specialists** (M8, with districts),
  **celebrations** (M7, with policies), **clear land** (M8).

### M7 · Progress trees and government ✅
- Tech and civics trees (Ancient → Medieval: 24 techs, 19 civics) with boosts and path queueing,
  7 governments, 22 policy cards, celebrations, unit upkeep, the settlement limit growing with
  civics, eras, and 8 new units and 5 buildings unlocked along the way.
- The effects system now reaches settlements and the whole empire (11 effect types, 18
  conditions); governments, policies, celebrations, techs and civics are effect sources.
- Client: the tech and civics trees (boost progress, unlocks, path numbers), the government
  screen (adopt, slot cards, cost preview), progress chips, and Next Action prompts for research,
  civics and policies.

### M8 · Improvements, districts, wonders ✅
- Improvements and their adjacency, the clear-land project, district placement with adjacency
  previews, the district limit, buildings in districts, and the first wonders.
- Built: 10 districts with adjacency and cost growth, specialists, 11 district buildings
  (4 new: Amphitheater, Workshop, Arena, Barracks), 9 wonders with a world-wide race, 3 tile
  projects, farm adjacency, tech-gated improvements, and the 6 town specializations with food
  and production sending.
- Client: the placement mode (valid tiles highlighted with their yields, plus a best-first list),
  district and wonder models in 3D and glyphs in 2D, planned districts marked on the map, the
  district limit, specialists, the specialization picker for towns, and wonder notices.

### M9 · Combat and conflict ✅
- The combat formula (lookup tables), modifiers, ranged attacks, city HP, walls, city strikes,
  capture/puppet/raze/liberate, promotions, healing, commanders (pack/unpack, radius), war
  support, and hostile camps (classic barbarians).
- Combat preview UI.
- Part 1 built: the formula and modifiers, melee and ranged attacks, capturing civilians,
  settlement health, walls and strikes, capture with keep/raze/liberate, capital moves and
  elimination (last one standing wins), healing, war and peace; the placeholder AI fights back
  and makes peace. Client: red attack tiles with expected damage, the combat preview (every
  modifier, damage ranges, verdict), the declare-war prompt, a panel per rival (war, peace),
  the capture dialog, health bars on units and banners, floating damage, lunges and shots.
- Part 2 built: promotions (32, by class), war support with war weariness, and hostile camps
  with raiders; the placeholder AI fights raiders and takes promotions. Client: the promotion
  picker, a star on units with a promotion ready, camps in 3D and 2D, war support in the rival
  panel, a camps toggle in the new-game dialog.
- Moved later: **commanders** (pack/unpack, command radius), after the M10 checkpoint, so how
  armies move can be shaped by playing (built in V1 part 4). Puppets wait for loyalty.

### M10 · Hotseat alpha 🎮 ✅
- 2–8 player hotseat, a turn summary, domination and score victories, and save/load.
- Built: the new-game dialog (players, AI rivals, turn limit, camps, domination), the pass
  screen, per-player turn summaries, score, the three victories with an end screen, saves in
  the browser with an autosave each turn, and save files. Next comes the 🎮 checkpoint: play.
- **Done when:** you and a friend can play a full Ancient → Medieval hotseat game on one machine.
- 🎮 **Big checkpoint: play 2–3 games.** Expect balance and UX notes. These decide the order of
  everything after this point.

## Phase C — Single player and online with friends

### M11 · AI v1 (moved earlier, because single player needs it) ✅
- Utility AI for expansion, building, research, and basic war and defense, using leader
  personalities and agendas. Uses the same redacted view as a human player. Runs in a Web Worker.
- **Single Player** mode on the main menu.
- **Done when:** an AI finishes full games without crashing in CI simulations, and beats an "AFK"
  player. (It doesn't need to beat you yet.)
- Built: `packages/engine/src/ai/` (settling with escorts, city builds, research and civics,
  governments and cards, town upgrades and specializations, buying, armies that guard, gather,
  besiege and clear camps, scouting, war and peace), the 10 leaders with personalities, army
  strength in the rival panel, and `pnpm cx simulate`. Tests: a 4-AI game for 80 turns
  (expansion, research, determinism) and an AI conquering an AFK player. Agendas only show in
  the rival panel until diplomacy (M15); the Web Worker and the main-menu Single Player button
  come with the polish part of the V1 build (single player already works from New game).
- 🎮 **Checkpoint:** play single player games against the AI.

### M12 · Accounts and lobby (Supabase)
- Supabase project setup (free tier), SQL migrations, row-level security policies, and the
  keep-alive scheduled job.
- In-game sign up / log in with username + password, remembered login, profiles.
- Host Multiplayer / Join with Code, lobby seats (human, AI, closed), leader picks, presets,
  ready check.

### M13 · Online play
- The host runs the engine in a Web Worker. The transport interface, with Supabase Realtime as the
  first implementation. Per-player redaction, simultaneous turns with End Turn / un-end,
  the Dynamic turns option, turn timers and time banks, disconnect grace and AI takeover,
  cloud saves each turn, resume, and host handoff.
- Chat, pings, the Discord webhook (via edge function), and browser notifications.
- **Done when:** a test proves no hidden information reaches a client, and a 4-player online game
  survives a host refresh and dropped connections.
- 🎮 **Checkpoint:** first online game between you two, then a 4–8 player game with more friends.

### M14 · Deploy
- Client on Cloudflare Pages (free), auto-deploys from `main`. Desktop builds come later (M27).
- **Done when:** your friends can open a link, make an account, and join your game by code.

## Phase D — Depth (modules)

The order inside this phase can change based on playtest feedback.

| Milestone | Contents |
|---|---|
| M15 · Diplomacy & deals | States, friendship, alliances, influence, endeavors and sanctions, enforced deals, promises, reputation, deal inbox (first part built in the V1 build: see 04, "Built so far") |
| M16 · Trade routes | Traders, routes, auto-roads, plunder (built in the V1 build except plunder) |
| M17 · Great people | Points race, named individuals, patronage, great works |
| M18 · Religion | Pantheons, founding, beliefs, pressure, missionaries/apostles, religious victory |
| M19 · Independent powers | Camps with dispositions, befriending, city-states, envoys, suzerains, quests, levies |
| M20 · Eras, golden ages, governors | Historic moments, legacy goals, ages, dedications, governor trees |
| M21a · Map breadth | 12+ map types (small continents, island plates, inland sea, lakes, highlands, seven seas, Terra old/new world, shuffle, duel arena, Earth with true starts...), world settings (world age, temperature, rainfall, sea level), natural wonders |
| M21b · Lenses and filters | Every lens in [06-ui-ux.md](06-ui-ux.md), map pins with notes, planning ghosts for districts and wonders |
| M21c · Espionage, world congress, loyalty | Spies and missions, congress votes and diplomatic victory, loyalty pressure and city flipping |
| M21d · Climate, disasters, corporations, Ages mode, crises | All as setup toggles |
| M21e · Graphs and statistics | The full graphs screen from doc 06 |
| M21 · Full trees & late game | Renaissance → Information eras, air units, nukes (toggleable), ideologies, science victory, tourism & culture victory |

🎮 Playtest after every 1–2 milestones.

## Phase E — Smarter AI

### M22 · AI v2
- AI diplomacy (deals, alliances, agendas, influence), better war planning (commanders, staging,
  siege), religion and independent-power play. Difficulty levels with openly declared bonuses.

### M23 · AI v3
- Long-term strategy per victory type, and AI tuned by large AI-vs-AI simulation runs.

## Phase F — Modding and content

### M24 · Content pipeline ("just ask Claude")
- Repo skills in `.claude/skills/` with step-by-step checklists for adding a leader, civ, unit,
  building, wonder, great person, map type, lens and game option, so any session adds content the
  same careful way.
- A **kit test harness**: every leader and civ ability is exercised by an automated test in a
  scripted game, so "it works properly" is checked, not hoped.
- An art-prompt style guide for portraits and icons, so supplied art matches.
- (Replaces the in-game mod manager and civ creator. Mod folders still load, without UI.)

### M25 · Leaders 11–30
- Full kits for the second and third waves of the roster, each with tests.

### M26 · Base content
- Leaders 1–10 are built along the way (needed for testing from M6 on). This milestone fills out
  the full unit roster, all buildings and districts, 40+ wonders, and anyone added from the queue.
  Balanced with simulation reports.
- 🎮 **Checkpoint:** add your friends as great people and custom leaders, and play an all-custom game.

## Phase G — Polish and v1.0

### M27 · Desktop apps
- Tauri builds for Windows, macOS and Linux (offline single player and hotseat, multiplayer
  hosting from the desktop app), with auto-updates via GitHub Releases.

### M28 · Art and audio pass
- Finish the look from doc 10: civ architecture sets, unit models, wonder hero models, portraits,
  the painted icon set, effects, music and SFX.

### M29 · UX polish and replays
- Replays with timeline, stats graphs, hall of fame, Civilopedia, accessibility options, and a
  tutorial or first-game hints.

### 🏁 v1.0
- Everything in [00-vision.md](00-vision.md#what-finished-v10-means).

## After v1.0 (backlog)

Mirrored maps, scripted mods, 12-player support, WebRTC transport (if message limits are
ever hit), a dedicated host for always-on async games, a mobile-first UI, map editor,
scenarios (preset maps + rules + victory), and alternative 3D renderer experiments.

## Rough effort

These are honest estimates, and they assume one focused Claude Code session completes roughly
one well-scoped chunk:

| Phase | Sessions (rough) |
|---|---|
| A · Foundations | 6–10 |
| B · Core game → hotseat alpha | 15–25 |
| C · Single player + online | 12–20 |
| D · Depth modules | 25–40 |
| E · Smarter AI | 8–15 |
| F · Modding & content | 10–20 |
| G · Polish & v1.0 | 10–20 |

The biggest unknowns are AI quality and how much balancing feedback the playtests produce.
