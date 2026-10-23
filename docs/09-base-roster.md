# 09 — Base roster

Leaders and civs are **separate** (see [08-best-of-civ.md](08-best-of-civ.md)). Each leader has a
default civ, and the lobby can allow any leader with any civ.

- **Leader** = leader ability + AI agenda + AI personality + portrait + quotes.
- **Civ** = civ ability + unique unit + unique building/district/improvement + start bias + city names.

All abilities and names below are original to Civius Maximus. Numbers are first-pass and
will be tuned by playtests and AI simulations. Adding a leader later is one JSON file, so just
ask for whoever you want next.

## The starting ten

### 1. Julius Caesar — Rome
- **Leader: *Crossing the Rubicon.*** Declaring war gives your units +5 combat strength for
  10 turns. Each city you capture gives gold equal to 50 × its population.
- **Civ: *Roads to the Forum.*** Every new settlement starts with a road to your capital and a free
  Forum (+1 culture, +1 happiness).
- **Unique unit: Legionary** (replaces Swordsman). +4 strength. Can build one fort or road.
- **Unique building: Thermae** (replaces the Aqueduct's building). +3 happiness, +1 culture.
- **Agenda: *Imperator.*** Respects big armies. Dislikes players with smaller empires that refuse
  his deals.
- **Personality:** aggression high, expansion high, science medium.

### 2. Cleopatra — Egypt
- **Leader: *Serpent of the Nile.*** Every deal you sign gives +1 influence per turn while it
  lasts. Trade routes to other players give +2 gold to *both* sides.
- **Civ: *Bounty of the Nile.*** +15% production toward districts and wonders next to rivers.
  Floodplains get +1 food.
- **Unique unit: War Chariot** (replaces Heavy Chariot). +1 movement on flat terrain, no
  penalty when attacking from open ground.
- **Unique improvement: Obelisk** (desert). +1 faith, +1 culture, +1 appeal to neighboring tiles.
- **Agenda: *Allure.*** Likes strong militaries. Dislikes weak ones.
- **Personality:** diplomacy high, wonders high, aggression low.

### 3. Alexander the Great — Macedon
- **Leader: *Never Defeated.*** Your war support never decays over time. Capturing a city fully
  heals all your units.
- **Civ: *Spoils of the Known World.*** Capturing a city gives one tech or civic boost for each
  district in it.
- **Unique unit: Companion Cavalry** (replaces Heavy Cavalry). +2 movement, earns great general
  points on kills.
- **Unique building: Royal Pages School** (Encampment). +1 science per military unit trained in this
  city (permanent, cumulative up to +10).
- **Agenda: *Conqueror.*** Dislikes players who are at peace with everyone.
- **Personality:** aggression very high, expansion medium.

### 4. Genghis Khan — Mongols
- **Leader: *Khan of the Steppe.*** Cavalry units +3 combat strength. Defeating an enemy cavalry
  unit has a 50% chance to capture it.
- **Civ: *Empire of Relays.*** Sending a trade route to a city reveals it and its surroundings.
  +3 combat strength against players you have an active trade route with.
- **Unique unit: Keshig** (ranged cavalry, replaces Crossbowman). Moves after attacking.
- **Unique building: Ordu** (Encampment, replaces Stable). +1 movement for cavalry trained here.
- **Agenda: *Horde.*** Respects mounted armies. Dislikes players with few cavalry units.
- **Personality:** aggression very high, expansion high, science low.

### 5. Elizabeth I — England
- **Leader: *Gloriana.*** +100% great admiral points. Naval units +1 movement. +1 trade route
  capacity in each era after the Medieval.
- **Civ: *Forge of the World.*** Iron and coal give +2 extra stockpile per turn. Industrial Zones get
  +2 adjacency next to a Harbor.
- **Unique unit: Privateer** (naval raider). Stealthy. Capturing a defeated ship has a 50% chance.
- **Unique building: Royal Dockyard** (replaces Shipyard). +1 movement for ships built here,
  +2 gold.
- **Agenda: *Queen of the Seas.*** Likes players with big navies who stay off her continent.
- **Personality:** naval high, trade high, aggression medium.

### 6. Napoleon Bonaparte — France
- **Leader: *Emperor of the French.*** Commanders gain XP 50% faster. Units within a
  commander's radius get +2 combat strength.
- **Civ: *Belle Époque.*** +20% production toward wonders from the Medieval era onward. Wonders give
  double tourism.
- **Unique unit: Imperial Guard** (replaces Line Infantry). +5 strength on your home continent.
- **Unique improvement: Château** (next to a river). +2 culture, +1 gold, +1 appeal.
- **Agenda: *Grand Strategist.*** Respects players with commanders and big armies. Dislikes
  players who win wars against him.
- **Personality:** aggression high, culture medium, wonders medium.

### 7. Abraham Lincoln — United States
- **Leader: *A House United.*** Settlements on your home continent get +2 happiness. Completing an
  Industrial Zone grants a free melee unit of your best type.
- **Civ: *Land of Opportunity.*** +1 diplomatic policy slot. National parks give double tourism.
- **Unique unit: Rough Rider** (replaces Cavalry). +3 strength on hills. Kills give culture.
- **Unique building: Film Studio** (Theater Square). +100% tourism in the Modern era and later.
- **Agenda: *Union.*** Dislikes players who start surprise wars. Likes players who keep their promises.
- **Personality:** diplomacy high, culture high, aggression low (but responds hard when attacked).

### 8. Qin Shi Huang — China
- **Leader: *The First Emperor.*** The first military unit trained in each city is free
  (the "Terracotta Legion"). +15% production toward Ancient and Classical wonders.
- **Civ: *Mandate of Heaven.*** Tech and civic boosts give 50% instead of 40%.
- **Unique unit: Fire Lance Cart** (replaces Crossbowman). Early gunpowder: high ranged strength, short range.
- **Unique improvement: Great Wall** (border tiles, in a connected line). +4 defense, +1 gold,
  +1 culture (more once Castles is researched).
- **Agenda: *Wonder of the World.*** Likes players who build wonders. Envies anyone who beats him to one.
- **Personality:** wonders very high, science high, expansion medium.

### 9. Mansa Musa — Mali
- **Leader: *Pilgrimage of Gold.*** International trade routes give +1 gold for each desert tile in
  the origin city. Entering a Golden Age gives +1 trade route capacity.
- **Civ: *Road of Salt and Gold.*** City centers get +1 faith and +1 food for each adjacent desert
  tile. Mines get −1 production but +4 gold. Buildings can be bought with faith.
- **Unique unit: Mandekalu Cavalry** (replaces Knight). Protects trade routes nearby. Kills
  give gold.
- **Unique district: Suguba** (replaces Commercial Hub). Purchases in this city cost 20% less.
- **Agenda: *Richest Man in History.*** Likes players with large trade networks. Dislikes poor ones.
- **Personality:** trade very high, faith high, aggression low.

### 10. Oda Nobunaga — Japan
- **Leader: *The Demon King.*** Gunpowder units cost 25% less and get +3 combat strength.
  Melee units +5 strength when attacking a damaged unit.
- **Civ: *Island Discipline.*** Districts get +1 adjacency for each adjacent district (instead of +0.5).
- **Unique unit: Samurai** (replaces Man-at-Arms). No combat penalty when damaged.
- **Unique building: Electronics Works** (replaces Factory). +4 production, +4 culture from the
  Modern era onward.
- **Agenda: *Unifier.*** Respects players who capture cities. Dislikes players with weak armies.
- **Personality:** aggression high, district planning high.

## Queued for later (just say "add X")

Harald Hardrada (Vikings), Shaka (Zulu), Montezuma (Aztecs), Hannibal (Carthage), Saladin
(Ayyubids), Catherine the Great (Russia), Ashoka (Maurya India), Suleiman (Ottomans), Pachacuti
(Inca), Boudica (Celts), Charlemagne (Franks), Ramesses II (Egypt, as a second Egyptian leader),
Theodore Roosevelt (United States), Queen Victoria (England), Hammurabi (Babylon), Peter the Great
(Russia), Wu Zetian (China), Isabella (Spain), Simón Bolívar (Gran Colombia), plus any custom
characters.
