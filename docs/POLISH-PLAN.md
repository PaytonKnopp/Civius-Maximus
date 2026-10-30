# Polish plan (before the first playtest)

Payton's brief after the V1 final review (October 2026): before he sets up Supabase and the
desktop app and plays with a friend, the game should look and feel as polished as a AAA Civ
game, or better. That means the UI (clean, smart, easy to read, everything where you'd expect
it, the best icons, buttons and flow) and the art (less blocky buildings and characters, closer
to Civ's real-looking characters, better leaders), still in the Outer Wilds and Puss in Boots
spirit of [10-art-direction.md](10-art-direction.md). The functionality stays; he tests that
next.

## What the audit found

Screenshots of every screen at turn 120 and the 3D Map Lab close-ups (October 30):

- **Map:** the terrain reads muddy and soft (smeared brown and olive, little texture), farms are
  flat cards, trees are faceted blobs, rocks are dark specks, and the explored-land tint washes
  over everything.
- **Units:** stick figures made of boxes, small on their tiles, no animation beyond sliding.
- **Cities:** boxes with cone roofs; little difference between a hamlet and a capital up close.
- **HUD:** sound structure, but crowded: 15 unlabeled screen buttons in a row, numbers with two
  decimals (68.08), a monospace font for numbers, the hint card over the rival list, text
  buttons where Civ has an icon action bar.
- **Screens:** most full screens are plain tables or lists on a dark background (Religion,
  Victories), without the art, cards and meters a Civ screen has.
- **Leaders:** clean vector portraits, but flat and similar to each other.

## Ground rules

- Everything is still made in code or drawn as vectors (no asset sites are reachable from
  Claude's environment, and the art stays free and original). Painted leader portraits made
  with an image generator remain a drop-in (`portrait.image`, [portrait-style-guide.md](portrait-style-guide.md)).
- Low, Medium and High quality presets keep working; the new art must stay light enough for a
  laptop on Medium and a phone on Low.
- Same working rules as before: each part ends in a PR merged to `main`, checks pass before
  every push, docs updated in the same commit, screenshots checked at desktop and phone size.

## Parts

| # | Part | Status |
|---|---|---|
| P1 | **Design system and HUD**: bundled fonts, one set of tokens (type scale, spacing, surfaces, gold trim), new buttons; the top bar with yields and grouped, labeled screen buttons; a Civ-style unit card with an icon action bar; a cleaner city panel; tidy numbers everywhere; hints and notifications out of the way | ✅ |
| P2 | **Characters**: new figures with real proportions, faces, hair, clothing and gear by era, smooth shading; procedural rigs with idle, walk and attack animation; better horses; civilians and great people as characters; bigger, readable squads on a team-colored base | ✅ |
| P3 | **Buildings and vehicles**: houses with eaves, windows and chimneys, varied towns that grow into dense cities with plazas, temples and towers, better districts and wonders up close, smooth ships, siege engines, tanks and aircraft | ✅ |
| P4 | **The world**: sharper painted terrain with a richer palette, lush mixed forests and jungles, fields with crop rows, mines, quarries and pastures, rivers and coasts, soft shadows and ambient occlusion, color grading, depth of field when zoomed in | ✅ |
| P5 | **Full screens**: one screen frame with a banner, cards, emblems, portraits and meters; tech and civic trees, government, religion, victories, city-states, great people and works, governors, espionage, congress, climate, ages, graphs, the Civilopedia and help | |
| P6 | **Menus and dialogs**: a cinematic home screen, setup with leader cards and a map preview, the online lobby, saves, the game-over screen, loading and turn transitions | |
| P7 | **Leaders**: painted-style portraits with real shading and distinct faces, scenic backgrounds by civ, a diplomacy screen worthy of them, gentle motion | |
| P8 | **Feel**: panel and screen transitions, hover and press feedback, a turn banner, combat and event feedback, floating numbers, selection and path highlights | |
| P9 | **Final pass**: phone layout, accessibility and keyboard, consistency sweep of every screen, performance on Low/Medium/High, and the review ([POLISH-REVIEW.md](POLISH-REVIEW.md)) | |
