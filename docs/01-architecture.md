# 01 — Technical architecture

## Summary

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) everywhere | One language for engine, client, server and tools. Types catch rule bugs early. |
| Repo | **pnpm monorepo** | Engine, content, client and server live side by side and share types. |
| Game engine | Pure TS library, no I/O | Can be tested, replayed and run on the server, in the client or in a worker. |
| Map rendering | **PixiJS v8** (WebGL) | Fast 2D rendering of thousands of hex tiles, sprites, fog and overlays. |
| UI (menus, panels) | **React** + CSS | Civ is mostly panels and tooltips. React is the best-supported way to build lots of UI. |
| Server | **Node.js** + Fastify + WebSockets | Runs the same engine code. Simple to host. |
| Storage | **SQLite** (via Drizzle ORM), Postgres-compatible | A single small file is enough for a friends' server. Can be upgraded later. |
| Desktop | **Tauri 2** | Wraps the web client into a native app (~10 MB) without a rewrite. |
| Tests | Vitest (engine, server), Playwright (client) | Fast unit tests, plus real-browser checks. |
| Hosting | Static client on Cloudflare Pages. Server on Fly.io / Railway / a home PC | About $0–5 per month for a friend group. |

### Why not Godot / Unity?

They would give prettier graphics sooner. But Claude Code can't easily run and verify them in a
cloud session, so every change would turn into a manual "build it, try it, report back" round trip.
Most of the work in a Civ-like game is rules and UI, and web tech handles both very well. Because
the engine is kept separate from rendering, a future 3D client could reuse the engine and the
server unchanged.

## Repository layout

```
/
├── docs/                    design docs (this folder)
├── packages/
│   ├── engine/              rules: state, actions, turn processing, combat, map gen, AI
│   ├── content/             base game data (JSON) + schemas (Zod) + loader/validator
│   ├── protocol/            message types shared by client and server
│   ├── client/              React + PixiJS web app
│   └── server/              lobby, accounts, game hosting, notifications, persistence
├── mods/                    local mods for development (one folder per mod)
├── apps/
│   └── desktop/             Tauri wrapper around packages/client
└── tools/                   CLI: validate-mods, simulate (AI-vs-AI), replay, balance reports
```

## The engine: a deterministic state machine

```
applyAction(state, action, ctx) -> { state', events[] }
endTurn(state, ctx)             -> { state', events[] }
```

- **`state`** is plain serializable data (JSON): map, players, cities, units, and the RNG
  state. There are no classes holding hidden data.
- **`action`** is something a player asks to do: `MoveUnit`, `FoundCity`, `SetProduction`,
  `Attack`, `ProposeDeal`, `EndTurn`, and so on.
- **`ctx`** holds the compiled content for this game (the base data plus enabled mods) and the
  enabled rule modules.
- **`events`** describe what happened ("unit moved along path", "combat: 34 dmg dealt, 12 taken",
  "city grew to 5"). The client uses them for animations and notifications. The server uses them
  for alerts and replays.
- **Validation is part of the engine.** `validateAction(state, action, ctx)` returns either OK or a
  reason, such as "not enough movement" or "tile occupied". The server always validates. The
  client validates too, so the UI can grey out buttons.

### Determinism rules (non-negotiable)

Replays, bug reproduction, hotseat/online parity and AI simulation all rely on these.

1. **Seeded RNG.** All randomness comes from a PRNG (sfc32/xoshiro128\*\*) whose state is
   stored in the game state. Engine code never calls `Math.random()`.
2. **No floating-point surprises.** Combat and yields use integer or fixed-point math.
   Curves like Civ's exponential damage use precomputed lookup tables, because `Math.exp`
   is not guaranteed to give identical results across JS engines.
3. **Stable iteration order.** Players, cities and units are processed in a defined order
   (by ID), never by object-key order.
4. **No clock or time dependence** inside the engine. Turn timers are a server concern.
5. **Golden tests.** CI replays recorded games and checks that the final state hash matches.

### Modules (feature toggles at the rules level)

Each big system (religion, great people, city-states, espionage, loyalty...) is an engine
**module**. A module can:
- register actions, per-turn processing steps, state slices and UI panels,
- declare which content types it needs (beliefs, great people, and so on),
- be turned on or off per game in the lobby.

This keeps the core small, lets us ship systems one at a time, and gives players a menu of
"how complex do we want tonight's game to be".

## Server: authoritative and redacting

```
client ──(action)──▶ server: validate → apply → persist → per-player views ──▶ all clients
```

- The server owns the game state. Clients send **actions** and receive **events** plus their own
  **redacted view**.
- **Redaction (fog of war):** each client only receives tiles, units and cities that its player can
  currently see (or has seen and remembers). This is the only real defense against peeking.
  Without it, anyone could open dev tools and see the whole map.
- **Persistence:** each game stores (a) a snapshot every turn and (b) an append-only action log.
  From these we get save/resume, replays, "rewind to turn N" (with host approval), and
  reproducible bug reports.
- **Content locking:** when a game is created, the exact base content version and mod list
  (with content hashes) are stored with it. A game started with "Bob's Pirates v1" keeps
  using v1 even if Bob updates the mod later.
- **Mod distribution:** the server sends the compiled content for the game to every client.
  Nobody has to install mods by hand to join a game.

## Client

- **PixiJS map layer:** terrain, features, rivers, borders, units, fog, yield icons, lenses, and
  path previews. A horizontally wrapping camera, smooth zoom and pan, and culling so large maps
  stay fast.
- **React UI layer:** top bar, unit panel, city screen, tech and civics trees, diplomacy, reports,
  and tooltips (including the "why is this +3?" breakdowns).
- **State on the client:** the redacted view plus a local copy of the engine for previews (path
  costs, combat predictions, yield changes when you swap a tile). The server's word is final.
- **Offline and hotseat:** the client can run the engine locally with no server at all, using the
  same code paths. A local game is just a game whose "server" lives in the same browser tab.

## AI

- Runs in the engine package, so it can play in hotseat, on the server and in CI simulations.
- **Utility-based:** it scores candidate actions using weights from a personality file per leader
  (`aggression`, `expansion`, `science`...), so modded leaders can have modded personalities.
- It gets **the same redacted view** a human player would (no cheating), apart from optional
  difficulty bonuses that are declared openly in the lobby.
- Runs in a worker thread on the server, so a thinking AI never blocks other games.

## Testing strategy

| Test | Covers | When |
|---|---|---|
| Engine unit tests | Every rule (movement costs, combat math, growth, adjacency...) | Every commit (fast) |
| Content validation | Every JSON file against the schemas, references resolve, no duplicate IDs | Every commit (fast) |
| Golden replays | Determinism: replay recorded games and compare state hashes | Every commit (fast) |
| AI-vs-AI simulations | No crashes over 300+ turns. Balance stats (win rate per civ, era timing) | CI nightly / on demand |
| Server integration | Lobby → game → actions → redaction (no leaked hidden info) | Every PR |
| Playwright | Key UI flows: create game, found city, move, attack, end turn | Every PR |

## Security and accounts

- See [DECISIONS.md](DECISIONS.md) D5 for login options. The default is **invite links + Discord
  login**.
- Mods are data only in v1 (no executable code), so loading a friend's mod is safe. Scripted mods
  are a possible later feature, and they would run in a sandbox (D10).
- Rate limiting and input validation on all server endpoints. Every action is validated by the
  engine anyway.

## Performance targets

- A Standard map (84×54 tiles, 8 players) renders at 60 fps while panning on a mid-range laptop.
- End-of-turn processing takes under 300 ms for human-only games. AI turns take under 3 s per AI
  in the late game.
- A save snapshot is under 2 MB compressed.
