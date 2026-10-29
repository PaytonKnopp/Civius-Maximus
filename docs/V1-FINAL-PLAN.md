# V1 final plan (the finished game, before playtesting)

Payton's brief after the first V1 review (October 2026): V1 should be what a finished new Civ
game would be, not a playtest build. Everything that doesn't need him to do something by hand
goes in first: the art, audio and a polished Civ-style UI; every depth module; all 30 leaders
and civs; lots of wonders; Civilopedia, hall of fame and in-game explanations. Every open
decision follows the best of the Civ games (DECISIONS.md). Once this plan is done he sets up
Supabase and the desktop build, then he and a friend playtest online.

Working rules are the same as [V1-PLAN.md](V1-PLAN.md): docs stay the source of truth, each part
ends in a PR merged to `main` (Pages redeploys), lint, format, typecheck and tests pass before
every push. Every new system comes with its AI, its setup toggle, its explanation in the UI and
the Civilopedia, and tests. At the end, a new review ([V1-FINAL-REVIEW.md](V1-FINAL-REVIEW.md))
lists everything, how to try it, and what Payton does next.

| # | Part | Status |
|---|---|---|
| F1 | **Rules match the Civ games**: razing over turns, AI difficulty levels (Settler → Deity), game speeds | ✅ |
| F2 | **UI overhaul**: a drawn icon set (yields, units, buildings, resources...), Civ-style top bar, research and civic trackers, unit action bar, city panel, minimap, notification feed, rich tooltips, ornate panel frames | ✅ |
| F3 | **3D art**: detailed units by era, buildings by era and culture, districts, a landmark for every wonder, natural wonders, improvements, effects (fire, smoke, combat), lighting polish | ✅ (wonder landmarks with F17, natural wonders with F7) |
| F4 | **Leaders and civs on screen**: an illustrated portrait for every leader, civ emblems, the diplomacy screen with portraits and quotes, leader intros | ✅ |
| F5 | **Audio**: sound effects for every action and event, music for each era (generative, plus public-domain classical pieces played by the game's own instruments), volume settings | ✅ |
| F6 | **Game setup**: Basic and Advanced setup (speed, difficulty, start era, world settings, every rule toggle, leader picks per seat, presets) for local and online games | ✅ (lobby leader picks with F20) |
| F7 | **Map breadth**: 10+ map types, world age / temperature / rainfall / sea level, natural wonders | ✅ |
| F8 | **Eras and ages**: era score from historic moments, golden, normal, dark and heroic ages with dedications | ✅ |
| F9 | **Governors**: seven governors with promotion trees, assigned to settlements | ✅ |
| F10 | **Loyalty**: loyalty pressure, free cities, settlements changing sides | ✅ |
| F11 | **Great works**: writers, artists and musicians, slots, theming, tourism from works | ✅ |
| F12 | **Espionage**: spies, offensive and defensive missions | ✅ |
| F13 | **World Congress**: diplomatic favor, sessions and resolutions, diplomatic victory | ✅ |
| F14 | **Climate and disasters**: floods, storms, droughts, eruptions, emissions and sea level (toggle) | ✅ |
| F15 | **To the Future era**: Atomic and Information eras, air units, nukes (toggle), late governments, the rest of the space race | ✅ |
| F16 | **Systems completed**: apostles, inquisitors, gurus and theological combat; worship buildings; plundering and sea trade; befriending independents and levies; goody huts | ✅ |
| F17 | **The full roster**: leaders and civs 11–30 with full kits; 40+ world wonders; the rest of the units and buildings | |
| F18 | **AI and balance**: the AI plays every system above, difficulty levels, simulation-tuned balance | |
| F19 | **Explanations and history**: Civilopedia, advisor tips, hall of fame, replays | |
| F20 | **Friends online (no setup)**: chat, map pings, un-end turn, turn timers, AI takeover, leader picks in the lobby | |
| F21 | **Ready for Payton's setup**: Supabase backend (accounts, cloud saves, lobby) switched on by configuration, Tauri desktop project, step-by-step guides | |
| F22 | **Final review**: [V1-FINAL-REVIEW.md](V1-FINAL-REVIEW.md) | |
