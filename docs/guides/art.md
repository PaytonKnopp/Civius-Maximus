# Updating the art later

Everything in the game is drawn in code today, so it's free and original. Two routes stay open
for making it look better later, and neither needs code from you.

## Painted leader portraits (no code)

The biggest single upgrade: replace the drawn leader portraits with painted ones, one at a time.

1. Make the image with an image generator, following
   [portrait-style-guide.md](../portrait-style-guide.md) (the look, the size and a prompt
   template), so all 30 leaders match.
2. Save it as `packages/client/public/leaders/<leader id>.webp` (1000×1200, under 250 KB). The
   leader ids are in `packages/content/base/leaders.json`, e.g. `leader_caesar`.
3. In `leaders.json`, add `"image": "leaders/<leader id>.webp"` inside that leader's
   `"portrait"`.
4. Commit and merge (GitHub's web editor works: **Add file** → **Upload files** for the image,
   the pencil icon for `leaders.json`). The website updates in about two minutes, and so does
   everyone's desktop app.

The game frames, crops and animates it like the drawn ones; leaders without an image keep the
drawn portrait. To check one first: `#gallery` after the game's address shows every leader.

## 3D models (send them to Claude)

Free CC0 model packs, for example from [Quaternius](https://quaternius.com) or
[Kenney](https://kenney.nl) (animated characters, medieval buildings, nature), can replace the
procedural units, houses and trees.

1. Download a pack you like (check that its license is CC0).
2. Put the files you want in the repository under `packages/client/public/models/<pack name>/`
   (glTF/GLB files are best) with the pack's license file, and merge.
3. Ask Claude in a session to wire them in. Claude's environment can't download from those sites,
   but it can use files that are in the repository, restyled to match the game's look and kept
   light enough for the Low, Medium and High quality presets.

## Rules for any art

- Free to use (CC0 or your own) and original: nothing from Civilization games, no film stills,
  no photos of living people, no logos or signatures.
- Sizes matter: the game runs on phones too. Portraits under 250 KB each; models under a few
  thousand triangles per unit.
