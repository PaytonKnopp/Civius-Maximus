# Decisions

Each decision has a **recommended default** (what the docs currently assume) and a status:
- **Open:** waiting on your input. Work proceeds with the default unless the milestone it blocks
  is next.
- **Decided:** confirmed. The docs match.

To change one, tell Claude in a session (or edit this file). The relevant docs get updated to match.

## Decided

| # | Decision | Choice | Docs |
|---|---|---|---|
| D1 | Game name | **Civius Maximus** | all |
| D2 | Platform | Browser first, plus desktop apps via Tauri from the same code | 01 |
| D3 | Movement with too few MP | **Civ 5 rule**: can always move 1 tile with any MP left | 03 |
| D4 | Turn mode | **Always simultaneous**, with an End Turn button. New turn when everyone is done (or the timer runs out) | 02 |
| D5 | Login | **In-game username + password**, remembered per device, stored in **Supabase (free tier)**. No Discord login needed | 01, 02 |
| D6 | Housing & amenities | Claude's call: replaced by Civ 7-style **happiness + celebrations + settlement limit**. Adjust after playtests if needed | 03, 08 |
| D12 | Base civs | Famous world leaders. Starts with the ten in 09-base-roster.md, and more are added on request | 09 |
| D13 | Max players | 8 in v1 (engine not hard-limited, 12 later) | 02 |
| D14 | Hosting | **$0/month**: Supabase free tier + free static hosting, and the host's game client runs the game | 01 |
| D17 | Game modes | Single player (vs AI), hotseat, host multiplayer with a **join code** | 02 |
| D18 | Design source | Best of Civ 5, 6 and 7, with each pick explained | 08 |
| D19 | War fairness in simultaneous turns | **As in Civ**: fully simultaneous by default, with Civ's Dynamic turns (alternate turns between players at war) as a lobby option. Tune after playtests | 02 |
| D11 | Art style | **Stylized painterly 3D**: Civ VII look + Outer Wilds / Puss in Boots painterly feel, light to run. 2D strategic view kept | 10 |
| D22 | Starting roster | **30 leaders + 30 civs**, each with a full unique kit; more on request | 09 |
| D23 | How content grows | **By asking Claude**, using checklist skills in the repo. No in-game civ creator | 00, 05 |
| D24 | Breadth | Maximum options: many map types and settings, many lenses, all the best Civ V/VI/VII systems as toggles | 00, 03, 06 |
| D20 | Leader / civ mixing | **Any leader with any civ.** The civ defaults to the leader's historical one. The host can restrict to historical pairs | 02, 09 |

## Open

| # | Decision | Recommended default | Alternatives | Blocks | Status |
|---|---|---|---|---|---|
| D7 | **Unit stacking** | 1 military + 1 civilian (+1 support) per tile, with commanders to pack units | Unlimited stacks | M5 | Open (default assumed) |
| D8 | **Phone support** | Phone/tablet browser can play a turn. A full mobile-first UI is not a v1 goal | Mobile-first in v1 | M13+ | Open (default assumed) |
| D9 | **Theological combat** | Off by default (lobby option) | On by default / removed | M18 | Open |
| D15 | **Nukes** | Included in the late game, toggle per game | Not in base | M21 | Open |
| D16 | **Default victory set** | All on, with a turn limit (score victory) | Per-group preset | M10 | Open |
| D21 | **Map wrap** | Wraps east–west by default | No wrap | M3 | Open (default assumed) |
