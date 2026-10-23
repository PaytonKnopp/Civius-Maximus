# 02 — Multiplayer and social

The most important doc for pillar #1 ("Friends first").

## Game lifecycle

```
Create game → Lobby (settings, seats, civs, mods) → Start → Turns ... → Victory → Replay / stats
```

### Creating a game (host)

The host picks these settings. All of them are saved as a **preset** so "our usual Friday game" is
one click.

| Setting | Options |
|---|---|
| Map type | Continents, Pangaea, Archipelago, Fractal, Inland Sea, Islands, Balanced Duel, plus mod map scripts |
| Map size | Duel, Tiny, Small, Standard, Large, Huge (see [03-core-mechanics.md](03-core-mechanics.md)) |
| Fairness | Normal / Balanced starts / Mirrored map (every player gets an identical start region) |
| Game speed | Online (fast), Quick, Standard, Epic. This scales all costs. |
| Start era | Ancient (default), Classical, Medieval... |
| Turn mode | Sequential / Simultaneous / **Dynamic** (see below) |
| Turn timer | None / Fixed per turn / Chess-clock time bank / Async (e.g., 24 h per turn) |
| Victories | Toggle each type, plus turn limit and score victory |
| Rule modules | Toggle religion, city-states, great people, espionage, loyalty... |
| Mods | Choose from the server's mod library. Load order is shown. |
| AI | Number of AI seats, difficulty, and "AI takes over absent players" (on/off) |
| Teams | Free-for-all, or assign teams (shared vision, shared victory) |
| House rules | Free-form text shown to everyone, plus modded rule constants (e.g., "no war before turn 50" can be *enforced*) |

### Lobby

- **Invite link** (`/join/ABCD-1234`). Friends click it, log in, and claim a seat.
- **Seats:** human (open/claimed), AI (with difficulty), or closed.
- **Civ selection:** pick a civ and leader, or random. The host can allow or forbid duplicates. An
  optional **draft mode** lets each player ban one civ, then pick in snake order (fun for
  competitive groups).
- **Ready check:** the host clicks start once everyone is ready.
- **Mod preview:** everyone can browse the active mods' civs and rules before the game starts.

## Turn modes

| Mode | How it works | Best for |
|---|---|---|
| **Sequential** | Players act one at a time, in order | 2 players, or async games over days |
| **Simultaneous** | Everyone acts at once. The turn ends when all have clicked "End Turn" (or the timer runs out) | Live sessions with 3+ players |
| **Dynamic** (recommended default for 3+) | Simultaneous between players at peace. Sequential between players who are at war with each other | Live sessions. Keeps the game fast but keeps combat fair |

**Conflict rules for simultaneous play:** actions are applied in the order the server receives them.
Two settlers can't found a city on the same tile, and whoever's action arrives first wins. Players at
war never act simultaneously against each other in dynamic mode, which removes "click faster" combat.

## Turn timers and absent players

- **Fixed timer:** N seconds per turn, scaled by era and number of cities.
- **Time bank:** each player has a pool of time that carries over (like a chess clock).
- **Async:** e.g., 24 h per turn, with reminders at 50% and 90%.
- **Timeout behavior** (host chooses): auto end turn / AI plays the turn on the absent player's
  behalf (conservative personality) / skip.
- **Vacation mode:** a player can tell the server "I'm away for 3 days, let the AI hold the fort."

## Notifications

Async games die when people forget it's their turn, so this is a core feature, not polish.

- **Discord webhook per game.** The host pastes a channel webhook, and the server posts
  "⚔️ **Turn 87** — it's @Alex's turn" plus a digest of big events (wonders built, wars declared,
  eliminations).
- **Email** (opt-in per player).
- **Browser / desktop push notifications.**
- **In-app:** a list of your games, each showing whose turn it is and how much time is left.

## Communication

- **Chat:** all-players, team, and private (1-to-1) channels, with emoji reactions and history
  saved in the game.
- **Map pings:** click a tile to ping it to your team (or to a player during diplomacy).
- **Diplomacy screen:** formal proposals (see [04-advanced-systems.md](04-advanced-systems.md)).
- **Binding vs non-binding:** anything in a formal deal is **enforced by the engine** (if you sign
  30 turns of peace, you can't declare war for 30 turns). Anything said in chat is just talk.
  That gap is part of the fun.

## Undo and mistakes

- **Safe undo:** within your own turn, you can undo an action if it revealed no new information
  and used no randomness. Moving a unit into already-visible terrain can be undone. A move that
  revealed fog, an attack, or a hut pop cannot.
- **Host rewind:** the host can propose rolling back to the start of a turn (all human players
  must accept). This is useful for bugs or genuine misclicks. Snapshots make it free.

## Hotseat (same machine)

- A "pass the device" screen hides the map between players.
- Uses the same engine and rules. The local client simply plays the server role.
- A hotseat game can be **uploaded to the server** and continued online.

## Spectators and eliminated players

- The host can allow spectators, who get full map or fog-of-team views.
- Eliminated players can choose to keep spectating with full vision (and are muted in all-chat,
  optionally, so they can't spill secrets).

## Reconnection and multiple devices

- A game is never "lost" when someone's connection drops. They reconnect and get their current view.
- The same account can play from browser, desktop and phone. The latest connection wins.
- The server keeps running games for days or weeks with no one connected (async).

## End of game

- **Victory screen** showing who won and how.
- **Replay:** a timeline scrubber of the whole map from turn 1 (borders growing, wars, cities
  founded), with per-turn event markers. Shareable link.
- **Stats:** graphs of score, science, culture, military strength, and land over time.
- **Hall of fame:** past games on the server with winners and civs played.

## Scale targets

- v1: 2–8 players per game. The engine is not limited to 8, but UI and balance are tested up
  to 8 (12 is a later goal).
- One small server ($5 VPS) should handle dozens of concurrent friend games.
