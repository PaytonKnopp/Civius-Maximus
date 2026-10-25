# V1 review

V1 is done. This page is everything for Payton in one sitting: what V1 is and how to try it,
what's next, every decision with the default now in the game, and what was built part by part
(the plan was [V1-PLAN.md](V1-PLAN.md)).

## V1 at a glance

**Play it:** https://paytonknopp.github.io/Civius-Maximus/ (it updates itself from `main`).

- **Three ways to play:** single player against AI leaders, hotseat on one device (up to 8
  people), or **online with friends**: host from your browser, they join with a code. Nothing to
  sign up for, nothing to pay.
- **10 leaders and civs** with full kits (abilities, unique units, buildings, improvements, a
  district), each played by an AI with its own personality.
- **Six eras** (Ancient → Modern): 47 techs, 37 civics, 42 units (with upgrades), 34 buildings,
  12 districts, 15 wonders, 10 governments and 35 policy cards.
- **The systems:** towns and cities, growth that develops your land, districts and adjacency,
  happiness and celebrations, combat with a full preview, promotions and commanders,
  diplomacy (opinions, deals, friendships, alliances, denouncing, surprise wars), trade routes
  and roads, 26 great people, religion (pantheons, 22 beliefs, missionaries), 18 city-states
  with envoys and suzerains, hostile camps.
- **Six ways to win** (each can be turned off): score, conquest, domination, science (space
  race), culture (tourism), religion.
- **The screen:** painterly 3D or a flat 2D map, phone-friendly; a "why?" breakdown on every
  number; lenses, graphs, a help screen and first-game hints; saves in the browser.
- **For building more:** every rule number lives in content files, there's a Map Lab, and
  `pnpm cx simulate` plays whole AI games to check balance.

**A ten-minute tour:**

1. Open the link and press **Quick game** (you and three rivals on a small map). The big button
   at the bottom right (or Enter) always does the next thing; **?** lists every shortcut.
2. Found your capital (**B**), pick research (**T**) and a civic (**C**), and Enter through the
   turns. Growth asks you which tile to develop.
3. Try the lenses (**L**), graphs (**H**), victories (**V**), city-states (**I**), religion
   (**R**) and great people (**P**). Click a civ in the top bar for diplomacy.
4. Online: **Play online…** → host → send your friend the code or invite link. To try it alone,
   open `…/Civius-Maximus/?net=local` in two tabs and host in one, join in the other.

## What's next (recommended order)

1. **Play it, ideally online with friends** (the playtest checkpoint), and answer the decisions
   below. I'll turn your answers and your notes into a tuning pass.
2. **Balance from play and simulation:** late-game pace, AI tourism, kit strengths, city-state
   bonuses (see Known issues).
3. **Accounts and cloud saves** (roadmap M12–M13): Supabase sign-in, saves in the cloud, chat,
   turn timers, an AI that takes over an absent seat, host handoff, and a relay server for
   strict networks. This is the one step that needs something from you: a free Supabase project
   (I'll give you the exact clicks when we get there).
4. **AI v2** (M22): AI deal-making with humans, smarter wars with commanders, religion and
   city-state play, difficulty levels.
5. **Art and audio** (M28): leader portraits, real models for units and buildings, the painted
   icon set, music and sound.
6. **More content** (M25–M26, M21): leaders 11–30, more wonders and units, the Atomic and
   Information eras (air units, nukes as a toggle), great works.
7. **The remaining depth modules:** governors and golden ages (M20), more map types and world
   settings (M21a), more lenses (M21b), espionage, world congress and loyalty (M21c), climate
   and the other setup toggles (M21d).
8. **Replays, hall of fame, Civilopedia** (M29) and **desktop apps** (M27).

## Decisions for you

Answer by number ("1 yes, 2 b..."). Each has the default that's in the game now; anything you
don't answer stays as it is.

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
36. **D65 Trade routes:** 20 turns, 15 tiles; domestic +2🍞 +2⚙, international +4💰
    (+1 per destination district), roads halve movement.
37. **D66 Great people:** 50–60 points (rising), districts and buildings earn them, recruit
    for 3 gold per missing point. Also: who should be on the list? Ask for anyone.
38. **D67 Religion numbers:** pantheon 25 faith; players ÷ 2 + 1 religions; pressure from
    followers within 8 tiles (+2, holy city +4, trade routes +3, −10% a turn), converts at 40;
    missionaries 100 faith, +60 pressure, 3 uses.
39. **D68 Whole settlements follow a religion** (or none). (Or per-citizen followers.)
40. **D69 Faith patronage:** great people for 3 faith per missing point, not prophets; a civ with
    a religion leaves the prophet race.
41. **D70 Religious units:** missionaries only (no apostles, inquisitors, theological combat).
42. **D71 Religion names:** you type yours; AIs use "<Civ> Faith". (Or a list to pick from.)
43. **D72 City-states from the start** (Civ VI), camps stay raiders. (Or camps you befriend grow
    into city-states, Civ VII.)
44. **D73 City-state numbers:** 3–18 by map size, envoys 40 influence or free (5 civics,
    quests, first to meet), bonuses at 1/3/6, suzerain at 3 and the most.
45. **D74 War with city-states:** costs your envoys there; they always take peace; no levies.
46. **D75 Suzerain bonuses:** see `packages/content/base/city-states.json`; tell me any that
    feel off.
47. **D76 Later eras stop at Modern** for V1 (no Atomic/Information eras, air units, nukes).
48. **D77 Modern governments:** Democracy, Collectivism, Militarism; no ideology pressure yet.
49. **D78 Unit upgrades:** 2 gold per production point of difference (min 20), in your territory.
50. **D79 Science victory:** Spaceport + 4 projects, the last arrives after 10 turns.
51. **D80 Culture victory:** culture/100 domestic tourists vs tourism/150 visitors, +25%
    bonuses for trade routes, shared religion and friendship.
52. **D81 First-game hints:** ten one-time notes on what this game does differently from Civ,
    on by default, off with one click. Or none at all (doc 06 says no hand-holding)?
53. **D82 Online games connect** browser to browser (WebRTC) through PeerJS's free public broker:
    no accounts, nothing to set up. Supabase accounts and cloud saves later (needs a free
    project of yours when you want them).
54. **D83 Absent players:** the game waits and the host can end their turn; no AI takeover yet.

## What was built

### Before the V1 build (M0–M10): the core game
- The engine: deterministic rules (same seed, same game; replays and saves rely on it), every
  rule number in content files, mods as folders, a validator.
- World generation: continents, Pangaea, archipelago and fractal maps in six sizes, rivers,
  resources and balanced starts; the Map Lab to look at them.
- The painterly 3D map (and 2D), fog of war, units and movement with path previews, towns and
  cities, growth that develops a tile, citizens and focus, buying tiles, borders.
- Technology and civic trees, governments and policy cards, happiness and celebrations.
- Improvements, districts with adjacency, wonders with a race for each.
- Combat with a full preview, ranged attacks, settlement strikes and walls, capturing and
  razing, promotions, hostile camps and raiders, war support, score and domination victories.
- Hotseat for up to 8 people, saves in the browser and as files.

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

### Part 5: trade routes and roads
- **Trader** (after Foreign Trade): in one of your settlements, select it and pick a
  destination from its panel (each shows what the route gives). Routes run 20 turns, show in
  the settlement's yields, build a **road** (half-cost movement), then the trader comes home.
- Route slots: Foreign Trade, each Commercial Hub and Harbor. Wars end routes between the two
  sides. Roads draw in 2D and 3D.
- The AI builds traders for its free slots and picks the best routes (abroad to players it
  likes). The trade parts of the Mongol, Egyptian, Malian and Roman kits now work.

### Part 6: great people
- ★ **Great people** (top bar, or P): seven kinds, 26 named people (Euclid, Hypatia, Imhotep,
  Marco Polo, Sun Tzu, Homer, Zheng He...). Districts and buildings earn points; the first to
  the cost earns the person, or **Recruit** them with gold for the points you're missing.
- A great person appears at your capital: select it and **Activate** in a settlement for its
  reward (science, production, gold, boosts, inspired soldiers...) and, for some, a lasting
  bonus.
- The AI uses its great people at once and buys one when it's rich and leading the race.

### Part 7: religion
- 🙏 **Religion** (top bar, or R): take a **pantheon** for 25 faith (11 to choose from, each
  only once in a game).
- Build a **Holy Site** to earn Great Prophet points. Select the prophet in that settlement and
  press **Found a religion**: name it, pick a founder belief (yields per follower) and a
  follower belief (for every settlement that follows it).
- Religions spread by themselves to settlements within 8 tiles of followers, faster near the
  holy city and along trade routes. Hover a settlement's 🙏 line to see the pressure on it.
- Buy **Missionaries** with faith (settlement panel, "With faith") and **Preach** next to other
  settlements to convert them.
- **Religious victory** (new-game option): your religion followed in more than half the
  settlements of every other civ.
- Great people can now also be bought with **faith** (not prophets).
- The AI picks pantheons, races for prophets, founds religions and sends missionaries.

### Part 8: city-states
- 🏛 **City-states** (top bar, or I): 3–18 on the map by size, six kinds (Scientific, Cultural,
  Trade, Religious, Militaristic, Industrial), 18 named ones (Ugarit, Byblos, Sparta, Delphi...).
- Find one to meet it (the first to arrive gets a free envoy). **Send envoys** (free ones from
  civics and quests, or 40 influence): 1, 3 and 6 unlock its kind's bonuses; the most (at
  least 3) makes you **suzerain** with its own bonus.
- Quests: build its kind's district, send it a trade route (+1 envoy each).
- Click a city-state's settlement for the same card. Declaring war on one costs your envoys
  there; free a captured one for 6 envoys.
- The AI competes for envoys and suzerainties. New-game option to turn them off.

### Part 9: later eras, science and culture victories
- Three more eras: **Renaissance, Industrial, Modern** (47 techs and 37 civics in all), with
  musketmen, frigates, cavalry, field cannons, ironclads, infantry, tanks, destroyers and
  more; banks, museums, factories, stock exchanges, hospitals, power plants, research labs,
  broadcast centers and stadiums; St. Basil's, the Taj Mahal, Big Ben, the Eiffel Tower, the
  Statue of Liberty and Broadway; Democracy, Collectivism and Militarism; 13 new policies.
- **Upgrades:** an older unit in your territory shows an Upgrade button (gold); old units drop
  off the build list once their replacement is available.
- 🏆 **Victories** (top bar, or V): everyone's progress toward each victory.
- **Science victory:** research Rocketry, build a Spaceport, then the four space projects on
  it; the last one arrives 10 turns later.
- **Culture victory:** tourism (wonders, museums, broadcast centers...) draws visitors from
  every civ you've met; win when they outnumber each civ's own tourists. Trade routes, a
  shared religion and friendship help.
- The rest of the kits: England's Privateer and extra trade routes, France's Imperial Guard and
  Napoleon's commander bonus, America's Rough Rider and Film Studio, Japan's Electronics Works
  and cheaper, stronger gunpowder units.
- The AI researches into the new eras, upgrades its units, and races for space when it can.

### Part 10: polish
- **Home screen** when you open the game: Continue (your autosave), Quick game, New game, Load
  game, Map Lab, over the live map.
- **No more freezes at End Turn:** the turn and the rivals' moves run in a background worker
  ("Rivals are moving…" on the turn button meanwhile).
- 📈 **Graphs** (H, or from Victories): score, science, culture, tourism, military, citizens and
  settlements over the game for every civ, with a hover readout. The end screen shows the
  score graph.
- 🔍 **Map lenses** (L, or the chip at the top): tile yields across your land, the best places
  to settle (ranked, the top three in gold), resources colored by kind, and which religion each
  settlement follows.
- ❓ **Help** (?): every keyboard and mouse shortcut on one screen. **First-game hints** (D81):
  a short note the first time something this game does its own way comes up.
- 🎨 **Unit models for the later eras:** riflemen, cannon, a catapult, tanks, steamships, a
  commander with a banner, robed missionaries and great people (until now they reused ancient
  models). The Map Lab's "Unit models" switch shows one of each.

### Part 11: online play
- 🌐 **Play online…** on the home screen: host a game (your name, how many friends, AI rivals,
  map) and get a six-character code, or join a friend's with their code. **Copy invite link**
  makes a link that opens the join screen with the code filled in.
- Your browser hosts: it runs the real game, and each friend's browser is only ever sent what
  their civ can see (no peeking through the fog in their dev tools; a test checks it). Moves
  show at once on each player's screen and the host confirms them.
- Everyone plays at the same time; the turn ends when all humans have ended theirs. A friend
  who drops shows as away (⏸): rejoin with the same code and name to get the seat back, or the
  host can **End their turn**.
- The host's game autosaves; **Host your online game again** on the home screen re-opens it
  with a new code, and friends get their seats back by name.
- Nothing to sign up for and nothing to pay (D82). Try it alone with two tabs:
  `…/?net=local`, host in one tab, join in the other.

## Known issues

- Late game pace (AI-only games): the Modern era arrives around turns 200–300 and the first
  science victory around turn 330 in a 6-player game. AIs make little tourism, so culture
  victories mostly need a human going for them.
- Online: on a few strict networks (some offices and mobile carriers) browsers can't connect
  directly; that needs a relay server, which isn't set up. The host's tab must stay open. Land
  you explored but can't see right now shows what's there now, not what you last saw. Other
  civs' scores on the score chips and the Victories screen count only what you can see of them
  (the Graphs screen has the real numbers).

(Added as found.)
