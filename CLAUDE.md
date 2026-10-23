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

Client checks: `pnpm build`, then `pnpm --filter @cx/client exec vite preview --port 4173` and
`pnpm --filter @cx/client screenshot <out-dir>` (Playwright screenshots at desktop and phone
size, plus console errors). `pnpm --filter @cx/client build:artifact <file.html>` builds the
client as one self-contained HTML page for sharing.

The golden replay test uses `packages/engine/test-fixtures/frozen-content`; only re-copy it from
base and update the hash when the engine's rules change on purpose.

Before committing, run `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`. CI
(`.github/workflows/ci.yml`) runs the same checks plus the client build.

## Layout

`packages/engine` (rules), `packages/content` (data + schemas), `packages/protocol` (messages),
`packages/host` (authoritative game host + transports), `packages/client` (React + PixiJS),
`packages/backend` (Supabase migrations and policies), `packages/tools` (the `cx` CLI).
Base game content lives in `packages/content/base/`; test mods in
`packages/content/test-fixtures/`. Library packages export TypeScript
source directly (`exports: ./src/index.ts`). There's no build step except the client.
