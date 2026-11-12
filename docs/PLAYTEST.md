# Playtest kit

Refreshed in the release pass (November 2026). What that pass checked, fixed and could not
check is in [RELEASE-REVIEW.md](RELEASE-REVIEW.md); this page is what to do with the game in
front of you.

## Open the game

- The hosted link, or `pnpm dev` and the printed address, or the single-file build
  (`pnpm --filter @cx/client build:artifact game.html`).
- On the home screen pick **Quick game**. Add `#play` to the address to skip the home screen,
  `#lab` for the Map Lab.
- **Options › About** shows the version (1.0 plus 0.01 for every merge into `main`). Put it in
  every report.

## Six scenarios

1. **First 30 turns.** Quick game, follow the hints. Found a city, explore, pick research,
   build a few things. Is it always clear what to do next?
2. **A war.** Pick a fight with a neighbor (or let one start). Attack, defend, take a city,
   choose what to do with it, make peace.
3. **Trade and diplomacy.** Send trade routes, make deals, meet city-states and send envoys,
   sit through a Congress session.
4. **A religion game.** Found a pantheon and a religion, spread it, see what rivals do.
5. **Online with a friend.** Host a lobby, share the code, play ten turns, have the friend
   close the tab and come back. Then have them join from a phone on mobile data.
6. **On a phone.** Play ten turns in a phone browser. Can you reach everything? Is the text
   readable? Does anything sit under the notch or the home bar?

## What this build could not be checked for

The release pass ran on one cloud machine with no sound card and no graphics card, in one
browser engine. These need a person and a device; each is a few minutes.

**Sound (headphones, then laptop speakers).** Levels were measured, not heard.

- [ ] Music under the effects: can you hear a click, a move and a fight over each era's music?
- [ ] Nothing harsh or sudden: a wonder, a war declaration, a victory, the cannon.
- [ ] The music after a long AI turn or after coming back to the tab: it should carry on, not
      burst.
- [ ] Options › Sound: each slider does what it says; mute is silent.

**Other browsers.** Only Chromium was run.

- [ ] Safari on a Mac and on an iPhone: title screen, a new game, ten turns, a full screen
      (Technologies), a save and a load.
- [ ] Firefox: the same.
- [ ] In each: the 3D view and the 2D view; the top bar at a narrow window; the lens list.

**Real graphics hardware.** 3D was drawn in software here.

- [ ] Frame rate at each quality setting on your machine (Options › Graphics has a counter).
- [ ] A late game on a large map: does scrolling stay smooth? How long does End Turn take?
- [ ] Leave the tab in the background for ten minutes and come back: does the map still draw?

**Real networks.**

- [ ] Host at home, a friend joins from another network.
- [ ] A friend on mobile data, and on an office or school network (these need the relay).
- [ ] Pull the plug on the friend's device for 30 seconds: do they come back by themselves?
- [ ] The host reloads the page: does "Host your online game again" give everyone their seat?

**If you set up accounts (Supabase).**

- [ ] Sign up, play three turns, open the game on a second device: does Continue pick the
      game up?
- [ ] List a public game from one account and find it from another.

## Feedback questions

1. Where were you confused?
2. Where were you bored?
3. Where were you frustrated?
4. Where were you delighted?
5. How long did a turn feel (too short, fine, too long) at turns 10, 50 and 100?
6. Did anything feel unfair (AI, combat, events, loyalty)?
7. Did anything feel broken or look wrong?
8. What is the one thing you'd change first?

## Reporting a bug

Send: the version (Options › About), browser and version, device, what you did and what you
expected, and the save. Two ways to get the save:

- Game menu › **Save and load** › **Export file** (it downloads the game as a file); or
- if the game itself says it hit a problem, the bar that says so has **Save a copy to send**.

The save holds the seed and the whole game, so the turn can be played again exactly.
