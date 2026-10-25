# V1 plan (autonomous build)

Payton asked for the best first complete version ("V1") to be built without stopping, merging
to `main` as each part is done, and then one master review with everything that was built and
every decision for him, answered all at once. This file is the working plan: what's done, what's
next. The review being collected for the end is [V1-REVIEW.md](V1-REVIEW.md).

Milestone numbers refer to [07-roadmap.md](07-roadmap.md). Each part ends with a PR merged to
`main` (which redeploys the Pages build).

| # | Part | Roadmap | Status |
|---|---|---|---|
| 0 | Core game through the hotseat alpha | M0–M10 | ✅ |
| 1 | **AI v1**: leader personalities, expansion, building, research, districts and wonders, armies, war and peace | M11 | ✅ |
| 2 | **Leaders and civs**: the 10 civs get leaders with unique abilities, units, buildings or improvements; AI personalities come from leaders | M25 (first 10) | ✅ (parts that need trade, commanders or later eras land with those) |
| 3 | **Diplomacy**: opinions with reasons, agendas, friendship, denouncing, alliances, open borders, deals (gold, per-turn gold, luxuries, peace terms), AI proposals, the diplomacy screen | M15 | ✅ (open borders and luxury trades wait for trade routes) |
| 4 | **Commanders**: pack and unpack, command radius bonuses, retreat instead of death | M9 (moved) | ✅ (fleet commanders wait for a naval AI) |
| 5 | **Trade routes**: traders, routes and their yields, roads | M16 | ✅ (plunder and sea routes later) |
| 6 | **Great people**: points race, named individuals with one-off actions | M17 | ✅ (great works later) |
| 7 | **Religion**: pantheons, founding, beliefs, spread, religious units, religious victory | M18 | ✅ (missionaries only; apostles, inquisitors and worship beliefs later) |
| 8 | **City-states**: independent settlements with suzerains and bonuses | M19 | ✅ (from the start, Civ VI style; befriending camps and levies later) |
| 9 | **Later eras**: Renaissance → Modern techs, civics, units, buildings, governments; science and culture victories | M21 | ✅ (up to Modern; air units, nukes, ideologies and great works later) |
| 10 | **Polish**: home screen, first-game guidance, lenses, graphs and end-of-game recap, phone layout, AI in a background worker, visual pass | M21b, M21e, M29 | ✅ |
| 11 | **Online play**: host in the browser, join by code | M12–M13 | |
| 12 | **Master review**: [V1-REVIEW.md](V1-REVIEW.md), every decision listed for one sitting | — | |

Working rules (from CLAUDE.md): the design docs stay the source of truth (update them with each
part); taste calls become DECISIONS.md rows with a recommended default and also get listed in
V1-REVIEW.md; lint, format, typecheck and tests pass before every push; no copyrighted names.
