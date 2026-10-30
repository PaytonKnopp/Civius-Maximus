# The desktop app (Tauri)

`packages/desktop` wraps the same game in a native window with [Tauri 2](https://v2.tauri.app):
small installers (a few MB), no browser tabs, and saves, online play and everything else work
as on the website.

## The easy way: let GitHub build it

1. In GitHub, open the repository → **Actions** → **Desktop installers** → **Run workflow**.
2. Wait about 15 minutes. The run's page then has three downloads (**Artifacts**): Windows
   (`.msi` and `.exe`), macOS (`.dmg`) and Linux (`.deb` and `.AppImage`).
3. Unzip the one you need and install it, or send it to your friends.

If the Supabase repository variables are set ([supabase.md](supabase.md)), the app has
accounts and cloud saves built in.

The installers aren't code-signed (that costs money each year), so the first launch asks:

- **Windows:** "Windows protected your PC" → **More info** → **Run anyway**.
- **macOS:** right-click the app → **Open** → **Open** (once).

## Building on your own computer

1. **Rust:** install from [rustup.rs](https://rustup.rs) (the default options).
2. **Your system's pieces** ([Tauri's list](https://v2.tauri.app/start/prerequisites/)):
   - **Windows:** [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
     with "Desktop development with C++". WebView2 is already on Windows 10 and 11.
   - **macOS:** `xcode-select --install`.
   - **Linux (Debian/Ubuntu):**
     `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
3. **Node 22 and pnpm:** as for the rest of the project (`corepack enable`, then `pnpm install`
   in the repository).
4. Run it: `pnpm --filter @cx/desktop dev` opens the game in a window (it reloads as code
   changes).
5. Build the installer: `pnpm --filter @cx/desktop build`. The first build downloads and
   compiles a lot (5–10 minutes); later ones are quick. Installers land in
   `packages/desktop/src-tauri/target/release/bundle/`.

## Changing the icon

Replace `packages/desktop/icon.png` (1024×1024) and run `pnpm --filter @cx/desktop icons`; keep
the five files listed under `bundle.icon` in `src-tauri/tauri.conf.json` (the command also makes
mobile sizes you can delete).

## How it fits together

- `src-tauri/tauri.conf.json` builds the client (`pnpm --filter @cx/client build`) and bundles
  `packages/client/dist`. The window is 1440×900 and resizable.
- `src-tauri/src/main.rs` only opens the window; the app asks for no file or shell access
  (`capabilities/default.json`).
- The game stores saves and settings in the app's own web storage, separate from your browser's.
