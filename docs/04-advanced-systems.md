# 04 — Advanced systems (rule modules)

Each system below is an **engine module** that can be toggled per game. A module bundles its
state, actions, turn processing, content types and UI panels. The game must stay fun and
balanced with any combination of modules turned off. CI runs AI-vs-AI simulations across
several module combinations to check this.

| Module | v1? | Depends on |
|---|---|---|
| Diplomacy & deals | ✅ | — |
| Trade routes | ✅ | — |
| Great people | ✅ | — |
| Religion | ✅ | — |
| Independent powers (city-states + barbarians) | ✅ | Diplomacy |
| Eras & golden ages | ✅ | — |
| Governors | ✅ | — |
| Tourism & great works | ✅ | Great people |
| Loyalty | ✅ toggle | Governors |
| Espionage | ✅ toggle | Diplomacy |
| World congress & diplomatic victory | ✅ toggle | Diplomacy |
| Climate & natural disasters | ✅ toggle | — |
| Corporations / monopolies | ✅ toggle | Trade routes |
| Ages mode (switch civs at era changes, Civ 7-style) | ✅ toggle, off by default | Eras |
| Crises at the end of an era | ✅ toggle, off by default | Eras |
| Nukes | ✅ toggle | Full tech tree |
| Tribal villages (goody huts) | ✅ toggle | — |

---

## Diplomacy & deals

Diplomacy between humans matters most in a friends' game, so it gets more depth than in Civ 6.

### Diplomatic states

`War ⇄ Neutral ⇄ Declared Friends ⇄ Alliance`, plus **Denounced** as a flag.

- **Declared friendship:** 30 turns. Lets you form alliances. Declaring a surprise war on a friend
  gives a heavy penalty with *every* player and AI.
- **Alliances** (types: Research, Military, Economic, Cultural, Religious) level up over time and
  share bonuses. Allies share vision.
- **Teams** (set in the lobby) are permanent alliances with shared victory.

### Influence (from Civ 7)

🤝 **Influence** is a yield (from the Palace, diplomatic policies, some buildings, alliances and
leader abilities). It's the currency for diplomacy:
- proposing formal treaties (open borders, research agreements, alliances) costs influence,
- **endeavors** (joint projects with another player, e.g., "+2 science for both of us for 15 turns")
  and **sanctions** (e.g., "−2 gold on their trade routes") cost influence to start and to keep running,
- befriending independent powers and sending envoys costs influence,
- denouncing someone costs influence and gives them war support if you attack them later.

This makes diplomacy a real economy, so a "peaceful" player has something to spend their effort on.

### Deals (the trade screen)

Either side can put any of these on the table:
- gold (lump sum or per turn for N turns), luxury or strategic resources (per turn), great works,
  cities
- open borders, a peace treaty (with N turns of enforced peace), a joint war against a third player
- **map sharing**, research agreements, and **promises** ("I won't settle near you", "I won't build
  Spaceport")

Rules:
- **Every signed term is enforced by the engine.** If you agree to send 5 gold per turn for 20
  turns, it's sent automatically. If you sign 10 turns of peace, the "declare war" button is
  locked for those 10 turns.
- **Promises** are tracked publicly. Breaking one is allowed, but everyone sees it ("⚠️ Alex broke
  their promise to Sam"), and AIs remember it.
- Deals can be proposed **asynchronously**. They sit in the other player's inbox until accepted,
  countered or rejected.

### AI diplomacy

AI leaders have **agendas** (e.g., "likes civs with big armies", "hates civs that settle near
them"), defined in the leader's content file. Agendas drive how they talk and what deals they
accept. The UI explains their opinion of you: "−6 You settled near them, +3 Shared enemy".

### Reputation and war support

Aggressive actions (surprise war, razing, breaking promises) lower your **reputation** with every
AI that witnesses them, which makes their deals and agendas less favorable. In the war itself, the
same actions shift **war support** toward your enemy (see
[03-core-mechanics.md](03-core-mechanics.md#war)). One number per war, and it's easy to read.

### Built so far (V1 part 3)

- **States:** war, peace (with a treaty after every war: no new war for 10 turns), declared
  friendship (30 turns; no war while it lasts), alliance (30 turns, needs a friendship; allies
  share vision). Both can be renewed. Teams also share vision.
- **Influence** 🤝: +2 a turn plus influence yields (Government Plaza, Trade Outpost towns).
  Friendship costs 20 and an alliance 50 from each side; denouncing costs 20.
- **Deals:** gold now, gold per turn (up to 30 turns, enforced: a missed payment breaks the deal
  and everyone remembers), shared maps, friendship, alliance, peace. Offers wait in the other
  player's panel for 10 turns; AI rivals answer at once, and the deal screen shows beforehand
  whether they'd accept and why not.
- **Surprise wars:** a war declared without denouncing the target in the last 10 turns. It gives
  the target the war-support head start and is remembered by every AI. A formal war (denounce
  first, then declare) does neither.
- **AI opinions** with reasons (shown in the rival panel): agenda likes and dislikes, long
  peace, same government, friendship or alliance, common enemies, denouncements, surprise
  wars, broken deals, razed settlements, settling nearby, running deals. AIs offer friendships
  and alliances to players they like, denounce ones they don't, and denounce before declaring
  war when they're diplomatic.
- Not yet: open borders, endeavors and sanctions, promises, joint wars, research agreements,
  resource trades (they need trade routes and strategic resources first).

---

## Trade routes

- **Traders** (unit) are built in a city, sent to a destination (domestic, foreign, or city-state),
  and run automatically for N turns. Afterwards they can be reassigned.
- Domestic routes give food and production to the origin city. International routes give gold
  (plus yields from the destination's districts) and spread religion and some culture.
- Routes **build roads** along their path, which is how the road network grows.
- The trade-route capacity per player comes from civics, commercial hubs and harbors.
- Routes going into a war zone can be **plundered** for gold.

### Built so far (V1 part 5)

- **Traders** (after Foreign Trade, 60 production, no upkeep): from one of your settlements,
  send one to any settlement you've found within 15 tiles over land (yours, or another
  player's you're at peace with). The route runs 20 turns, then the trader comes home.
- **Yields each turn:** a domestic route gives its origin +2 food and +2 production; an
  international one gives its origin +4 gold plus +1 gold per district at the destination, and
  the destination +1 gold.
- **Capacity:** Foreign Trade +1, each Commercial Hub (or Suguba) and Harbor +1.
- **Roads:** every route builds a road along its way. Moving road to road costs half a move
  (settlement centers count as road).
- A war between the two players ends their routes (the traders come home). AIs like players
  they trade with (+3 per route, up to 2).
- Kits that needed this now work: Mongol routes reveal the land around their destination and
  Mongol units get +3 against trade partners; Cleopatra's routes give +2 gold to both ends and
  each running deal gives her +1 influence; Mansa Musa's international routes give +1 gold per
  desert tile of the origin; new Roman settlements get a road to the capital.
- Not yet: plundering routes, sea routes, road building by other means.

---

## Great people

Great people are the natural place to add **named characters**, including your friends,
because each one is unique.

- Types: Scientist, Engineer, Merchant, Prophet (religion), General, Admiral, Writer, Artist,
  Musician.
- Each type has **points**, earned from districts, buildings and projects. There's a shared
  timeline: one great person of each type per era is available to *the whole world*, and the
  first player to reach the points gets them.
- **Each great person is a named individual with a unique ability**, e.g., "Hypatia: +1 🔬 per
  Library, and boosts a random Classical tech". Patronage lets you buy one with gold or faith
  before someone else gets it.
- Writers, Artists and Musicians create **great works**, which go into building slots and give
  culture and tourism.
- **Content:** great people are just data, so a mod can add "Great Engineer Mike: completes 50% of
  any wonder" in about 10 lines of JSON.

### Built so far (V1 part 6)

- Seven classes (Scientist, Engineer, Merchant, Prophet, General, Writer, Admiral), 26 named
  people from the Ancient to the Medieval era, in `great-people.json`. Points come from
  districts (+1) and their buildings (+1 or +2); each class's next person costs 50–60 points,
  rising by the same each time one is earned. The first player to the cost earns them (most
  points wins ties) and they appear at the capital.
- **Recruit** (patronage): buy the next one now for 3 gold, or 3 faith, per missing point (the
  Great People screen, P). Prophets can't be bought with faith (a class's `faithRecruit`), so
  faith can't be turned into more faith.
- **Activate** in one of your settlements: yields at once (science and culture toward your
  current tech and civic, production toward the settlement's build), boosts, or inspiring
  nearby soldiers; some also give a lasting effect (Hypatia: +1 science in Library
  settlements; Marco Polo: +1 trade route...).
- Great Prophets found religions (see "Religion"). Whoever has founded one is out of the
  prophet race, and prophets stop coming once every religion the game can have exists.
- Elizabeth's +100% great admiral points works. Not yet: great works and tourism.

---

## Religion

- **Pantheon:** reach 25 faith (configurable) and pick a pantheon belief (e.g., "+1 faith from
  desert tiles"). Each pantheon belief can only be taken by one player.
- **Founding a religion:** earn a Great Prophet, use it on a Holy Site, name the religion (custom
  name and icon, for fun), and pick a founder belief and a follower belief. Later you add worship
  and enhancer beliefs.
- **Max religions** = players ÷ 2 + 1 (configurable).
- **Spread:**
  - *Passive pressure:* cities within 10 tiles of a city following the religion feel its
    pressure. Holy cities and trade routes increase it.
  - *Missionaries* spread it actively (a burst of followers). *Apostles* spread it more strongly
    and can start theological combat.
- **Theological combat** (Civ 6 had religious units fighting each other) is a **sub-option**:
  off / on. Many players find it tedious, so the recommended default is *off*. Rival religious
  units can still **condemn** each other with an Inquisitor (D9).
- **Religious victory:** your religion is the majority in more than half the cities of every
  other civ.

### Built so far (V1 part 7)

- **Pantheons:** 11 pantheon beliefs (`beliefs.json`); 25 faith takes one, each only once in a
  game. Its effects apply to the player like a policy's.
- **Founding:** a Great Prophet in your settlement with a Holy Site founds a religion: you name
  it and pick a **founder belief** (yields in the holy city for each settlement following it,
  e.g. Tithe: +2 gold per follower) and a **follower belief** (applies in every settlement
  that follows it, whoever owns it, e.g. Almsgiving). At most players ÷ 2 + 1 religions; one
  per player; each belief once. The settlement becomes the holy city and follows it at once.
  Worship and enhancer beliefs come later.
- **Spread by pressure:** a settlement follows one religion (or none), not a mix of citizens.
  Every turn each settlement gets pressure from each settlement within 8 tiles following a
  religion (+2, itself included), from a holy city (+4, even after the holy city loses it) and
  from both ends of its trade routes (+3); built-up pressure falls by 10% a turn, so it settles
  where its sources keep it. A settlement follows the religion with the most pressure once that
  reaches 40.
- **Missionaries:** bought for 100 faith in a settlement following a religion (or in your own
  holy city), they spread that religion: on or next to a settlement, **Preach** adds 60
  pressure (3 times, once a turn). Apostles, inquisitors and theological combat aren't built
  (D9's toggle stays off).
- **Religious victory** (a new-game option, on by default): checked every turn.
- The AI takes the pantheon that suits its land, builds a Holy Site while a religion can still
  be founded, founds one with its prophet, and buys a few missionaries to preach where they'd
  convert.
- The Religion screen (R, or the 🙏 chip): pantheon choice, your religion, the founding form,
  every religion with its followers and victory progress. Settlements show what they follow
  and the pressure on them (hover).

---

## Independent powers (city-states and barbarians)

From Civ 7, combined with Civ 6's envoys and Civ 5's quests. Independent powers make duel games
feel populated and give players something to compete over even when there's no war.

- **Independent camps** spawn early in unclaimed land. Each has a disposition: **hostile**
  (raids like classic barbarians) or **neutral** (trades, gives quests).
- Players can **befriend** a camp by spending influence over several turns (other players can
  compete and outbid). Or they can attack it.
- A befriended camp eventually **becomes a city-state** (one settlement, never expands much) of a
  type: Scientific, Cultural, Trade, Religious, Militaristic or Industrial. Each one also has a
  unique **suzerain bonus** (data-driven, so mods can add more).
- **Envoys** (from civics, quests, and influence) are assigned to city-states. 1/3/6 envoys give
  growing type bonuses. The player with the most envoys (at least 3) is **suzerain**: they get the
  unique bonus, the city-state's luxuries, and the option to **levy** its military for gold.
- **Quests** ("build a Campus", "send a trade route", "clear the hostile camp near us") reward
  envoys.
- Conquering a city-state is allowed, but every player with envoys there gets war support against
  you.
- With the module off, camps are always hostile and never become city-states (classic barbarians).

### Built so far (V1 part 8)

- **City-states from the start** (Civ VI's way for now): each map size places some (Duel 3,
  Tiny 6, Small 9, Standard 12, Large 15, Huge 18) on open land at least 7 tiles from every
  start and from each other. 18 in `city-states.json`, three of each kind: Scientific,
  Cultural, Trade, Religious, Militaristic, Industrial. Hostile camps stay classic raiders;
  befriending camps into city-states (Civ VII) comes later.
- A city-state is a player outside the turn order with one settlement: it grows, builds up to
  3 soldiers (the best its techs allow; it knows what at least half the civs know), then
  buildings, and its soldiers fight enemies next to home but never take settlements.
- **Meeting:** exploring its settlement meets it; the first to do so gets a free envoy.
- **Envoys:** free ones from five civics (Mysticism, Political Philosophy, Military Training,
  Theology, Guilds), quests and meeting first; otherwise 40 influence each. 1, 3 and 6 envoys
  unlock its kind's bonuses (e.g. Scientific: +2 science in your capital, then +2 in every
  settlement with a Campus, then +2 more). The most envoys, at least 3, makes you **suzerain**:
  its own bonus (Ugarit: +1 trade route; Byblos: +15% production toward wonders...). A tie keeps
  the current suzerain.
- **Quests:** build its kind's district, and send it a trade route: +1 envoy each, once.
- **War:** declaring war on one costs every envoy you had there; it takes peace whenever
  offered (after the minimum war). Taking it ends it; freeing it from its captor brings it back
  and gives the liberator 6 envoys. Its capital doesn't count for domination.
- The AI sends free envoys at once and buys more with spare influence, where they unlock a tier
  or take (or keep) a suzerainty.
- The City-states screen (I, or the 🏛 chip) and a card in a city-state's settlement panel;
  a new-game option turns them off. Not yet: levies, luxuries for the suzerain, war support
  for envoy holders, quests beyond the two.

---

## Eras & golden ages

- The **world era** advances when enough players reach the next era's techs and civics (or after a
  maximum number of turns).
- At each era change, each player is scored on **era points** earned from "historic moments"
  (first to found a religion, first to circumnavigate, building a wonder, killing a unit with a
  general...):
  - low score → **Dark Age** (penalties, but access to powerful dark-age policies),
  - normal → **Normal Age**,
  - high → **Golden Age** (pick one **dedication**, e.g., "+2 era points per wonder", plus a
    bonus).
  - Getting a Golden Age right after a Dark Age gives a **Heroic Age** (pick 3 dedications).
- **Legacy goals** (from Civ 7): each era shows four visible goals, one each for Military, Science,
  Culture and Economic (e.g., *Classical Military: control 6 settlements*, *Classical Science: 3
  campuses with +3 adjacency*). Completing one gives a big chunk of era points and a small permanent
  bonus. Players always know how to reach a Golden Age.
- Historic moments double as a **timeline** shown in the end-of-game replay.

### Built so far (V1 final, F8)

- **Era score from historic moments** (`moment` content, 17 of them):
  - Moments include a new settlement, a town becoming a city, a world wonder (4), a great person
    (2), a pantheon and a religion (once each), a new government, districts, battles won, a
    captured city (2), becoming a city-state's suzerain, trade routes, finding a natural wonder,
    being the **first civ into a new era** (3, world-first) and steps into space.
  - Some have caps per era: 5 battles, 4 districts and 3 trade routes count.
  - Each moment goes on your **timeline**.
- **Ages:** when a civ enters its next era, last era's score decides its age:
  - **Dark** below `8 + 3 × (era − 1)`: −1 happiness everywhere, +25% faith.
  - **Golden** at 10 more: +1 happiness and +10% culture.
  - **Heroic** for a golden age right after a dark one: +2 happiness, +10% culture, three
    dedications.
  - **Normal** in between.
- Thresholds are `rules.ages`; ages are `age` content with ordinary effects, so they show in
  every breakdown.
- **Dedications** (`dedication` content, 8): pick one each era (three in a heroic age), for
  example *Light of Learning* (+15% science, techs earn era score), *Under the Banners* (+2
  strength, faster soldiers, battles earn more), or *Open the Frontier* (cheaper settlers, faster
  growth, settlements earn more). Each gives a bonus for the era and adds +1 to its kind of
  moment.
- AI leaders choose dedications by personality.
- **On screen:** the turn pill shows your era and age with this era's score. Clicking it (or
  **E**) opens Eras and Ages: the age and its bonus, a meter with the dark and golden marks and
  what the next age would be now, the dedications (chosen there when it's time; the next-action
  button says so), the ages of past eras, and the moment timeline. Moments, new ages and natural
  wonders found show as notices with a sound.

**Different from the plan above, on purpose:** each civ's age changes when *it* enters its next
era (its own techs and civics), not when a world era advances. Everything else in the game
already follows a civ's own era (units, buildings, music, city art), and in simultaneous play it
never ends an era early for a civ that hasn't reached it. The "first into an era" moment rewards
whoever gets there first. Legacy goals and dark-age policy cards are still to come.

### Ages mode (optional, later)

Civ 7's signature system for groups that want it: the game is split into three ages (Antiquity,
Exploration, Modern). At each age change, every player picks a **new civ** (from those unlocked
by their history and legacy goals) while keeping their leader, settlements and some legacies.
Off by default.

### Crises (optional, later)

Near the end of each era, a crisis can hit everyone: plague, revolts, invasions. Each crisis
forces new crisis policies. Off by default, for groups that like chaos.

---

## Governors

- You earn titles from civics. Each title appoints a new governor or promotes one you have.
- About 7 governors, each with a 6-promotion tree (e.g., "The Planner: +1 tile developed on growth,
  +20% district production"). Each governor is assigned to one city.
- Governors are data: name, portrait, promotion tree. Your friends can be governors.
- If the Loyalty module is on, governors also add loyalty to their city.

---

## Tourism & great works (culture victory)

- **Tourism** comes from great works, wonders, national parks, seaside resorts, and later rock
  bands.
- Each player has **domestic tourists** (accumulated culture) and attracts **foreign tourists**
  (accumulated tourism toward each other player).
- **Culture victory:** your visiting tourists from every other civ outnumber that civ's own
  domestic tourists.
- Bonus modifiers: open borders, trade routes, shared religion, the Online Communication tech.
- **Ideological pressure** (from Civ 5): the Modern-era governments are grouped into three
  ideologies. If a rival with a *different* ideology has a lot of tourism toward you, your
  citizens get unhappy (−1 to −5 😊 per settlement) and, at extremes, demand a change of government.
  Sharing an ideology gives a small happiness bonus instead. This creates great late-game tension
  between friends.

### Built so far (V1 part 9)

- **Tourism** is a yield: from wonders (each later wonder has some), Museums, Broadcast
  Centers, Stadiums, a few policies, and Radio (+25%). There are no great works yet.
- **Domestic tourists:** every 100 culture a civ ever earns. **Visiting tourists:** every 150
  tourism a civ has sent toward another; tourism goes each turn to every civ whose settlement
  you've seen, +25% each with a trade route between you, a shared religion (both capitals
  follow it) or a friendship or alliance.
- **Culture victory:** your visitors from each other civ outnumber its domestic tourists.
- Not yet: ideologies and their pressure, great works, national parks and seaside resorts.

---

## More modules (all in v1 as toggles)

- **Loyalty:** cities near your population centers stay loyal. A city far from home and next to
  a big rival can **flip** (become a free city, then join someone else). This makes settling
  "inside" your friend's empire risky.
- **Espionage:** spies with missions: steal tech boosts, siphon funds, sabotage production,
  recruit partisans, counterspy. Each mission has a visible success chance.
- **World congress:** periodic votes on resolutions (e.g., "+100% production to Campus districts for
  all" or "Embargo against [player]") using diplomatic favor. Diplomatic victory comes from
  diplomatic points.
- **Climate & disasters:** floods (fertilize floodplains but damage improvements), volcanic
  eruptions, storms, and CO₂-driven global warming with rising sea levels in the late game.
- **Corporations/monopolies:** control luxury resources for empire-wide bonuses.

---

## Victory conditions

All can be toggled. The game ends when one condition is met (or at the turn limit, which gives a
score victory).

| Victory | Condition |
|---|---|
| **Domination** | Hold every other player's original capital (the original capital of an eliminated player counts as held if you own it) |
| **Science** | Complete the space program chain: launch satellite → moon landing → Mars colony → exoplanet expedition traveling to its destination |
| **Culture** | Your foreign tourists exceed every other civ's domestic tourists |
| **Religious** | Your religion is the majority in more than half of every other civ's cities |
| **Score** | Highest score at the turn limit |
| **Diplomatic** (later) | Reach N diplomatic points through the world congress |
| **Custom** | Defined by mods using the effects/conditions system (e.g., "Hold 5 natural wonders for 10 turns") |

**Team victory:** if any member of a team meets a condition, the team wins.

**Built so far (M10):** domination (a setup toggle, on by default), conquest (the last team
standing always wins) and score (at the turn limit: none, 60, 100, 150, 200 or 250 turns).
The end screen names the winner and how, with everyone's score.

**Built so far (V1 parts 7 and 9):** religious, science and culture victories, each a
new-game toggle (on by default), and a Victories screen (V) with everyone's progress.
- **Science:** a Spaceport (after Rocketry, flat land, outside the district limit) and four
  projects done on it in order: Launch a Satellite, Moon Landing, Mars Colony, then the
  Exoplanet Expedition, which arrives 10 turns later and wins.
- **Culture:** see "Tourism & great works".
