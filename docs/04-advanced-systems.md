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
| City-states | ✅ | Diplomacy |
| Eras & golden ages | ✅ | — |
| Governors | ✅ | — |
| Tourism & great works | ✅ | Great people |
| Loyalty | later | Governors |
| Espionage | later | Diplomacy |
| World congress & diplomatic victory | later | Diplomacy |
| Climate & natural disasters | later | — |
| Corporations / monopolies | later | Trade routes |
| Barbarian clans | later | — |

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

### Grievances / warmongering

Aggressive actions (surprise war, razing cities, capturing cities, breaking promises) create
**grievances** with the victim and a smaller amount with witnesses. Grievances decay over time.
They hurt AI attitude, and some casus belli require them.

---

## Trade routes

- **Traders** (unit) are built in a city, sent to a destination (domestic, foreign, or city-state),
  and run automatically for N turns. Afterwards they can be reassigned.
- Domestic routes give food and production to the origin city. International routes give gold
  (plus yields from the destination's districts) and spread religion and some culture.
- Routes **build roads** along their path, which is how the road network grows.
- The trade-route capacity per player comes from civics, commercial hubs and harbors.
- Routes going into a war zone can be **plundered** for gold.

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

---

## City-states

City-states make duel games feel populated and give players something to compete over even when
there's no war.

- Minor civs with one city each. Types: Scientific, Cultural, Trade, Religious, Militaristic,
  Industrial, plus a unique **suzerain bonus** each (data-driven, so mods can add more).
- **Envoys:** earned from civics and quests, and assigned to city-states. 1/3/6 envoys give
  growing bonuses. The player with the most envoys (at least 3) becomes **suzerain** and gets the
  unique bonus, the city-state's resources, and the option to **levy** its military.
- **Quests:** "Build a Campus", "Send a trade route", "Clear the barbarian camp near us". Completing
  one earns an envoy.
- Conquering a city-state is possible, but every player with envoys there gets a grievance.

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
- Historic moments double as a **timeline** shown in the end-of-game replay.

---

## Governors

- You earn titles from civics. Each title appoints a new governor or promotes one you have.
- About 7 governors, each with a 6-promotion tree (e.g., "The Builder: +1 builder charge,
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

---

## Later modules (post-v1, already designed for)

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
- **Barbarian clans:** hire, bribe, or convert camps into city-states.

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
