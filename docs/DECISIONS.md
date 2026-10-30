# Decisions

Payton's answer to the V1 review (October 2026): for every open decision, follow the best of
the existing Civ games (or a clearly better way), and record it here. Each decision has a
**recommended default** (what the docs currently assume) and a status:
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
| D8 | **Phone support** | Phone/tablet browser can play a turn. A full mobile-first UI is not a v1 goal | Mobile-first in v1 | M13+ | Decided (Payton: the best of the Civ games) |
| D21 | **Map wrap** | Wraps east–west by default | No wrap | M3 | Decided (Payton: the best of the Civ games) |
| D31 | **Starting units** | Settler + Warrior + Scout (exploring early is fun, and the scout finds goody huts and rivals sooner) | Settler + Warrior only (Civ VI); setup option for extra settlers | M5 | Decided (Payton: the best of the Civ games) |
| D33 | **Where growth can develop** | Any tile of the settlement within 3, or an unclaimed tile touching its territory (claims it). Unchosen growth is developed automatically at turn end | Own tiles only (borders grow only by culture and buying) | M6 | Decided (Payton: the best of the Civ games) |
| D34 | **Town economy** | Towns sell 100% of their production as gold; upgrading to a city costs 100 + 60 per city you have | Towns keep a small build queue | M6 | Decided (Payton: the best of the Civ games) |
| D35 | **Base happiness** | Every settlement starts at +2; 1 unhappiness per 2 citizens; luxuries +2 each where improved | Harsher (0 base) or softer (+4 base) | M6 | Decided (Payton: the best of the Civ games) |
| D36 | **Science from citizens** | Each citizen gives +0.5 science, so science grows with your people (without it, early research is very slow) | None (buildings and tiles only) | M7 | Decided (Payton: the best of the Civ games) |
| D37 | **Free unit upkeep** | 3 gold of unit upkeep free per player; past that, each unit costs its upkeep (1 gold for most) | Civ VI style (every unit costs from the start) | M7 | Decided (Payton: the best of the Civ games) |
| D38 | **Celebration pace** | 40 surplus happiness for the first, +30 for each after; lasts 10 turns; +1 wildcard slot and +10% production | Faster or slower; Civ VII-style menu of bonuses per government | M7 | Decided (Payton: the best of the Civ games) |
| D39 | **District cost growth** | +2% of the base cost per tech and civic finished (about double by the Renaissance), so early districts are a bargain | Civ VI's steeper curve; flat cost | M8 | Decided (Payton: the best of the Civ games) |
| D40 | **Wonder strength** | Each Ancient/Classical wonder gives +2–3 of a yield where it stands plus one empire-wide effect worth roughly a policy card (e.g. Pyramids +15% production toward buildings everywhere) | Stronger, Civ VI-style signature effects; weaker | M8 | Decided (Payton: the best of the Civ games) |
| D41 | **Town specialization numbers** | Specialize at 5 citizens; first choice free, then 50 gold to change; Farming/Mining towns send half their food or production to the nearest city within 10 tiles | All of it (Civ VII); only a bonus, no sending | M8 | Decided (Payton: the best of the Civ games) |
| D42 | **Captured civilians** | Join the captor as they are (a captured Settler is your Settler) | Civ VI (settlers become builders); Civ VII (removed) | M9 | Decided (Payton: the best of the Civ games) |
| D43 | **Settlement strikes** | Every settlement has a ranged strike from the start (range 2, once a turn), so a lone early raid can be fought off | Civ VI (needs walls first) | M9 | Decided (Payton: the best of the Civ games) |
| D44 | **Razing** | Over time, like Civ VI/VII: a razed settlement loses a citizen each turn until it is gone (it can be stopped by recapture) | Civ VI (shrinks a citizen per turn, can be stopped) | M9 | Decided (Payton: the best of the Civ games) |
| D45 | **Minimum war length** | Peace can be offered after 10 turns of war | Any time; 20 turns | M9 | Decided (Payton: the best of the Civ games) |
| D46 | **Hostile camps** | On by default: one per 120 land tiles, a raider every 7 turns (3 per camp at most), a new camp every 12 turns in unseen land, 50 gold for clearing | Fewer (calmer early game); more ("raging"); off | M9 | Decided (Payton: the best of the Civ games) |
| D47 | **Promotion trees** | Small trees per class (2 + 1–2 + 1), original names, flat strength bonuses in situations | Civ VI's bigger trees; Civ VII's commander-only promotions | M9 | Decided (Payton: the best of the Civ games) |
| D48 | **War support numbers** | Declared-on side starts +3; +1 per kill, +3 per settlement taken, cap 10; −1 happiness per point behind, at most −5 | Harsher weariness; none until diplomacy | M9 | Decided (Payton: the best of the Civ games) |
| D49 | **Raiders** | Carry civilians off and can't take settlements (they damage and pin them) | Civ VI (capture civilians; can take city-states) | M9 | Decided (Payton: the best of the Civ games) |
| D50 | **Score weights** | 1/citizen, 5/city, 2/town, 2/tech, 2/civic, 10/wonder, 2/district, 10/era, 1/kill | Civ VI's weights; more for wonders and eras | M10 | Decided (Payton: the best of the Civ games) |
| D51 | **Hotseat turn order** | Humans play one after another within each turn (simultaneous turns underneath), in seat order every turn | Rotate who goes first each turn | M10 | Decided (Payton: the best of the Civ games) |
| D52 | **Where saves live** | In the browser (IndexedDB) with an autosave each turn, plus export/import as a file; cloud saves come with accounts (M12) | Files only | M10 | Decided (Payton: the best of the Civ games) |
| D53 | **AI difficulty** | Difficulty levels with openly declared AI bonuses (Civ-style, eight levels from Settler to Deity); the default level gives the AI no bonuses | Difficulty levels with open bonuses (production, gold, combat) for the AI | M11 | Decided (Payton: the best of the Civ games) |
| D54 | **When AIs start wars** | Not before turn 25–85 (sooner the more aggressive the leader), only on a met neighbor within 12 tiles, only when its army is clearly stronger (80–160% of theirs depending on aggression) | Never declare on humans; much earlier rushes | M11 | Decided (Payton: the best of the Civ games) |
| D55 | **AI peace** | Accepts peace unless clearly winning; offers it when losing, war-weary, or after 20–60 turns of war | Fight to the end; peace only with gold (diplomacy) | M11 | Decided (Payton: the best of the Civ games) |
| D56 | **Army strength is public** | Everyone can see every player's total army strength (rival panel); the AI uses it to judge wars | Hidden until you've seen the units | M11 | Decided (Payton: the best of the Civ games) |
| D57 | **AI keeps what it captures** | Always keeps captured settlements (no razing or liberating) | Razes small towns far from home | M11 | Decided (Payton: the best of the Civ games) |
| D58 | **Kit numbers** | First-pass numbers from 09-base-roster (e.g. Caesar +5 strength for 10 turns after declaring war, Qin's first soldier per settlement free, Mongols 50% cavalry capture) | Tune after playing each civ | V1-2 | Decided (Payton: the best of the Civ games) |
| D59 | **What uniques replace** | Where the planned base item doesn't exist yet, the nearest one: War Chariot → Horseman, Samurai → Swordsman, Thermae → Baths, Ordu and Royal Pages School → Barracks, Royal Dockyard → Lighthouse | Wait for the later-era items | V1-2 | Decided (Payton: the best of the Civ games) |
| D60 | **Surprise wars** | A war without denouncing the target in the last 10 turns is a surprise war: the target gets the +3 war-support head start and every AI remembers it (−20 opinion for the victim, −4 for others, fading over 50 turns). A formal war has neither | Civ VI's longer formal-war wait; no distinction | V1-3 | Decided (Payton: the best of the Civ games) |
| D61 | **Pacts and influence** | Friendship 30 turns (20 influence each side), alliance 30 turns (50 each, needs friendship, shares vision), peace treaty 10 turns after any war; +2 influence a turn | Longer pacts; alliances that level up (Civ VI) | V1-3 | Decided (Payton: the best of the Civ games) |
| D62 | **AI answers deals at once** | AI rivals accept or decline the moment you propose, and the deal screen shows their answer beforehand | Answer on their next turn | V1-3 | Decided (Payton: the best of the Civ games) |
| D63 | **Opinion weights** | The numbers in `rules.json` → `diplomacy.opinion` (friends +8, allies +12, long peace up to +4, same government +3, agenda ±2–8...) | Tune after play | V1-3 | Decided (Payton: the best of the Civ games) |
| D64 | **Commander numbers** | Army Commander after Military Tradition: carries 4, radius 1, +2 strength in the radius, out for 5 turns after a retreat; packed units it can't put down when caught are lost | Bigger radius (Civ VII); commanders that die | V1-4 | Decided (Payton: the best of the Civ games) |
| D65 | **Trade route numbers** | 20 turns, 15 tiles over land; domestic +2 food +2 production; international +4 gold (+1 per destination district), destination +1 gold; capacity from Foreign Trade, Commercial Hubs and Harbors; roads halve movement | Civ VI's per-district yields; permanent routes (Civ VII) | V1-5 | Decided (Payton: the best of the Civ games) |
| D66 | **Great people numbers** | 50–60 points for the first of a class, +50–60 for each after; districts +1 point a turn, their buildings +1–2; recruit for 3 gold per missing point; the next person in a class is fixed (era, then list order), one of each per game | Civ VI's per-era timeline | V1-6 | Decided (Payton: the best of the Civ games) |
| D67 | **Religion numbers** | Pantheon 25 faith; players ÷ 2 + 1 religions; pressure within 8 tiles: +2 per follower, +4 from the holy city, +3 per trade route, −10% a turn; converts at 40; missionary 100 faith, +60 pressure, 3 uses | Civ VI's per-citizen followers; bigger radius | V1-7 | Decided (Payton: the best of the Civ games) |
| D68 | **Whole settlements follow a religion** | A settlement follows one religion or none (simpler to read on the map) | Per-citizen followers with a majority (Civ VI) | V1-7 | Decided (Payton: the best of the Civ games) |
| D69 | **Faith patronage** | Great people can be bought with faith at 3 per missing point, except prophets; a civ that founded a religion leaves the prophet race; prophets stop once every religion is founded | Faith can't buy great people; prophets keep coming | V1-7 | Decided (Payton: the best of the Civ games) |
| D70 | **Religious units** | Missionaries, apostles, inquisitors and gurus (V1 final F16); theological combat is the D9 toggle, off by default | Apostles with theological combat as the D9 toggle | V1-7 | Decided (Payton: the best of the Civ games) |
| D71 | **Religion names** | You type any name; AI religions are named after their civ ("Egyptian Faith") | A list of invented names to pick from | V1-7 | Decided (Payton: the best of the Civ games) |
| D72 | **City-states from the start** | Placed at game start like Civ VI; hostile camps stay raiders | Befriended camps grow into city-states (Civ VII, the design in 04) | V1-8 | Decided (Payton: the best of the Civ games) |
| D73 | **City-state numbers** | 3–18 by map size; envoys 40 influence (or free from 5 civics, quests, meeting first); bonuses at 1/3/6; suzerain at 3 and the most; liberating gives 6 | Civ VI's 1/3/6 with more civic envoys | V1-8 | Decided (Payton: the best of the Civ games) |
| D74 | **War with city-states** | Costs your envoys there; they always take peace; they never take settlements; no levies or envoy-holder war support yet | Levies for gold; war support for envoy holders | V1-8 | Decided (Payton: the best of the Civ games) |
| D75 | **Suzerain bonuses** | 18 invented bonuses in `city-states.json` (Ugarit +1 trade route, Byblos +15% wonders, Sparta +3 defending melee...) | Tune after play | V1-8 | Decided (Payton: the best of the Civ games) |
| D76 | **Later eras stop at Modern** | The full tree to the Future era: Atomic and Information eras with air units, nukes (setup toggle) and the late space race | Add the Atomic and Information eras | V1-9 | Decided (Payton: the best of the Civ games) |
| D77 | **Modern governments** | Civ VI-style government tiers through the late game (our names), no ideology pressure | Civ VI names; ideology pressure from tourism | V1-9 | Decided (Payton: the best of the Civ games) |
| D78 | **Unit upgrades** | 2 gold per production point of difference (at least 20), in your own territory, keeps XP; obsolete units leave the build list | Civ VI-style upgrade costs; upgrades anywhere | V1-9 | Decided (Payton: the best of the Civ games) |
| D79 | **Science victory** | Spaceport + 4 projects (600–1320 production), the last arrives after 10 turns; later-era techs and civics cost about 2/3 of Civ VI so the race fits ~300–400 turns | More or fewer steps; projects in parallel | V1-9 | Decided (Payton: the best of the Civ games) |
| D80 | **Culture victory** | Domestic tourists = culture / 100; visitors = tourism / 150 toward each met civ, +25% each for trade route, shared religion, friendship | Civ VI's numbers; great works | V1-9 | Decided (Payton: the best of the Civ games) |
| D81 | **First-game hints** | On: one short note the first time each of ten things comes up (the Next button, growth develops a tile, towns, free policy swaps, lenses, commanders, envoys, pantheon, war, victories), only about what differs from Civ; one click turns them off, and the Help screen (?) turns them back on | None (doc 06 says no hand-holding); a full tutorial | V1-10 | Decided (Payton: the best of the Civ games) |
| D82 | **How online games connect (V1)** | Browser-to-browser (WebRTC through PeerJS) works with no setup; Supabase accounts, cloud saves and lobby are built in and switch on when a project is configured | Set up Supabase now (needs a free project of yours); run our own broker | V1-11 | Decided (Payton: the best of the Civ games) |
| D83 | **Absent players** | The host chooses: wait (and end their turn for them), or an AI plays their seat until they rejoin; optional turn timer | AI plays their turn after a grace period; turn timer | V1-11 | Decided (Payton: the best of the Civ games) |
| D84 | **Tribal villages** | On by default, one per 40 land tiles; 8 rewards by weight (gold, faith, tech or civic boost, a citizen, a scout, a map) | Off by default; Civ VI's rewards by era | V1 final F16 | Decided (Payton: the best of the Civ games) |
| D85 | **Repairing pillaged improvements** | They come back on their own after 10 turns, like disaster damage | A repair project in the build queue (Civ VI); builders | V1 final F16 | Decided (Payton: the best of the Civ games) |
| D86 | **Befriending camps** | 30 influence a turn for 4 turns; the first civ to finish turns the camp into a new city-state with 3 envoys | Civ VII's exact costs; neutral camps only | V1 final F16 | Decided (Payton: the best of the Civ games) |
| D87 | **Saves across updates** | A save from an earlier version loads and plays on with the current rules when every content id it uses still exists; otherwise it's refused and says what's missing | Lock each save to the exact content it began with | Setup | Decided (Payton: "save just like Civ") |
| D88 | **Desktop app updates** | The app opens the live website at every start (the latest game, no reinstall); offline it plays the copy it was installed with; open games are never interrupted, the title screen offers a reload | Tauri's own updater, downloading a new installer per release | Setup | Decided (Payton: "one setup and they get all my updates") |
| D89 | **Who gets a seat back** | Only the friend whose browser holds the seat's key; the host can free an away seat for a new device; dropped lines reconnect by themselves for about three minutes | Anyone with the code and the name (the V1 behavior) | Setup | Decided (Payton: "safe to host or play together") |
| D32 | **Unit auto-cycling** | After a unit uses its moves, the next unit that needs orders is selected and the camera pans to it | Stay on the moved unit until you pick another | M5 | Open (default assumed; becomes a setting) |
