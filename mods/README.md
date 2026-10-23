# Mods

Each folder here is one mod. A mod is a `mod.json` plus any number of `.json` content files,
in any subfolders you like. Full reference: [docs/05-modding.md](../docs/05-modding.md).

```
mods/my-mod/
├── mod.json
├── terrain.json      one entry, or a list of entries
└── strings/en.json   display text for any "@key" names
```

`mod.json`:

```json
{ "id": "my-mod", "name": "My Mod", "version": "1.0.0", "authors": ["You"] }
```

A content file (add a terrain, give coast tiles +1 production, and make grassland better):

```json
[
  { "type": "terrain", "id": "savanna", "name": "Savanna", "yields": { "food": 1, "production": 1 }, "color": "#b59a4a" },
  {
    "type": "ability", "id": "ability_sea_raiders", "name": "Sea Raiders",
    "effects": [
      { "effect": "modify_yield", "params": { "yield": "production", "amount": 1 },
        "target": { "scope": "tiles" }, "condition": { "tile_terrain": "coast" } }
    ]
  },
  { "type": "patch", "target": "grassland", "ops": [{ "op": "set", "path": "yields.gold", "value": 1 }] }
]
```

Check it:

```bash
pnpm cx validate mods/my-mod
```

In VS Code, every file here gets autocompletion and inline errors from `schemas/`.
