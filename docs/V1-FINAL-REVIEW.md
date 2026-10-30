# V1 final review

The final V1 plan ([V1-FINAL-PLAN.md](V1-FINAL-PLAN.md)) is done: 22 parts, each merged to
`main`. This page has everything for Payton in one place: what's in the game, how to try it,
what's left for you to do (all optional except playing), what isn't built, and the numbers. The
first review, [V1-REVIEW.md](V1-REVIEW.md), covers the game as it was before this plan.

## At a glance

**Play it:** https://paytonknopp.github.io/Civius-Maximus/ (it rebuilds itself whenever `main`
changes).

- **Ways to play:** single player against AI leaders, hotseat on one device (up to 8 people), or
  **online with friends**: host from your browser and they join with a code or an invite link.
  No account, no server, nothing to pay. Accounts, cloud saves and a public games list are built
  in too, and switch on once you connect a free Supabase project (about ten minutes, below).
- **30 leaders and civs**, each with a full kit (an ability, unique units, a building or
  improvement, a district) and an AI personality of their own.
- **All nine eras, Ancient to Future:** 63 techs, 46 civics, 81 units, 69 buildings,
  12 districts, 45 world wonders, 16 natural wonders, 13 governments and 35 policy cards.
- **Every Civ system the plan listed**, most of them setup toggles: religion with theological
  combat, great people and great works, city-states and befriending camps, tribal villages,
  governors, loyalty, eras and ages, espionage, the World Congress, climate and disasters, nukes,
  plunder and sea trade.
- **Seven ways to win:** score, conquest, domination, science, culture, religion and diplomacy.
  All but conquest can be turned off in setup.
- **The screen:** a painterly 3D map or a flat 2D one, a Civ-style HUD with drawn icons,
  illustrated leader portraits, sound and era music, a Civilopedia (F1), advisor tips, replays
  and a Hall of Fame. A "why?" breakdown sits on every number. It works on phones.

## What's in the game

### Content (base game)

| | | | |
|---|---|---|---|
| Civs and leaders | 30 | Eras | 9 (Ancient → Future) |
| Units | 81 (13 classes) | Techs / civics | 63 / 46 |
| Buildings | 69 | Governments / policies | 13 / 35 |
| Districts | 12 | Great people | 41 (9 kinds) |
| World wonders | 45, each with its own 3D landmark | Beliefs | 30 |
| Natural wonders | 16 | City-states | 18 (6 kinds) |
| Improvements | 13 | Governors | 7, with promotion trees |
| Resources | 24 | Spy missions | 8 |
| Promotions | 42 | World Congress resolutions | 9 |
| Map scripts | 12 | Disasters | 5 |
| Map sizes / speeds / difficulties | 6 / 5 / 8 | Historic moments / dedications | 19 / 8 |

The leaders: Julius Caesar (Rome), Cleopatra (Egypt), Alexander (Macedon), Genghis Khan
(Mongols), Elizabeth I (England), Napoleon (France), Abraham Lincoln (United States), Qin Shi
Huang (China), Mansa Musa (Mali), Oda Nobunaga (Japan), Harald Hardrada (Norse), Shaka (Zulu),
Montezuma (Aztec), Hannibal (Carthage), Saladin (Ayyubids), Catherine the Great (Russia),
Ashoka (Maurya), Suleiman (Ottomans), Pachacuti (Inca), Boudica (Celts), Charlemagne (Franks),
Cyrus (Persia), Sejong (Korea), Theodora (Byzantium), Isabella (Spain), Pericles (Greece), Lady
Six Sky (Maya), Hammurabi (Babylon), Pedro II (Brazil) and Menelik II (Ethiopia). Every ability
name is original.

### Setup

- **Basic setup:** your leader, the map, difficulty, speed and rivals. **Advanced setup** adds
  everything else: start era, world age, temperature, rainfall and sea level, a leader per
  seat, every rule toggle, and saved presets. The same options apply to online games.
- **Maps:** Continents, Pangaea, Archipelago, Fractal, Small Continents, Island Plates, Inland
  Sea, Continents and Islands, Highlands, Lakes, Mirror and Shuffle, in six sizes (Duel →
  Huge).
- **Speeds:** Online (a game in an evening), Quick, Standard, Epic and Marathon.
  **Difficulty:** Settler → Deity, with the AI's bonuses shown openly. Prince gives none.
- **Toggles** (all on by default except theological combat): hostile camps, city-states, tribal
  villages, loyalty, espionage, World Congress, climate and disasters, nukes, theological combat,
  and every victory except conquest.

### Systems, by plan part

| Part | What it added | PR |
|---|---|---|
| F1 | Razing over turns; eight difficulty levels; five game speeds | [#16](https://github.com/PaytonKnopp/Civius-Maximus/pull/16) |
| F2 | The UI overhaul: a drawn icon set, Civ-style top bar, research and civic trackers, unit action bar, city panel, minimap, notification feed, rich tooltips, ornate frames | [#17](https://github.com/PaytonKnopp/Civius-Maximus/pull/17) |
| F3 | 3D art: units by era, buildings by era and culture, districts, improvements, fire, smoke and combat effects, lighting | [#18](https://github.com/PaytonKnopp/Civius-Maximus/pull/18), [#19](https://github.com/PaytonKnopp/Civius-Maximus/pull/19) |
| F4, F5 | An illustrated portrait for every leader, civ emblems, a diplomacy screen with quotes, leader intros; sound for every action, music per era (generated, plus public-domain classical played by the game's own instruments), volume settings | [#20](https://github.com/PaytonKnopp/Civius-Maximus/pull/20) |
| F6, F7 | Basic and Advanced setup with presets; 12 map scripts, world settings, natural wonders | [#21](https://github.com/PaytonKnopp/Civius-Maximus/pull/21) |
| F8 | Era score from historic moments; golden, normal, dark and heroic ages; dedications | [#22](https://github.com/PaytonKnopp/Civius-Maximus/pull/22) |
| F9 | Seven governors with promotion trees, posted to settlements | [#23](https://github.com/PaytonKnopp/Civius-Maximus/pull/23) |
| F10 | Loyalty pressure, free cities, settlements changing sides | [#24](https://github.com/PaytonKnopp/Civius-Maximus/pull/24) |
| F11 | Great writers, artists and musicians; slots, theming, tourism from works | [#25](https://github.com/PaytonKnopp/Civius-Maximus/pull/25) |
| F12, F13 | Spies with offensive and defensive missions; the World Congress with diplomatic favor, sessions, resolutions and the diplomatic victory | [#26](https://github.com/PaytonKnopp/Civius-Maximus/pull/26) |
| F14 | Floods, storms, droughts, eruptions, emissions and rising seas | [#27](https://github.com/PaytonKnopp/Civius-Maximus/pull/27) |
| F15 | The Atomic, Information and Future eras: air units, nukes, late governments, the rest of the space race | [#28](https://github.com/PaytonKnopp/Civius-Maximus/pull/28) |
| F16 | Apostles, inquisitors, gurus and theological combat; worship buildings; pillage, plunder and sea trade routes; befriending camps into city-states; city-state levies; tribal villages | [#29](https://github.com/PaytonKnopp/Civius-Maximus/pull/29), [#30](https://github.com/PaytonKnopp/Civius-Maximus/pull/30) |
| F17 | Leaders and civs 11–30 with full kits and portraits; 45 world wonders, each with a 3D landmark; the missing units (Quadrireme, Man-at-Arms, Courser, Battleship, Rocket Artillery…) and buildings (Stable, Armory, Military Academy, Shipyard, Seaport, Zoo, Sewer) | [#31](https://github.com/PaytonKnopp/Civius-Maximus/pull/31), [#32](https://github.com/PaytonKnopp/Civius-Maximus/pull/32), [#33](https://github.com/PaytonKnopp/Civius-Maximus/pull/33) |
| F18 | The AI plays every system above: it uses villages, camps, pillage, plunder, sea trade, levies, religious units, wonders, and nukes as a deterrent; balance checked by simulation | [#34](https://github.com/PaytonKnopp/Civius-Maximus/pull/34) |
| F19 | The Civilopedia (16 categories, search, 22 concept articles), advisor tips each turn, replays of finished games, a Hall of Fame | [#35](https://github.com/PaytonKnopp/Civius-Maximus/pull/35) |
| F20 | Online: chat, map pings, **Not done yet** (take back End Turn), turn timers, an AI that plays a dropped friend's seat, leader picks in the lobby | [#36](https://github.com/PaytonKnopp/Civius-Maximus/pull/36) |
| F21 | Supabase accounts, cloud saves and a public games list (switched on by configuration); the Tauri desktop app and its installer workflow; the setup guides | [#37](https://github.com/PaytonKnopp/Civius-Maximus/pull/37) |
| F22 | This review | #38 |

Every new system came with its AI, its setup toggle, its Civilopedia entry and tests, and the
design docs (`docs/03`, `04`, `06`, `09`) describe each one as built.

## How to try it (fifteen minutes)

1. Open the link. The home screen sits over a live game. **Quick game** starts you against three
   rivals on a small map. **New game** opens the full setup.
2. Found your capital (**B**), then pick research (**T**) and a civic (**C**). The big button at
   the bottom right, or Enter, always does the next thing. **?** lists every shortcut, and
   **F1** opens the Civilopedia.
3. Send your scout to a **tribal village** (the little huts) for a reward. Open the
   **City-states** screen (**I**) to see nearby camps you can **befriend** into a new city-state,
   or to levy a city-state's army once you're its suzerain.
4. Work through the screens: government (**G**), governors (**O**), great people (**P**), great
   works (**K**), espionage (**Y**), World Congress (**U**), climate (**X**), religion (**R**),
   victories (**V**), eras and ages (**E**), graphs (**H**) and lenses (**L**). Click a portrait
   in the top bar for diplomacy.
5. To see the late game quickly, use **New game → Advanced** and pick a later start era.
6. When a game ends, **Watch the replay**. Finished games collect in the **Hall of Fame** on the
   home screen.
7. Online on your own: open `https://paytonknopp.github.io/Civius-Maximus/?net=local` in two
   tabs, host in one and join in the other. Try chat (**/**), a ping (**M**), and **Not done
   yet** after ending a turn.

## Your next steps

Only the first step is needed to play together. The rest are optional, in the order I'd do them.

1. **Play a game with a friend online.** Home → **Play online…** → **Host**, then send the
   code or invite link. For a first night, pick the **Online** speed (a game in an evening), a
   2- or 3-minute **turn timer**, and **"An AI plays until they're back"** for drops. Nothing to set up.
2. **Accounts and cloud saves (optional, ~10 minutes, free):** follow
   [guides/supabase.md](guides/supabase.md). In short: create a Supabase project, paste one SQL
   file into its SQL editor, turn email confirmation off, then add the project URL and anon key
   as the repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`. GitHub: Settings →
   Secrets and variables → Actions → **Variables**, then re-run the Pages workflow. (Or paste
   them into the game's **Account** dialog to try it in just your browser.) A small workflow
   then pings the project every three days so the free tier doesn't pause it.
3. **Desktop app (optional, ~15 minutes of waiting):** GitHub → **Actions** → **Desktop
   installers** → **Run workflow**. The run's page then has Windows, macOS and Linux downloads
   ([guides/desktop.md](guides/desktop.md)). They're unsigned, so Windows and macOS show a
   warning the first time; the guide has the click-through.
4. **Install the Claude GitHub App on the repository (optional):**
   https://github.com/apps/claude/installations/select_target. My sessions then get CI results
   and review comments on their own instead of checking by hand.
5. **Send me your notes** from the playtest, in any form. I'll turn them into a tuning and fix
   pass. The checklist below is what I'd watch for.

### Playtest checklist

- **Connecting:** does your friend get in with the code? If not, note your networks: some
  offices and mobile carriers need a relay (see Known gaps).
- **Turns together:** simultaneous turns, the timer, **Not done yet**, and what happens when
  someone closes their tab and comes back (same code, same name).
- **Pace:** at Online speed, which era are you in after an hour? Did the game feel long?
- **War:** is the combat preview right? Are AI attacks fair at your difficulty? How does a war
  between the two of you feel when you move at the same time?
- **Clarity:** anything you had to ask about, and whether the Civilopedia or a "why?" answered
  it.
- **Taste:** anything that felt off compared with the Civ games you like. Those become rows in
  DECISIONS.md.

## Decisions

After the first review you said to follow the best of the Civ games for every open decision. 84 of
the 85 rows in [DECISIONS.md](DECISIONS.md) are decided, 57 of them that way, each with the choice
and the alternatives written down. The ones that changed the game during this plan:

- **D44 Razing** happens over turns, a citizen at a time, and recapture can stop it (Civ VI).
- **D53 Difficulty:** eight levels, Settler to Deity, with the AI's bonuses shown openly; Prince
  is fair play.
- **D76 Eras** run all the way to the Future era.
- **D9 Theological combat** is a toggle, off by default. **D15 Nukes** are a toggle, on by
  default.
- **D70 Religious units:** missionaries, apostles, inquisitors and gurus.
- **D82 Online:** browser to browser with no setup; Supabase switches on when configured.
- **D83 Absent players:** the host chooses whether to wait or have an AI play their seat, with
  an optional turn timer.
- **D84 Tribal villages:** on by default, one per 40 land tiles, eight kinds of reward.
- **D85 Pillaged improvements** repair themselves after 10 turns.
- **D86 Befriending camps:** 30 influence a turn for 4 turns. The first civ to finish turns the
  camp into a city-state and gets 3 envoys there.

One row is still marked open: **D32 unit auto-cycling** (after a unit moves, the next one that
needs orders is selected). It was meant to become a setting and hasn't yet. Tell me if you want
the other behavior.

## Known gaps

What the plan didn't include, and what I couldn't check from here:

- **Not built from D29 and D30** (decided early, outside this plan): corporations and
  monopolies, the Ages mode with civ switching (Civ VII), crises, and the Earth map with true
  start locations. These are the biggest remaining pieces.
- **Other Civ features not in yet:** ideologies, open borders and research agreements,
  endeavors, national parks, undo, browser or Discord notifications for "your turn",
  spectators.
- **Online:** the host's tab must stay open; there's no host handoff yet. A few strict networks
  need a relay (TURN) server, which isn't set up. There's no team or private chat, time banks or
  draft mode. Explored land you can't currently see shows what's there now, not what you last
  saw. Other civs' scores on the score chips count only what you can see of them (the Graphs
  screen has the real numbers).
- **Not tested live:** the Supabase parts are tested against a fake Supabase, not a real
  project; your setup will be their first real run. The desktop app can't be compiled in my
  environment (it needs system libraries I don't have), so the Actions workflow's first run will
  be its first real build.
- **For modders:** no mod manager or civ-creator screen yet (mods are content files), no
  translations, and no signed installers (signing costs money every year, which conflicts with
  keeping the game free).
- **Balance:** AIs rarely win by culture; culture victories mostly need a human going for them.
  Kit strengths are tuned by simulation, not yet by play.

## Tests and simulations

- **Tests:** 325 tests in 39 files, all passing. Lint (including the engine's determinism rules), Prettier,
  `tsc` in every package, the client build, and a golden replay that fails if the rules change
  by accident. CI runs all of it on every pull request.
- **Balance simulations** (six AI players, 330 turns, four seeds):
  - Medieval era around turns 70–90, Industrial 135–166, Information 267–311.
  - Two diplomatic victories (turns 307 and 329) and two score victories.
  - The AI used every F16 system: villages, camps, sea routes, pillage, plunder and levies.
  - 29 of the 45 wonders were built across the games.
- **Screenshots checked** as each part was built, at desktop and phone sizes: the setup
  screens, all 30 portraits, the wonder landmarks, the Civilopedia, advisors, replays, the online
  lobby with leader picks and chat, and the Account dialog.
