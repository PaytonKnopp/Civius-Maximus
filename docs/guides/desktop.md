# The desktop app

The desktop app is the game in its own window on Windows, macOS or Linux, with an icon on the
desktop and no browser tabs. **You install it once and it stays up to date by itself:** every
time it starts, it opens the live game from the website, so whatever was last merged to `main`
is what everyone plays, with nothing to download again. Without internet it plays the copy of
the game it was installed with.

## How updates reach everyone

```
merge to main ─► "Deploy to GitHub Pages" (≈2 min) ─► the website has the new version
                                                        │
              the desktop app, at every start ◄─────────┘ (and a website tab when reloaded)
```

- **Game updates** (rules, art, UI, fixes: everything in `packages/`) arrive in the app the next
  time it starts. An app or tab left open shows **A new version is out · Reload** on the title
  screen; an open game is never interrupted.
- **Installing again** is only needed if the app *itself* changes (its window, icon or the
  Tauri shell), which is rare; this guide says so when it happens. If the app doesn't change, the
  installers from the first run keep working forever.
- **Saves:** the app keeps its own saves on each computer, apart from the browser's; with an
  account ([supabase.md](supabase.md)) the autosave also goes to the cloud each turn, and
  **Continue** picks the newest from anywhere. Saves from before an update keep working.

## 1. Publish the installers (once, 15 minutes of waiting)

The **Desktop installers** workflow builds the app for all three systems and publishes them as a
public **release** on GitHub, at links that never change.

1. GitHub → the repository → **Actions** → **Desktop installers** → **Run workflow** → branch
   `main` → **Run workflow**.
2. Wait for the run to finish (about 15 minutes: three builds, then **release**). All green?
3. The repository's front page now shows **Releases** on the right → **Desktop app (build N)**,
   with five files. These links always download the newest:

| System | Link |
|---|---|
| Windows | `https://github.com/PaytonKnopp/Civius-Maximus/releases/latest/download/Civius-Maximus-Windows-setup.exe` |
| macOS (Apple silicon and Intel) | `https://github.com/PaytonKnopp/Civius-Maximus/releases/latest/download/Civius-Maximus-macOS.dmg` |
| Linux | `https://github.com/PaytonKnopp/Civius-Maximus/releases/latest/download/Civius-Maximus-Linux.AppImage` |

(If the repository has a different name, swap it into the links; the release page shows them
too. There's also a Windows `.msi` and a Linux `.deb`.) The repository is public (GitHub Pages
needs that on a free account), so friends need no GitHub account.

You ran the older version of this workflow once already: its installers were only attachments
to that run (they expire after 90 days and need a GitHub login). Run it again after this update
merges, and use the release links from now on.

## 2. Install it on your computer (2 minutes)

The installers aren't code-signed (signing costs $100–400 a year), so each system asks once
whether you trust the app. This is expected; after the first launch it opens normally.

**Windows**

1. Download `Civius-Maximus-Windows-setup.exe` and open it.
2. "Windows protected your PC" → **More info** → **Run anyway**.
3. The installer finishes in seconds and adds **Civius Maximus** to the Start menu (and the
   desktop). It may first install Microsoft's WebView2 if the PC lacks it (Windows 10 and 11
   usually have it).

**macOS**

1. Download `Civius-Maximus-macOS.dmg`, open it, and drag **Civius Maximus** into
   **Applications**.
2. Open it from Applications. macOS says it can't verify the developer → **Done** (not "Move to
   Trash").
3. **System Settings** → **Privacy & Security** → scroll down to "Civius Maximus was blocked" →
   **Open Anyway** → enter your password → **Open**.
4. If macOS instead says the app "is damaged and can't be opened", that's the same warning
   worded badly: open **Terminal** and run
   `xattr -dr com.apple.quarantine "/Applications/Civius Maximus.app"`, then open it again.

**Linux**

- **AppImage** (any distribution): download it, then `chmod +x Civius-Maximus-Linux.AppImage`
  and run it (or right-click → Properties → "Allow executing as program").
- **Debian/Ubuntu:** download the `.deb` and `sudo apt install ./Civius-Maximus-Linux.deb`.
- Some Linux web views have no WebRTC, so online play may not connect from the Linux app; the
  website in Firefox or Chrome always works.

The first start shows "Loading…" for a moment while it reaches the website.

## 3. Send it to friends (1 minute)

Send them a message like this (with your links):

> Civius Maximus, my game. Install once, it updates itself:
> Windows: https://github.com/PaytonKnopp/Civius-Maximus/releases/latest/download/Civius-Maximus-Windows-setup.exe
> Mac: https://github.com/PaytonKnopp/Civius-Maximus/releases/latest/download/Civius-Maximus-macOS.dmg
> Windows will say "protected your PC": More info → Run anyway. Mac: drag it to Applications,
> open it, then System Settings → Privacy & Security → Open Anyway.
> No install? Play in the browser: https://paytonknopp.github.io/Civius-Maximus/

The website and the app are the same game and play together online.

## 4. When do I run the workflow again?

- **Normally never.** Merging to `main` updates the website, and the app follows.
- **When the app itself changed:** a change under `packages/desktop/` (icon, window, Tauri).
  Run **Desktop installers** again; the links above then download the new installers, and
  friends install over the old one (their saves stay).
- **If the website moves** (the repository is renamed, or you add a custom domain): set the
  repository variable `LIVE_URL` to the new address (with a `/` at the end) and run the workflow
  again, then send friends the new installers. Until they reinstall, their app plays its
  built-in copy (it can't find the old address).

## Building on your own computer (optional)

You don't need this to use or share the app; it's for changing the app itself.

1. **Rust:** install from [rustup.rs](https://rustup.rs) (the default options).
2. **Your system's pieces** ([Tauri's list](https://v2.tauri.app/start/prerequisites/)):
   - **Windows:** [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
     with "Desktop development with C++". WebView2 is already on Windows 10 and 11.
   - **macOS:** `xcode-select --install`.
   - **Linux (Debian/Ubuntu):**
     `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
3. **Node 22 and pnpm:** as for the rest of the project (`corepack enable`, then `pnpm install`
   in the repository).
4. `pnpm --filter @cx/desktop dev` opens the game in a window (it reloads as code changes; it
   doesn't jump to the website).
5. `pnpm --filter @cx/desktop build` makes installers in
   `packages/desktop/src-tauri/target/release/bundle/`. Built this way, the app opens the
   website only if `VITE_LIVE_URL` is set (e.g.
   `VITE_LIVE_URL=https://paytonknopp.github.io/Civius-Maximus/`).

## Changing the icon

Replace `packages/desktop/icon.png` (1024×1024) and run `pnpm --filter @cx/desktop icons`; keep
the five files listed under `bundle.icon` in `src-tauri/tauri.conf.json` (the command also makes
mobile sizes you can delete). Then run the workflow again (this is an app change).

## How it fits together

- `src-tauri/tauri.conf.json` builds the client (`pnpm --filter @cx/client build`) and bundles
  `packages/client/dist` as the offline copy. The window is 1440×900 and resizable. On macOS
  the app is ad-hoc signed (`signingIdentity: "-"`), which Apple silicon needs to run it at all.
- At start, the bundled page (`client/src/update.ts`, `openLiveSite`) asks the website for its
  `version.json`; if it answers within five seconds, the window goes to the website (with a
  fresh address, so no stale copy is used); otherwise the bundled game plays.
- `src-tauri/src/main.rs` only opens the window. The app asks for no file or shell access
  (`capabilities/default.json`), and the website gets no access to the app's native side at
  all: it runs like a page in a browser.
- The workflow names the files the same every time and publishes them with `--latest`, which is
  what makes `releases/latest/download/<file>` links permanent.
