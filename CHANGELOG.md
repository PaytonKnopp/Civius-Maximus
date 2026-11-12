# Changelog

What changed for someone playing the game, newest first. The version number in the game
(Options › About) counts merges into `main`, so each entry here is a merge. Each pass has a
longer write-up in `docs/`.

## Release pass (November 2026)

The last pass before playtesting: no new features, only what was broken, unclear or unsafe.
Full account: [docs/RELEASE-REVIEW.md](docs/RELEASE-REVIEW.md).

**Fixed in play**

- Soldiers hired from a city-state now go home when the levy ends (they used to stay inside
  your city, on top of your own units).
- A camp can no longer become a city-state inside someone's borders or right beside a
  settlement.
- Policy cards are fitted to your slots at the end of every turn and when a city is taken (a
  civ could keep more cards than it had slots).
- The AI no longer leaves settlers and scouts standing for turns on end when what they were
  heading for can't be reached; on island maps it settles and explores far more.
- Gold per turn in the top bar now counts deals, towns selling their production and cities
  with nothing to build, so it matches what the turn gives.

**Fixed on screen**

- The top bar never clips or scrolls: on smaller screens it drops detail level by level, and
  every tooltip keeps everything.
- The lens list fits a laptop screen; on phones the Next button works while a lens legend is up.
- "What it does" lines in the Civilopedia and on the Government screen read as sentences.
- "How to play" covers everything the gameplay pass added, with every number read from the
  rules.
- Government legacies count down correctly at every game speed.
- City banners in the 2D view are no longer hidden behind unit markers.
- Explore is offered only to units that can explore; many small wording and agreement fixes.

**Safer**

- A damaged save file is refused with a reason instead of breaking the game.
- If a turn ever fails, the game goes back to where it was and says what happened, with a
  button that saves a copy to send. It no longer waits for ever.
- Online: a misbehaving client can't stop a host's game or take every seat in a lobby.
- The game ships the licenses of the libraries it is built with (Options › About).

**Names**

- 27 names that matched Civilization ability names were replaced with the game's own (for
  example Qin Shi Huang's ability is now "All Under Heaven"). Old saves load as before.

**Defaults**

- The frame rate counter is off unless you turn it on (Options › Graphics).

## Earlier

Each has its own write-up:

- [Mechanics review](docs/MECHANICS-REVIEW.md): the final gameplay pass (November 2026).
- [Final quick review](docs/FINAL-REVIEW.md).
- [Setup review](docs/SETUP-REVIEW.md): safe online play, cloud saves, the desktop app.
- [Polish review](docs/POLISH-REVIEW.md): the UI and art pass before the first playtest.
- [V1 final review](docs/V1-FINAL-REVIEW.md): leaders, every major system, seven victories.
- [V1 review](docs/V1-REVIEW.md): the first complete build.
