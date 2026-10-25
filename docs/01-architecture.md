# 01 — Technical architecture

## Summary

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) everywhere | One language for engine, client, host and tools. Types catch rule bugs early. |
| Repo | **pnpm monorepo** | Engine, content, client and host code live side by side and share types. |
| Game engine | Pure TS library, no I/O | Can be tested, replayed, and run in a browser tab, a Web Worker, or Node. |
| Map rendering | **Three.js** (WebGL2) for the painterly 3D world; **PixiJS v8** for the 2D strategic view | Stylized 3D per [10-art-direction.md](10-art-direction.md), kept light with instancing and quality presets. The 2D view is fast, clear, and a fallback for weak devices. |
| UI (menus, panels) | **React** + CSS | Civ is mostly panels and tooltips. React is the best-supported way to build lots of UI. |
| Accounts & database | **Supabase** (free tier): Auth + Postgres | Players make their own login. It stores profiles, games, join codes, saves and chat. |
| Live connection | **Supabase Realtime** at first, **WebRTC** later | Relays actions between players. WebRTC (peer-to-peer) removes the message limits when needed. |
| Game authority | **The host's game client** (in a Web Worker) | No paid server needed. Someone who makes a game "hosts" it, the same way Civ multiplayer works. |
| Client hosting | **Cloudflare Pages** or GitHub Pages (free) | A static site. Auto-deploys from `main`. |
| Desktop | **Tauri 2** | Wraps the web client into a native app (~10 MB) without a rewrite. Distributed via GitHub Releases. |
| Tests | Vitest (engine), Playwright (client) | Fast unit tests, plus real-browser checks. |

**Cost target: $0/month.** Every piece above has a free tier that a friend group stays well within.
If the group ever outgrows it, the same host code can run as a $5/month dedicated server
with no rewrite (see "Upgrade path").

### Why not Godot / Unity?

They would give prettier graphics sooner. But Claude Code can't easily run and verify them in a
cloud session, so every change would turn into a manual "build it, try it, report back" round trip.
Most of the work in a Civ-like game is rules and UI, and web tech handles both very well. Because
the engine is kept separate from rendering, a future 3D client could reuse it unchanged.

## Repository layout

```
/
├── docs/                    design docs (this folder)
├── packages/
│   ├── engine/              rules: state, actions, turn processing, combat, map gen, AI
│   ├── content/             base game data (JSON) + schemas (Zod) + loader/validator
│   ├── protocol/            message types shared by client, host and transport
│   ├── host/                authoritative game host: runs the engine, redacts views, saves
│   ├── client/              React + PixiJS web app
│   └── backend/             Supabase SQL migrations, row-level security policies, edge functions (if any)
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

- **`state`** is plain serializable data (JSON): map, players, settlements, units, and the RNG
  state. There are no classes holding hidden data.
- **`action`** is something a player asks to do: `MoveUnit`, `FoundSettlement`, `SetProduction`,
  `Attack`, `ProposeDeal`, `EndTurn`, and so on.
- **`ctx`** holds the compiled content for this game (the base data plus enabled mods) and the
  enabled rule modules.
- **`events`** describe what happened ("unit moved along path", "combat: 34 dmg dealt, 12 taken",
  "city grew to 5"). The client uses them for animations and notifications, and the host saves
  them for replays.
- **Validation is part of the engine.** `validateAction(state, action, ctx)` returns either OK or a
  reason, such as "not enough movement" or "tile occupied". The host always validates. The client
  validates too, so the UI can grey out buttons.

### Determinism rules (non-negotiable)

Replays, bug reproduction, host handoff and AI simulation all rely on these.

1. **Seeded RNG.** All randomness comes from a PRNG whose state is stored in the game state.
   Engine code never calls `Math.random()`.
2. **No floating-point surprises.** Combat and yields use integer or fixed-point math.
   Curves like Civ's exponential damage use precomputed lookup tables, because `Math.exp` is not
   guaranteed to give identical results across JS engines.
3. **Stable iteration order.** Players, settlements and units are processed in a defined order
   (by ID), never by object-key order.
4. **No clock or time dependence** inside the engine. Turn timers belong to the host.
5. **Golden tests.** CI replays recorded games and checks that the final state hash matches.

### Modules (feature toggles at the rules level)

Each big system (religion, great people, independent powers, espionage, loyalty...) is an engine
**module**. A module can:
- register actions, per-turn processing steps, state slices and UI panels,
- declare which content types it needs (beliefs, great people, and so on),
- be turned on or off per game in the lobby.

This keeps the core small, lets us ship systems one at a time, and gives players a menu of
"how complex do we want tonight's game to be".

## Game modes and who runs the game

| Mode | Where the engine runs | Needs internet? | Needs an account? |
|---|---|---|---|
| **Single player** (vs AI) | Your browser (a Web Worker) | No | No (optional, for cloud saves) |
| **Hotseat** | Your browser | No | No |
| **Multiplayer** | The **host's** browser or desktop app. Other players connect by **join code** | Yes | Yes |

All three use the same **host** package. Single player is just a game where the host has one
human and several AI seats, all on your machine.

### Multiplayer data flow

```
            ┌──────────────── Supabase ───────────────┐
            │ Auth · Postgres (games, saves, chat)    │
            │ Realtime channels (one private channel  │
            │ per player per game)                    │
            └──────▲───────────────────────▲──────────┘
                   │ actions / views       │ snapshot each turn
   Player client ──┘                       └── Host client (engine in a Web Worker)
```

1. The host creates a game and gets a **join code** (e.g., `MAX-7Q2K`), which is stored in Postgres.
2. Friends log in, enter the code, and claim a seat. Row-level security lets only seated players
   read the game's metadata and their *own* private channel.
3. During play, each client sends **actions** to the host. The host validates and applies them with
   the engine, then sends **each player only their own redacted view and events** (fog of war is
   enforced by what the host sends).
4. At the end of every turn, the host saves a **snapshot + action log** to Postgres. This gives
   resume, replays and crash recovery. The game's **compiled content** (base + mods, about
   100–300 KB compressed) is stored once per game too, since every game is locked to the content
   it started with (the engine refuses to apply actions under different content). Base-game
   updates and mod updates never break a game in progress.
5. **Host handoff:** if the host leaves, the game pauses. The host can resume it later, or hand
   hosting to another seated player, who loads the latest snapshot. This works because the engine
   is deterministic.

### Trade-offs of a player-hosted game (honest)

- **The game runs while the host is online.** That fits simultaneous-turn sessions, which are live
  anyway. Each player's state is saved every turn, so nothing is lost.
- **A technically skilled host could peek through fog** by inspecting their own browser's memory.
  The host's own UI only ever shows their redacted view, so an honest host sees nothing extra.
  Between friends, this is the right trade for $0/month. The upgrade path below removes it.
- **Message budget:** Supabase's free tier allows about 2 million Realtime messages per month.
  The host sends events only to players who can see them, and batches updates (about 10 per
  second at most). Estimates: a 2-player game is about 30k messages and a full 8-player game is
  200–400k. If usage gets close to the limit, switch the transport to **WebRTC** (direct
  peer-to-peer, using Supabase only to connect players, with no message limits). The transport is
  behind an interface from day one, so this is a swap and not a rewrite.

### Upgrade path (only if ever needed)

The `host` package has no browser-only dependencies, so it can also run as a Node process
(**dedicated host**) on a $5/month server. That gives always-on async games, host-proof fog, and
no message limits. Nothing else changes.

## Accounts

- **Username + password**, created in-game. Login is remembered (Supabase keeps a refresh token
  in the browser or desktop app), so players only log in once per device.
- Supabase Auth needs an email address internally. If a player doesn't give one, the game uses a
  private placeholder address (`<username>@players.civiusmaximus.invalid`) with email
  confirmation turned off. Players who add a real email get password reset.
- Profile: display name, avatar, favorite leaders, stats (games played and won).
- **Single player and hotseat need no account.**

## Supabase free tier: limits to keep in mind

These are the commonly cited free-tier limits (verify on the pricing page when setting up):
500 MB database, 50,000 monthly active users, 200 concurrent Realtime connections, about 2M
Realtime messages per month, 5 GB egress, and 2 active projects.

- **Inactive projects pause after 7 days.** A free GitHub Actions scheduled job will query the
  database every few days so the project never pauses between game nights.
- **Database size:** snapshots are compressed (target < 300 KB each, gzip). We keep the last 5
  snapshots plus the full action log per game. Replays rebuild from the action log, so old
  snapshots aren't needed. Finished games can be exported to a file and pruned.

## Client

- **PixiJS map layer:** terrain, features, rivers, borders, units, fog, yield icons, lenses, and
  path previews. A horizontally wrapping camera, smooth zoom and pan, and culling so large maps
  stay fast.
- **React UI layer:** top bar, unit panel, settlement screen, tech and civics trees, diplomacy,
  reports, and tooltips (including the "why is this +3?" breakdowns).
- **Local engine copy** for previews (path costs, combat predictions, yield changes). The host's
  word is final.

## AI

- Runs in the engine package, so it can play in single player, hotseat, multiplayer (on the host)
  and in CI simulations.
- **Utility-based:** it scores candidate actions using weights from each leader's personality file
  (`aggression`, `expansion`, `science`...), so modded leaders can have modded personalities.
- It gets **the same redacted view** a human player would (no cheating), apart from optional
  difficulty bonuses that are declared openly in the lobby.
- Runs in its own Web Worker, so AI thinking never freezes the UI. **Built (V1 part 10):**
  End Turn (when it ends the round) and the AI seats' turns run in a background worker
  (`client/src/game/ai.worker.ts`, using `runTurn` from the host); the page shows "Rivals are
  moving…" and holds actions until it's back. Same engine, same result as on the page, which
  it falls back to if workers aren't available.
- It keeps **no memory between turns**: every turn is planned from the state, so saves, replays
  and host handoff need nothing extra, and the same state always gets the same moves.
- What it can know: tiles it sees now, tiles it has explored, settlements on explored tiles, and
  every player's **army strength** (public, like a score screen; the rival panel shows it).
- Code: `packages/engine/src/ai/` (`playAiTurn`). Try it with `pnpm cx simulate`.

## Testing strategy

| Test | Covers | When |
|---|---|---|
| Engine unit tests | Every rule (movement costs, combat math, growth, adjacency...) | Every commit (fast) |
| Content validation | Every JSON file against the schemas, references resolve, no duplicate IDs | Every commit (fast) |
| Golden replays | Determinism: replay recorded games and compare state hashes | Every commit (fast) |
| Redaction tests | No hidden information ever appears in a player's view or events | Every commit (fast) |
| AI-vs-AI simulations | No crashes over 300+ turns. Balance stats (win rate per civ, era timing) | On demand / nightly |
| Host + transport integration | Lobby → join code → actions → views, with an in-memory transport | Every PR |
| Playwright | Key UI flows: create game, found settlement, move, attack, end turn | Every PR |

## Security

- Supabase row-level security on every table: you can only read games you're seated in, only your
  own private channel, and only your own profile's private fields.
- Mods are data only in v1 (no executable code), so loading a friend's mod is safe (D10).
- Every action is validated by the engine on the host. Clients are never trusted.

## Performance targets

- A Standard map (84×54 tiles, 8 players) renders at 60 fps while panning on a mid-range laptop.
- End-of-turn processing takes under 300 ms for human-only games. AI turns take under 3 s per AI
  in the late game.
- A compressed snapshot is under 300 KB.
