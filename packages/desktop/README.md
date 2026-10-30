# desktop

The desktop app: Tauri 2 wraps the web game (`packages/client`) in a native window for Windows,
macOS and Linux. No code is duplicated: `tauri build` builds the client and bundles it.

Step by step (install Rust, make the icons, build, share the installer):
[docs/guides/desktop.md](../../docs/guides/desktop.md).

- `pnpm --filter @cx/desktop icons`: makes every icon size from `icon.png` (once).
- `pnpm --filter @cx/desktop dev`: the game in a window, reloading as you edit.
- `pnpm --filter @cx/desktop build`: installers in `src-tauri/target/release/bundle/`.
