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

Generation is a pipeline of seeded steps that mods can replace:

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
9. **Fairness pass:** in *Balanced* mode, starts are equalized by adding or swapping resources. In
   *Mirrored* mode, one region is generated and copied for every player.
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

- Rivers run along tile edges. A tile next to a river has **fresh water** (more housing and
  better farms).
- **Crossing a river** uses all remaining movement (until Bridge Building). Attacking across a river
  gives the attacker −5 combat strength.
- Rivers give adjacency bonuses (e.g., Commercial Hub +2) and make floodplains possible.

### Resources

| Type | Effect | Examples |
|---|---|---|
| Bonus | Extra tile yield | Wheat, Rice, Cattle, Sheep, Deer, Fish, Stone, Copper, Bananas |
| Luxury | Tile yield + **amenities** for your empire (each copy serves up to 4 cities) | Silk, Spices, Wine, Incense, Diamonds, Pearls, Whales |
| Strategic | Accumulates a **stockpile** per turn that units and buildings consume | Horses, Iron, Niter, Coal, Oil, Aluminum, Uranium |

Strategic resources are only revealed once you research the matching tech.

### Appeal

Each tile has an **appeal** score from neighbors (mountains, coast, woods, natural wonders: +.
Industrial zones, mines, marsh: −). Appeal affects neighborhoods' housing, national parks (culture),
seaside resorts, and some beliefs.

---

## 2. Yields

| Yield | Used for |
|---|---|
| 🍞 Food | City growth |
| ⚙️ Production | Building units, buildings, districts, wonders, projects |
| 💰 Gold | Buying, maintenance, deals |
| 🔬 Science | Tech tree |
| 🎭 Culture | Civics tree, border growth |
| 🙏 Faith | Religion, buying religious units and some units/buildings (module) |
| ✈️ Tourism | Culture victory (derived from great works, wonders and parks) |

Every yield displayed anywhere can be clicked to see a **breakdown tree**, e.g.,
`Campus: +5 🔬 = base 1 + 2 (mountain ×2) + 1 (rainforest ×2, ½ each) + 1 (policy: Natural Philosophy)`.

---

## 3. Cities

### Founding

- A **Settler** founds a city. A city can't be founded within **3 tiles** of another city (minimum
  distance, configurable).
- The city center tile gets a minimum of **2🍞 1⚙️** (better if the terrain is better), and gets +1⚙️
  if it's on hills.
- A city starts with **1 citizen** and claims the 6 surrounding tiles (ring 1).
- The first city is the **capital** (Palace: +2⚙️ +2🔬 +5🎭 +5💰, +1 housing, +1 amenity).

### Workable area and borders

- Cities can work tiles up to **3 rings** away, and can *own* tiles up to 5 rings away.
- **Border growth:** culture accumulates per city. When it reaches the threshold, the best tile is
  claimed. The threshold is `10 + (6 × tiles_acquired)^1.3` (rounded).
- **Buy tiles** with gold: the cost scales with distance and the number of tiles already owned.

### Citizens

- Each citizen works one tile, or is a **specialist** in a district (fixed yields).
- **Auto-assign** follows a city focus (balanced, food, production, gold, science, culture, faith).
  Players can lock tiles manually.

### Growth

- Food surplus = food produced − (2 × population).
- Food needed for the next citizen: `15 + 8 × (pop − 1) + (pop − 1)^1.5` (Civ 6-style).
- On growth, the stored food resets (optionally keeping some from buildings like the Granary/Aqueduct).
- **Starvation:** a negative food surplus drains the store. At 0, the city loses a citizen.

### Housing (growth cap, soft)

- Base: 2 (no water), 3 (coast), 5 (fresh water). Plus buildings, districts, improvements, policies.
- At `pop ≥ housing − 1`, growth slows by 50%. At `pop ≥ housing`, it slows by 75%. At
  `pop ≥ housing + 4`, growth stops.

### Amenities (happiness, per city)

- Each city needs `ceil(pop / 2)` amenities. They come from luxuries, entertainment districts,
  policies, wonders and religion.
- The surplus or deficit sets the city mood:

| Net amenities | Mood | Effect |
|---|---|---|
| ≥ +3 | Ecstatic | +20% non-food yields, +10% growth |
| +1 to +2 | Happy | +10% non-food yields, +5% growth |
| 0 | Content | — |
| −1 to −2 | Displeased | −15% yields, −10% growth |
| −3 to −4 | Unrest | −30% yields, no growth |
| ≤ −5 | Revolt | Rebels spawn, −50% yields |

> D6 asks whether to keep housing and amenities exactly like this or merge them into one
> "happiness" stat. The recommendation is to keep both, with tooltips that make the reason
> for any problem obvious.

### Production

- One build queue per city (units, buildings, districts, wonders, projects).
- **Overflow** carries extra production into the next item.
- **Buying:** gold for units and buildings (not districts or wonders), and faith for religious units
  and some others (module).
- **Chopping:** removing woods or rainforest gives a one-time production burst to the nearest city.
- **Projects:** repeatable city projects that convert production into another yield (e.g., Campus
  Research Grants → science and great scientist points).

### Capture, raze, liberate

- Capturing a city: keep it, raze it (shrinks by 1 pop per turn until destroyed, but original
  capitals can't be razed), or liberate it (return it to its original owner, with a big
  diplomatic boost).
- Captured cities lose 50% of their population and some buildings (configurable).

---

## 4. Units

### Classes

| Class | Examples (Ancient → Modern) | Role |
|---|---|---|
| Civilian | Settler, Builder, Trader, Great Person, Missionary | Non-combat, can be captured |
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
- **Formations** (later eras): combine 2 units into a Corps (+10 strength) or 3 into an Army (+17).

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
- **Pathfinding:** A* over move costs, with the path preview showing how many turns each step
  takes. Multi-turn paths are queued as orders.

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
- **War weariness:** ongoing war reduces amenities empire-wide, scaling with units lost.
  Peace slowly heals it.

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
  and amenities drop.
- **Buying:** units and buildings with gold. Prices scale with production cost (×4 by default).

---

## 8. Builders and improvements (core)

- Builders have **charges** (3 by default). Each improvement uses one charge and is built instantly.
- Improvements: Farm, Mine, Quarry, Pasture, Plantation, Camp, Fishing Boats, Lumber Mill, Oil
  Well, Offshore Platform, Fort, Airstrip, Beach Resort, Ski Resort, Seaside Resort, plus unique
  ones from civs.
- **Adjacency for improvements:** farms gain +1🍞 for every two adjacent farms (Feudalism makes it
  every one), mines gain from adjacent mines later, and so on.
- Builders also **remove features** (chop, giving production or food) and **repair** pillaged tiles.
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
| Entertainment Complex | amenities | — |
| Aqueduct | housing | Must be next to a city center and fresh water or a mountain |
| Neighborhood | housing by appeal | — |
| Government Plaza | unique | One per empire. Extra policy slot |
| Spaceport | science victory | — |

- Every specialty district also gets **+0.5 for each adjacent district** of any kind
  (so clustering districts pays off).
- **World wonders:** only one can exist per world, each with placement rules (e.g., the Pyramids
  need desert, Machu Picchu needs a mountain). Building one gives a big unique bonus, tourism, and
  bragging rights in chat. If someone completes a wonder first, the other players building it
  have their production converted to gold.

---

## 10. Barbarians

- Camps spawn in fog and spawn scouts. When a scout finds a city, the camp sends raids.
- Clearing a camp gives gold and XP.
- Settings: off / normal / raging. Optional **clans mode** later: camps can be bribed, hired, or
  turned into city-states.

---

## 11. Score

- Score from population, wonders, techs, civics, great people, eras and military. It's shown in
  reports and decides a **score victory** at the turn limit.
