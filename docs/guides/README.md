# Setup guides

Everything in the game works without these: single player, hotseat, and online play with a
join code (straight from browser to browser) need no account and no server. These guides add
the optional parts, safely, at $0 a month.

| Guide | What it adds | Time | Cost |
|---|---|---|---|
| [Online play](online.md) | How hosting and joining work, what keeps it safe and in sync, and your own relay for strict networks | 5 minutes to read, 10 for a relay | Free |
| [Supabase](supabase.md) | Accounts, a cloud autosave every turn (continue on any device), public games | ~20 minutes | Free tier |
| [Desktop app](desktop.md) | The game as a Windows, macOS or Linux app that updates itself; links to send friends | ~15 minutes, mostly waiting | Free |
| [Art](art.md) | Painted leader portraits and 3D model packs, later | Per image | Free |

The web version is live on GitHub Pages (Settings → Pages → Source: GitHub Actions) and
rebuilds whenever `main` changes; the desktop app opens it, so both always run the latest game.

## Repository variables

All optional, under GitHub → **Settings** → **Secrets and variables** → **Actions** →
**Variables** (they end up inside the public website, so none of them is a secret):

| Variable | Used for | Guide |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Accounts, cloud saves, public games | [supabase.md](supabase.md) |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Your own relay for online play | [online.md](online.md) |
| `LIVE_URL` | The address the desktop app opens, if not this repository's GitHub Pages site | [desktop.md](desktop.md) |

After changing one, run **Actions** → **Deploy to GitHub Pages** → **Run workflow**.
