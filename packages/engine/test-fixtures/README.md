`frozen-content/` is a snapshot of the base content used only by the golden replay test, so that
balance changes to `packages/content/base` don't change the golden hash. Only update it (and the
hash) when the engine's rules change on purpose.
