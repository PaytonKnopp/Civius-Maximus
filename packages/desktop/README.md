# desktop

The desktop app: Tauri 2 wraps the web game (`packages/client`) in a native window for Windows,
macOS and Linux. No code is duplicated: `tauri build` builds the client and bundles it as the
offline copy. At start, the app opens the live website when it answers (`VITE_LIVE_URL`, set by
the Desktop installers workflow), so one install keeps up with every merge to `main`.

Publishing, installing, sending to friends and when to rebuild:
[docs/guides/desktop.md](../../docs/guides/desktop.md).

- `pnpm --filter @cx/desktop icons`: makes every icon size from `icon.png` (once).
- `pnpm --filter @cx/desktop dev`: the game in a window, reloading as you edit.
- `pnpm --filter @cx/desktop build`: installers in `src-tauri/target/release/bundle/`.
