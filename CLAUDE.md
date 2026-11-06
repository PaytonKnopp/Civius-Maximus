# Working agreement for Claude sessions

- **The design docs in `docs/` are the source of truth.** Before building a milestone, read
  `docs/07-roadmap.md` for its scope and the docs it touches. If the implementation needs to
  differ from a doc, update the doc in the same commit and say why.
- **Taste calls go to the user.** Anything that's a matter of game feel rather than engineering
  becomes a row in `docs/DECISIONS.md` with a recommended default. Ask before deciding it.
- **Non-negotiables** (see `docs/01-architecture.md`): the engine is deterministic (seeded RNG
  stored in state, no `Math.random()`, no floats in rules math, stable iteration order); no
  2-player assumptions anywhere; every rule constant lives in content, not code; the host is
  authoritative and only sends each player what they can see; it must stay free to run.
- **No copyrighted assets, text or ability names** from Civilization games. Mechanics only.
- Each milestone ends with a short "what's new / how to try it / new decisions" note for the user.

## Commands

| Command | What it does |
|---|---|
| `pnpm lint` | ESLint, including determinism rules for `packages/engine` and `packages/content` |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm typecheck` | `tsc` in every package |
| `pnpm test` | Vitest across all packages |
| `pnpm dev` / `pnpm build` | Client dev server / production build |
| `pnpm cx validate [mods...]` | Compile base content (+ mods) and print every problem |
| `pnpm cx schema` | Regenerate `schemas/` (a test fails if they're stale) |
| `pnpm cx map [script] [size] [seed]` | Print a generated map as text |
| `pnpm cx mapcheck [count] [sizes]` | Generate + validate many maps (run after map generator changes) |
| `pnpm cx simulate [players] [turns] [seed] [size] [script] [--afk]` | Play an all-AI game and report on it (run after AI or balance changes) |
| `pnpm cx stats <preset\|matrix.json> [--out f.jsonl] [--jobs N]` | Play a batch of all-AI games in parallel (presets in `packages/tools/src/statsPresets.ts`: speeds, sizes, scripts, difficulty, eras, standard, options-off) and record pace, victories, yields over time, builds and choices, one JSON line per game. Run before and after balance changes |
| `pnpm cx stats-report <f.jsonl> [speed\|size\|difficulty\|startEra\|script\|all]` | Summarize measured games into the tables used in `docs/MECHANICS-REVIEW.md` |
| `pnpm cx profile [players] [turns] [seed] [size] [script] [--every N] [--from f] [--save f] [--check]` | Play an all-AI game and report turn time, AI time, save size and memory as it goes on, plus the final state hash. Run it before and after any engine change that touches turn processing, the AI or map code: the hash must not change for a speed-up, and `--check` (CI runs it) fails if late games get slow. `--save`/`--from` keep a mid-game state to re-measure quickly |

Client checks: `pnpm build`, then `pnpm --filter @cx/client exec vite preview --port 4173` and
`pnpm --filter @cx/client screenshot <out-dir>` (Map Lab screenshots at desktop and phone
size, plus console errors); `node packages/client/scripts/screenshot-3d.mjs <out-dir>` captures
the 3D view at Medium, in fog view, at High, every unit model close up, and every building style and age; `node packages/client/scripts/screenshot-art.mjs <out-dir>` captures close-ups of towns and figures at High (`QUALITY=medium` for another preset); `node packages/client/scripts/screenshot-game.mjs
<out-dir>` plays the first turns of a local game (select, path preview, move, end turn, lenses,
help, 2D view, phone size), or with `SAVE=<state.json>` plays on from a saved state (e.g. from
`cx profile --save`) as seat p1; `node packages/client/scripts/screenshot-menus.mjs <out-dir>` captures every screen before a game
(title, Options, New game and the leader picker, Civilopedia, Hall of Fame, Load, Play online) at
desktop and phone size and flags anything wider than the screen; `node packages/client/scripts/screenshot-online.mjs <out-dir>` plays
an online game between two tabs (`?net=local`): lobby, join, a turn, a friend dropping. The app opens on a home screen over a quick game; `#play` in the URL skips it (the game scripts use it) and `#lab` opens the Map Lab.
`node packages/client/scripts/perf-lategame.mjs early=<save.json> late=<save.json>` loads saves made with `cx profile --save` and compares frame times in a real browser (see its header; it needs the client built and served).
`pnpm --filter @cx/client build:artifact <file.html>` builds the client as one self-contained
HTML page for sharing.

The golden replay test uses `packages/engine/test-fixtures/frozen-content`; only re-copy it from
base and update the hash when the engine's rules change on purpose.

Before committing, run `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`. CI
(`.github/workflows/ci.yml`) runs the same checks plus the client build.

## Layout

`packages/engine` (rules), `packages/content` (data + schemas), `packages/protocol` (messages),
`packages/host` (authoritative game host + transports; `LocalGame` runs a game in the browser),
`packages/client` (React, PixiJS for 2D, Three.js for 3D; `src/game` is the game screen),
`packages/backend` (Supabase migrations and policies), `packages/tools` (the `cx` CLI).
Engine tests build hand-drawn maps with `packages/engine/src/testing/world.ts`.
Base game content lives in `packages/content/base/`; test mods in
`packages/content/test-fixtures/`. Library packages export TypeScript
source directly (`exports: ./src/index.ts`). There's no build step except the client.
