# Polish review

The polish plan ([POLISH-PLAN.md](POLISH-PLAN.md)) is done: the UI and the art had a full
pass before the first playtest, part by part, each merged to `main` (Pages rebuilds itself).
The game plays the same as before; it looks and feels very different. This page covers what
changed, how to see it, an honest answer to "is it the best it can be?", and what Payton does
next. The full game review is still [V1-FINAL-REVIEW.md](V1-FINAL-REVIEW.md).

**Play it:** https://paytonknopp.github.io/Civius-Maximus/

## What changed

| Part | What it did | PR |
|---|---|---|
| P1 | **Design system and HUD.** Bundled Cinzel and Source Sans 3 (no font CDN, so the desktop app and offline play look the same). One theme for every panel (dark lacquer with a fine grain, a gold hairline, brass corner ticks, a blur of the map behind), buttons (default, gold primary, ghost, danger, with hover, press and focus), fields and scrollbars. The game's own tooltips everywhere, with keys and "why?" lines. Numbers show at most one decimal (68.1, not 68.08). The top bar's screen buttons are brass glyphs in dark wells, grouped, with new icons for governors, great works and eras; graphics quality moved into the ☰ menu. A Civ-style unit card with an action bar of icon tiles. | [#39](https://github.com/PaytonKnopp/Civius-Maximus/pull/39) |
| P2 | **Characters.** Units are people, not blocks: figures about five and a half heads tall with faces, hair, era helmets, tunics or breeches, armor, cloaks and quivers, mixed skin tones; horses, oxen, mules and elephants with jointed legs and riders seated on them. Every unit is rigged (a skeleton per unit, still two draw calls) and animated in code: breathing and glancing at rest, a walk with swinging arms and bending knees, a trot, ships on the swell, hovering aircraft; attackers face their target and swing, thrust, draw a bow or shoulder and fire; guns recoil. A warm rim light, a soft shadow and a ring in the owner's color under each unit. | [#40](https://github.com/PaytonKnopp/Civius-Maximus/pull/40) |
| P3 | **Buildings and vehicles.** Real gable roofs with eaves, overhanging hips, sweeping two-tier East Asian roofs, parapets; doors, windows by story (a third lit at dusk), footings, cornices, chimneys, awnings, half-timbering, side wings. Industrial rows with slate gables; modern towers with window bands. Denser towns (up to 60 buildings) with garden trees. Smooth ship hulls with a prow and rail, sails that belly forward, streamlined aircraft, a rounded tank turret. | [#41](https://github.com/PaytonKnopp/Civius-Maximus/pull/41) |
| P4 | **The world.** Terrain painted per pixel (patches of lush and sun-dried growth, fine grain up close that fades with distance) in a warmer natural palette. Soft woods: lumpy smooth canopies and layered pines with light baked in. Crisp borders. Farms as a patchwork of crops on the ground's slope, with furrows, hedges and a farmhouse (and a long-standing bug that scattered improvement pieces is fixed). | [#42](https://github.com/PaytonKnopp/Civius-Maximus/pull/42) |
| P5 | **Full screens.** One frame for every screen: a deep backdrop lit from above, a banner header, engraved section titles, tables as rows of cards (your row in gold), progress meters. The Victories screen shows each leader and a meter per victory; the Religion screen shows beliefs as cards. Game icons replace emoji in costs; graphs fill the screen. | [#43](https://github.com/PaytonKnopp/Civius-Maximus/pull/43) |
| P6 | **Title screen.** The menu stands in a column on the left over the living world, the HUD hidden, the main choices as large engraved words; a bottom sheet on phones. | [#44](https://github.com/PaytonKnopp/Civius-Maximus/pull/44) |
| P7, P8 | **Leaders and feel.** Every portrait stands before its own dusk with a landmark of the civ's architecture on the horizon; faces painted with soft form; big portraits breathe. A turn banner sweeps across at each new turn; panels, notices and dialogs arrive instead of popping in. | [#45](https://github.com/PaytonKnopp/Civius-Maximus/pull/45) |
| P9 | **Final pass.** Units are about 7× lighter to draw (indexed smooth parts, fewer faces on small ones) and trees stay as light as before; unit and city cards become bottom sheets on phones; this review. | #46 |

## How to see it (ten minutes)

1. Open the link. The title screen: the menu on the left, the world behind it.
2. **Quick game.** Read your leader's intro (their portrait breathes in front of their civ's
   landmark). Note the top bar: yields on the left, grouped brass screen buttons; hover any of
   them for the game's tooltip.
3. Select a unit: the card on the left has stat tiles and an action bar. Zoom in (mouse wheel)
   on your units and watch them breathe; move one and watch it walk.
4. Found your city, play a few turns: the turn banner sweeps across; the city grows into a
   dense town with real roofs and garden trees; build a farm and see the patchwork fields.
5. Open the screens: Victories (**V**), Religion (**R**), City-states (**I**), Great people
   (**P**), the tech tree (**T**).
6. See every leader at once: add `#gallery` to the URL. See every unit and every architecture
   and age: the **Map Lab** (title screen) → Controls → "Unit models" or "Buildings".

## Is it the best it can be?

It's the best I can make it from code, and a big step up from where it was: the interface now
looks and behaves like a finished game, the map reads as a painted world, and units are
recognizable people that move. Honestly, compared with a AAA Civ game:

- **Characters** are well-made puppets: rigid parts on a skeleton, smooth-shaded, with simple
  faces. Civ's characters are sculpted and textured by artists, with motion-captured
  animation. Closing that gap needs real 3D models.
- **Leader portraits** are vector paintings drawn in code. They're consistent and characterful,
  but not painted like Civ VI's or rendered like Civ VII's.
- **The world** has no cast shadows or ambient occlusion on units and buildings, and the
  terrain is painted procedurally rather than from hand-made textures.

The two things that would lift it furthest, both free:

1. **Painted leader portraits.** Make 30 images with an image generator using
   [portrait-style-guide.md](portrait-style-guide.md) (it has the look and a prompt template)
   and drop them in: each leader's `portrait.image` in content replaces the drawn one, no code
   needed. This is the single biggest visual upgrade available.
2. **CC0 3D models.** Free packs from Quaternius or Kenney (animated characters, medieval
   buildings) could replace the procedural units and houses. My environment can't reach those
   sites, but if you download a pack into the repository I can wire it in, restyled to match.

## Your next steps

Unchanged from the V1 final review, with one optional addition:

1. **Play a game online with a friend** (title screen → Play online → Host; send the code).
   Note anything that looks wrong, reads unclearly or feels slow, and send it to me.
2. **Accounts and cloud saves** (optional, ~10 minutes, free): [guides/supabase.md](guides/supabase.md).
3. **Desktop app** (optional): GitHub → Actions → Desktop installers → Run workflow.
4. **Optional art:** painted portraits and/or CC0 model packs, as above.
5. **Optional:** install the Claude GitHub App on the repository so my sessions get CI results
   on their own: https://github.com/apps/claude/installations/select_target.

## What's still missing

The game's known gaps are unchanged (see [V1-FINAL-REVIEW.md](V1-FINAL-REVIEW.md#known-gaps)):
corporations, the Ages mode, crises and the Earth map from D29/D30; host handoff and a relay
server online; Supabase and the desktop build not yet run for real. For the art and UI:
painted portraits and artist-made models (above), cast shadows, and more animations (deaths,
celebrations, idle variety).

## Checks

Lint, format, typecheck and 325 tests pass on every part; every screen was checked at desktop
and phone sizes on a turn-120 save, plus Map Lab close-ups of units, buildings and terrain and a
scripted game with no console errors. Draw budget: about 6,800 vertices per unit on average
(squads 8,000–13,000, vehicles 500–6,000) and 42–210 per tree, each unit two draw calls.
