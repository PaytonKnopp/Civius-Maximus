# 07 — Roadmap

Every milestone ends with a pull request containing tests, plus a short note covering what's new,
how to try it, and any new decisions for you. **🎮 marks a playtest checkpoint.** At those points,
playing decides what changes next.

The order follows one rule: **build foundations that are painful to change later first**
(determinism, N-player support, the content format, server authority, redaction), then add
features on top.

## Phase A — Foundations (no playable game yet, by design)

### M0 · Project skeleton
- pnpm monorepo, strict TypeScript, ESLint/Prettier, Vitest, GitHub Actions CI.
- `CLAUDE.md` with the working agreement for future sessions (fast checks, what CI runs).
- **Done when:** `pnpm lint && pnpm test` pass in CI on an empty engine, client and server.

### M1 · Content format and effects core
- Zod schemas for the core content types, the loader (base + mods, load order, patches), and the
  validator CLI.
- Effects/conditions evaluator, with tests. Yield breakdowns ("why?") are built from day one.
- Initial `content/base` covering terrain, features, resources and rules constants.
- **Done when:** `pnpm cx validate` passes on base content, and a test mod with a patch and a
  broken reference produces the expected friendly errors.

### M2 · Engine core: state, actions, determinism
- Game state model for N players (no 2-player assumptions anywhere), the seeded RNG, the action
  pipeline (validate → apply → events), turn processing order, and state hashing.
- Golden-replay test harness.
- **Done when:** a scripted 8-player game of no-op turns replays to an identical hash, and the
  engine has no `Math.random()` or floating-point math in the rules (enforced by a lint rule).

### M3 · World generation
- Hex math (axial coordinates, wrapping, distance, rings, line of sight), plus map scripts:
  Continents, Pangaea, Archipelago and Fractal.
- Climate, rivers on edges, features, resources, start positions with civ bias, and
  balanced/mirrored modes.
- **Done when:** 1,000 seeded maps per script generate with valid starts (minimum yields, no
  overlapping starts, every start reachable) in under 1 s each.

### M4 · Map renderer (first visible thing)
- PixiJS map: terrain, features, rivers, resources, a wrapping camera, zoom and pan, culling,
  fog states, and a debug "god view".
- Placeholder art (shapes and colors), with an asset pipeline ready for real art.
- **Done when:** a Standard map renders at 60 fps while panning, and you can open a URL and fly
  around generated worlds.
- 🎮 **Checkpoint:** look at the maps. Do they feel like good Civ maps? Tune the generator.

## Phase B — The core game (local / hotseat)

### M5 · Units and movement
- Unit content plus engine support: movement costs, A* pathfinding, ZOC, stacking, embarking,
  multi-turn orders, vision, fog memory, and the scout/warrior/settler/builder basics.
- Client: selection, path preview with turn markers, and the unit panel.

### M6 · Cities
- Founding, workable tiles, border growth, citizens and auto-assign, growth, housing, amenities,
  production queue, overflow, buying, and tile purchases.
- City screen UI with yield breakdowns.

### M7 · Progress trees and government
- Tech and civics trees (Ancient → Medieval at first), boosts, governments, policy cards, gold
  economy, and upkeep.
- Tech/civics tree UI and the government screen.

### M8 · Builders, improvements, districts, wonders
- Builder charges, improvements with adjacency, chopping, district placement with adjacency
  previews, the district limit, buildings in districts, and the first wonders.

### M9 · Combat and conflict
- The combat formula (lookup tables), modifiers, ranged attacks, city HP, walls, city strikes,
  capture/raze/liberate, promotions, healing, war weariness, and barbarians.
- Combat preview UI.

### M10 · Hotseat alpha 🎮
- 2–8 player hotseat, a turn summary, domination and score victories, and save/load.
- **Done when:** you and a friend can play a full Ancient → Medieval hotseat game on one machine.
- 🎮 **Big checkpoint: play 2–3 games.** Expect balance and UX notes. These decide the order of
  everything after this point.

## Phase C — Online with friends

### M11 · Server and online play
- Accounts (D5), lobby, invite links, seats, presets, the authoritative game host, per-player
  redaction, persistence (snapshots + action log), reconnection, and multi-device support.
- **Done when:** a test proves no hidden information reaches a client, and a 4-player online game
  survives server restarts and dropped connections.

### M12 · Turn modes, timers and notifications
- Sequential, simultaneous and dynamic turns; timers and time banks; timeout options
  (auto end turn or skip; AI takeover arrives with M21); vacation mode; Discord webhooks, email and push; chat; pings.
- 🎮 **Checkpoint:** first online game between you two, then a 3–4 player game with more friends.

### M13 · Deploy
- Hosted server plus hosted client, automatic deploys from `main`, backups of the game database.
- **Done when:** your friends can join from a link with nothing to install.

## Phase D — Depth (modules)

The order inside this phase can change based on playtest feedback.

| Milestone | Contents |
|---|---|
| M14 · Diplomacy & deals | States, friendship, alliances, enforced deals, promises, grievances, deal inbox |
| M15 · Trade routes | Traders, routes, auto-roads, plunder |
| M16 · Great people | Points race, named individuals, patronage, great works |
| M17 · Religion | Pantheons, founding, beliefs, pressure, missionaries/apostles, religious victory |
| M18 · City-states | Types, envoys, suzerains, quests, levies |
| M19 · Eras & golden ages, governors | Historic moments, ages, dedications, governor trees |
| M20 · Full trees & late game | Renaissance → Information eras, air units, nukes (toggleable), science victory, tourism & culture victory |

🎮 Playtest after every 1–2 milestones.

## Phase E — AI

### M21 · AI v1
- Utility AI for expansion, building, research, basic war and defense, using leader
  personalities and agendas. Uses the same redacted view as a human player.
- Fills empty seats and takes over absent players.
- **Done when:** an AI can finish a full game without crashing in a CI simulation, and beats an
  "AFK" player. (It doesn't need to beat you yet.)

### M22 · AI v2
- AI diplomacy (deals, alliances, agendas), better war planning (staging, siege), and religion and
  city-state play. Difficulty levels with openly declared bonuses.

## Phase F — Modding and content

### M23 · Modding v1
- Mod manager UI, server mod library and upload, conflict display, auto-download on join,
  a modding guide, and JSON Schema for editor autocompletion.

### M24 · Civ creator
- The form-based editor for civs, leaders, uniques, great people and governors, with a
  plain-English effect preview.

### M25 · Base content
- About 12 base civs with leaders, uniques and agendas, a full unit roster, all buildings and
  districts, and 30+ wonders. Balanced with simulation reports.
- 🎮 **Checkpoint:** each friend makes their own civ. Play an all-custom-civs game.

## Phase G — Polish and v1.0

### M26 · Desktop apps
- Tauri builds for Windows, macOS and Linux, with offline hotseat support and auto-updates.

### M27 · Art and audio pass
- The chosen art style (D11), unit and district sprites, leader portraits, animations, music and SFX.

### M28 · UX polish and replays
- Replays with timeline, stats graphs, hall of fame, Civilopedia, accessibility options, and a
  tutorial or first-game hints.

### 🏁 v1.0
- Everything in [00-vision.md](00-vision.md#what-finished-v10-means).

## After v1.0 (backlog)

Loyalty, espionage, world congress and diplomatic victory, climate and disasters, corporations,
barbarian clans, scripted mods, 12-player support, a mobile-first UI, map editor,
scenarios (preset maps + rules + victory), and alternative 3D renderer experiments.

## Rough effort

These are honest estimates, and they assume one focused Claude Code session completes roughly
one well-scoped chunk:

| Phase | Sessions (rough) |
|---|---|
| A · Foundations | 6–10 |
| B · Core game → hotseat alpha | 15–25 |
| C · Online | 8–12 |
| D · Depth modules | 25–40 |
| E · AI | 10–20 |
| F · Modding & content | 10–20 |
| G · Polish & v1.0 | 10–20 |

The biggest unknowns are AI quality and how much balancing feedback the playtests produce.
