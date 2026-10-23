# 06 — UI and UX

Principle: **you should never have to leave the game to understand the game.** Every number
has a breakdown, every button explains why it's disabled, and every turn starts with "here's what
happened and what needs you".

## Screens

| Screen | Contents |
|---|---|
| **Home** | Single player, host multiplayer, join with code, hotseat, load game, mod manager, civ creator, settings, hall of fame, profile / log in |
| **Lobby** | Join code, settings, seats, leader picks or draft, mods, chat, ready check |
| **Map (main)** | The world view, plus the overlays below |
| **Settlement** | Tiles (with yields and lock buttons), citizens, production queue (cities) or specialization (towns), upgrade to city, buy, districts and buildings, growth and happiness breakdown, religion |
| **Tech tree / Civics tree** | Zoomable graph, boost conditions, unlock previews, "path to X" queueing |
| **Government** | Government choice, policy card slots, drag-and-drop cards |
| **Diplomacy** | Leaders list with relationships and opinion breakdowns, deal screen, promises, history |
| **Trade** | Active routes, plan a route with a yield preview |
| **Great people** | The current available person of each type, points race, patronage |
| **Religion** | Beliefs, spread map, followers per city |
| **Independent powers** | Camps and their disposition, befriending, city-states, envoys, suzerains, quests |
| **Reports** | Cities overview, units list, yields over time, demographics, score |
| **Turn summary** | What changed since your last turn (what the other players did that you can see) |
| **Victory progress** | Each victory type, with every player's progress (based on what you can see) |
| **Replay** | Timeline scrubber, map playback, historic moments |

## Main map HUD

- **Top bar:** yields per turn and stockpiles (click any one for a breakdown), turn number, era,
  timer, every player's turn status (🟢 playing / ✅ done), game menu.
- **Bottom right:** the **Next Action** button: "Choose production", "Unit needs orders",
  "Choose research", "Pick policy", "End Turn". Clicking it jumps to the next thing that needs you.
- **Bottom left:** the selected unit or city panel, with actions as big icon buttons plus
  keyboard shortcuts.
- **Notifications stack** (right edge): click one to jump to its location, right-click to dismiss.
- **Minimap**, with a lens selector.
- **Chat**, collapsible, with an unread badge.

## Map lenses and filters (lots of them, by design)

| Lens | Shows |
|---|---|
| Yields | All yields as big icons with numbers, or one yield at a time as a heatmap |
| Settler | Good settlement spots scored, invalid spots greyed out, fresh water and coast marked |
| Adjacency | For each district type, the bonus it would get on every tile (also shown while placing) |
| Appeal | Tile appeal for neighborhoods, resorts and parks |
| Resources | Filter by bonus / luxury / strategic, or by a single resource; owned vs. unowned |
| Empire | Borders, settlement ranges, who owns what |
| Religion | Majority religion and pressure per settlement |
| Loyalty | Loyalty pressure (when the module is on) |
| Trade | Trade routes, ranges, and route yields |
| Tourism | Tourism sources and visitors |
| Military | Units you can see, zones of control, threat, war support |
| Continents | Continent names and boundaries |
| Climate | Temperature, rainfall, elevation |
| Great works & archaeology | Slots and dig sites |
| Governors | Who governs where |
| Natural wonders | Every known natural wonder |

Plus **filters** (show or hide resource icons, yield icons, units, grid, clouds), **map pins**
with notes (shared with your team), **planning ghosts** to sketch districts and wonders before you
can build them, and the **strategic view** (flat 2D map) for fast late-game play.

## Explainability features

- **"Why?" tooltips** on every number, shown as a tree of contributors (see
  [03-core-mechanics.md](03-core-mechanics.md#2-yields)).
- **Disabled buttons explain themselves:** "Can't found city: too close to Rome (2 tiles, minimum 3)".
- **Combat preview** with the expected damage range and a list of modifiers.
- **Placement previews:** hover a district or wonder spot to see adjacency and what you'd lose
  (e.g., "removes Woods: −1 ⚙️").
- **Civilopedia:** an in-game encyclopedia generated from content, so mods show up automatically.

## Controls

- Mouse: left click selects, right click moves or attacks, drag pans, and the wheel zooms.
- Keyboard: WASD/arrows to pan, Enter for Next Action, standard Civ-like shortcuts (F = fortify,
  S = sleep, B = found city...). Everything is rebindable.
- Touch: tap selects, tap again confirms a move, pinch zooms. This is enough to play a turn
  on a tablet or phone. Full phone play isn't a v1 goal (D8).

## Accessibility

- Player colors have a second visual cue (pattern on borders, shape on units) for colorblind
  players, plus colorblind-safe palettes.
- UI scaling (75%–200%), font size settings, and reduced-motion mode.
- Every important event is written to a readable log, not just shown as an animation.

## Pace and feel

- **Quick combat / quick movement** toggles (skip animations).
- **Auto-end turn** option when nothing needs your attention (live games).
- A **"waiting for…"** indicator showing which players are still on their turn, plus a polite
  "nudge" button.
- Turn-start **digest**: "Last turn: Sam built the Pyramids, Alex's army moved toward your border
  (last seen 4 tiles from Berlin)". This also appears when you resume a saved game.

## Audio (later)

- Ambient music per era, UI sounds, combat sounds, and unit voice lines are optional. All audio
  can be replaced by mods.
