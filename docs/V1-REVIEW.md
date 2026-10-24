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
29. **D58 Kit numbers** (abilities and uniques, first pass): see the table in
    `docs/09-base-roster.md`, "In the game now". Tell me any that feel too strong or weak.
30. **D59 What uniques replace** while the planned base items don't exist (War Chariot →
    Horseman, Samurai → Swordsman, Thermae → Baths, Ordu/Royal Pages School → Barracks,
    Royal Dockyard → Lighthouse).
31. **D60 Surprise wars:** declaring without denouncing first (10 turns) is a surprise war:
    war-support head start for the target, and every AI remembers it.
32. **D61 Pacts:** friendship 30 turns (20 influence each), alliance 30 turns (50 each, shares
    vision), 10-turn peace treaty after every war, +2 influence a turn.
33. **D62 AI rivals answer deals at once**, and the deal screen shows their answer beforehand.
34. **D63 Opinion weights** (`rules.json` → `diplomacy.opinion`).
35. **D64 Commanders:** carry 4, radius 1, +2 strength, 5 turns out after a retreat.
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

### Part 2: leaders and civ kits
- All 10 leaders and civs have their abilities, and 7 unique units, 6 unique buildings, a
  unique district and 3 unique improvements are in. A few pieces wait for systems that come
  later (trade routes, commanders, later eras); the table in `docs/09-base-roster.md` shows
  exactly what works now.
- Click any civ in the top bar (your own too) and open **Abilities and uniques**.
- Mali can buy buildings with faith (a ✨ button next to the gold one).
- The AI builds its civ's uniques automatically (they're stronger versions of what it wants).

### Part 3: diplomacy
- Click a civ in the top bar: their **opinion of you** with every reason, your relation
  (friends, allies, treaty, war), offers waiting, **Propose a deal…** (gold, payments, maps,
  friendship, alliance, peace, with a live "would they accept?"), and **Denounce…**.
- 🤝 **Influence** in the top bar pays for friendships, alliances and denouncing.
- Friends and allies can't declare war on each other; allies share vision; every war ends in a
  10-turn peace treaty; a surprise war is remembered by everyone.
- AIs make friends and alliances among themselves, denounce rivals, and denounce before they
  attack (diplomatic leaders). The top bar marks friends 🙂, allies 🤝 and offers ✉.

### Part 4: commanders
- **Army Commander** (after Military Tradition): select it and press **Pack** to load the
  soldiers on and next to it (up to 4), move it, then **Unpack** to put them down around it,
  ready to fight if the commander still has moves.
- Soldiers within 1 tile get +2 strength; the commander earns XP from their fights and has its
  own promotions (Assault, Bastion, Logistics, Field Medicine, Leadership).
- Caught by an enemy, it falls back to your nearest settlement for 5 turns instead of dying.
- The AI builds one once its army is big (or at war) and keeps it with its front line.

## Known issues

(Added as found.)
