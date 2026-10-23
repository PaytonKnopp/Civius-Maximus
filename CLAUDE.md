# Working agreement for Claude sessions

- **The design docs in `docs/` are the source of truth.** Before building a milestone, read
  `docs/07-roadmap.md` for its scope and the docs it touches. If the implementation needs to
  differ from a doc, update the doc in the same PR and say why.
- **Taste calls go to the user.** Anything that's a matter of game feel rather than engineering
  becomes a row in `docs/DECISIONS.md` with a recommended default. Ask before deciding it.
- **Non-negotiables** (see `docs/01-architecture.md`): the engine is deterministic (seeded RNG
  stored in state, no `Math.random()`, no floats in rules math, stable iteration order); no
  2-player assumptions anywhere; every rule constant lives in content, not code; the server is
  authoritative and redacts fog-of-war.
- **No copyrighted assets or text** from Civilization games. Mechanics only.
- Each milestone ends in a PR with tests and a short "what's new / how to try it / new decisions"
  note for the user.
- Testing commands will be added here once M0 sets up the toolchain.
