# 03 — Core mechanics

The core is always on. Optional systems are in [04-advanced-systems.md](04-advanced-systems.md).

**Every number in this doc is a starting value**, stored in `content/base/rules.json` (or the
relevant content file) so mods and balance passes can change it without code changes. Where we
deliberately differ from Civ 6, the doc says so and gives a reason.

---

## 1. Map

### Grid

- **Hexagons**, pointy-top, using axial coordinates `(q, r)` internally.
- **Wraps horizontally** (cylindrical world). This is a host option; a non-wrapping map is also available.
- One tile holds: terrain, an optional feature, elevation (flat / hills / mountain), an optional
  resource, an optional improvement, an optional district/wonder, plus river edges, roads, owner and appeal.

### Map sizes

| Size | Tiles (w × h) | Recommended players | City-states |
|---|---|---|---|
| Duel | 44 × 26 | 2 | 3 |
| Tiny | 60 × 38 | 3–4 | 6 |
| Small | 74 × 46 | 4–6 | 9 |
| Standard | 84 × 54 | 6–8 | 12 |
| Large | 96 × 60 | 8–10 | 15 |
| Huge | 106 × 66 | 10–12 | 18 |

### Map generation

Map types (V1 final, F7), twelve of them:
- **Continents**, **Small Continents** (five) and **Continents and Islands** (islands scattered
  across the oceans).
- **Pangaea** and **Highlands** (one rugged landmass of hills and ranges).
- **Archipelago** and **Island Plates** (large islands).
- **Fractal**.
- **Inland Sea** (a ring of land around a central sea) and **Lakes** (wide land dotted with
  lakes).
- **Mirror** (each half reflects the other, for fair duels and team games).
- **Shuffle** (any of the others, picked from the seed).

Still planned: Terra (old world and new world) and Earth with true start locations.

**World settings** (setup → Advanced → Map, and the Map Lab), with constants in
`rules.mapgen.world`:
- **World age:** new means 150% mountains and 130% hills; old means 60% and 75%.
- **Temperature:** cool or hot shifts the climate 12 points, giving more tundra and snow or
  more desert and jungle.
- **Rainfall:** arid means −18 moisture and 65% of the usual woods and marsh; wet means +15 and
  135%.
- **Sea level:** low means +8% land; high means −8%.

The natural wonder count comes with the map size (2 on Duel up to 8 on Huge).

Generation is a pipeline of seeded steps, driven by content wherever possible (map types and
sizes are content; each terrain declares the temperature/moisture box it belongs in; each feature
declares its placement chance and climate). Preview any map with `pnpm cx map pangaea small 42`.
All math is integer-only so every browser generates the identical map from the same seed.

1. **Landmass shape**, chosen by the map script (continents, pangaea, islands...).
2. **Elevation:** mountains along "plate" boundaries, hills in clusters.
3. **Climate:** temperature by latitude and moisture by noise and rain shadow, giving terrain type.
4. **Rivers:** they start in high moisture or elevation, flow downhill along tile *edges*, and end at
   the coast or a lake.
5. **Features:** woods, rainforest, marsh, floodplains (along desert/plains rivers), oasis, reef, ice.
6. **Resources:** placed by terrain rules, with per-region balancing.
7. **Natural wonders** (built in F7): sixteen of them, each a special feature
   (`feature.naturalWonder`) placed after the starts. They sit at least 5 tiles apart and 3 from
   any start, and only where they fit: Kilimanjaro, Everest, Fuji, the Matterhorn and Torres del
   Paine on mountains; Uluru, the Grand Canyon, the Dead Sea and the Eye of the Sahara in deserts;
   Victoria Falls, Yosemite, the Pantanal and the Giant's Causeway on green land (the Causeway on
   the coast); the Great Barrier Reef, the Galápagos and Ha Long Bay in coastal waters.
   - Some can be worked for their own yields (the reef: 3 food and 2 science).
   - Most give their neighbors yields (Kilimanjaro: +2 food to every tile next to it), which shows
     in each tile's "why?" breakdown.
   - Nothing can be founded, built or improved on them.
   - In 3D each has its own landmark.
   - Discovering them will count toward era score (F8).
8. **Start positions:** the scorer guarantees minimum food, production and fresh water within 2
   rings, and respects civ start biases (coast, river, hills, tundra...).
9. **Fairness pass:** every start is topped up to a minimum food and production (adding bonus
   resources, woods or hills). In *Balanced* mode, weaker starts are also raised to about 90% of
   the best one. (*Mirrored* mode is in the backlog.)
10. **City-states and barbarian spawn zones.**

### Terrain (base yields: 🍞 food, ⚙️ production, 💰 gold)

| Terrain | Yield | Move cost | Notes |
|---|---|---|---|
| Grassland | 2🍞 | 1 | |
| Plains | 1🍞 1⚙️ | 1 | |
| Desert | — | 1 | Floodplains/oasis make it valuable |
| Tundra | 1🍞 | 1 | |
| Snow | — | 1 | |
| Coast / Lake | 1🍞 1💰 | (embarked) 1 | Lake provides fresh water |
| Ocean | 1🍞 | (embarked) 1 | Needs a later tech to enter |
| **Hills** (modifier) | +1⚙️ | +1 | +3 defense, better vision |
| **Mountain** | — | impassable | Blocks vision, gives adjacency to some districts |

### Features

| Feature | Yield change | Move cost | Removable | Notes |
|---|---|---|---|---|
| Woods | +1⚙️ | +1 | yes (chop) | +3 defense |
| Rainforest | +1🍞 | +1 | yes (chop) | +3 defense |
| Marsh | +1🍞 | +1 | yes | |
| Floodplains | +3🍞 on desert, +1 on others | 0 | no | Can flood (disasters module) |
| Oasis | +3🍞 +1💰 | 0 | no | Fresh water |
| Reef | +1🍞 +1⚙️ | +1 | no | Coast only |
| Ice | — | impassable | no | |

### Rivers

- Rivers run along tile edges. A tile next to a river has **fresh water** (faster growth for a
  settlement on it, and better farms).
- **Crossing a river** uses all remaining movement (until Bridge Building). Attacking across a river
  gives the attacker −5 combat strength.
- Rivers give adjacency bonuses (e.g., Commercial Hub +2) and make floodplains possible.
- **Navigable rivers** (from Civ 7): the largest rivers are marked navigable. Boats can travel
  along them, so inland settlements on them count as coastal for harbors and naval trade, and
  they can be attacked by ships. Land units cross navigable rivers only by embarking (or by bridge,
  later).

### Resources

| Type | Effect | Examples |
|---|---|---|
| Bonus | Extra tile yield | Wheat, Rice, Cattle, Sheep, Deer, Fish, Stone, Copper, Bananas |
| Luxury | Tile yield + **happiness** in the settlement that owns it and up to 3 others nearby | Silk, Spices, Wine, Incense, Diamonds, Pearls, Whales |
| Strategic | Accumulates a **stockpile** per turn that units and buildings consume | Horses, Iron, Niter, Coal, Oil, Aluminum, Uranium |

Strategic resources are only revealed once you research the matching tech.

**Built (final gameplay pass, November 2026):**
- **A resource gets its own improvement.** Once its improvement is known, a resource tile can
  only take that one (wine: a plantation). Before then any improvement that fits the land can
  hold it, and it's replaced by the resource's own the turn that unlocks (a farm on wine becomes
  a plantation when Irrigation arrives). Growth values luxuries and strategic resources first.
- **Luxuries** (`rules.luxuryHappinessRadius` = 3): each improved luxury gives its happiness
  (+2) to the settlement that owns it and to the 3 nearest other settlements of its owner. A
  settlement counts each kind once, however many reach it, so variety matters and spare copies
  are for trading. The settlement's happiness breakdown names each one and where it comes from.
  Fifteen luxuries (D106): Silk, Spices, Wine, Incense, Diamonds, Pearls, Whales, Dyes, Furs,
  Ivory, Marble, Salt, Sugar, Tea and Cotton.
- **Trading resources** (D118, see [04-advanced-systems.md](04-advanced-systems.md)): each
  improved luxury tile is one copy; all but one can go in a deal. A copy sent away stops counting
  at home (a settlement's second copies first, then the newest settlement's), and one received
  cheers the receiver's capital and its 3 nearest settlements ("Wine (from Rome)"). Strategic
  resources trade per turn out of the sender's own income: their stockpile gains that much less
  and the other's that much more.
- **Monopolies** (D118, light; `rules.monopoly`): hold more than half of the map's tiles of a
  luxury, improved and in your land, at least 3 of them, and its `monopoly` effects reach your
  whole empire ("Silk monopoly (+10%)" in the yields): Silk and Ivory +10% culture, Spices and
  Salt +10% food, Wine and Furs +10% gold, Diamonds +15% gold, Incense +15% faith, Pearls +10%
  faith and +5% gold, Whales +15% production toward soldiers, Dyes +10% tourism, Marble +15%
  production toward wonders, Sugar +1 happiness everywhere, Tea +10% science, Cotton +10%
  production toward buildings. The Civilopedia's luxury articles say so. Luxuries come in
  clusters, so a monopoly usually means settling or taking a second cluster.
- **Strategic resources** (`rules.strategic`), after Civ VI:
  - Hidden until their tech: horses (Animal Husbandry), iron (Bronze Working), niter (Military
    Tactics), coal (Industrialization), oil (Steam Power), aluminum (Radio), uranium (Nuclear
    Fission). Before that they can't be seen, improved or worked for their yields.
  - Each improved source adds its `stockpilePerTurn` to its owner's stockpile, up to 30 + 15
    per era past the first. Oil is improved by Oil Wells (Steam Power) and, at sea, Offshore
    Platforms (Combustion).
  - Units take resources to train (`resourceCost`; Swordsman 10 iron, Horseman 10 horses,
    Musketman 10 niter, Tank 10 oil, Fighter 10 aluminum, Atomic Bomb 20 uranium...); unique
    units take what the unit they replace takes. A source is enough to start one; it finishes
    when the stockpile can pay. Upgrading into a unit pays its resources too.
  - Industrial-era and later units use some up every turn (`resourceUpkeep`: ironclads and
    battleships coal, tanks, aircraft and destroyers oil). When the stockpile can't cover it,
    those units fight with −20 strength ("Short of Oil") until it can.
  - An older unit stays buildable while its replacement's resource is out of reach (warriors
    without iron), as in Civ VI.
- **Placement:** each resource gets its share of the map by frequency, wherever it fits, so
  resources that fit few tiles aren't crowded out; luxuries come in clusters of two or three.
  Every start gets at least one luxury within 3 tiles and horses or iron within 4.

### Appeal

Each tile has an **appeal** score from neighbors (mountains, coast, woods, natural wonders: +.
Industrial zones, mines, marsh: −). Appeal affects neighborhoods' happiness, resort towns, national parks (culture),
seaside resorts, and some beliefs.

**Built (final gameplay pass):** a tile's appeal is the sum of its six neighbors' `appeal`:
terrain (coast and lake +1, snow −1), features (woods +1, reef +2, oasis +1, rainforest, marsh
and volcanoes −1, natural wonders +4 or +5), mountains +1, wonders +1 (`rules.appeal`),
districts (Holy Site, Theater Square, Entertainment Complex +1; Industrial Zone, Encampment,
Spaceport −1) and improvements (Mines, Quarries, Oil Wells, Offshore Platforms −1; National
Parks +1). Words: Breathtaking at 4, Charming at 2, Uninviting at −2, Disgusting at −4.
- **National Parks** (Conservation): an improvement for breathtaking land (woods, rainforest or
  marsh may stay): +1 culture and +1 tourism per point of appeal.
- **Seaside Resorts** (Radio): breathtaking flat land on the coast: +2 gold and +1 tourism per
  point of appeal.
- **Resort Towns** turn their charming and breathtaking tiles' appeal into tourism (1 per 2
  points), gold (1 per 3) and happiness (1 per 6) (`yield_per_appeal`).

**Continents (final pass):** every landmass is numbered (connected land, from the lowest tile
index), for the continents lens and home-continent abilities (`settlement_on_home_continent`:
the capital's landmass). Lincoln's +2 happiness on the home continent now works.

---

## 2. Yields

| Yield | Used for |
|---|---|
| 🍞 Food | Settlement growth |
| ⚙️ Production | Building units, buildings, districts, wonders, projects (in towns, converted to gold) |
| 💰 Gold | Buying, maintenance, deals, upgrading towns to cities |
| 🔬 Science | Tech tree |
| 🎭 Culture | Civics tree, border growth |
| 😊 Happiness | Settlement mood, celebrations (see below) |
| 🤝 Influence | Diplomacy: deals, befriending independent powers, envoys (see the diplomacy module) |
| 🙏 Faith | Religion, buying religious units and some units/buildings (module) |
| ✈️ Tourism | Culture victory (derived from great works, wonders and parks) |

Every yield displayed anywhere can be clicked to see a **breakdown tree**, e.g.,
`Campus: +5 🔬 = base 1 + 2 (mountain ×2) + 1 (rainforest ×2, ½ each) + 1 (policy: Natural Philosophy)`.

---

## 3. Settlements: towns and cities

### Founding

- A **Settler** founds a settlement. Settlements can't be founded within **3 tiles** of each other
  (configurable).
- Your first settlement is your **capital** and starts as a **City**, with a Palace (+2⚙️ +2🔬 +3🎭
  +5💰 +2😊). Every later settlement starts as a **Town**.
- The center tile gets a minimum of **2🍞 1⚙️** (better if the terrain is better), and gets +1⚙️
  if it's on hills.
- A new settlement has **1 citizen** and claims the 6 surrounding tiles (ring 1). Woods,
  rainforest or marsh on the center tile are cleared.
- Training a Settler costs its settlement **1 citizen** (it needs at least 2).

### Towns vs Cities (from Civ 7)

| | Town | City |
|---|---|---|
| Build queue | None. ⚙️ production is converted to 💰 gold | Full queue (units, buildings, districts, wonders, projects) |
| Focus | Picks **one specialization** at pop 5 (see below) | Can build any district |
| Districts | None (except through its specialization) | Yes, up to the district limit |
| Buying | Can buy units and buildings with gold | Yes |
| Upgrade | Pay gold to become a City (cost scales with the number of cities you already have) | — |

**Town specializations** (one at a time, can be changed for gold):
*Farming Town* (+food sent to nearby cities), *Mining Town* (+production sent to nearby cities),
*Trade Outpost* (+trade route range, +influence), *Fort Town* (+defense, heals units, +1 commander
radius), *Religious Site* (+faith, missionaries), *Resort Town* (+happiness and tourism by appeal).
Mods can add more.

- **Finished in the final pass:** Fort Towns get +6 strength defending themselves and heal your
  units 10 more in their territory; Religious Sites sell religious units for 30% less faith;
  Trade Outposts give one more trade route; Resort Towns earn by appeal (above).
- **Later-era starts (final pass):** in a game started in a later era, every settlement founded
  starts with that era's extra citizens (each with a tile to develop) and basic buildings
  (Classical +1 and a Monument; Medieval +1, Monument and Granary; Renaissance +2 and Walls;
  Industrial and Modern +2/+3 and Baths; Information +4), as in Civ VI (`era.start`).
- **Built so far (M8):** all six, at 5 citizens; the first choice is free, a change costs 50 gold
  (D41). Farming and Mining towns send **half** their food or production to the owner's nearest
  city within 10 tiles (production goes toward that city's current build). Trade, Fort,
  Religious and Resort towns get local yields and happiness for now; their range, defense,
  missionary and tourism parts arrive with the systems they belong to.

Why: an empire can be wide without every settlement needing a build queue every turn. Only your
important cities need constant attention, which keeps simultaneous turns fast with 8 players.

### Workable area and borders

- Settlements work tiles up to **3 rings** away, and can *own* tiles up to 5 rings away.
- **Border growth:** culture accumulates per settlement. When it reaches the threshold, the best
  tile is claimed. The threshold is `10 + (6 × tiles_acquired)^1.3` (rounded).
- **Buy tiles** with gold: the cost scales with distance and the number of tiles already owned.

### Growth develops your land (from Civ 7, replaces builders)

- Food surplus = food produced − (2 × population).
- Food needed for the next citizen: `15 + 8 × (pop − 1) + (pop − 1)^1.5`.
- **Each time a settlement grows, you choose one tile to develop.** The game proposes the best
  improvement for that tile: a farm on grassland, a mine on hills, a plantation on bananas, fishing
  boats on fish, and so on. If a tile allows more than one improvement, you pick which. The new
  citizen works that tile right away.
- The tile can be one of the settlement's own (within 3 tiles), or an **unclaimed tile touching
  its territory**, which developing claims (D33). End the turn without choosing and the best tile
  is developed for you.
- A city can instead put its new citizen into a district as a **specialist** (fixed yields, extra
  adjacency).
- **Clear land** (removing woods, rainforest or marsh) is a cheap city project. It gives a one-time
  production or food burst to the settlement, like Civ 6 chopping.
- **Starvation:** a negative surplus drains the food store. At 0, the settlement loses a citizen
  (and that tile's improvement stays, unworked).

### Citizens

- Each citizen works a developed or natural tile, or is a specialist.
- **Auto-assign** follows a focus (balanced, food, production, gold, science, culture, faith). Tiles
  can be locked manually.

### Happiness (replaces housing and amenities)

Each settlement has a 😊 **happiness** balance:

- **Sources:** luxuries, the Palace, certain buildings and districts (Entertainment Complex,
  Aqueduct building, Thermae...), wonders, policies, religion, town specializations, and war
  support when defending.
- **Costs:** 1 per 2 citizens, 1 per 2 buildings that have maintenance (final pass, D107; was 1
  per building), settlements above your
  **settlement limit** (−1 per settlement over the limit, in every settlement; −2 before the final pass, D107; puppets count half), and negative
  war support.

| Settlement balance | Effect |
|---|---|
| ≥ +5 | Thriving: +10% all yields, +10% growth |
| 0 to +4 | Content |
| −1 to −4 | Unhappy: −2% yields per point, growth halved |
| ≤ −5 | Unrest: no growth, −25% yields, rebels may appear at −10 |

- **Celebrations:** your empire-wide happiness *surplus* each turn accumulates. When it reaches the
  threshold (which rises with each celebration), you start a **Celebration**: for 10 turns you get
  one **bonus wildcard policy slot**, and all settlements get +10% production. The threshold is
  40, then +30 for each celebration so far (D38); the bonus is content (`rules.progress.celebration`).
- **Settlement limit:** starts at 4 and grows with techs, civics and some policies. It's the Civ 5
  "tall vs wide" balance, but softer.

### Production (cities)

- One build queue per city (units, buildings, districts, wonders, projects).
- **Overflow** carries extra production into the next item.
- **Buying:** gold for units and buildings (not districts or wonders), and faith for religious units
  and some others (module).
- **Late-game sinks (D114, final pass):** gold also buys **repeatable district projects** at 2
  gold per production (`purchase.projectGoldPerProduction`; units and buildings cost 4), and a
  religion's founder can buy **buildings with faith** (4 faith per production,
  `faithPerProduction`) in its settlements that follow that religion. Influence buys open
  borders and research agreements ([04-advanced-systems.md](04-advanced-systems.md)).
- **Nothing is wasted (final pass):** a city with nothing queued sells its production for gold
  at the town rate, and so does overflow with nothing after it.
- **District projects (built in the final pass):** every specialty district has a repeatable
  project costing 60 production (+50% per era past the first): Research Grants (Campus, half
  back as science), Pilgrimage (Holy Site, 60% as faith), Arts Festival (Theater, half as
  culture), Market Fair (Commercial Hub, 75% as gold), Trade Fleet (Harbor, half as gold and a
  fifth as food), Engineering Works (Industrial Zone, 40% as gold), War Games (Encampment, 30%
  as gold), Festival of Games (Entertainment Complex, half toward the next celebration) and
  Envoys Abroad (Government Plaza, 40% as influence), plus great person points of the district's
  kind (10–15% of the cost). Clearing woods, rainforest and marsh pays 25% more per era.
- **Projects:** repeatable city projects that convert production into another yield (e.g., Campus
  Research Grants → science and great scientist points).

### Capture, puppet, raze, liberate

When you capture a settlement, you choose one of:
- **Annex:** it's yours to manage fully (counts toward the settlement limit).
- **Puppet** (from Civ 5): it runs itself on auto-focus, gives you its yields at −25%, can't build
  wonders or be micromanaged, and counts as half a settlement toward the limit. You can annex it
  later for gold.
- **Raze:** it shrinks by 1 pop per turn until destroyed. Original capitals can't be razed.
- **Liberate:** return it to its original owner, with a big diplomatic and war support boost.

Captured settlements lose 25% of their population and some buildings (configurable).

**Built so far (M9):** Keep, Raze and Liberate. A settlement falls when a melee unit (melee,
anti-cavalry, cavalry, naval melee) attacks it at 0 health. It loses 25% of its citizens
(rounded up, at least 1 stays), its queue and walls, and comes back at a quarter of its health;
the defenders inside die and civilians are taken. Razing (D44, like Civ VI/VII) burns it down
over turns: it produces nothing and loses a citizen each turn until it's gone, unless someone
takes it back first; original capitals and settlements with a wonder can't be razed. Liberating returns it to its founder (not if
you took it from them). Not answering by the end of the turn keeps it. Losing the capital moves
it to the biggest remaining settlement; losing the last settlement knocks a player out, and the
last player standing wins.

**Puppets (built in the final pass):** the capture choice also offers **Make it a puppet**
(`rules.settlements.puppet`). A puppet runs itself: balanced focus, its own growth choices, and
its own builds (the building with the most yield for its cost, else a district project; never
units, districts or wonders). It gives its yields at −25% and counts half toward the settlement
limit (rounded down over all of them). Its owner can rename it and **annex** it for 50 + 15 gold
per citizen; nothing else. The AI puppets a capture that would push it over its limit and annexes
when there's room.

---

## 4. Units

### Classes

| Class | Examples (Ancient → Modern) | Role |
|---|---|---|
| Civilian | Settler, Trader, Great Person, Missionary | Non-combat, can be captured |
| Commander | Army Commander, Fleet Commander | Packs units, gives area bonuses (see below) |
| Recon | Scout → Ranger → Spec Ops | Exploration, vision |
| Melee | Warrior → Swordsman → Musketman → Infantry | Front line, captures cities |
| Ranged | Slinger → Archer → Crossbowman → Machine Gun | Attack without retaliation |
| Anti-cavalry | Spearman → Pikeman → AT Crew | Bonus vs cavalry |
| Light cavalry | Horseman → Cavalry → Helicopter | Fast flanking |
| Heavy cavalry | Heavy Chariot → Knight → Tank | Strong attacks |
| Siege | Catapult → Trebuchet → Artillery | Bonus vs cities |
| Naval melee / ranged / raider / carrier | Galley → ... | Sea control |
| Air | Biplane → Jet Fighter / Bomber | Late game |
| Support | Battering Ram, Siege Tower, Medic, Observation Balloon | Buff adjacent units |

**Built so far (V1 final F15):**
- **Air units:**
  - Fighter, Bomber, Jet Fighter and Stealth Bomber (the `air` domain).
  - They fly over anything (water, mountains, impassable features) at one move per tile and
    ignore zones of control.
  - They sit in the support layer, so they share a tile with a ground unit.
  - They fight with ranged attacks and never capture.
  - Civ VI's bases and rebasing are left out, which is simpler for a two-person game.
- **New land units:** Helicopter (ignores terrain), Modern Armor, Mechanized Infantry and the
  Future-era Titan Walker. Tanks and Infantry upgrade into them.
- **Nuclear weapons:** Atomic Bomb and Nuclear Missile; see docs/04, "Nukes".
- The AI builds and flies aircraft (bombers first). It never builds nuclear weapons.

**Built (final gameplay pass, D112),** reusing existing 3D models:
- **Recon:** Ranger (Military Science; 45 strength, 3 moves, ignores terrain costs) and Spec
  Ops (Combined Arms; 65, also ignores zones of control). Scout → Ranger → Spec Ops.
- **Support** (`support` on units; they share a tile with a soldier and are captured if
  caught alone): **Battering Ram** (Masonry): melee and anti-cavalry attacks next to it put all
  their damage into standing walls instead of 15%; **Siege Tower** (Construction): their
  damage skips the walls altogether; **Medic** (Sanitation): units next to it heal +20 a turn.
- **Fleet Commander** (Mercenaries): an Army Commander for ships (packs up to 3, +2 strength
  in its radius) that falls back to a port. The AI doesn't use it yet.
- **Late navy:** Submarine (Electricity) → Nuclear Submarine (Telecommunications, 5 uranium),
  and Missile Cruiser (Lasers, 10 aluminum, after the Battleship).
- **Anti-air** (a new class, +25 against aircraft): Anti-Air Gun (Advanced Flight) → Mobile
  SAM (Guidance Systems).
- Dead ends closed: Cavalry → Helicopter, Battleship → Missile Cruiser.

### Stacking

- One **military** unit and one **civilian** unit per tile (plus one support unit). This matches
  Civ 5/6. It makes positioning matter and avoids giant stacks of doom (D7).
### Commanders (from Civ 7, replaces corps/armies)

- **Army Commanders** (land) and **Fleet Commanders** (naval) are units you train or earn.
- **Pack:** a commander can carry up to 4 adjacent units (6 with promotions). Packed units move as
  one stack at the commander's speed and don't block tiles. **Unpack** them next to the commander
  to fight. This means moving an army across your empire takes one click instead of eight.
- **Command radius** (1 tile, more with promotions): units in it get the commander's bonuses
  (e.g., +2 strength, +1 movement, healing).
- Commanders gain XP when units in their radius fight, and have their own promotion tree
  (Assault, Logistics, Maneuver, Leadership, Bastion).
- If a commander is defeated, it retreats to your nearest settlement and is out of action for a
  few turns rather than dying. Units packed inside are unpacked first.
- **Built (V1 part 4):** the Army Commander (Military Tradition, 90 production): packs up to 4
  soldiers on or next to it, radius 1, +2 strength in the radius, 2 XP per fight in its radius,
  retreats for 5 turns when caught (packed units it can't put down are lost). Its tree: Assault /
  Bastion (+2 attacking / defending), then Logistics (+2 capacity, +1 movement) / Field Medicine
  (+10 healing), then Leadership (+1 radius). Unpacked units can act at once if the commander
  still has moves. The Fleet Commander came in the final gameplay pass (D112); the AI doesn't
  use it yet.

### Movement

- Each unit has movement points (MP) that reset each turn.
- Costs: flat 1, hills/woods/rainforest/marsh +1 each, mountains impassable (some mods/civs may
  ignore this). Roads reduce cost. River crossing ends the move.
- **Entering with too few MP:** Civ 6 forbids entering a tile if you lack the full MP, which often
  leaves units stuck in front of a hill. **Our default is the more forgiving Civ 5 rule:** you can
  always move one tile if you have any MP left (D3).
- **Zone of Control:** moving into a tile adjacent to an enemy military unit or city ends the
  move. Cavalry and some promotions ignore ZOC.
- **Embarking:** land units can embark onto coast after Shipbuilding (ocean after Cartography).
  Embarked units are very weak.
- **Pathfinding:** the path with the fewest turns, then the most moves left, over tiles you've
  explored (so paths never reveal what's in the fog). The preview marks where each turn ends.
  Multi-turn paths are queued as orders and continue at the start of each turn.
- **Starting units:** a Settler, a Warrior and a Scout (D31; content: `rules.units.startingUnits`).

### Vision and fog

- Base sight 2 tiles. Hills +1, recon units +1. Mountains and woods block line of sight.
- Three fog states: **unexplored** (black), **remembered** (seen before; shows the last known terrain,
  cities and improvements, but no units), **visible**.

### Experience and promotions

- Units gain XP from combat. Each class has a promotion tree with 2 branches.
- Promoting **fully heals** the unit but uses up its turn (Civ 6 rule, which keeps promotion a real
  decision).
- **Built so far (M9):** 32 promotions for the 8 combat classes, with original names (D47).
- **Unit upgrades (V1 part 9):** each unit names what it becomes (Warrior → Swordsman →
  Man-at-Arms → Musketman → Line Infantry → Infantry; uniques follow the unit they replace).
  V1 final F17 filled the gaps in the lines: Quadrireme (early naval ranged, → Frigate →
  Battleship), Courser (Horseman → Courser → Cavalry), Modern AT (after the Anti-Tank Crew)
  and Rocket Artillery (after Artillery). Once you can
  build the newer one, the old one leaves the build list (one already queued becomes the new
  one, keeping its progress), and units in your territory with moves left can **upgrade** for
  2 gold per point of production between them (at least 20), keeping their experience.
  Each class has 2 starting choices, a middle tier that needs either of them, and a top tier.
  They add strength in situations (when attacking or defending, against some classes, against
  settlements or ranged attacks, fighting in woods), or movement, sight or range. XP: 4 per
  attack and 3 per defense; promotions cost 15, 30, 50, 75, then 105 XP each.

### Upkeep and requirements

- Gold upkeep per unit, scaling with era. Each player gets **3 gold of upkeep free** each turn
  (D37), so a starting army doesn't drain an empty treasury.
- **Built (final pass):** a unit costs at least its era's upkeep (`rules.units.upkeepByEra`: 1
  gold in the Ancient and Classical eras, 2 Medieval–Renaissance, 3 Industrial–Modern, 4 from
  the Atomic era); its own `upkeep` counts if higher, and free units stay free.
- Strategic units cost a stockpile amount to train (e.g., Swordsman: 10 Iron) and a small amount
  per turn to maintain. If the stockpile runs out, those units get −20 combat strength.

---

## 5. Combat

### Damage formula

```
diff   = attacker_strength − defender_strength      (after all modifiers)
damage = 30 × e^(0.04 × diff) × random(0.8, 1.2)    (dealt to defender)
recoil = 30 × e^(−0.04 × diff) × random(0.8, 1.2)   (dealt to attacker; melee only)
```

- Units have **100 HP**. Damage is computed with a fixed-point lookup table (see determinism rules).
- **Ranged attacks** take no recoil. The defender uses its ranged-defense value.
- **Combat preview** shows the expected damage range for both sides *before* you commit, with every
  modifier listed.

### Strength modifiers (base set)

| Modifier | Value |
|---|---|
| Defender on hills | +3 |
| Defender in woods/rainforest | +3 |
| Defender fortified (1 / 2+ turns) | +3 / +6 |
| Attacker across river | −5 |
| Attacker from sea (amphibious) | −10 |
| Flanking (per friendly unit adjacent to the target) | +2 |
| Support (per friendly unit adjacent to the defender) | +2 |
| Damaged unit | −1 per 10 HP missing |
| Anti-cavalry vs cavalry | +10 |
| Siege vs city / district | +10 |
| Ranged / melee vs district | −17 / 0 |
| Out of strategic resource | −20 |

### Cities and districts in combat

- City HP 200, plus **walls** (outer defense HP: Ancient 100, Medieval 100 more, Renaissance 100 more).
- While walls stand, melee attacks barely hurt the city. Siege units and battering rams
  get around this.
- Cities and encampments get a **ranged strike** each turn (strength based on the best unit you
  can build).
- A city is captured when its HP hits 0 and a **melee** unit moves in.

### Healing

- Per turn, if the unit didn't act: +10 HP in enemy land, +10 neutral, +15 own land, +20 in a city.
  Medics give +20 to adjacent units.

### Built so far (M9, part 1)

- The damage formula with every number from `rules.combat`; e^x comes from a table built with
  integer math (a Taylor series on BigInts), so all machines agree. Damage at equal strength is
  30 (24–36 with the roll).
- Modifiers: terrain (hills, woods, rainforest), fortified (+3 after a turn, +6 after two),
  support and flanking (+2 per unit), wounded (−1 per 10 HP missing), across a river (−5), from
  the water (−10), embarked defenders (at most 10), class bonuses (anti-cavalry +10 against
  cavalry, siege +10 against settlements). Every line shows in the combat preview.
- Melee attacks (both sides take damage; the winner moves into the tile it cleared), ranged
  attacks (range and line of sight, no damage back), capturing lone civilians by moving onto
  them (they join you, D42). Attacking uses the unit's turn.
- Settlements: 200 HP for cities and 100 for towns; strength is the best unit you can train
  that takes settlements (+3 in a city, +5 while walls stand, plus terrain). Walls (Masonry,
  +100) and Castles (Military Tactics, +100) absorb hits first and let through 15% of melee,
  50% of ranged and all of siege damage. Each settlement has a ranged strike (range 2, once a
  turn, no walls needed, D43). Settlements heal 20 HP and repair 10 walls a turn when not
  attacked.
- War: declare it any time on a non-teammate; peace can be offered after 10 turns of war (D45)
  and is made when the other side accepts (or offers back). Diplomacy proper arrives in M15.
- Healing as above, at the start of each turn for units that didn't use their moves.
- Coming in part 2: promotions, commanders, war support and hostile camps.

### War

- Declaring war gives a diplomatic penalty unless you have a reason (a **casus belli**, e.g., they
  converted your cities, they denounced you, liberation...). See the diplomacy module.
- **War support** (from Civ 7, replaces war weariness): each war has a war support score per
  side. It starts in favor of the defender if the war was a surprise (no casus belli). Captured
  settlements, battles won, and allies joining shift it. Negative war support costs happiness in
  every settlement, so long unpopular wars get harder to sustain.
- **Built so far (M9):** each side of a war has a score. The side that's declared on starts at +3;
  each enemy unit destroyed adds 1 and each settlement taken adds 3, up to 10. The side behind
  loses 1 happiness per point behind in every settlement, at most 5 (D48). Raiders don't count.

---

## 6. Science and culture

### Tech tree

- About **70 techs** across 8 eras (Ancient, Classical, Medieval, Renaissance, Industrial, Modern,
  Atomic, Information) plus a Future era.
- Each tech unlocks units, buildings, improvements, abilities and resources.
- **Boosts ("Eurekas"):** each tech has a gameplay condition (e.g., *Archery: kill a unit with a
  Slinger*) that pays 40% of its cost when met. This keeps players' paths varied, and the
  conditions are moddable.
- Cost formula: base by era × game-speed multiplier.
- **Built so far (M7):** Ancient → Medieval, 24 techs. Choosing anything queues the path of
  prerequisites to it. Each citizen adds **+0.5 🔬** on top of buildings and tiles (D36).
  Boosts are paid the moment their goal is met (or at the end of the turn).
- **Built so far (V1 part 9):** the Renaissance, Industrial and Modern eras: 47 techs in all,
  up to Rocketry, Satellites and Space Flight (the space race). Astronomy and Radio carry
  lasting bonuses (+1 science per University; +25% tourism).
- **Built so far (V1 final F15):** the **Atomic, Information and Future eras**: 16 more techs,
  63 in all, from Flight and Nuclear Fission to Artificial Intelligence and Future Tech.
  - Atomic: Flight, Advanced Flight, Nuclear Fission, Computers, Synthetic Materials, Combined
    Arms.
  - Information: Composites, Robotics, Lasers, Telecommunications, Stealth Technology, Guidance
    Systems, Nuclear Fusion.
  - Future: Artificial Intelligence, Nanotechnology, Future Tech.
  - Space Flight stays in the Modern era, so the science victory doesn't move later. The
    **Orbital Laser Relay** (Lasers, on a Spaceport) brings a launched expedition 2 turns
    sooner each time it's built.
  - Games can start in the Atomic or Information era.
- **Final gameplay pass (D117, the late game's pace):** once the economy grew (2A–2C) the space
  race finished around turn 230–280 at Standard, mostly because every space project unlocked in
  the Modern era. Now:
  - The projects follow the tree: Launch a Satellite at Rocketry (Modern), Moon Landing at
    Computers (Atomic), Mars Colony at Robotics (Information), the Exoplanet Expedition at
    Nanotechnology (Future); they cost 1000, 1400, 1800 and 2200, and the expedition travels
    20 turns.
  - Techs and civics of later eras cost more than listed (`rules.progress.eraCostPercent`):
    Renaissance 110%, Industrial 130%, Modern 150%, Atomic 185%, Information 240%, Future 300%.
    The trees show the real cost.

### Civics tree

- About **60 civics**, paid for with culture, unlocking governments, policy cards, districts and
  diplomatic options. Boosts ("Inspirations") work the same way as tech boosts.

### Governments and policy cards

- **Governments** (Chiefdom → Autocracy / Oligarchy / Classical Republic → Monarchy / Theocracy /
  Merchant Republic → Democracy / Communism / Fascism) each have **slots**: Military,
  Economic, Diplomatic, Wildcard. Each government also has its own bonus.
- **Policy cards** go into slots. They can be swapped for free when you finish a civic, otherwise
  for gold (25 per new card; a new government costs 100). Wildcard slots take any card.
- **Built so far (M7):** 19 civics, 7 governments (Chiefdom → Merchant Republic) and 22 policy
  cards, all original names. Early Empire, Political Philosophy and Civil Service each raise the
  settlement limit by 1.
- **Built so far (V1 part 9):** 37 civics through the Modern era, 10 governments (adding
  Democracy, Collectivism and Militarism, our names for the three Modern ones; ideological
  pressure isn't built) and 35 policy cards.
- **Built so far (V1 final F15):** 9 more civics, 46 in all:
  - Atomic: Cold War, Decolonization, Consumerism, Space Age.
  - Information: Globalization, Environmentalism, Digital Rights, Social Networks.
  - Future: World Federation.

  Three late governments, our own names and bonuses:
  - **Technocracy** (Digital Rights): +20% science, +10% toward districts.
  - **Digital Republic** (Globalization): +15% gold, +1 happiness, +3 favor.
  - **Corporate Federation** (Social Networks): +20% toward buildings, +10% gold, two more
    trade routes.
- **Final gameplay pass (November 2026):**
  - **Catch-up research (D119):** a tech or civic costs 5% less for each civ you know (have seen
    a settlement of) that has it, up to 25% (`rules.progress.catchUp`); the trees show the
    lower cost.
  - **Every node does something.** Synthetic Materials, Nuclear Fusion and Artificial
    Intelligence now improve tiles and buildings; **Future Tech** and the new **Future Civic**
    can be finished again and again (each time counts toward the score), so science and culture
    never stop mattering. Every Atomic, Information and Future node has a boost.
  - **46 policy cards.** The flat "+1 everywhere" cards became decisions: six **adjacency
    cards** add half again to one district's adjacency (Scribes' Stipend: Campus; Temple Tithes:
    Holy Site; Patrons of Poetry: Theater Square; Royal Mint: Commercial Hub; Guild Charters:
    Industrial Zone; Charted Coasts: Harbor; +50%, D121: doubling let one civ run away with
    science), and others need a building (Festival Calendar: Arenas).
    Early cards go **obsolete** when their later version arrives (Militia Drills, Bowyers'
    Workshops, Remount Herds and Siege Engineers at Nationalism...) and leave their slots.
    Three **dark-age cards** (Martial Law, Monastic Retreat, Rally the Levies) are strong with
    a price and only open during a dark age. New cards for the civics that had none (Border
    Forts, Air Doctrine, Self-Determination, Space Program, Green Energy, World Forum) and a
    fourth diplomatic one (Trade Delegations).
  - **Legacies (D113):** every 25 turns in one government (scaled by speed) earns one more of
    its `legacy` bonus, kept after you switch, up to 3 per government (`rules.progress.legacy`).
    Changing government starts the count over. Chiefdom, Oligarchy and Militarism: +5%
    production toward soldiers; Autocracy: +5% toward wonders; Classical Republic: +3% culture;
    Theocracy: +5% faith; Monarchy: +10% border growth; Merchant Republic: +4% gold; Democracy:
    +5% toward buildings; Collectivism: +3% production; Technocracy: +4% science; Digital
    Republic: +5% tourism; Corporate Federation: +5% gold. Staying the course pays; a civ that
    lived under several governments carries a mix. The government screen shows each legacy, how
    many you have and when the next comes.
- This is one of Civ 6's best systems. It's very moddable, and it creates lots of strategic
  choices, so we keep it as-is.

---

## 7. Economy

- **Gold income:** tiles, commercial hubs, harbors, trade routes, policies, deals.
- **Costs:** unit upkeep, building maintenance, district maintenance (some), deals.
- **Negative gold:** if the treasury hits 0 with a negative income, a unit is disbanded each turn
  and happiness drops. (Until unit upkeep exists in M9, the treasury simply stops at 0.)
- **Buying:** units and buildings with gold. Prices scale with production cost (×4 by default).

---

## 8. Improvements (core)

- Improvements are created when a settlement **grows** (see section 3). No builder units.
- Improvements: Farm, Mine, Quarry, Pasture, Plantation, Camp, Fishing Boats, Lumber Mill, Oil
  Well, Offshore Platform, Fort, Airstrip, Beach Resort, Ski Resort, Seaside Resort, plus unique
  ones from civs.
- **Improvements grow through the tree (final pass):** Farms +1 food at Replaceable Parts and
  Synthetic Materials; Mines +1 production at Apprenticeship, Industrialization and Robotics;
  Quarries +1 at Metal Casting; Pastures +1 food at Stirrups and +1 production at Robotics;
  Plantations and Camps +1 gold at Mercantilism; Camps +1 production at Synthetic Materials;
  Fishing Boats +1 gold at Cartography and +1 food at Synthetic Materials; Woodcutters +1 at
  Machinery and Steel; Oil Wells and Offshore Platforms +1 at Nuclear Fusion.
- **Adjacency for improvements:** farms gain +1🍞 for every two adjacent farms (Feudalism makes it
  every one), mines gain from adjacent mines later, and so on.
- **Built so far (M8):** farms get +1🍞 per two neighboring farms; the Open Fields policy
  (Feudalism) makes it +1 per neighboring farm. Quarries need Mining, pastures and camps Animal
  Husbandry, plantations Irrigation; farms, mines, fishing boats and woodcutters are available
  from the start.
- **Pillaged** improvements are repaired with a cheap city project or by a unit with the *Engineer*
  ability (Military Engineer). *Built (V1 final F16):* they come back into use on their own after
  10 turns, like disaster damage, so a repair never takes a slot in the build queue (D85).
- **Roads** are built automatically by trade routes. Military engineers can build them manually.

---

## 9. Districts and wonders (core)

Districts are Civ 6's signature system and the main source of city planning.

- A city can have `1 + floor((pop − 1) / 3)` specialty districts. Some, like the Aqueduct,
  Neighborhood and Spaceport, don't count toward this limit.
- A district occupies a tile and holds **buildings** (e.g., Campus → Library → University → Lab).
- **District cost** increases with your progress through the tech and civics trees, so building
  early is cheaper.
- **Adjacency bonuses** reward placement, and the map shows them (via the district lens) before you
  place one.

| District | Yield | Adjacency (examples) |
|---|---|---|
| Campus | 🔬 | +1 per mountain, +1 per 2 rainforest, +2 per reef |
| Holy Site | 🙏 | +1 per mountain, +2 natural wonder, +1 per 2 woods |
| Theater Square | 🎭 | +1 per wonder, +2 next to Entertainment Complex |
| Commercial Hub | 💰 | +2 river, +2 next to Harbor |
| Harbor | 💰 🍞 | +2 next to city center, +1 per coastal resource |
| Industrial Zone | ⚙️ | +1 per mine/quarry, +2 next to Aqueduct/Dam |
| Encampment | military | Defensive district with a ranged strike |
| Entertainment Complex | 😊 happiness | — |
| Aqueduct | +growth, +😊 | Must be next to a city center and fresh water or a mountain |
| Neighborhood | 😊 by appeal, +growth | Outside the limit (D111) |
| Dam | ⚙️, no floods | On river floodplains, outside the limit (D111) |
| Preserve | appeal, 🎭 🙏 to neighbors | On woods or rainforest, outside the limit (D111) |
| Government Plaza | unique | One per empire. Extra policy slot; three tiers of buildings, one of two each (D110) |
| Spaceport | science victory | — |

- **Final gameplay pass (November 2026):**
  - The **Holy Site** gets +2 faith per neighboring natural wonder (any feature marked as one,
    so modded wonders count: the `naturalWonder` tile match).
  - The **Encampment** gets +1 production per neighboring Pasture and strategic resource, and
    its settlement can make its ranged strike from the Encampment's tile too (`rangedStrike`).
  - **Buildings share their district's adjacency (D108):** each building inside a specialty
    district adds a third of the district's adjacency bonus, rounded down to whole points
    (`rules.settlements.districts.buildingAdjacencyPercent`). A +6 Campus with a Library,
    University and Research Lab makes +12 from adjacency; a +1 Campus stays poor.
  - **Adjacency cards** (`adjacency_percent`) add 50% to one district's adjacency (section 6).
  - **Regional effects (D109):** a Factory (+3 production), Power Plant (+4) or Stadium (+2
    happiness) also reaches your other settlements within 6 tiles that don't have their own;
    each kind counts once (`regional` on buildings and wonders). The Colosseum, Taj Mahal and
    Maracanã reach the same way with happiness.
  - The Nuclear Plant needs a Power Plant.
  - **New districts (D111),** none counting toward the district limit:
    - **Neighborhood** (Urbanization): +10% growth, and happiness by its own tile's appeal
      (`happinessByAppeal`: +3 breathtaking, +2 charming, +1 average, nothing below).
    - **Dam** (Engineering): on a floodplains tile by a river; floods no longer touch its
      settlement's land (`preventedBy` on the flood), +2 production, and +2 for a neighboring
      Industrial Zone.
    - **Preserve** (Mysticism): on woods or rainforest, which it keeps (`placement.features`
      now also means "kept when built"); +2 appeal to its neighbors and +1 culture and +1
      faith on each of your tiles next to it.
    - The AI places a Neighborhood where the land is loveliest and values each by its yields.
  - **Government Plaza buildings (D110):** three tiers, each a choice of two; building one
    closes the other for good (`excludes`):
    - Political Philosophy: **Envoys' Hall** (+3 influence, +1 favor a turn) or **Builders'
      Lodge** (+25% production toward districts in its settlement).
    - Civil Service: **Treasury Hall** (+4 gold, +5% gold everywhere) or **War College** (+10%
      production toward soldiers everywhere).
    - Nationalism: **Grand Archive** (+15% Great Scientist, Writer and Artist points) or
      **National Monument** (+1 happiness in every settlement).
  - **Wonders:** every wonder now has a placement rule (St. Basil's next to the city center,
    Big Ben next to a Commercial Hub, Broadway next to a Theater Square, the Statue of Liberty
    on the coast...), and the empire-wide trickles became signature effects (Stonehenge +3
    great prophet points a turn; the Oracle makes boosts 10% bigger; Big Ben an economic slot;
    the Eiffel Tower +15% tourism; the CN Tower +25% tourism where there's a Broadcast Center).
- Every specialty district also gets **+0.5 for each adjacent district** of any kind
  (so clustering districts pays off).
- **World wonders:** only one can exist per world, each with placement rules (e.g., the Pyramids
  need desert, Machu Picchu needs a mountain). Building one gives a big unique bonus, tourism, and
  bragging rights in chat. If someone completes a wonder first, the other players building it
  have their production converted to gold.

**Built so far (M8):**
- All 10 districts in the table except Neighborhood and Spaceport (later eras), with the listed
  adjacencies. A district costs its base (54 production for specialty districts, 36 for the
  Aqueduct) **+2% per tech and civic you've finished** (D39). Districts can't be bought.
- Placement rules: the tile must be the city's own, within 3 tiles, not its center, without a
  district or wonder, and fit the district (Harbor on coast or lake next to land, Encampment not
  next to the center, Aqueduct next to the center and fresh water or a mountain). Building on a
  tile removes woods, rainforest or marsh and any improvement there.
- 9 Ancient and Classical wonders (Pyramids, Hanging Gardens, Stonehenge, Temple of Artemis,
  Oracle, Colossus, Great Library, Colosseum, Petra), each with a placement rule, local yields and
  an empire-wide effect (D40). The race is world-wide: when one finishes, every other settlement
  building it gets its production back as gold and drops it from the queue.
- 11 buildings now belong to districts (Library and University in the Campus, Shrine and Temple
  in the Holy Site, and so on); a district building needs its district first.
- **The full wonder list (V1 final F17):** 45 world wonders from every era, each with its own
  landmark in 3D: Etemenanki and the Great Bath (Ancient); the Great Lighthouse, Mausoleum at
  Halicarnassus, Terracotta Army, Parthenon and Statue of Zeus (Classical); Hagia Sophia, Angkor
  Wat, Chichen Itza, Machu Picchu (on hills next to a mountain), Notre-Dame, Great Zimbabwe, the
  Great Mosque of Djenné, the Alhambra and Kilwa Kisiwani (Medieval); the Forbidden City,
  Venetian Arsenal, Himeji Castle, Porcelain Tower, Potala Palace and Jantar Mantar
  (Renaissance); the Hermitage, Ruhr Valley and Oxford University (Industrial); Cristo
  Redentor, the Maracanã and Hoover Dam (Modern); the Sydney Opera House (Atomic) and the CN
  Tower (Information), with the earlier fifteen. Effects are built from the shared effects
  list (`wonders.json`).
- **More buildings (V1 final F17):** Stable, Armory and Military Academy in the Encampment;
  Shipyard and Seaport in the Harbor; Zoo in the Entertainment Complex; Sewer in the Aqueduct.
- **Specialists:** each building in a district opens one specialist slot. Specialists give the
  district's specialist yields (e.g. +2🔬 in a Campus) instead of working a tile, and are assigned
  by the citizen focus like tiles.
- Clear Woods (+25⚙️ toward the next item, +25% per era past the first), Clear Rainforest (+15🍞 +15⚙️) and Drain Marsh
  (+20🍞) are 15-production city projects on a tile.
- The settlement screen previews each possible tile's yield before you place a district, on the
  map and in a list.

---

## 10. Independent powers (core)

Barbarians and city-states are one system (from Civ 7). See
[04-advanced-systems.md](04-advanced-systems.md#independent-powers-city-states-and-barbarians).
With the module off, they act as classic barbarians: camps spawn in fog, send scouts, then raid,
and clearing one gives gold and XP. Settings: off / normal / raging.

**Built so far (V1 part 8): city-states** are placed at the start, by map size (see the
table above and 04, "Built so far").

**Built so far (M9): hostile camps.** One camp per 120 land tiles at the start, at least 6
tiles from any start, each with a raider; a new camp may appear every 12 turns in land no
player can see, up to the same number. A camp trains a raider every 7 turns while it has fewer
than 3, picked by the latest era any player has reached (warriors and slingers, then spearmen,
archers and horsemen...). Raiders belong to no one and are at war with everyone: each turn they
attack the best target in reach, close in on anything within 4 tiles, or wander near home.
They carry civilians off rather than capture them and can't take settlements (D49). Moving a
military unit onto a camp clears it for 50 gold. The new-game dialog can turn camps off.

---

## 11. Score

- Score from population, wonders, techs, civics, great people, eras and military. It's shown in
  reports and decides a **score victory** at the turn limit.
- **Built so far (M10):** 1 per citizen, 5 per city, 2 per town, 2 per tech, 2 per civic, 10 per
  wonder, 2 per district, 10 per era past the first, 1 per enemy unit destroyed (D50).
- **Final pass (D117):** also 5 per great person earned, 10 for founding a religion and 1 per
  settlement following it, 2 per great work held, and 5 each time Future Tech or Future Civic
  is finished again. Shown on
  each player's chip and panel and on the end-of-game screen.
