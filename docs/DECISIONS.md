# Decisions

Each decision has a **recommended default** (what the docs currently assume) and a status:
- **Open:** waiting on your input. Work proceeds with the default unless the milestone it blocks
  is next.
- **Decided:** confirmed. The docs match.

To change one, tell Claude in a session (or edit this file). The relevant docs get updated to match.

## Decided

| # | Decision | Choice | Docs |
|---|---|---|---|
| D1 | Game name | **Civius Maximus** | all |
| D2 | Platform | Browser first, plus desktop apps via Tauri from the same code | 01 |
| D3 | Movement with too few MP | **Civ 5 rule**: can always move 1 tile with any MP left | 03 |
| D4 | Turn mode | **Always simultaneous**, with an End Turn button. New turn when everyone is done (or the timer runs out) | 02 |
| D5 | Login | **In-game username + password**, remembered per device, stored in **Supabase (free tier)**. No Discord login needed | 01, 02 |
| D6 | Housing & amenities | Claude's call: replaced by Civ 7-style **happiness + celebrations + settlement limit**. Adjust after playtests if needed | 03, 08 |
| D12 | Base civs | Famous world leaders. Starts with the ten in 09-base-roster.md, and more are added on request | 09 |
| D13 | Max players | 8 in v1 (engine not hard-limited, 12 later) | 02 |
| D14 | Hosting | **$0/month**: Supabase free tier + free static hosting, and the host's game client runs the game | 01 |
| D17 | Game modes | Single player (vs AI), hotseat, host multiplayer with a **join code** | 02 |
| D18 | Design source | Best of Civ 5, 6 and 7, with each pick explained | 08 |
| D19 | War fairness in simultaneous turns | **As in Civ**: fully simultaneous by default, with Civ's Dynamic turns (alternate turns between players at war) as a lobby option. Tune after playtests | 02 |
| D11 | Art style | **Painted-realistic 3D, dark and grand**: Civ VII grandeur + Outer Wilds warmth, dusk light, muted natural colors, dark fog of war; light to run. 2D strategic view kept | 10 |
| D22 | Starting roster | **30 leaders + 30 civs**, each with a full unique kit; more on request | 09 |
| D23 | How content grows | **By asking Claude**, using checklist skills in the repo. No in-game civ creator | 00, 05 |
| D24 | Breadth | Maximum options: many map types and settings, many lenses, all the best Civ V/VI/VII systems as toggles | 00, 03, 06 |
| D25 | UI look | Clean like Civ VII, info-dense like Civ VI where useful; gold/brass/copper metallic accents; standard (not beginner) tooltips | 06, 10 |
| D26 | Game setup | Full Civ VI-style Basic/Advanced setup with every option; speeds Online/Quick/Standard/Epic/Marathon at Civ VI multipliers | 02 |
| D27 | Graphs | Civ VI end-game graphs plus many more graph types and options | 06 |
| D28 | Music | Shuffled public-domain classical playlist, by-era option, your own tracks addable | 06 |
| D29 | Scope of systems | Everything from Ancient to Future era; espionage, world congress, loyalty, disasters/climate, corporations, nukes, Ages mode (civ switching), crises, goody huts all in v1 as setup toggles | 02, 04 |
| D30 | Earth map | Included, with optional true start locations | 02, 03 |
| D9 | Theological combat | Setup toggle, off by default | 04 |
| D15 | Nukes | Included, setup toggle | 04 |
| D16 | Victories | All on by default, each a setup toggle | 02 |
| D20 | Leader / civ mixing | **Any leader with any civ.** The civ defaults to the leader's historical one. The host can restrict to historical pairs | 02, 09 |
| D7 | Unit stacking | **1 military + 1 civilian (+1 support) per tile**, with commanders to pack units | 03 |

## Open

| # | Decision | Recommended default | Alternatives | Blocks | Status |
|---|---|---|---|---|---|
| D8 | **Phone support** | Phone/tablet browser can play a turn. A full mobile-first UI is not a v1 goal | Mobile-first in v1 | M13+ | Open (default assumed) |
| D21 | **Map wrap** | Wraps east–west by default | No wrap | M3 | Open (default assumed) |
| D31 | **Starting units** | Settler + Warrior + Scout (exploring early is fun, and the scout finds goody huts and rivals sooner) | Settler + Warrior only (Civ VI); setup option for extra settlers | M5 | Open (default assumed) |
| D33 | **Where growth can develop** | Any tile of the settlement within 3, or an unclaimed tile touching its territory (claims it). Unchosen growth is developed automatically at turn end | Own tiles only (borders grow only by culture and buying) | M6 | Open (default assumed) |
| D34 | **Town economy** | Towns sell 100% of their production as gold; upgrading to a city costs 100 + 60 per city you have | Towns keep a small build queue | M6 | Open (default assumed) |
| D35 | **Base happiness** | Every settlement starts at +2; 1 unhappiness per 2 citizens; luxuries +2 each where improved | Harsher (0 base) or softer (+4 base) | M6 | Open (default assumed) |
| D36 | **Science from citizens** | Each citizen gives +0.5 science, so science grows with your people (without it, early research is very slow) | None (buildings and tiles only) | M7 | Open (default assumed) |
| D37 | **Free unit upkeep** | 3 gold of unit upkeep free per player; past that, each unit costs its upkeep (1 gold for most) | Civ VI style (every unit costs from the start) | M7 | Open (default assumed) |
| D38 | **Celebration pace** | 40 surplus happiness for the first, +30 for each after; lasts 10 turns; +1 wildcard slot and +10% production | Faster or slower; Civ VII-style menu of bonuses per government | M7 | Open (default assumed) |
| D39 | **District cost growth** | +2% of the base cost per tech and civic finished (about double by the Renaissance), so early districts are a bargain | Civ VI's steeper curve; flat cost | M8 | Open (default assumed) |
| D40 | **Wonder strength** | Each Ancient/Classical wonder gives +2–3 of a yield where it stands plus one empire-wide effect worth roughly a policy card (e.g. Pyramids +15% production toward buildings everywhere) | Stronger, Civ VI-style signature effects; weaker | M8 | Open (default assumed) |
| D41 | **Town specialization numbers** | Specialize at 5 citizens; first choice free, then 50 gold to change; Farming/Mining towns send half their food or production to the nearest city within 10 tiles | All of it (Civ VII); only a bonus, no sending | M8 | Open (default assumed) |
| D42 | **Captured civilians** | Join the captor as they are (a captured Settler is your Settler) | Civ VI (settlers become builders); Civ VII (removed) | M9 | Open (default assumed) |
| D43 | **Settlement strikes** | Every settlement has a ranged strike from the start (range 2, once a turn), so a lone early raid can be fought off | Civ VI (needs walls first) | M9 | Open (default assumed) |
| D44 | **Razing** | Immediate | Civ VI (shrinks a citizen per turn, can be stopped) | M9 | Open (default assumed) |
| D45 | **Minimum war length** | Peace can be offered after 10 turns of war | Any time; 20 turns | M9 | Open (default assumed) |
| D46 | **Hostile camps** | On by default: one per 120 land tiles, a raider every 7 turns (3 per camp at most), a new camp every 12 turns in unseen land, 50 gold for clearing | Fewer (calmer early game); more ("raging"); off | M9 | Open (default assumed) |
| D47 | **Promotion trees** | Small trees per class (2 + 1–2 + 1), original names, flat strength bonuses in situations | Civ VI's bigger trees; Civ VII's commander-only promotions | M9 | Open (default assumed) |
| D48 | **War support numbers** | Declared-on side starts +3; +1 per kill, +3 per settlement taken, cap 10; −1 happiness per point behind, at most −5 | Harsher weariness; none until diplomacy | M9 | Open (default assumed) |
| D49 | **Raiders** | Carry civilians off and can't take settlements (they damage and pin them) | Civ VI (capture civilians; can take city-states) | M9 | Open (default assumed) |
| D32 | **Unit auto-cycling** | After a unit uses its moves, the next unit that needs orders is selected and the camera pans to it | Stay on the moved unit until you pick another | M5 | Open (default assumed; becomes a setting) |
