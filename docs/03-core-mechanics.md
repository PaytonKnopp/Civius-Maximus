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

Map types now: Continents, Pangaea, Archipelago, Fractal. Planned (M21a): small continents,
island plates, inland sea, lakes, highlands, seven seas, Terra (old world / new world), shuffle,
duel arena, and Earth with true start locations. World settings planned: world age (how
mountainous), temperature, rainfall, sea level, natural wonder count.

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
7. **Natural wonders.**
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

### Appeal

Each tile has an **appeal** score from neighbors (mountains, coast, woods, natural wonders: +.
Industrial zones, mines, marsh: −). Appeal affects neighborhoods' happiness, resort towns, national parks (culture),
seaside resorts, and some beliefs.

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
- **Costs:** 1 per 2 citizens, 1 per building that has maintenance, settlements above your
  **settlement limit** (−2 per settlement over the limit, in every settlement), and negative
  war support.

| Settlement balance | Effect |
|---|---|
| ≥ +5 | Thriving: +10% all yields, +10% growth |
| 0 to +4 | Content |
| −1 to −4 | Unhappy: −2% yields per point, growth halved |
| ≤ −5 | Unrest: no growth, −25% yields, rebels may appear at −10 |

- **Celebrations:** your empire-wide happiness *surplus* each turn accumulates. When it reaches the
  threshold (which rises with each celebration), you start a **Celebration**: for 10 turns you pick
  one **bonus policy slot** from your government's list, and all settlements get +10% production.
- **Settlement limit:** starts at 4 and grows with techs, civics and some policies. It's the Civ 5
  "tall vs wide" balance, but softer.

### Production (cities)

- One build queue per city (units, buildings, districts, wonders, projects).
- **Overflow** carries extra production into the next item.
- **Buying:** gold for units and buildings (not districts or wonders), and faith for religious units
  and some others (module).
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

### Upkeep and requirements

- Gold upkeep per unit, scaling with era.
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

### War

- Declaring war gives a diplomatic penalty unless you have a reason (a **casus belli**, e.g., they
  converted your cities, they denounced you, liberation...). See the diplomacy module.
- **War support** (from Civ 7, replaces war weariness): each war has a war support score per
  side. It starts in favor of the defender if the war was a surprise (no casus belli). Captured
  settlements, battles won, and allies joining shift it. Negative war support costs happiness in
  every settlement, so long unpopular wars get harder to sustain.

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

### Civics tree

- About **60 civics**, paid for with culture, unlocking governments, policy cards, districts and
  diplomatic options. Boosts ("Inspirations") work the same way as tech boosts.

### Governments and policy cards

- **Governments** (Chiefdom → Autocracy / Oligarchy / Classical Republic → Monarchy / Theocracy /
  Merchant Republic → Democracy / Communism / Fascism) each have **slots**: Military,
  Economic, Diplomatic, Wildcard. Each government also has its own bonus.
- **Policy cards** go into slots. They can be swapped for free when you finish a civic, otherwise
  for gold.
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
- **Adjacency for improvements:** farms gain +1🍞 for every two adjacent farms (Feudalism makes it
  every one), mines gain from adjacent mines later, and so on.
- **Pillaged** improvements are repaired with a cheap city project or by a unit with the *Engineer*
  ability (Military Engineer).
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
| Neighborhood | 😊 by appeal, +growth | — |
| Government Plaza | unique | One per empire. Extra policy slot |
| Spaceport | science victory | — |

- Every specialty district also gets **+0.5 for each adjacent district** of any kind
  (so clustering districts pays off).
- **World wonders:** only one can exist per world, each with placement rules (e.g., the Pyramids
  need desert, Machu Picchu needs a mountain). Building one gives a big unique bonus, tourism, and
  bragging rights in chat. If someone completes a wonder first, the other players building it
  have their production converted to gold.

---

## 10. Independent powers (core)

Barbarians and city-states are one system (from Civ 7). See
[04-advanced-systems.md](04-advanced-systems.md#independent-powers-city-states-and-barbarians).
With the module off, they act as classic barbarians: camps spawn in fog, send scouts, then raid,
and clearing one gives gold and XP. Settings: off / normal / raging.

---

## 11. Score

- Score from population, wonders, techs, civics, great people, eras and military. It's shown in
  reports and decides a **score victory** at the turn limit.
