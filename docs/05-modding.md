# 05 — Content and modding

Goal: **anything a base civ can do, a mod can do**, and a non-programmer can make a new leader or civ
in an evening, either by editing JSON or with the in-game creator.

**Leaders and civs are separate files** (see [08-best-of-civ.md](08-best-of-civ.md)). To add a
famous leader, write one `leader` file that points at an existing civ as its default. To add a
whole new people, also write a `civ` file. The starting roster is in
[09-base-roster.md](09-base-roster.md).

The base game is itself built as a mod (`content/base/`) using exactly the same format. So the
format will always be complete enough for real content.

> **Implemented so far (M1):** content types `yield`, `terrain`, `feature`, `resource`,
> `ability`, `rules`, `strings` and `patch`; effects `modify_yield` (flat or percent) and
> `yield_per_adjacent`; all tile conditions listed below. Other types and effects in this doc
> are the plan and arrive with their milestones. `pnpm cx validate` and the schemas in
> `schemas/` always reflect what's actually implemented.

## Content package layout

```
mods/vikings-plus/
├── mod.json                  manifest
├── civs/vikings.json
├── leaders/harald.json
├── units/longship.json
├── buildings/stave_church.json
├── great-people/leif.json
├── patches/warrior-buff.json  changes to existing content
├── strings/en.json           display text (lets us add translations later)
└── art/
    ├── harald.png            leader portrait
    ├── longship.png          unit sprite
    └── vikings-icon.png
```

### `mod.json`

```json
{
  "id": "vikings-plus",
  "name": "Vikings Plus",
  "version": "1.0.0",
  "authors": ["Payton"],
  "description": "Adds the Vikings with Harald and a reworked Longship.",
  "gameVersion": ">=1.0.0",
  "dependsOn": [],
  "loadAfter": ["base"],
  "modules": [],
  "tags": ["civ"]
}
```

## Content types

Every type has a schema (written with Zod, exported as JSON Schema so VS Code autocompletes and
underlines mistakes while you type).

| Type | Examples |
|---|---|
| `civ` | name, adjectives, colors, city names list, start bias, unique ability, unique unit/building/district/improvement |
| `leader` | name, portrait, default civ, leader ability, AI personality, agenda, quotes |
| `unit`, `unitClass`, `promotion` | stats, costs, requirements, abilities |
| `building`, `district`, `wonder`, `improvement`, `townSpecialization` | yields, costs, placement rules, adjacency |
| `terrain`, `feature`, `resource` | yields, move cost, defense, appearance rules |
| `tech`, `civic`, `era` | cost, prerequisites, unlocks, boost condition |
| `government`, `policy` | slots, effects |
| `greatPerson`, `belief`, `pantheon`, `governor`, `independentPower`, `legacyGoal`, `commanderPromotion` | module content |
| `mapScript` | map generation parameters (later: scripted generation) |
| `victory` | custom victory definitions |
| `rules` | global constants (growth formula numbers, combat modifiers, min city distance...) |

## The effects system (the heart of modding)

Unique abilities, policies, beliefs, wonders, promotions and great people are all expressed as
lists of **effects**. An effect = *what changes* + *who it applies to* + *when*.

```json
{
  "effect": "modify_yield",
  "params": { "yield": "production", "amount": 1 },
  "target": { "scope": "tiles", "owner": "self" },
  "condition": { "all": [
    { "tile_terrain": "coast" },
    { "tile_has_improvement": "fishing_boats" }
  ]}
}
```

### Starting set of effect types (≈40, grows as needed)

- **Yields:** `modify_yield` (flat / percent), `yield_per_adjacent`, `convert_yield`, `yield_on_event`
- **Costs:** `modify_cost` (units / buildings / districts / wonders / techs / civics / policies; flat or %)
- **Units:** `modify_combat_strength`, `modify_movement`, `modify_sight`, `grant_ability`
  (ignore ZOC, ignore terrain cost, heal after kill...), `grant_promotion`, `grant_unit`,
  `modify_upkeep`, `can_embark_early`
- **Settlements:** `modify_happiness`, `modify_growth`, `modify_border_growth`, `modify_settlement_limit`,
  `extra_district_slot`, `free_building`, `modify_town_upgrade_cost`
- **Empire:** `extra_policy_slot`, `extra_trade_route`, `grant_envoys`, `grant_great_person_points`,
  `grant_tech_boost`, `reveal_resource`, `modify_era_points`
- **Diplomacy/war:** `modify_influence`, `modify_war_support`, `modify_reputation`, `allow_casus_belli`
- **Unlocks:** `unlock` (unit, building, improvement, policy, ability)
- **Events:** `on_event` wrapper (e.g., on `city_founded`, `unit_killed`, `wonder_completed`,
  `tech_researched`) that triggers a one-time effect

### Conditions

These can be combined with `all`, `any` and `not`:
`tile_terrain`, `tile_feature`, `tile_has_resource`, `tile_adjacent_to`, `tile_on_river`,
`unit_class`, `unit_in_territory` (own/foreign/neutral), `at_war_with`, `era_at_least`,
`government_is`, `city_population_at_least`, `has_tech`, `has_civic`, `is_capital`,
`within_tiles_of`, `turn_at_least`, `random_chance` (seeded).

### Example: a complete custom civ (a leader file looks similar)

```json
{
  "type": "civ",
  "id": "civ_vikings",
  "name": "@vikings.name",
  "colors": { "primary": "#1b3a5c", "secondary": "#d9c27a" },
  "startBias": [{ "terrain": "coast", "weight": 3 }, { "terrain": "tundra", "weight": 1 }],
  "cityNames": ["Trondheim", "Bergen", "Kaupang", "Hedeby", "Birka"],
  "ability": {
    "name": "@vikings.ability.name",
    "description": "@vikings.ability.desc",
    "effects": [
      { "effect": "modify_yield", "params": { "yield": "production", "amount": 1 },
        "target": { "scope": "tiles", "owner": "self" },
        "condition": { "tile_terrain": "coast" } },
      { "effect": "grant_ability", "params": { "ability": "embark_early" },
        "target": { "scope": "units", "owner": "self", "unitClass": ["melee", "recon"] } }
    ]
  },
  "uniques": { "unit": "unit_longship", "building": "building_stave_church" },
  "leaders": ["leader_harald"]
}
```

### Escape hatch: scripted effects (later, D10)

Some ideas won't fit the effects system ("every 10 turns, swap two random players' capitals").
After v1, mods may include **sandboxed scripts** (run in an isolated JS interpreter with a strict
time/memory budget and access only to an effects API). Until then, a new effect type in the engine
(a small PR) covers anything missing.

## Patches: changing existing content

```json
{
  "type": "patch",
  "target": "unit_warrior",
  "ops": [
    { "op": "set", "path": "combat.melee", "value": 22 },
    { "op": "append", "path": "abilities", "value": "ability_ignore_zoc" }
  ]
}
```

- Patches apply in load order. Conflicts (two mods setting the same field) are **shown in the
  mod manager** before a game starts. Nothing fails silently.
- A mod can also `remove` content (e.g., a "no nukes" house-rule mod).

## Validation

`pnpm cx validate mods/vikings-plus` checks (✅ = implemented):
- ✅ schema validity, with friendly messages ("units/longship.json: `combat.melee` must be a number,
  got "25"")
- ✅ every reference resolves (`unit_longship` exists, its `requiresTech` exists...)
- ✅ no duplicate IDs, unless it's a declared patch
- ✅ strings exist for every `@` key
- art files exist and are the right size and format
- **balance hints** (warnings only), e.g., "this unit is 40% stronger than others of its era and cost"

The game runs the same validation when a mod is uploaded, and the client shows the
results in the mod manager.

## Mod manager (in-game)

- Browse the mod library, with descriptions, author, version, and what each mod adds.
- Upload a mod (zip or folder). It's validated, then becomes available to everyone in your group.
- Each game shows its locked mod list. Mods are downloaded automatically when you join.

## In-game civ creator

A form-based editor that writes the same JSON:
1. Name, colors, icon, city names.
2. Leader name, portrait upload (auto-cropped), quote.
3. Ability: pick effects from a menu (effect + target + condition dropdowns), shown with a
   plain-English preview: *"+1 ⚙️ on coast tiles you own."*
4. Unique unit: "based on" an existing unit, plus stat changes and abilities.
5. Unique building, district or improvement in the same style.
6. Save as a mod, or add it to an existing one.

## Balance tools

- `pnpm cx simulate --games 200 --mods vikings-plus` runs AI-vs-AI games and reports win rates by
  civ, average victory turn, and the most-built units. It's a quick check on whether something
  is overpowered.
- Content diff tool: "what changed between mod v1 and v2" in plain English.

## Art in mods

- The art pipeline is designed so placeholder art works everywhere: colored shapes and icons
  generated from the civ colors, until real art is dropped in.
- Sizes and formats are documented per asset type (unit sprites, leader portraits, district
  tiles, icons). The art style will be decided later (D11).
