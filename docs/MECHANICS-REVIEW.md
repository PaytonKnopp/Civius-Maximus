# Mechanics review (final gameplay pass, November 2026)

Payton's brief: one last complete pass over how the game works (every mechanic, number, rule and
flow), measured with all-AI games rather than guessed, compared with the best of Civ V, VI and
VII, and fixed until every system works, scales and plays well together. The visual and UI side
had its own pass; this one is about everything else.

This page is Phase 1 of that pass: how each system really works today (in code and content, not
as the docs say), what the measurements show, what's wrong, and what to change. Every proposed
change is marked:

- **Fix**: a bug, broken math, dead content, a flat "+1 to everything" bonus, or functionality the
  docs promise that isn't there. These go ahead without asking.
- **Taste**: changes how the game feels (a new system, removing one, changing a decided design, a
  big balance target). Each is a row in [DECISIONS.md](DECISIONS.md) (D106–D120) with a
  recommended default, and Payton decides.

Phase 2 (below each section as it lands) records what was built and the numbers after.

## How it was measured

A new tool plays whole all-AI games and records everything as they go:

- `pnpm cx stats <preset>` plays a batch of games in parallel (one process per game) and writes
  one line of JSON per game; `pnpm cx stats-report <file> [speed|size|difficulty|startEra|script]`
  turns them into the tables on this page. Presets are in `packages/tools/src/statsPresets.ts`;
  each varies one thing around a base setup of 6 civs on a Small map with the Continents
  script, at Standard speed, Prince, Ancient start.
- Per game it records: the length and the victory; the turn the first civ and half the civs
  reached each era; every 10 turns, each civ's yields (food, production, gold, science, culture,
  faith, influence, tourism), net gold, treasury, settlements, cities, population, techs, civics,
  era, districts, buildings, units, unhappy settlements and average mood; every unit, building,
  district, wonder and project built (and what was bought); great people, pantheons and religions
  with their turns; wars, peace, captures and eliminations; policy cards and governments in use
  (player-turns); beliefs, dedications, ages, governors, spy missions and resolutions; refused
  AI actions; and AI and turn-processing time.
- Measuring only reads the game, so the final state hash matches `cx simulate` and `cx profile`.
- The baseline is the game as merged in PR #58 (commit `b30eb14`): **6 full Standard games**
  (500-turn limit), plus batches over every speed, every map size, eleven map scripts, six
  difficulties, seven start eras and a game with every optional system off.

### The baseline in one table (6 Standard games, 6 civs, Continents on a Small map)

| | Turn 50 | 100 | 150 | 200 | 250 | 300 | 400 |
|---|---|---|---|---|---|---|---|
| Settlements (median civ) | 3 | 6 | 6 | 6 | 6 | 6 | 7 |
| Population | 13 | 36 | 51 | 63 | 66 | 67 | 69 |
| Science / turn | 9 | 23 | 37 | 51 | 61 | 64 | 67 |
| Culture / turn | 5 | 9 | 13 | 18 | 24 | 25 | 34 |
| Faith / turn | 2 | 15 | 41 | 59 | 73 | 82 | 95 |
| Gold / turn (gross, net) | 8, 10 | 21, 20 | 45, 35 | 84, 56 | 111, 61 | 128, 29 | 128, 5 |
| Production / turn | 25 | 53 | 82 | 109 | 128 | 137 | 186 |
| Tourism / turn | 0 | 0 | 1 | 2 | 3 | 4 | 7 |
| Unhappy settlements | 1 of 3 | 4 of 6 | 4 of 6 | 5 of 6 | 5 of 6 | 6 of 6 | 7 of 7 |

- **Victories:** 4 science (turns 370, 378, 445, 485) and 2 diplomatic (363, 438). No culture,
  religious or domination win; no game reached the turn limit.
- **Eras** (turn half the civs got there): Classical 58, Medieval 102, Renaissance 145,
  Industrial 190, Modern 231, Atomic 330, Information 390. The first civ reached the Future era on
  turn 357.
- **Every one of the 45 wonders was built in every game** (the CN Tower in 1 of 6), most by
  turn 250. All 41 great people were claimed by turn ~190, so there were none for the last
  200 turns.
- About 19 wars, 7 captured settlements and half a civ eliminated per game.
- Cities sat with an empty build queue about 3,200 city-turns per game (1.3 idle cities per
  civ per turn), and that production was lost.
- Turn processing averaged 589 ms and all AIs together 277 ms a turn (one laptop core).

**The headline:** the numbers stop growing around turn 250 while the game goes on for another
150–250 turns; most settlements are unhappy from turn 100 to the end; and the systems that should
carry the late game (great people, wonders, strategic resources, tourism, faith) are either spent
or never switched on. Each section below has the causes. The biggest are four bugs: luxuries are
almost never improved, strategic resources do nothing, idle production is thrown away, and the
AI's valuation ignores conditions on effects.

The speed, size, difficulty, start-era, map-script and options-off batches are in section 10,
next to the same games after the pass.

---

## 1. The map and the land

### How it works now

- **Terrain** matches Civ VI: grassland 2 food, plains 1 food 1 production, desert and snow
  nothing, tundra 1 food, coast and lake 1 food 1 gold, ocean 1 food; hills +1 production, +3
  defense, +1 move, +1 sight; mountains impassable, block sight.
- **Features:** woods +1 production, rainforest +1 food, marsh +1 food, floodplains +3 food on
  desert (+1 on grassland and plains), oasis 3 food 1 gold, reef 1 food 1 production, ice
  impassable, volcanoes (6% of mountains). Woods, rainforest and marsh can be cleared by a
  15-production city project for a flat 25 production, 15 food + 15 production, or 20 food.
- **Rivers** on tile edges give fresh water, end a move when crossed and give attackers −5.
- **16 natural wonders**, 2 (Duel) to 8 (Huge) per map; some workable, most give their
  neighbors yields.
- **Resources:** 10 bonus (+1 or +2 of a yield), 7 luxuries (+2 happiness each where improved)
  and 7 strategic resources.
- **Map generation:** 12 scripts, world age, temperature, rainfall and sea level; start
  positions with minimum food and production, civ start biases, a Balanced option.

### What the measurements and the code show

1. **Luxuries are almost never improved (bug).** On a turn-150 map (6 civs, seed 7) the civs
   owned 18 luxury tiles and had improved one. Growth develops a tile with the best improvement
   *available*, so before Irrigation (plantations) or Animal Husbandry (camps, pastures) a
   luxury or bonus tile gets a farm or a woodcutter, and an improved tile is never offered again.
   That map had no plantation and no camp at all; deer had 8 woodcutters, horses 6 farms, niter
   6 farms. With no luxuries, happiness has almost no sources (section 2).
2. **Strategic resources do nothing (missing functionality).** `stockpilePerTurn` is in the
   content and the schema but no engine code reads it: no unit needs iron, horses or oil, and
   there's no stockpile. Doc 03 describes stockpiles, costs to train and −20 strength when out.
   Oil can't be improved at all (no improvement lists it). They're also visible from turn 1
   (doc 03: revealed by tech).
3. **Resource placement ignores frequency (bug).** Each eligible tile picks among the resources
   that fit it, weighted by frequency, so resources that fit many tiles crowd out the rest: one
   Small map had 20 uranium, 19 oil and 21 stone against 2 iron and 1 coal. There's no balancing
   of strategic resources or luxuries between starts.
4. **The luxury rule in the docs isn't built.** Doc 03 says a luxury cheers its settlement and up
   to 3 others nearby (`luxuryHappinessRadius` in the rules, unused). Today a luxury only counts
   in the settlement that owns the tile, and copies stack (two silks = +4 in one place), so
   there's nothing to trade and no reason to want variety.
5. **Clearing land doesn't scale.** The chop rewards are flat: at Online speed a 7-production
   project returns 25 production; at Marathon a 45-production one returns 25.
6. **Appeal isn't computed.** Terrain and features carry appeal values, but nothing adds them
   up; doc 03's appeal (resort towns, national parks, seaside resorts) does nothing.
7. **No continents.** The map doesn't know its landmasses, so there's no continent lens and
   "home continent" abilities (Lincoln, Napoleon) were left out.
8. **Few improvements, and they never grow.** Eight basic improvements, each +1 or +2, improved
   by three techs in the whole tree (Apprenticeship +1 mines, Machinery +1 woodcutters,
   Astronomy for universities); farms never get better except through one policy. No late-game
   improvements (doc 03 lists oil wells, offshore platforms, forts, resorts).

### Compared with Civ

- Civ VI and VII put the right improvement on a resource automatically (VII) or let builders
  replace one (VI); either way a luxury is never "lost". Civ VI's luxuries each give an amenity to
  four cities, so variety matters and copies are trade goods; Civ V's are empire-wide.
- Civ VI (Gathering Storm) stockpiles strategic resources, charges them to train units and
  per turn for late units and power plants; Civ V counts copies. Both reveal them by tech.
- Civ VI scales chop yields with era and speed, raises tile yields through the tree (farms,
  mines, plantations and camps each improve two or three times), and has appeal-driven
  national parks and seaside resorts.

### Proposed

| # | Change | Kind |
|---|---|---|
| 1.1 | A resource tile always ends up with its own improvement: growth never puts another improvement on it while its own exists in the game, except a placeholder that **upgrades itself** the turn the right one unlocks; growth choices and auto-develop value luxuries (happiness) and strategic resources | Fix |
| 1.2 | Luxuries as documented: each improved luxury cheers its settlement and up to three of your other settlements nearby; a settlement counts each kind of luxury once, so variety pays and copies become trade goods (deals can include luxuries) | Fix |
| 1.3 | Strategic resources work: stockpiles from improved sources, unit costs to train, per-turn upkeep for Industrial-era and later units, a strength penalty when short, revealed by tech, tradeable in deals; oil wells and offshore platforms so oil can be improved | Fix |
| 1.4 | Resource placement by frequency across the whole map, luxuries in small clusters, and a fair share near every start (at least one luxury and a horses or iron source within reach) | Fix |
| 1.5 | Chop rewards scale with speed and era | Fix |
| 1.6 | Appeal computed for every tile (neighbors' terrain, features, wonders, districts), shown in tooltips and an appeal lens, and used by resort towns | Fix |
| 1.7 | Continents identified when the map is made (for a lens and home-continent abilities) | Fix |
| 1.8 | Improvements improve through the tree, like Civ VI: farms, mines, plantations, camps, pastures and fishing boats each gain a yield two or three times along the way, on techs and civics that make sense | Fix |
| 1.9 | Eight more luxuries (so maps have variety to trade) | Taste (D106) |

## 2. Settlements and growth

### How it works now

- **Founding:** 3 tiles apart; the capital starts as a city with a Palace; later settlements
  are towns; a settler costs 80 production and a citizen.
- **Towns** sell all their production for gold and pick a specialization at 5 citizens (farming
  and mining towns send half their food or production to the nearest city).
- **Growth develops land** (Civ VII): each new citizen develops a tile; unchosen growth is
  developed automatically at the end of the turn.
- **Happiness** per settlement: +2 base, −1 per 2 citizens, −1 per building with maintenance,
  −2 per settlement over the settlement limit (in every settlement), luxuries, buildings,
  wonders, policies. Thriving at +5 (+10% yields), unhappy below 0 (−2% per point, growth
  halved), unrest at −5 (−25%). A celebration (an extra wildcard slot, +10% production for 10
  turns) when the empire's surplus fills a store of 40, +30 each time.
- **Settlement limit** 4, +1 from Early Empire, Political Philosophy and Civil Service.
- **Production:** queues with overflow, buying at 4 gold per production point.
- **Conquest:** keep, raze (over turns) or liberate. Loyalty can flip settlements.

### What the measurements and the code show

1. **Most settlements are unhappy all game.** At turn 100, 4 of the median civ's 6 settlements
   had a negative balance; from turn 300, all of them. The turn-150 save shows why: a size-10
   city's only sources were +2 base and +1 from an aqueduct, against −5 for its citizens and
   −1 per maintained building. Luxuries, the intended main source, aren't improved (1.1).
2. **Conquest puts the AI into empire-wide unrest.** A civ that took three settlements had 9
   against a limit of 6: −6 in *every* settlement, all of them in unrest (−25% yields). Puppets,
   the doc's answer (they count half), were never built.
3. **The AI stops building.** With unhappiness weighted heavily, every building's −1 happiness
   outweighs its yield, so cities with five districts sat with no buildings and an empty queue.
4. **Idle production is thrown away (bug).** A city with an empty queue loses its production
   (towns sell theirs); so does overflow when nothing is queued. About 3,200 city-turns per
   game.
5. **No repeatable projects.** Doc 03 lists them (a Campus project turning production into
   science and great scientist points); only feature clearing and the space race exist.
6. **Yields plateau.** Population stops at ~11 per settlement and settlements at 6–7 per civ
   after turn 100. Science per citizen (0.5) is the biggest single source of science.
7. **Town specializations are half-built.** The trade outpost's route range, the fort town's
   defense and healing, the religious site's missionaries and the resort town's appeal-based
   tourism (doc 03) were left for "the systems they belong to", which now exist.
8. 97 starvations and 84 units disbanded for lack of gold per game.

### Compared with Civ

- Civ VII's happiness works because many things produce it: resources, many buildings, wonders,
  celebrations' policies, specialists cost it; Civ VI's amenities come mainly from luxuries
  (4 cities each) and entertainment districts. Here only base, aqueduct, temple, baths and a few
  wonders produce it.
- Civ V and VI never leave production idle: Civ VI always has projects, Civ V turns idle
  production into gold or research.
- Civ V's puppets (yields with a penalty, counts less) let conquest scale.

### Proposed

| # | Change | Kind |
|---|---|---|
| 2.1 | Luxuries (1.1, 1.2) are the main happiness source again | Fix |
| 2.2 | **Puppets**: a fourth capture choice; a puppet runs itself on balanced focus, can't build wonders or be micromanaged, gives 75% of its yields and counts half toward the settlement limit; annex later for gold | Fix (doc 03, 08) |
| 2.3 | Never lose production: an empty queue (or overflow with nothing queued) turns production into gold at the town rate; repeatable **district projects** in every specialty district (production → that district's yield + its great person points, Civ VI style), always available | Fix |
| 2.4 | The AI keeps a queue (projects as a fallback), builds happiness when settlements are unhappy, values the settlement limit and puppets captures that would push it over | Fix |
| 2.5 | Finish the town specializations (trade outpost: +range and a route slot; fort town: defense, healing, command radius; religious site: cheaper religious units; resort town: happiness and tourism from appeal) | Fix |
| 2.6 | Re-tune happiness after 2.1–2.4 so a well-run empire is content or better most of the game (target: under a third of settlements unhappy at turn 150 for the median civ); the −1 per maintained building and −2 per settlement over the limit become −1 per 2 buildings and −1 per settlement if the numbers still demand it | Taste (D107) |

## 3. Districts, buildings, adjacency and city planning

### How it works now

- 12 districts with adjacency (Campus: mountains, rainforest, reefs; Holy Site: mountains,
  woods; Theater: wonders, Entertainment Complex; Commercial Hub: river, Harbor; Harbor: city
  center, sea resources; Industrial Zone: mines and quarries, Aqueduct). Every specialty
  district also gets +0.5 per neighboring district. Limit: 1 + 1 per 3 citizens.
- District cost: 54 + 2% per tech and civic finished.
- 69 buildings, most of them a flat yield (Library +2 science, University +4...). The only
  choice between buildings is the worship building.
- 45 world wonders with placement rules, local yields and an empire effect.
- Great works with slots and theming.
- The settlement screen previews each tile's yield while placing a district.

### What the measurements and the code show

1. **The Holy Site has no natural wonder adjacency** (doc 03 and the brief list it).
2. **The Encampment does nothing on its own:** no adjacency, no yields, and no ranged strike
   (doc 03 says it has one).
3. **Twelve wonders have no placement rule** (St. Basil's, Taj Mahal, Big Ben, Eiffel Tower,
   Statue of Liberty, Broadway, Statue of Zeus, Great Zimbabwe, Porcelain Tower, CN Tower and
   two more), and many wonder effects are a flat trickle everywhere (Stonehenge +1 faith in
   every settlement, the Eiffel Tower +1 tourism everywhere, the Colosseum +1 happiness
   everywhere). Every wonder gets built in every game.
4. **Buildings never interact with planning:** a Library gives +2 whatever the Campus's
   adjacency, so a +6 Campus and a +1 Campus differ by 5 and no more for the rest of the game.
5. **No regional effects** (Civ VI's factories and power plants reach nearby cities).
6. **Missing districts:** the Neighborhood is in doc 03's table but not in the game; Civ VI's
   Dam, Canal, Aerodrome, Preserve and Water Park aren't either.
7. **The Nuclear Plant doesn't need a Power Plant** (a missing prerequisite).
8. **District mix (per game, all civs):** Industrial Zone 28, Commercial Hub 23, Holy Site 23,
   Aqueduct 22, Harbor 20, Campus 16, Spaceport 12, Theater 8, Encampment 6, Government Plaza
   6, Entertainment Complex 1.

### Compared with Civ

- Civ VI's best decisions come from adjacency multipliers (policy cards that double a
  district's adjacency, buildings that need a strong district), Government Plaza tiers with
  choices, regional power, and wonders whose placement shapes the city (Big Ben next to a
  Commercial Hub with a Bank, Broadway next to a Theater Square).
- Civ VII gives every building its own adjacency, so a well-placed quarter keeps paying.

### Proposed

| # | Change | Kind |
|---|---|---|
| 3.1 | Holy Site +2 per neighboring natural wonder | Fix |
| 3.2 | Encampment: a ranged strike like a settlement's, and +1 production per neighboring pasture or strategic resource | Fix |
| 3.3 | Placement rules for every wonder, and signature effects instead of "+1 in every settlement" (e.g. Stonehenge founds your pantheon; the Colosseum cheers settlements within 6 tiles; Big Ben next to a Commercial Hub with a Bank) | Fix |
| 3.4 | Nuclear Plant requires a Power Plant | Fix |
| 3.5 | Buildings in a district get a share of its adjacency (each tier adds a third of the district's adjacency bonus), so placement keeps paying all game | Taste (D108) |
| 3.6 | Regional effects: Factory, Power Plant and Stadium reach every one of your city centers within 6 tiles (the best one counts once per city) | Taste (D109) |
| 3.7 | Government Plaza buildings: three tiers with a choice of two or three each (Civ VI style) | Taste (D110) |
| 3.8 | New districts: Neighborhood (housing-style growth and happiness by appeal), Dam (river floods → production) and Preserve (appeal); Canal, Aerodrome and Water Park left out | Taste (D111) |

## 4. Lenses and filters

**Now:** six lenses (Yields for your own tiles, Settler, Resources, Religion, Loyalty, none),
cycled with L or picked under the minimap. No legend; the yields lens only covers owned tiles;
no filters. District adjacency shows only while placing a district.

**Proposed (Fix, functionality the docs list):** the rest of doc 06's table where it makes
sense: yields (all, or one yield as a heatmap, every explored tile), settler, adjacency for each
district type, appeal, resources (by class, single resource, owned or not), empire and borders,
religion, loyalty, trade routes and ranges, tourism, military (zones of control, threat),
continents, climate (temperature, rainfall, elevation), great works and governors, natural
wonders; filters for resource icons, yield icons, units, grid and clouds; a legend for each;
reachable from the picker and L. Plus map pins with notes and planning ghosts for districts and
wonders (section 3's planning tools).

## 5. Units, combat and war

### How it works now

- 81 units in 13 classes, with upgrade lines; unique units replace a base unit.
- Upkeep: 1 gold per unit (air 2–3), 3 free per player. Strategic resources not used (1.3).
- Commanders (Army Commander) pack up to 4 units; promotions per class (42).
- Combat: Civ VI's exponential formula from an integer table, modifiers for terrain, fortify,
  flanking, support, rivers, amphibious, wounds, class bonuses, walls; settlements strike.
- War support, surprise wars, peace after 10 turns.

### What the measurements and the code show

1. **The AI never builds a navy:** galleys, quadriremes, caravels, frigates, ironclads,
   destroyers and battleships were built 0 times in 6 games. Its production roles are melee,
   ranged and siege only.
2. **AI armies ignore counters:** it builds the strongest unit of a role, so its "melee" is
   whatever capturing unit is strongest (knights over pikemen) and anti-cavalry is never chosen
   on purpose. Cavalry, anti-tank and mechanized infantry were never built.
3. **Upkeep doesn't scale** (doc 03 says it does with era): a tank costs what a warrior costs.
4. **Dead ends and gaps in the roster:** Cavalry, Machine Gun, Destroyer, Battleship and
   Helicopter upgrade to nothing; there's no recon line past the Scout, no support units (doc 03
   lists rams, siege towers, medics), no Fleet Commander, no late navy (submarine, carrier,
   missile cruiser) and no anti-air.
5. 19 wars, 7 captures and 0.5 eliminations per game; 1,358 refused AI moves (no path).

### Proposed

| # | Change | Kind |
|---|---|---|
| 5.1 | AI: build and use navies on water maps (escorts, coastal sieges), compose armies with counters (anti-cavalry against cavalry, siege for cities) | Fix |
| 5.2 | Upkeep by era: 1 gold (Ancient–Classical), 2 (Medieval–Renaissance), 3 (Industrial–Modern), 4 (Atomic on) | Fix (doc 03) |
| 5.3 | Strategic resource costs on units (1.3) | Fix |
| 5.4 | Close the upgrade dead ends (Cavalry → Helicopter, Machine Gun → a late support unit, Destroyer and Battleship onward) | Fix |
| 5.5 | Roster additions: recon (Ranger, Spec Ops), support (Battering Ram, Siege Tower, Medic), Fleet Commander, late navy (Submarine, Carrier, Missile Cruiser), anti-air (Anti-Air Gun, Mobile SAM) | Taste (D112) |

## 6. Science, culture and the trees

### How it works now

63 techs and 46 civics over 9 eras, with boosts (40%); costs by era × speed. 13 governments,
35 policy cards in military, economic, diplomatic and wildcard slots. Eras, golden, dark and
heroic ages with dedications.

### What the measurements and the code show

1. **Empty nodes:** Synthetic Materials, Nuclear Fusion, Artificial Intelligence, Future Tech,
   Defensive Tactics, Cold War, Decolonization, Space Age, Environmentalism and World Federation
   unlock nothing and do nothing. (The trees' "unlocks" list also misses districts, wonders and
   projects, so some nodes look emptier than they are.)
2. **No boosts** on most Atomic, Information and Future techs and on every civic from Cold War on.
3. **Nothing to research at the end:** Future Tech isn't repeatable, so science (and culture)
   piles up unused in the last eras.
4. **The AI lives in Autocracy:** 80% of player-turns in Autocracy, 18% in Chiefdom; Monarchy
   1.2%, Merchant Republic 0.3%, Democracy 0.2%; the other eight governments never. The cause is
   a bug in the AI's valuation: it ignores conditions, so "+1 in the capital" counts as "+1 in
   every settlement".
5. **Policy cards:** 16 of 35 were never slotted; several are flat "+1 everywhere" (Civic
   Works, Patrons of Poetry, Temple Tithes, Festival Calendar, National Parks); none goes
   obsolete; none rewards adjacency; the dark-age cards doc 04 promised aren't there; the
   diplomatic slot has 5 cards.
6. **Ages work:** Normal 36%, Golden 32%, Dark 31%, Heroic 2%; dedications are varied.

### Proposed

| # | Change | Kind |
|---|---|---|
| 6.1 | Give every empty node something worth having (an improvement upgrade, a building, a project, a policy or a lasting effect) and every node a boost | Fix |
| 6.2 | Repeatable Future Tech and Future Civic (each adds score and a little era score) | Fix |
| 6.3 | AI values effects by where their conditions hold, picks governments by slots and effects, and moves up the tiers | Fix |
| 6.4 | Rework the flat cards into conditional ones; obsolete early cards when their upgrade arrives; adjacency cards (Civ VI's "+100% Campus adjacency" family); three dark-age cards; more diplomatic cards | Fix |
| 6.5 | Trees' "unlocks" lists include districts, wonders and projects | Fix |
| 6.6 | Government legacy bonuses (Civ VI: the longer you keep a government, the bigger its lasting bonus) | Taste (D113) |

## 7. Economy and the other yields

### How it works now

Gold from tiles, buildings, districts and routes; maintenance on buildings, upkeep on units;
buying at 4 gold per production. Trade routes: domestic +2 food +2 production; international +4
gold +1 per destination district, +1 at the destination. Influence +2 a turn plus buildings.
Faith buys religious units and great people (not prophets). Tourism from wonders, works and a
few buildings.

### What the measurements and the code show

1. **Net gold collapses late:** +61 at turn 250, +29 at 300, +5 at 400, as maintenance grows
   and income doesn't.
2. **Trade routes don't scale:** +4 gold or +2/+2 are worth a lot at turn 40 and nothing at
   turn 300.
3. **Faith outgrows science** (95 vs 67 at turn 400) and goes into ~160 religious units per game
   (83 apostles, 52 inquisitors, 25 missionaries) that convert settlements back and forth (376
   conversions a game); no religious victory in any game.
4. **Tourism stays tiny** (7 a turn at turn 400 against 34 culture), so a culture victory is out
   of reach: tourists come from tourism ÷ 150, domestic ones from culture ÷ 100.
5. **No late-game sinks** for gold, faith or influence beyond buying units, buildings and great
   people.

### Proposed

| # | Change | Kind |
|---|---|---|
| 7.1 | Trade route yields grow with the destination: +1 per district there (domestic: food and production; international: gold), and +1 per era for international routes | Fix |
| 7.2 | AI: a budget for religious units (and none when it can't win the religious race), gold kept for upkeep | Fix |
| 7.3 | Late-game sinks: buy district projects and space projects with gold at a premium; faith buys buildings in settlements following your religion; influence buys envoys, levies and congress votes (already) and endeavors if approved | Taste (D114) |
| 7.4 | Tourism that can win: great works and wonders give more tourism in later eras, national parks and seaside resorts (appeal), +25% tourism per open-border or trade partner | Taste (D115, with victory targets D117) |

## 8. Great people, religion and the other systems

### What the measurements and the code show

1. **The great people run out.** Scientists 4, engineers 3, merchants 3, generals 3, admirals 3,
   none after the Medieval era. All 41 people were claimed by turn ~190 in every game; from
   then on Campus, Industrial Zone, Commercial Hub, Harbor and Encampment points buy nothing.
   Most activations are a lump of yield.
2. **Religion** founds early (first religion turn 79, 3.3 per game) and then becomes a unit war
   (above).
3. **City-states:** quests are only "build our district" and "send a trade route" (doc 04: more
   to come). Suzerain bonuses are fine.
4. **Diplomacy:** deals can't include resources, open borders, research agreements or promises
   (doc 04).
5. **Congress:** diplomatic victories at turns 363 and 438; resolutions vary.
6. **Espionage:** Skim the Treasury is 54% of missions, Make Contacts 27%; Stir Discontent and
   Lift a Masterpiece never run.
7. **Governors** are used evenly; climate and disasters work (58 disasters a game).

### Proposed

| # | Change | Kind |
|---|---|---|
| 8.1 | Great people for every era in every class (Renaissance to Information scientists, engineers, merchants, generals and admirals), with distinct effects (finish a wonder's share, a free building, boosts in their field, a district's adjacency, a trade route...) | Fix |
| 8.2 | AI religious budget (7.2) | Fix |
| 8.3 | More city-state quests (clear a camp near us, train a unit of our kind, convert to a religion, send envoys) | Fix (doc 04) |
| 8.4 | Resources in deals (luxury and strategic, per turn) | Fix (doc 04) |
| 8.5 | AI spies use the full mission list where it makes sense | Fix |
| 8.6 | One great person per class per era (Civ VI's timeline) instead of a fixed list | Taste (D116) |

## 9. Victories, score and the endgame

**Measured (Standard):** science 4 of 6, diplomatic 2 of 6, between turns 363 and 485; culture,
religion and domination never.

| # | Change | Kind |
|---|---|---|
| 9.1 | Score counts great people (5), religion founded (10) and settlements following it (1), great works (2), future techs and civics (5) and era score | Taste (D50 → D117) |
| 9.2 | Victory targets per speed (Standard: decisive wins from about turn 300; each of the six types happens in simulation), culture and religion reachable | Taste (D117) |
| 9.3 | After a win, "one more turn" keeps playing | Fix (check) |

## 10. Difficulty, speed, map size and start era

- **Start eras** give the techs, gold and units of the era, but settlements still start at 1
  citizen with nothing built, so a Medieval start is an Ancient start with more techs. Civ VI
  gives later-era cities population, buildings and districts. **Fix:** era starts give founded
  settlements population and the era's basic buildings (content: `era.start`). Built in 2D.

### Measured before and after the pass

Each batch varies one setting around the base setup (6 civs, Continents on a Small map,
Prince, Ancient start); all but the speed batch play at Online speed (half costs) so they
finish quickly. The baseline ran two to four seeds per setting, the final sweep seeds 1 and 2
(only seed 1 for the start eras and the two biggest maps), so each table puts the final games
next to the baseline games on the same seeds, then the whole baseline row. A row is a handful
of games: read them as a direction, not a measurement to the turn. Each cell is the turn of
the first decisive win and its kind.

**Speed** (6 civs, Continents on a Small map, Prince):

| Speed (costs, turn limit) | Final | Baseline, same seeds | Baseline, all seeds |
|---|---|---|---|
| Online (50%, 250) | 163 science, 174 science | 225 science, 180 diplomatic | 180–246 (average 218): 3 diplomatic, 1 science |
| Quick (67%, 330) | 214 science, 170 culture | 276 diplomatic, 228 culture | 228–295 (average 268): 2 diplomatic, 1 culture, 1 science |
| Standard (100%, 500) | 277–385 (average 316, seeds 1–6): 4 science, 1 culture, 1 diplomatic | | 363–485 (average 413): 4 science, 2 diplomatic |
| Epic (150%, 750) | 469 science | 559 science | 559 and 693: 2 science |
| Marathon (300%, 1,500) | 788 science | 1,500: the turn limit, won on score | |

Game length follows each speed's costs, before and after: an Online game lasts about 0.53 of
a Standard one, Quick about 0.6 and Epic 1.5. The whole curve moved about a quarter earlier
and mostly sits on D117's target scaled by cost (Standard 300–400, so Online 150–200, Quick
200–270, Epic 450–600, Marathon 900–1,200). Marathon now ends in a decisive win instead of
running into its 1,500-turn limit, on turn 788: about 2.8 times the same map's Standard game
(285), a little short of its scaled target, since the eras pass 2.3–2.8 times slower rather
than 3.

**Map size** (Online speed; Duel 2 civs, Tiny 4, Small 6, Standard 8, Large 10, Huge 12):

| Size | Final | Baseline, same seeds | Baseline, all seeds |
|---|---|---|---|
| Duel | 129 culture, 133 diplomatic | 148 diplomatic, 134 diplomatic | 134–157: 3 diplomatic |
| Tiny | 160 diplomatic, 173 diplomatic | 150 diplomatic, 212 science | 150–212: 2 diplomatic, 1 science |
| Small | 163 science, 174 science | 225 science, 180 diplomatic | 180–225: 2 diplomatic, 1 science |
| Standard | 178 science, 194 science | 230 diplomatic, 247 diplomatic | 146–247: 3 diplomatic |
| Large | 196 science | 186 science | 186 science, 201 diplomatic |
| Huge | 164 science | 233 diplomatic | 233 diplomatic; 250, the turn limit, won on score |

- The diplomatic victory won 12 of the 16 baseline size games, at every size. With 24 points
  instead of 20 it wins 3 of the 4 Duel and Tiny games and none from Small up, where science
  wins all six.
- Length barely depends on the size (131 turns on Duel, 164–196 from Small to Huge), as before
  (146, then 194–242): a leader's pace comes from its own empire, not from the number of rivals.
- Turn time grows with the map and the number of civs, more than before the pass. Measured
  alone at turn 120 (Standard speed, one process): 8 civs on a Standard map take 1.27 s of
  turn processing (1.22 s before the pass), 12 civs on a Huge map 2.05 s (1.53 s before), and
  all 12 AIs 1.04 s (0.73 s). See section 12.

**Difficulty** (Online speed). The first seat plays at Prince and the other five AIs at the
level, so its final place by score shows what the level's bonuses are worth:

| AI level | Final (Prince civ's place) | Baseline, same seeds | Baseline, all seeds: Prince civ's places |
|---|---|---|---|
| Settler | 224 science (1st), 185 diplomatic (1st) | 185 diplomatic (1st), 197 diplomatic (1st) | 1st, 1st, 1st |
| Warlord | 189 diplomatic (1st) | 193 diplomatic (2nd) | 2nd, 1st, 1st |
| Prince | 163 science (3rd), 174 science (2nd) | 225 science (2nd), 180 diplomatic (1st) | 2nd, 1st, 1st |
| King | 146 diplomatic (3rd) | 165 diplomatic (4th) | 4th, 1st, 1st |
| Emperor | 146 science (6th) | 123 diplomatic (6th) | 6th, 1st, 4th |
| Deity | 133 science (6th), 143 science (6th) | 159 science (6th), 175 science (4th) | 6th, 4th, 5th |

The ladder is cleaner: the Prince civ comes first against Settler and Warlord AIs, mid-table
among equals and against King, and last against Emperor and Deity. In the baseline it won two
of three games against King AIs and one against Emperor, partly because the first seat was
always processed first (now the order rotates, 2D). Games end sooner as the AIs get stronger
(Settler 204 turns on average, Deity 138), as before (182 and 161) but more steadily.

**Start era** (Online speed; the final sweep ran seed 1 only):

| Start | Final | Baseline, seed 1 | Baseline, seed 2 |
|---|---|---|---|
| Ancient | 163 science | 225 science | 180 diplomatic |
| Classical | 161 science | 152 diplomatic | 199 science |
| Medieval | 151 science | 189 diplomatic | 144 diplomatic |
| Renaissance | 142 science | 157 diplomatic | 158 culture |
| Industrial | 135 science | 177 diplomatic | 137 diplomatic |
| Modern | 135 science | 127 diplomatic | 137 diplomatic |
| Atomic | 134 science | 168 science | 116 religion |
| Information | 140 science | 156 science | 127 diplomatic |

A later start now shortens the game a little and steadily (163 turns from the Ancient era,
134–140 from the Industrial era on) where before it was noisy (116–199). Settlements founded in
a later era start bigger and with the era's buildings, but most of a game's turns are now spent
in the last two eras (240% and 300% costs, 2G), which every start goes through: an
Information-era start still lasts 140 Online turns, so a late start skips the opening rather
than making a short game.

**Map script** (Online speed, 6 civs, Small, seeds 1 and 2; the baseline on the same seeds):

| Script | Final | Baseline |
|---|---|---|
| Continents | 163 science, 174 science | 225 science, 180 diplomatic |
| Pangaea | 92 culture, 192 culture | 235 science, 195 science |
| Archipelago | 205 diplomatic, 195 diplomatic | 158 diplomatic, 162 diplomatic |
| Fractal | 183 science, 163 diplomatic | 231 diplomatic, 209 diplomatic |
| Small Continents | 250 (the turn limit, won on score), 184 diplomatic | 231 science, 224 diplomatic |
| Island Plates | 211 science, 166 science | 216 diplomatic, 176 diplomatic |
| Inland Sea | 180 science, 144 culture | 250 (the turn limit, won on score), 197 science |
| Continents and Islands | 176 science, 178 science | 146 diplomatic, 216 science |
| Highlands | 148 culture, 150 culture | 219 culture, 226 science |
| Lakes | 204 culture, 202 science | 204 science, 177 science |
| Mirror | 198 science, 137 culture | 125 diplomatic, 119 religion |

- On varied maps the mix is much closer to D117's: of the 22 games, science won 10, culture 7
  and diplomacy 4, and one ran to the turn limit (the baseline: diplomatic 10, science 9, and
  culture, religion and the turn limit 1 each). Culture now wins on five of the eleven scripts,
  sometimes early (137–150 turns on Highlands, Inland Sea and Mirror, about 275–300 at
  Standard; and turn 92 in the Pangaea game where one civ built 26 of the 34 wonders, see
  "One AI takes most of the wonders" below). Archipelago still goes to diplomacy.
- The average game is 177 turns (196 before), inside D117's Online range (150–200).

**Optional systems off** (Online speed, Continents on a Small map; no barbarians,
city-states, tribal villages, loyalty, spies, World Congress, disasters, nuclear weapons or
religion, and no diplomatic victory): the baseline's three games ended at the 250-turn limit
twice and by science on turn 248 once; now all three end by science, on turns 158, 193 and
193. The core game alone grows and finishes.

**The victory mix across the sweep.** The 27 distinct games of the final speed, size, difficulty
and start-era batches: science 19, diplomatic 6, culture 2 (the baseline's 53 games on the same
settings: diplomatic 33, science 15, culture 2, score 2, religion 1). The batches reuse seeds,
so the same map and civs come back: seed 1's Small map made 15 of the 27 games and Korea won 14
of them (13 by science), at every speed, difficulty and start era; the other 12 games went 6
science, 4 diplomatic and 2 culture. Korea's kit is the strongest science stack in the game
(Campuses +1 science per neighboring hills and built 25% faster, Libraries +1 science, +50%
great scientist points, a science-first personality); with more rivals on the same seed (the
Standard and Huge maps) it didn't win. On Continents science has replaced diplomacy as the
usual winner; across the other map scripts culture is close behind (above). Religion and
domination still never win an AI game: that's D121.

## 11. Turn flow and quality of life

**Now:** Next Action covers captures, units, growth choices, production, dedications, the
Congress, research, civics and policies; a mid-game save played through it in the browser for
several turns without errors. Missing: auto-explore, alert (sleep until an enemy is seen),
repeat production, quick save and load keys, notification settings, the turn summary when
resuming a game, waypoints.

**Proposed (Fix):** auto-explore, alert, repeat in queues, quick save (F5) and quick load (F9),
notification settings (which ones stop the turn), the turn summary on resume. Undo is a known
gap (section 13).

## 12. Performance and robustness

**Measured (`pnpm cx profile 8 120 1 standard --check`, one cloud core):** turn processing
averages 1.22 s at turn ~120 before the pass and 1.27 s after it; the AIs 0.54 s → 0.63 s; the
save 1.03 MB (45 KB gzipped). The check passes. On the way, two new systems made turns twice as
slow by re-reading the whole map through the Immer draft for every settlement (monopolies,
then luxuries); both now read the state as the action began, once per action. Hundreds of
simulated games (over 50,000 turns) ran without an engine error.

**On the biggest map** (`pnpm cx profile 12 120 1 huge`, 12 civs) the pass costs more: 1.53 s
→ 2.05 s of turn processing at turn 120, the AIs 0.73 s → 1.04 s. A CPU profile of both
versions spreads the difference over many places (effects from the new sources about a
third, copying a bigger state a quarter, then barbarians, city-states and the AI's deals).
Three things were cheap to fix without changing a single game (the same state hashes on the
Standard and Huge checks): regional buildings are found once per player instead of by every
settlement scanning every other one, loyalty works out the turn's effects once for all
settlements, and research agreements are skipped when none are running. Those took about 3%
off; the rest is the price of a richer game, and the next step there is the one doc 01
already names (reading the unchanged parts of the state without Immer proxies).

## 13. Known gaps: what the final game should have

Each is a taste call (D118). Recommended:

| Gap | Recommended | Why |
|---|---|---|
| Open borders and research agreements | **Build** | Cheap, Civ-standard diplomacy, gives influence a use |
| Ideologies (Civ V-style pressure from tourism) | **Build, light** | Late-game tension between friends; pairs with tourism |
| National parks | **Build** | Appeal and tourism need it |
| Corporations and monopolies | **Build, light** (Civ VI monopolies: control most of a luxury for empire bonuses) | Gives luxuries a late-game role |
| Endeavors and sanctions | Later | Needs influence economy tuning first |
| Crises | Later | Optional chaos, low value |
| Ages mode (civ switching) | Later | Big system, off by default anyway |
| Earth map with true starts | Later | Map work, separate from mechanics |
| Undo (single player) | **Build** for movement only | Saves misclicks; full undo conflicts with hidden information |
| "Your turn" notifications | **Build** (browser notification) | Small, helps online games |
| Spectators | Later | Online feature, not mechanics |

## 14. Other things worth adding

- **Catch-up:** Civ's techs known by many civs cost less (Civ IV/VII); proposed −5% per civ you've
  met that knows it, up to −25% (Taste, D119).
- **The opening 30 turns:** scout, village, capital, first growth choice and first wonder race
  all happen; the first great person comes around turn 37. Fine.
- **A lead that runs away:** in the baseline the leader doesn't run away (score ranks stay
  mixed), but the world gangs up only through the AI's agendas. Proposed: the World Congress
  can call an emergency against a civ close to winning (Taste, D120).

---

## Phase 2: what was built

Payton approved every recommended default (D106–D120), the four groups of known gaps in D118,
"fix first, then tune" for happiness and the turn 300–400 target with every victory type.

### 2A–2B: the economy core and strategic resources

- **1.1** Resource tiles take only their own improvement once it's known, and a placeholder is
  replaced the turn it unlocks; growth reaches for luxuries and strategic resources first.
- **1.2** Luxuries cheer their settlement and the 3 nearest others, each kind once per
  settlement.
- **1.3** Strategic resources: hidden until their tech, stockpiles with a cap by era, costs to
  train and upgrade (uniques inherit), upkeep for Industrial-era units and later with −20
  strength when short, Oil Wells and Offshore Platforms, older units stay buildable without the
  newer one's resource. The AI only builds units whose upkeep it can carry.
- **1.4** Resources placed by frequency (Small map, seed 7: iron 2 → 7, coal 1 → 5, uranium
  20 → 2), luxury clusters, a luxury and horses or iron near every start.
- **1.5** Chop rewards scale with speed and +25% per era.
- **2.2** Puppets (capture choice, −25% yields, half toward the limit, self-chosen builds,
  annex for gold); the AI puppets captures that would put it over the limit.
- **2.3** Idle production and stray overflow become gold; nine repeatable district projects.
- **2.6 (D107)** Building upkeep is −1 happiness per 2 maintained buildings and −1 per
  settlement over the limit: with luxuries fixed, the AI built 50% more buildings by turn 250
  and the old −1 per building put its cities back into unrest.
- **6.3** The AI values an effect only where its condition holds (it no longer thinks "+1 in
  the capital" is "+1 everywhere"), and picks a district project rather than idling.

### 2C: content depth

- **8.1** 28 more great people (69 in all), every class through the Information era, with
  `finish` and `envoys` activations; yields scale with speed.
- **6.1, 6.2** Every empty tech and civic does something; boosts on every late node; repeatable
  Future Tech and Future Civic.
- **1.8** Improvements improve through the tree (13 upgrades on 11 nodes).
- **3.1, 3.2, 3.4** Holy Site natural-wonder adjacency; Encampment adjacency and ranged strike;
  the Nuclear Plant needs a Power Plant.
- **3.3** Placement rules for every wonder; signature effects for the eight that were
  empire-wide trickles.
- **3.5 (D108), 3.6 (D109)** Buildings add a third of their district's adjacency; regional
  Factory, Power Plant and Stadium (and three wonders).
- **6.4** Policy rework: adjacency cards, obsolescence, three dark-age cards, eight new cards on
  civics that had none; slotted cards that go obsolete leave their slots.
- **1.9 (D106)** Eight more luxuries (Dyes, Furs, Ivory, Marble, Salt, Sugar, Tea, Cotton), 15
  in all, each with its own map icon.
- The flat pantheons became conditional (Hearth Goddess: Granaries; Harvest Rites: Wheat, Rice
  and Cattle; God of the Forge: Mines).

### 2D, part 1

- **Measured after 2C** (4 Standard games): the economy grows now (turn 250: science 97 vs 61,
  production 198 vs 128, gold 180 vs 111, population 101 vs 66), the first culture victory
  happened, and games end at turns 229–279: faster than D117's 300–400, to be tuned with the
  trees' costs once the rest of 2D is in.
- **1.6** Appeal; national parks, seaside resorts and resort towns built on it.
- **1.7** Continents; Lincoln's home-continent happiness.
- **5.2** Unit upkeep by era.
- **10** Later-era starts: bigger settlements with the era's basic buildings.
- **2.5** Fort towns, religious sites and trade outposts finished.
- **7.1** Trade routes grow with the destination's districts and the era.
- **9.1 (D117)** Score: great people, religion, great works, future techs and civics.
- **D119** Catch-up research.

### 2D, part 2

- **Fair turn order.** In the 72 baseline games the first seat won 21 times (about 12
  expected): its settlements were processed first every turn, so it won same-turn wonder races
  and great person ties, and among AIs it acted first. The processing order now rotates by one
  seat each turn (D51's hotseat order for humans is unchanged).
- **D118 deals:** resource trades (spare luxury copies, strategic resources per turn out of the
  sender's income), open borders (+25% tourism toward each other, units heal there as at home)
  and research agreements between friends (+10% science each while they run, a boost each at
  the end), paid in influence (D114). War ends them; a sender that can't deliver breaks the deal.
  The AI swaps spare luxuries, offers open borders and research agreements, values a luxury by
  the happiness it brings, and no longer tries to buy a unit whose resources aren't stockpiled.
- **D115** Great works and wonders draw +25% tourism per era past their own, up to double.
- **D120** Emergency sessions: a civ three quarters of the way to any victory faces a
  containment vote (−15% toward that victory for 20 turns if it passes).
- **D118** Light monopolies (more than half of a luxury's tiles: an empire bonus per luxury)
  and light ideologies (three camps of late governments; rival camps' tourism costs happiness,
  the AI picks its camp with that in mind).
- **D113** Government legacies (every 25 turns in a government: a lasting bonus of its kind, up
  to 3). **D110** Six Government Plaza buildings in three exclusive pairs. **D114** Gold buys
  repeatable district projects; a founder's faith buys buildings where its religion is
  followed (the AI keeps faith for its religious units).
- **D111** Neighborhood, Dam and Preserve. **D112** Eleven units: Ranger, Spec Ops, Battering
  Ram, Siege Tower, Medic, Fleet Commander, Submarine, Nuclear Submarine, Missile Cruiser,
  Anti-Air Gun, Mobile SAM, with support-unit rules (walls, healing) and the upgrade dead ends
  closed. The AI builds the recon and naval ones through its usual choices but not support
  units, anti-air or the Fleet Commander (a known gap).
- **D118** Undo for moves that revealed nothing (single player, Ctrl+Z) and "your turn"
  browser notices in online games (with a switch in Options).

### 2E: the client

- **Section 4:** thirteen lenses with legends (adjacency, appeal, empires, continents,
  military, trade and natural wonders are new; yields covers every explored tile).
- **Section 11:** Explore and Alert orders, repeat production, quick save and load (F5/F9), a
  "welcome back" summary when a save is resumed, unlock lists with districts, wonders, projects
  and revealed resources, strategic stockpiles in the top bar, and a switch for online turn
  notices.
- **9.3** "One more turn" after a win (it wasn't possible: every action was refused once a game
  ended).
- Not done: one-yield heatmaps, resource filters, tourism/climate/great works/governors lenses,
  map filters, pins and planning ghosts, and settings for which notices stop the turn.

### 2F: the AI and the last fixes

- **8.3** Three more city-state quests (bring your religion, earn a great person of its kind,
  field a siege unit).
- **7.2** The AI spends banked faith on more preachers, keeping a reserve (one game had banked
  9,695 faith).
- **5.1 (part)** The AI counts a class's bonus against what its enemies field (two or more
  seen) as strength when it picks a soldier (anti-cavalry against cavalry, anti-air against
  aircraft), and armies at war bring a siege tower or a battering ram. Navies (escorts,
  coastal sieges) are still missing.
- **8.5** AI spies also stir discontent in wartime, and culture-minded leaders try to lift
  masterpieces in peace.
- **12** Turn speed: see section 12.

### 2G: pace (D117)

After 2A–2C the economy grew as intended, and games got much shorter: the space race finished
around turn 230–280 at Standard because all four space projects unlocked in the Modern era.
Each round below is the same six Standard games (6 civs, Continents on a Small map, Prince):

| Measured | First decisive win (Standard) | Victories |
|---|---|---|
| Baseline (PR #58, 6 games) | 363–485 | 4 science, 2 diplomatic |
| After 2C (4 games) | 229–279 | 2 science, 1 culture, 1 diplomatic |
| After 2D (6 games) | 230–281 | 5 science, 1 diplomatic |
| Projects follow the tree, late eras 110–185% (3 games) | 266–283 | 3 science |
| Late eras up to 210%, projects +40%, 50 tourism a visitor (3 games) | 275–303 | 3 science |
| Up to 250%, projects 1000–2200, 15-turn journey, tech-based containment (2 games) | 284–288 | 2 science |
| **Final:** Information 240%, Future 300%, 20-turn journey (6 games) | **277–385 (average 316)** | **4 science, 1 culture, 1 diplomatic** |

**Where it ends up (final six games):** half the civs reach the Classical era on turn 48,
Medieval 95, Renaissance 123, Industrial 162, Modern 200, Atomic 246, Information 277 and the
Future 326 (the first civ on turn 267), close to Civ VI's Standard pacing, and the first
decisive win lands between turns 277 and 385. D117's pace target is met; its victory-mix target
(every type, none over 40%) is not: science still wins four games in six, and religion and
domination none at Standard (open decision D121).

| Median civ (Standard) | Turn 50 | 100 | 150 | 200 | 250 | 300 |
|---|---|---|---|---|---|---|
| Settlements | 3 (3) | 6 (6) | 6 (6) | 7 (6) | 7 (6) | 7 (6) |
| Population | 12 (13) | 40 (34) | 70 (52) | 87 (64) | 92 (67) | 100 (66) |
| Science / turn | 9 (9) | 29 (22) | 56 (37) | 100 (54) | 128 (61) | 158 (65) |
| Culture / turn | 5 (5) | 9 (10) | 25 (13) | 74 (19) | 127 (24) | 189 (27) |
| Production / turn | 22 (26) | 69 (51) | 147 (86) | 233 (113) | 294 (130) | 374 (145) |
| Gold / turn | 12 (9) | 32 (19) | 58 (44) | 179 (79) | 284 (106) | 375 (127) |
| Faith / turn | 3 (2) | 14 (15) | 52 (39) | 115 (56) | 117 (70) | 161 (83) |
| Tourism / turn | 0 (0) | 1 (0) | 3 (1) | 7 (2) | 18 (3) | 51 (5) |
| Unhappy settlements | 0 (1) | 0 (3) | 1 (4) | 2 (5) | 3 (6) | 4 (6) |

(Baseline in brackets.) The economy keeps growing to the end instead of flattening at turn
250, tourism finally becomes a force in the late game, and unhappiness stays a pressure rather
than a permanent state (D107's target, under a third of settlements unhappy at turn 150, is met).

Why science kept winning: one AI with a science personality and a good start stacks campus
adjacency (doubled by a policy card, shared by its buildings), a +15% dedication and a founder
belief, and by turn 120 makes 3–5 times the science of anyone else (182 against 25–44 in one
game). Raising late costs moves its finish less than one would expect, because its science
keeps growing; the other AIs barely invest in science or tourism. See "What's still weaker
than Civ" below.

## What's still weaker than Civ, and what it would take

- **Victory variety in AI games.** Science wins most simulated games: four of the six Standard
  games, and 10 of 22 on the varied map scripts, where culture took 7. Religion and domination
  never win. Culture, religion and domination are reachable (tourism converts three times faster,
  containment slows a runaway, armies bring wall-breakers) but AIs rarely build toward them on
  purpose. It would take victory-minded AI strategies: a culture AI that chases wonders, great
  works, national parks and open borders; a religious AI that floods rivals with apostles; a
  conqueror that plans sieges with navies.
- **One AI out-researches everyone.** Science stacking (adjacency cards that double a Campus,
  buildings sharing it, dedications, founder beliefs) is strong for whoever leans into it, and
  most AI personalities invest little in science, so the gap reaches 3–5×. Options: soften the
  doubling cards (+50%), or make every AI keep a Campus and a Library in its larger cities.
- **One AI takes most of the wonders.** In a typical game one civ builds over half of them
  (median 60% of the wonders built, up to 90%; 56% before the pass): an AI only starts a
  wonder it can finish within 20–40 turns (by its personality), so the civ with the most
  production qualifies for nearly all of them, and none weighs whether a rival is about to
  finish one. With tourism converting three times faster, a wonder hoarder can now win by
  culture very early on a shared continent (Pangaea, seed 1: Brazil built 26 of the 34
  wonders and won on turn 92 at Online speed, about turn 185 at Standard). It would take an
  AI that steers away from wonders a rival is ahead on, or wonders' tourism tuned down (part
  of D121).
- **Navies.** The AI builds ships but doesn't escort, blockade or siege from the sea; the
  Fleet Commander, support units' AI use beyond wall-breakers, anti-air and the new ships are
  mostly for human players for now.
- **Lenses and planning:** one-yield heatmaps, resource filters, tourism and climate lenses,
  map pins and planning ghosts are not built.
- **Turn time on big maps.** A 12-civ Huge game spends about 2 s on each turn by turn 120, a
  third more than before the pass (section 12); late in such a game it's longer. It runs in a
  background worker, so the page stays responsive, but the wait is felt. The fix is the
  structural one doc 01 describes, not more caching.
- **Deferred by D118:** endeavors and sanctions, crises, Ages mode, an Earth map, spectators;
  undo only covers moves in single player.

