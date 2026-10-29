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

### Game setup (host, or you in single player)

A full Civ VI-style setup screen, with **Basic** and **Advanced** tabs. Everything is saved as a
**preset** so "our usual Friday game" is one click. Every rule module in
[04-advanced-systems.md](04-advanced-systems.md) appears here as a toggle.

**Game**

| Setting | Options |
|---|---|
| Game speed | **Online** (×0.5), **Quick** (×0.67), **Standard** (×1), **Epic** (×1.5), **Marathon** (×3). Scales every cost (research, culture, production, growth, great people, era length), like Civ VI |
| Start era | Ancient (default) through Atomic, with era-appropriate starting units and techs |
| Turn limit | Off, or a number (defaults scale with speed: 250 / 330 / 500 / 750 / 1500) |
| Victories | Toggle each: domination, science, culture, religious, diplomatic, score, plus mod-defined |
| Difficulty | Per AI seat, and optional per-player handicaps |
| Turn timer | None / Fixed per turn / Time bank / Dynamic (scales with empire size) |
| Turn mode | Simultaneous (default) / Dynamic (players at war alternate) |
| Leaders | Any leader with any civ (default) / Historical pairs only. Duplicates allowed or not. Random pick, draft mode (bans + picks) |

**Built so far (V1 final, F1):** game speeds (`gameSpeed` content: Online 50%, Quick 67%,
Standard, Epic 150%, Marathon 300%) scale research, civics, production, growth, border growth,
tile purchases, great people, faith costs and unit upgrades. Difficulty levels (`difficulty`
content, D53): Settler, Chieftain and Warlord give AI rivals less; Prince is fair; King, Emperor,
Immortal and Deity give them more yields (+10% to +50% science, culture, gold, production and
faith), more strength (+1 to +4) and extra starting units. The bonuses are ordinary effects, so
they show in every "why?" breakdown. A seat can have its own difficulty in the setup.

**Built so far (V1 final, F6):** the setup screen (Home → New game…) has Basic and Advanced
tabs.
- **Basic:** your leader (portrait, abilities and uniques; or Random), map type, size,
  difficulty, speed, number of rivals and start era, with notes on what each choice means, and
  presets.
- **Advanced:** every seat (humans for hotseat, AI rivals) with its own leader, team and AI
  difficulty. A leader one seat has is greyed out for the others, and Random seats get a leader
  nobody picked. The map section has type, size, resources, start positions (standard or
  balanced), seed and wrap. The rules section has start era, turn limit, camps, city-states and
  each victory.
- **Presets:** six built in (Standard, Duel, Grand empire, Conquest, Peaceful builder,
  Renaissance start), plus your own, saved in the browser. The screen reopens on your last
  setup.
- **Start era** (`era.start` content): every tech and civic of the earlier eras is done, and
  each player gets the era's gold and units. For example, the Medieval start gives 150 gold, two
  settlers, a swordsman and a crossbowman.
- Hosting online has the same start era, turn limit and rule switches under "More rules".
- Leader picks in the online lobby and turn timers come with F20. World settings (age,
  temperature, rainfall, sea level) come with the map work (F7).

**Rules (toggles)**

Religion, theological combat, great people, independent powers (city-states and barbarians),
barbarian intensity, governors, loyalty, espionage, world congress, climate & natural disasters
(with intensity), corporations, nukes, eras & golden/dark ages, legacy goals, **Ages mode (civ
switching)**, crises, tribal villages (goody huts), secret societies-style mod modules, war
support, policy-swap cost, tech boosts on/off, "no war before turn N", and any house rule a mod
defines.

**Map**

| Setting | Options |
|---|---|
| Map type | Continents, Pangaea, Archipelago, Fractal, and (M21a) small continents, island plates, inland sea, lakes, highlands, seven seas, Terra, shuffle, duel arena, **Earth** (with optional true start locations) |
| Map size | Duel (2), Tiny (4), Small (6), Standard (8), Large (10), Huge (12), plus Enormous (16) for big games |
| World age | New (more mountains) / Standard / Old |
| Temperature | Hot / Standard / Cold |
| Rainfall | Wet / Standard / Dry |
| Sea level | Low / Standard / High |
| Resources | Sparse / Standard / Abundant, plus strategic-resource balance (standard / guaranteed near starts) |
| Natural wonders | Count slider |
| Starts | Normal / Balanced |
| Wrap | East-west wrap on/off |
| Seed | Random or a typed seed (to replay a map you liked) |

### Lobby

**Built so far (V1 part 11):** Home → **Play online…** → host (your name, friends, AI rivals,
map type and size; every rule on) or join with a code. The lobby shows the code big, a button
that copies an invite link (`…#join=CODE`, which opens Join with the code filled in), and who's
in. The host starts whenever ready: seats nobody took are left out. No accounts, leader picks,
presets or ready check yet. A friend who drops can rejoin with the same code and name and gets
their seat back; until then the top of the host's screen says they're away, with **End their
turn** so the others aren't stuck (D83). Closing the host's tab ends the game for everyone; the
host's browser keeps an online autosave, and the home screen offers **Host your online game
again** (with a new code).

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
- **Built so far (M10):** 1–8 human players plus AI rivals, chosen in the new-game dialog.
  Within each (simultaneous) turn the humans play one after another in turn order; ending your
  turn brings up the pass screen for the next one, and once everyone is done the turn is
  processed and the first player is up again (D51). Each player starts their turn with a
  summary of what they could see happen since their last one (wars, captures, kills, growth,
  wonders...). Undo isn't there yet.

## Spectators and eliminated players

- The host can allow spectators (via the join code), who get full-map or team views.
- Eliminated players can choose to keep spectating with full vision (and are muted in all-chat,
  optionally, so they can't spill secrets).

## Saving (built in M10)

- **Save / Load** in the top bar: named saves kept in the browser (IndexedDB), an autosave at
  the start of every turn, and export/import as a file (D52). A save is the whole game state as
  JSON; it only loads with the same content (base + mods), since other rules would play
  differently.

## End of game

- **Victory screen** showing who won and how.
- **Replay:** a timeline scrubber of the whole map from turn 1 (borders growing, wars, settlements
  founded), with per-turn event markers.
- **Stats:** graphs of score, science, culture, military strength, and land over time.
- **Hall of fame:** past games with winners, leaders played, and memorable moments.

## Scale targets

- **2–8 players** per game, humans and AI in any mix. The engine isn't limited to 8. UI and balance
  are tested up to 8, and 12 is a later goal.
