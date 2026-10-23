# 00 — Vision

> **Civius Maximus**. Code uses the package scope `@cx/`.

## The one-sentence pitch

A turn-based 4X strategy game that takes the best of Civ 5, 6 and 7
([08-best-of-civ.md](08-best-of-civ.md)), built so a group of friends can play online
against each other (or solo against the AI), and so any of them can add their own civs, leaders, units and rules without
touching engine code.

## Who it's for

- **You and your friends**: 2 players for sure, 4 often, up to 8 in v1 (12 later). Everyone plays
  their turn at the same time.
- **Solo play** against AI leaders, offline.
- **People who will mod it**: you two first, then anyone you invite.
- It is not aimed at a public storefront. Everything is built so that it *could* go there later
  (desktop build, no copyrighted assets), but that is not a goal.

## Design pillars

Every feature decision gets checked against these, in this order.

1. **Friends first.** It should be fun to play with people you know. That means simultaneous
   turns so nobody waits, join codes, trash-talk chat, binding deals between players, replays,
   and games that fit around real life (cloud saves, turn timers, AI takeover when someone drops).
2. **Everything is customizable.** Civs, leaders, units, buildings, techs, rules and constants
   all live in data files. Each game is created with a chosen set of mods and rule modules.
   Nothing about "what Rome does" is hard-coded.
3. **Civ 6 depth, but readable.** The systems are deep (districts, adjacency, policies, great
   people, religion, city-states), but every number in the UI can be clicked to see *why* it is
   that number. No hidden math.
4. **Fair and trustworthy.** The game host holds the authoritative state and checks every
   action. Clients only receive what their player can see (no peeking through fog with dev
   tools). The engine is deterministic, so replays and bug reports reproduce exactly.
5. **Grows over time.** Big systems are optional **modules** (religion, espionage, loyalty...).
   The game is fun with only the core, and each module can be added later without rewriting
   the core.

## What "finished" (v1.0) means

- **Platforms:** browser (any modern desktop browser), plus desktop apps for Windows, macOS
  and Linux built from the same code. A turn can be played from a tablet or phone browser.
- **Modes:** single player vs AI, hotseat, and online multiplayer for 2–8 players. The host
  makes a game and friends join with a **code**. Players have their own in-game login. Turns
  are simultaneous with an End Turn button, with turn timers and teams. AI can fill empty seats or
  stand in for a disconnected player.
- **Cost:** $0/month to run (Supabase free tier + free static hosting; see
  [01-architecture.md](01-architecture.md)).
- **Core game:** hex map with several map types and navigable rivers, towns and cities,
  growth that develops tiles, happiness and celebrations, districts with adjacency, wonders,
  units with promotions and commanders, combat with war support, a tech tree and a civics tree
  covering 8 eras, governments and policy cards, gold economy, hostile camps.
- **Modules shipped in v1:** great people, religion, independent powers (city-states), diplomacy
  with influence and deals, trade routes, eras with golden ages and legacy goals, governors.
- **Victories:** domination, science, culture, religious, score, plus custom victories defined by
  mods. Each can be toggled per game.
- **Content:** the ten starting leaders and civs ([09-base-roster.md](09-base-roster.md)) plus any
  added from the queue, with a full set of base units, buildings and wonders.
- **Modding:** mod folders, an in-game mod manager, and an in-game civ and leader creator. Mods
  are sent to every player in a game automatically.
- **Social:** chat (all, team and private), an optional Discord webhook, browser notifications,
  and end-of-game replays with a timeline.

## What we are explicitly *not* doing (v1)

- 3D graphics. The map is 2D/isometric, with art you can swap in later.
- Real-time anything. It's turn-based throughout.
- Matchmaking with strangers, ranked play, or anti-cheat beyond what host authority already gives.
- Copying Firaxis/2K assets, text, icons, ability names or the "Civilization" name. Game *mechanics* are fair to
  use. Their art and writing are not.

## How we build it

- The plan is split into milestones ([07-roadmap.md](07-roadmap.md)). Each milestone ends in a
  pull request with tests and a short "what changed / what to try" note.
- Anything that's a matter of taste goes into [DECISIONS.md](DECISIONS.md) with a recommended
  default. You confirm or change it, and the docs are updated to match.
- **Playtest checkpoints** are part of the roadmap. Once the game is playable, what's fun (or
  not) when you actually play decides what gets built next.
