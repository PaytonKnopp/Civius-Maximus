# 06 — UI and UX

Principle: **you should never have to leave the game to understand the game.** Every number
has a breakdown, every button explains why it's disabled, and every turn starts with "here's what
happened and what needs you".

## Screens

| Screen | Contents |
|---|---|
| **Home** | Your games (whose turn, time left), create/join, mod manager, civ creator, settings, hall of fame |
| **Lobby** | Settings, seats, civ picks or draft, mods, chat, ready check |
| **Map (main)** | The world view, plus the overlays below |
| **City** | Tiles (with yields and lock buttons), citizens, production queue, buy, districts and buildings, growth/housing/amenities breakdown, religion, loyalty |
| **Tech tree / Civics tree** | Zoomable graph, boost conditions, unlock previews, "path to X" queueing |
| **Government** | Government choice, policy card slots, drag-and-drop cards |
| **Diplomacy** | Leaders list with relationships and opinion breakdowns, deal screen, promises, history |
| **Trade** | Active routes, plan a route with a yield preview |
| **Great people** | The current available person of each type, points race, patronage |
| **Religion** | Beliefs, spread map, followers per city |
| **City-states** | Envoys, suzerains, quests |
| **Reports** | Cities overview, units list, yields over time, demographics, score |
| **Turn summary** | What changed since your last turn (essential for async play) |
| **Victory progress** | Each victory type, with every player's progress (based on what you can see) |
| **Replay** | Timeline scrubber, map playback, historic moments |

## Main map HUD

- **Top bar:** yields per turn and stockpiles (click any one for a breakdown), turn number, era,
  timer, whose turn it is, game menu.
- **Bottom right:** the **Next Action** button: "Choose production", "Unit needs orders",
  "Choose research", "Pick policy", "End Turn". Clicking it jumps to the next thing that needs you.
- **Bottom left:** the selected unit or city panel, with actions as big icon buttons plus
  keyboard shortcuts.
- **Notifications stack** (right edge): click one to jump to its location, right-click to dismiss.
- **Minimap**, with a lens selector.
- **Chat**, collapsible, with an unread badge.

## Map lenses (overlays)

- Yields (all or per yield), settler (good city spots, invalid spots greyed out), district
  adjacency (when placing), appeal, religion, loyalty, empire (borders highlighted), trade routes,
  resources, continents, plus a **strategic view**: a flat icon-style map for fast late-game play.

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
- Touch: tap selects, tap again confirms a move, pinch zooms. This is enough to take an async
  turn on a phone. Full phone play isn't a v1 goal (D8).

## Accessibility

- Player colors have a second visual cue (pattern on borders, shape on units) for colorblind
  players, plus colorblind-safe palettes.
- UI scaling (75%–200%), font size settings, and reduced-motion mode.
- Every important event is written to a readable log, not just shown as an animation.

## Pace and feel

- **Quick combat / quick movement** toggles (skip animations).
- **Auto-end turn** option when nothing needs your attention (live games).
- A **"waiting for…"** indicator showing which players are still on their turn in
  simultaneous mode, plus a polite "nudge" button.
- Turn-start **digest** in async: "While you were away: Sam built the Pyramids, Alex's army moved
  toward your border (last seen 4 tiles from Berlin)".

## Audio (later)

- Ambient music per era, UI sounds, combat sounds, and unit voice lines are optional. All audio
  can be replaced by mods.
