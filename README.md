# Civius Maximus

A turn-based 4X strategy game that takes the best of Civ 5, 6 and 7. Play solo against AI leaders,
or host a game and have 2–8 friends join with a code. Everyone takes their turn at the same time.
Built from the ground up to be modded: leaders, civs, units and rules are all data. Costs $0/month to run.

> **Play it:** https://paytonknopp.github.io/Civius-Maximus/ (deployed from `main` by
> `.github/workflows/pages.yml`).
>
> **Status:** M7 done: found settlements and grow them by developing tiles; research through the
> tech and civics trees (Ancient → Medieval) with boosts; adopt governments and slot policy cards;
> celebrate. 3D or 2D. Next: M8, improvements' adjacency, districts and wonders.

## Design docs

| Doc | What's in it |
|---|---|
| [00 · Vision](docs/00-vision.md) | Pillars, what "finished" means, what we're not doing |
| [01 · Architecture](docs/01-architecture.md) | Tech stack, engine design, free hosting with Supabase, determinism, testing |
| [02 · Multiplayer](docs/02-multiplayer.md) | Game modes, join codes, accounts, simultaneous turns, timers, chat, saves |
| [03 · Core mechanics](docs/03-core-mechanics.md) | Map, yields, towns & cities, happiness, units, commanders, combat, trees, districts |
| [04 · Advanced systems](docs/04-advanced-systems.md) | Diplomacy & influence, trade, great people, religion, independent powers, eras, victories |
| [05 · Modding](docs/05-modding.md) | Content format, the effects system, patches, validation, civ creator |
| [06 · UI/UX](docs/06-ui-ux.md) | Screens, HUD, lenses, explainability, controls, accessibility |
| [07 · Roadmap](docs/07-roadmap.md) | Milestones M0–M29, playtest checkpoints, effort estimates |
| [08 · Best of Civ 5/6/7](docs/08-best-of-civ.md) | Which version of each system we use, and why |
| [09 · Base roster](docs/09-base-roster.md) | The starting 30 leaders and civs, plus the queue |
| [10 · Art direction](docs/10-art-direction.md) | Painterly stylized 3D: Civ VII + Outer Wilds + Puss in Boots |
| [Decisions](docs/DECISIONS.md) | Decided and open questions |

## Development

Requires Node 22+ and pnpm 10+.

```bash
pnpm install
pnpm lint        # ESLint, including determinism rules for the engine
pnpm typecheck   # TypeScript, all packages
pnpm test        # Vitest, all packages
pnpm dev         # client dev server
pnpm cx validate mods/my-mod   # check a mod (see mods/README.md)
```

## Legal note

Game mechanics are fair to use. This project uses **no** Firaxis/2K art, text, icons, ability
names, or the "Civilization" trademark. All leader and civ abilities are original.
