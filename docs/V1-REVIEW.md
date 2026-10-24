# V1 review (collected during the build)

Everything for Payton to go through in one sitting once V1 is done: what was built, how to try
it, known issues, and every decision with a recommended answer. Filled in as each part of
[V1-PLAN.md](V1-PLAN.md) lands; finished at the end.

## Decisions for you

Answer by number ("1 yes, 2 b..."). Each has the default that's in the game now.

### Already in the game before the V1 build (D31–D52, details in DECISIONS.md)

1. **D31 Starting units:** settler, warrior and scout. (Alternatives: settler + warrior only.)
2. **D32 Unit auto-cycling:** after a unit moves, the next one is selected. (Or stay on it.)
3. **D33 Where growth can develop:** own tiles within 3, or unclaimed tiles touching your land.
4. **D34 Town economy:** towns turn production into gold; upgrading costs 100 + 60 per city.
5. **D35 Base happiness:** +2 per settlement, −1 per 2 citizens, luxuries +2.
6. **D36 Science from citizens:** +0.5 per citizen.
7. **D37 Free unit upkeep:** 3 gold a turn free.
8. **D38 Celebrations:** 40 surplus happiness for the first, +30 each after, 10 turns.
9. **D39 District cost:** +2% per tech and civic finished.
10. **D40 Wonder strength:** +2–3 yields on the tile plus one empire-wide effect.
11. **D41 Town specializations:** at 5 citizens, 50 gold to change, Farming/Mining send half.
12. **D42 Captured civilians** join you as they are.
13. **D43 Settlement strikes** without walls.
14. **D44 Razing** is immediate.
15. **D45 Minimum war** of 10 turns before peace.
16. **D46 Hostile camps:** density and pace.
17. **D47 Promotion trees:** small, per class.
18. **D48 War support** numbers.
19. **D49 Raiders** carry civilians off and can't take settlements.
20. **D50 Score weights.**
21. **D51 Hotseat order:** same seat order every turn.
22. **D52 Saves** in the browser and as files.

### New during the V1 build

23. **D53 AI difficulty:** one level, the AI plays fair (no bonuses). (Or difficulty levels.)
24. **D54 When AIs start wars:** not before turn 25–85 depending on aggression, only on a nearby
    neighbor, only when clearly stronger. (Or never on humans; or earlier rushes.)
25. **D55 AI peace:** accepts unless clearly winning; offers when losing or tired of the war.
26. **D56 Army strength is public** (shown in the rival panel). (Or hidden.)
27. **D57 AI keeps captured settlements** (never razes or liberates).
28. **Leader personalities:** the numbers in `packages/content/base/leaders.json` (aggression,
    expansion, science... 0–10). Tweak any that feel wrong once you've played them.

## What was built

### Part 1: the AI (M11)
- **Single player works:** New game → add AI rivals. Each AI has a leader (Caesar, Cleopatra,
  Alexander, Genghis Khan, Elizabeth, Napoleon, Lincoln, Qin Shi Huang, Mansa Musa, Nobunaga)
  with a personality that shapes everything it does.
- **What the AI does:** scouts the map; settles good land (food, rivers, coast, luxuries) near
  home and sends soldiers with its settlers; picks research, civics, governments and policy
  cards by its tastes; builds settlers, armies, buildings, districts (at the best adjacency
  spot) and wonders; turns towns into cities and specializes the rest; buys things when rich or
  in danger; guards its settlements; clears hostile camps; strikes from its cities; and goes to
  war with weaker neighbors, gathers its army, besieges and captures cities, then makes peace
  when the war turns or drags on.
- **Rival panel** (click a civ in the top bar) shows the leader, their agenda, and army
  strength next to yours.
- **For testing:** `pnpm cx simulate 8 150` plays an all-AI game and prints how it went.

## Known issues

(Added as found.)
