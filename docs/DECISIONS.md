# Decisions

Each decision has a **recommended default** (what the docs currently assume) and a status:
- **Open:** waiting on your input. Work proceeds with the default unless the milestone it blocks
  is next.
- **Decided:** confirmed. The docs match.

To change one, tell Claude in a session (or edit this file). The relevant docs get updated
to match.

| # | Decision | Recommended default | Alternatives | Blocks | Status |
|---|---|---|---|---|---|
| D1 | **Game name** | *TBD*. Shortlist: Epochs, Crownfall, Age of Embers, Worldforge, Banners & Borders | Anything without "Civilization" in it | Branding, M13 deploy URL | Open |
| D2 | **Platform** | Browser first, plus desktop apps via Tauri (same code), phone browser for async turns | Native engine (Godot/Unity) | — | Decided (browser + desktop) |
| D3 | **Movement with insufficient MP** | Civ 5 rule: can always move 1 tile with any MP left | Civ 6 rule: need the full cost | M5 | Open |
| D4 | **Default turn mode for 3+ players** | Dynamic (simultaneous at peace, sequential at war) | Sequential / Simultaneous | M12 | Open |
| D5 | **Login** | Discord login plus invite links (your group likely already uses Discord, and it makes turn pings natural) | Email magic link / username + password / no accounts (seat passwords) | M11 | Open |
| D6 | **Housing & amenities** | Keep both, as in Civ 6, with clear tooltips | Merge into a single "happiness" stat | M6 | Open |
| D7 | **Unit stacking** | 1 military + 1 civilian (+1 support) per tile, with corps/armies later | Unlimited stacks (Civ 1–4 style) | M5 | Open |
| D8 | **Phone support** | Phone browser can take async turns; full phone play is not a v1 goal | Full mobile-first UI in v1 | M11+ | Open |
| D9 | **Theological combat** | Off by default (lobby option) | On by default / removed | M17 | Open |
| D10 | **Scripted mods** | Data-only mods for v1; sandboxed scripts after v1 | Scripts from the start | M23 | Open |
| D11 | **Art style** | Decide later. Placeholder shapes until then | Painterly tabletop / clean flat / pixel art / AI-generated | M27 | Deferred |
| D12 | **Base civs** | Historical civs (Rome, Egypt, Japan...) with *original* abilities and art; custom civs via mods | Fully original/fantasy civs in base | M25 | Open |
| D13 | **Max players** | 8 in v1 (tested and balanced), engine not hard-limited, 12 later | 12 in v1 | M10 | Decided (2 guaranteed, 4 common, more later) |
| D14 | **Hosting** | Small cloud server (Fly.io/Railway, about $5/mo) | Host on a home PC (free, but must stay on) | M13 | Open |
| D15 | **Nukes** | Included in the late game, toggle per game | Not in base | M20 | Open |
| D16 | **Default victory set** | All on, with a turn limit (score victory) | Per-group preset | M10 | Open |
