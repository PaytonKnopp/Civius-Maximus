# 00 — Vision

> Working title: **TBD** (see [DECISIONS.md](DECISIONS.md) D1). Until a name is picked, docs say
> "the game" and code uses the package scope `@cx/`.

## The one-sentence pitch

A turn-based 4X strategy game in the spirit of Civ 6, built so a group of friends can play online
against each other, and so any of them can add their own civs, leaders, units and rules without
touching engine code.

## Who it's for

- **You and your friends**: 2 players for sure, 4 often, up to 8 in v1 (12 later).
- **People who will mod it**: you two first, then anyone you invite.
- It is not aimed at a public storefront. Everything is built so that it *could* go there later
  (desktop build, no copyrighted assets), but that is not a goal.

## Design pillars

Every feature decision gets checked against these, in this order.

1. **Friends first.** It should be fun to play with people you know. That means async-friendly
   turns, turn alerts, trash-talk chat, binding deals between players, replays, and games that
   fit around real life (pause, turn timers, AI takeover when someone is away).
2. **Everything is customizable.** Civs, leaders, units, buildings, techs, rules and constants
   all live in data files. Each game is created with a chosen set of mods and rule modules.
   Nothing about "what Rome does" is hard-coded.
3. **Civ 6 depth, but readable.** The systems are deep (districts, adjacency, policies, great
   people, religion, city-states), but every number in the UI can be clicked to see *why* it is
   that number. No hidden math.
4. **Fair and trustworthy.** The server holds the authoritative game state and checks every
   action. Clients only see what their player can see (no peeking through fog with dev
   tools). The engine is deterministic, so replays and bug reports reproduce exactly.
5. **Grows over time.** Big systems are optional **modules** (religion, espionage, loyalty...).
   The game is fun with only the core, and each module can be added later without rewriting
   the core.

## What "finished" (v1.0) means

- **Platforms:** browser (any modern desktop browser), plus desktop apps for Windows, macOS
  and Linux built from the same code. You can take an async turn from a phone browser.
- **Multiplayer:** 2–8 players online, plus hotseat on one machine. Sequential, simultaneous and
  dynamic turn modes. Turn timers. Teams. AI can fill empty seats or stand in for an absent player.
- **Core game:** hex map with several map types, cities, citizens, housing/amenities, builders and
  improvements, districts with adjacency, wonders, units with promotions, combat, a tech tree and
  a civics tree covering 8 eras, governments and policy cards, gold economy, barbarians.
- **Modules shipped in v1:** great people, religion, city-states, diplomacy and deals, trade
  routes, eras and golden ages, governors.
- **Victories:** domination, science, culture, religious, score, plus custom victories defined by
  mods. Each can be toggled per game.
- **Content:** about 12 base civs with unique abilities, units and buildings, and a full set of
  base units, buildings and wonders.
- **Modding:** mod folders, an in-game mod manager, and an in-game civ creator. Mods
  are distributed to every player in a game automatically by the server.
- **Social:** chat (all, team and private), turn alerts (Discord, email, browser push), and
  end-of-game replays with a timeline.

## What we are explicitly *not* doing (v1)

- 3D graphics. The map is 2D/isometric, with art you can swap in later.
- Real-time anything. It's turn-based throughout.
- Matchmaking with strangers, ranked play, or anti-cheat beyond what server authority already gives.
- Copying Firaxis/2K assets, text, icons or the "Civilization" name. Game *mechanics* are fair to
  use. Their art and writing are not.

## How we build it

- The plan is split into milestones ([07-roadmap.md](07-roadmap.md)). Each milestone ends in a
  pull request with tests and a short "what changed / what to try" note.
- Anything that's a matter of taste goes into [DECISIONS.md](DECISIONS.md) with a recommended
  default. You confirm or change it, and the docs are updated to match.
- **Playtest checkpoints** are part of the roadmap. Once the game is playable, what's fun (or
  not) when you actually play decides what gets built next.
