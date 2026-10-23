# 02 — Game modes, multiplayer and social

The most important doc for pillar #1 ("Friends first").

## Main menu

```
[ Single Player ]   [ Host Multiplayer ]   [ Join with Code ]   [ Hotseat ]   [ Load Game ]
[ Mods ]   [ Civ Creator ]   [ Hall of Fame ]   [ Settings ]   [ Profile / Log in ]
```

| Mode | What it is |
|---|---|
| **Single Player** | You against AI leaders, running fully in your browser or desktop app. Works offline, no login needed. |
| **Host Multiplayer** | You create a game, get a **join code**, and send it to friends (Discord, text, whatever). Seats left empty can be filled by AI. |
| **Join with Code** | Enter a friend's code (e.g., `MAX-7Q2K`), pick your leader, and click ready. |
| **Hotseat** | Several people share one computer, taking turns. |
| **Load Game** | Resume single player, hotseat or hosted games from cloud saves (multiplayer) or local saves. |

## Accounts

- Players create their own **username + password** inside the game. Login is remembered on each
  device. See [01-architecture.md](01-architecture.md#accounts).
- Single player and hotseat don't need an account.

## Game lifecycle

```
Host creates game → Lobby (code, settings, seats, leaders, mods) → Start → Turns ... → Victory → Replay / stats
```

### Game settings (host)

The host picks these settings. All of them are saved as a **preset** so "our usual Friday game" is
one click.

| Setting | Options |
|---|---|
| Map type | Continents, Pangaea, Archipelago, Fractal, Inland Sea, Islands, Balanced Duel, plus mod map scripts |
| Map size | Duel, Tiny, Small, Standard, Large, Huge (see [03-core-mechanics.md](03-core-mechanics.md)) |
| Fairness | Normal / Balanced starts (Mirrored maps later) |
| Game speed | Online (fast), Quick, Standard, Epic. This scales all costs. |
| Start era | Ancient (default), Classical, Medieval... |
| Turn timer | None / Fixed per turn / Time bank (see below) |
| Victories | Toggle each type, plus turn limit and score victory |
| Rule modules | Toggle religion, independent powers, great people, governors, loyalty, Ages mode, crises... |
| Leaders | Any leader with any civ (default) / Historical pairs only |
| Mods | Choose from the mod library. Load order is shown. |
| AI | AI seats and difficulty. "AI takes over a disconnected player" (on/off) |
| Teams | Free-for-all, or assign teams (shared vision, shared victory) |
| House rules | Free-form text shown to everyone, plus modded rule constants (e.g., "no war before turn 50" can be *enforced*) |

### Lobby

- The **join code** is shown big at the top with a copy button. The host can regenerate it or lock
  the lobby.
- **Seats (up to 8):** open, claimed (human), AI (with difficulty), or closed.
- **Leader selection:** pick a leader, then a civ. The civ defaults to the leader's historical
  civ, but you can pick any civ (unless the host chose "historical pairs only"). Or pick random. The host
  can allow or forbid duplicates. An optional **draft mode** lets each player ban one leader, then
  pick in snake order.
- **Ready check:** the host clicks start once everyone is ready.
- **Mod preview:** everyone can browse the active mods' leaders, civs and rules before the game starts.
- Mods are sent to every player automatically. Nobody installs anything by hand.

## Turns: always simultaneous

- **Everyone plays their turn at the same time.** When you're done, click **End Turn**. A new turn
  starts when *every* human player has ended their turn (or the timer runs out).
- The top bar shows everyone's status: 🟢 still playing / ✅ done. After you end your turn you can
  still look around, use chat, and prepare deals. You can also **un-end** your turn if you change
  your mind before the others finish.
- A "nudge" button sends a polite ping to whoever's still playing.
- **Order of actions:** actions are applied in the order the host receives them. If two settlers
  try to found a settlement on the same tile, the first one wins, and the other gets a clear
  message.
- **Wars work the way Civ handles them:** by default, turns stay fully simultaneous even
  during wars, as in Civ 6 and 7's simultaneous mode. For groups that dislike racing each other
  in battles, the lobby has Civ's **Dynamic turns** option (Civ 5 called it *hybrid*): players at
  peace keep playing at the same time, while two players at war with each other alternate turns.
  It's off by default. We'll tune after playtests.

## Turn timers and absent players

- **Fixed timer:** N seconds per turn, scaled by era and number of settlements.
- **Time bank:** each player has a pool of time that carries over (like a chess clock).
- **Timeout behavior** (host chooses): auto end turn / AI plays the rest of the turn for that player.
- **Disconnects:** the game waits a grace period (e.g., 2 minutes) for the player to reconnect, then
  either pauses or hands the seat to the AI until they're back (host setting).

## Saving and resuming

- Hosted games are saved to the cloud every turn. Game nights can stop mid-game and pick up later.
- "My games" lists every game you're in, with turn number, players, and last played date.
- **Host handoff:** if the host can't make it, another seated player can resume the game as host.

## Notifications

Simultaneous turns are played live, so notifications are mostly about getting everyone into the game:

- **Discord webhook per game** (optional). The host pastes a channel webhook, and the game posts
  "🎮 Game *Pangaea #3* is live, join code MAX-7Q2K", plus a game recap at the end. This is sent via
  a small Supabase edge function, so webhook URLs never reach other players.
- **Browser / desktop notifications:** "Turn 87 started", "Alex proposed a deal", "Everyone's
  waiting on you".

## Communication

- **Chat:** all-players, team, and private (1-to-1) channels, with emoji reactions and history
  saved with the game.
- **Map pings:** click a tile to ping it to your team (or to a player during diplomacy).
- **Diplomacy screen:** formal proposals (see [04-advanced-systems.md](04-advanced-systems.md)).
- **Binding vs non-binding:** anything in a formal deal is **enforced by the engine** (if you sign
  30 turns of peace, you can't declare war for 30 turns). Anything said in chat is just talk.

## Undo and mistakes

- **Safe undo:** within the current turn, you can undo an action if it revealed no new information
  and used no randomness. Moving into already-visible terrain can be undone. A move that revealed
  fog, an attack, or anything random cannot.
- **Host rewind:** the host can propose rolling back to the start of the turn (all human players
  must accept). This is useful for bugs or genuine misclicks.

## Hotseat (same machine)

- A "pass the device" screen hides the map between players.
- Uses the same engine and rules. Turns are taken one player at a time on the shared screen.

## Spectators and eliminated players

- The host can allow spectators (via the join code), who get full-map or team views.
- Eliminated players can choose to keep spectating with full vision (and are muted in all-chat,
  optionally, so they can't spill secrets).

## End of game

- **Victory screen** showing who won and how.
- **Replay:** a timeline scrubber of the whole map from turn 1 (borders growing, wars, settlements
  founded), with per-turn event markers.
- **Stats:** graphs of score, science, culture, military strength, and land over time.
- **Hall of fame:** past games with winners, leaders played, and memorable moments.

## Scale targets

- **2–8 players** per game, humans and AI in any mix. The engine isn't limited to 8. UI and balance
  are tested up to 8, and 12 is a later goal.
