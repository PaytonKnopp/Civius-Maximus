# 06 — UI and UX

**Look (decided):** clean and easy to read like **Civ VII**, with **Civ VI's** information
density where you want it. Metallic accent tones (**gold, brass, copper**) for headings, numbers
and highlights; everything else as clean and calm as possible so the map and the numbers stand
out. Players know Civ well, so tooltips are thorough but there's no beginner hand-holding.

Principle: **you should never have to leave the game to understand the game.** Every number
has a breakdown, every button explains why it's disabled, and every turn starts with "here's what
happened and what needs you".

## Screens

| Screen | Contents |
|---|---|
| **Home** | Single player, host multiplayer, join with code, hotseat, load game, mod manager, civ creator, settings, hall of fame, profile / log in (built so far: Continue the autosave, Quick game, New game, Load game, Map Lab, over the live map) |
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
| **Replay** | Timeline scrubber, map playback, historic moments (built in V1 final F19: from the game-over dialog and the Hall of Fame; the map is drawn from a snapshot of who owned what every 5 turns, kept in the game's history) |
| **Graphs** | Civ VI-style end-of-game (and mid-game) graphs, with more options (below) |
| **Game setup** | Basic and Advanced setup tabs with every option (see [02-multiplayer.md](02-multiplayer.md)) |

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

**Built so far (V1 final, F2):** a full-width top bar: empire yields on the left (science,
culture, gold and faith with their per-turn change, influence, happiness), round screen buttons
on the right (research T, civics C, government G, great people P, religion R, city-states I,
victories V, graphs H, help ?) with badges for empty policy slots and spare envoys, then the
turn and era, the ☰ game menu (new game, save/load, Map Lab, title screen) and the 3D/2D
switch. Under it, research and civic trackers with a progress ring; the civs' turn chips sit top
right. The next-action button sits over a clickable minimap (terrain, borders, fog, settlements,
your units) with the lens picker on its frame. Every panel and full screen shares one frame:
sea-blue lacquer, a brass edge and corner flourishes; titles are gold Cinzel (refined in
polish P1, below).

**The design system (polish P1):** `packages/client/src/theme.css` holds the tokens every
screen uses. Type is **Cinzel** for titles and **Source Sans 3** for text, both bundled with the
game (no font CDN, so the desktop app and offline play look the same); numbers use tabular
figures and show at most one decimal (12.4), whole from 100 up. Panels are dark lacquer with a
fine grain, a gold hairline and small brass corner ticks over a blurred map; buttons come as
default (dark, gold edge on hover), primary (gold), ghost and danger, with hover, press and focus
states. Tooltips are the game's own card (title, key, then the "why?" lines with yield icons)
for anything with a hint. The screen buttons in the top bar are brass glyphs in dark wells,
grouped (empire: research, civics, government, governors; culture: great people, great works,
religion; world: climate, World Congress, espionage, city-states; standing: victories, graphs;
help: Civilopedia, help), lighting up in the screen's color on hover; graphics quality moved
into the ☰ menu. The unit card has an action bar of tiles (icon, name, key) with the cost on
upgrades, pillage and plunder.

**Leaders on screen (V1 final, F4):** a game opens on your leader's intro (portrait, emblem, a
few lines on who they were, the leader and civ abilities and uniques). The civ chips at the top
show each leader's face. A rival's diplomacy panel shows their portrait and a line in their
voice (a greeting, or a threat at war). When a rival declares war, makes peace or falls, they
speak to you over their portrait. Every line is original (`leader.quotes`, `leader.intro`).

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

**Built so far (V1 part 10):** four lenses, cycled with L or picked from the lens chip: Yields
(what each of your tiles gives), Settler (the twelve best known sites, ranked by the same scoring
the AI uses, the top three in gold), Resources (by name, colored bonus / luxury / strategic) and
Religion (each known settlement's territory in its religion's color, named on the center). The
rest of the table comes later. District adjacency already shows while placing a district.

**First-game hints (D81):** players know Civ, so there's no tutorial, but the first time
something this game does its own way comes up (growth develops a tile, towns, free policy swaps
after a civic, commanders, envoys...) a short note says so, once. One click turns them off; the
Help screen (?) lists every shortcut and turns hints back on.

## Explainability features

- **"Why?" tooltips** on every number, shown as a tree of contributors (see
  [03-core-mechanics.md](03-core-mechanics.md#2-yields)).
- **Disabled buttons explain themselves:** "Can't found city: too close to Rome (2 tiles, minimum 3)".
- **Combat preview** with the expected damage range and a list of modifiers.
- **Placement previews:** hover a district or wonder spot to see adjacency and what you'd lose
  (e.g., "removes Woods: −1 ⚙️").
- **Civilopedia:** an in-game encyclopedia generated from content, so mods show up automatically.
  *Built (V1 final F19):* F1, the 📖 button or the home screen. Sixteen categories (how to play,
  civilizations and leaders, units, buildings, districts, wonders, improvements, techs, civics,
  governments and policies, religion, great people, city-states, the map, promotions, and
  governors, eras and the world), a search across titles and text, and links between articles
  (what a tech unlocks, what a unit upgrades to, a leader's civ...). "How to play" has 22 short
  articles on the systems, with numbers from the rules.
- **Advisors** (V1 final F19): each turn, tips from the military, economic, culture and foreign
  advisors about what needs attention (enemies near a settlement, losing gold, a pile of gold,
  free trade routes, unhappiness, starvation, room to expand, falling loyalty, a hostile
  neighbor, envoys to send), one at a time in a card under the research trackers. "Hide this
  turn", or turn them off (and back on from Help).

## End Turn (works like Civ)

The big **Next Action** button doesn't let you end the turn while something needs you: it shows
the next blocker ("Choose production in Rome", "Units need orders", "Choose a research", "Fill
an empty policy slot", "Pick a pantheon") and takes you there on click. Once nothing's left it
becomes **End Turn**. Units can sleep, fortify or skip so they stop asking. Optional setting:
also stop for "a city finished a building" style notices.

## Graphs and statistics (a favourite, so more than Civ VI)

Available any time for what you know about, and in full for everyone at the end of the game.

- **Line graphs over turns** for every yield (food, production, gold, science, culture, faith,
  happiness, influence, tourism), score and score breakdown, population, number of settlements,
  land owned, military strength, units lost and killed, techs and civics known, great people
  earned, wonders built, religion followers, trade routes, era score, war support.
- **Per-player toggles**, smoothing, log scale, and "per settlement" / "per citizen" normalization.
- **Stacked area charts** (share of the world's science, culture, land...), **rankings over time**
  (bump chart), and **demographics** (best / average / worst with your rank).
- **Event markers** on every graph: wars, wonders, golden/dark ages, eras, eliminations; hover any
  point to see the exact value and what happened that turn.
- **Summary cards** at the end: biggest empire, most wonders, deadliest war, fastest tech, longest
  golden age, and each player's best moment.
- Graphs export as images, and stay in the hall of fame with the replay.
- **Hall of Fame** (V1 final F19, home screen): every finished game in this browser, newest
  first: date, leader, result and how, turn, score, map and difficulty, with a replay for the
  eight newest (kept in local storage; the oldest replays go first when it fills).

**Built so far (V1 part 10):** the game keeps every civ's numbers each turn (score, science,
culture and tourism per turn, military, citizens, settlements). The Graphs screen (H, or from
Victories) shows one at a time as a line chart for every civ, with a legend, end labels for up to
four civs, and a hover readout of every value that turn; the end-of-game screen shows the score
graph. Series colors come from a palette checked for colorblind separation on the dark panel.

## Music and sound

- **Classical soundtrack:** a shuffled playlist of public-domain classical recordings (e.g.
  Musopen's public-domain catalog), with options for **shuffle**, **by era** (Baroque in early
  eras, Romantic later), skip, and volume. You can add your own tracks to the playlist folder.
- Separate volume sliders for music, effects, ambience and UI.

**Built so far (V1 final, F5):** all sound is synthesized live with Web Audio (`client/src/audio`),
so nothing has to be downloaded or licensed, and it starts on your first click (browsers require
a gesture).
- **Music** is composed as it plays, one style per era: frame drums, lyre and flute in the Ancient
  era; harp and choir in the Classical and Medieval; lute, recorder and strings in the
  Renaissance; keys, strings and brass in the Industrial; slow keys and pads in the Modern.
  A civ's culture colors the early eras: pentatonic for East Asia, Africa and the steppe, the
  Hijaz mode for the Middle East and South Asia.
- Pieces are 16 bars built from a motif that repeats and varies over a chord progression, with
  quiet between them.
- Now and then the game plays a public-domain tune on its own instruments: Greensleeves, a minuet
  in G, Ode to Joy, Amazing Grace, a Gymnopédie, and Sakura for East Asian civs.
- **Sound effects:** about 40 cues, among them clicks, selection, footsteps, hooves and waves,
  founding a city, builds, research and civics, boosts, growth, melee clashes, arrows, musket
  volleys and cannon, deaths, captures, promotions, war drums, peace, wonder fanfares, great
  people, religion, government, new eras, turns, fire, victory and defeat.
- **Ambience:** wind, plus birdsong before the Industrial era.
- The ☰ menu has volume sliders for master, music, effects and ambience, and a mute switch. Music
  ducks under big moments.

The playlist of recorded public-domain pieces stays the plan for when recordings can be bundled
or streamed. Mods will be able to add tracks.

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
