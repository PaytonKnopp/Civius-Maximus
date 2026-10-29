# Leader portrait style guide

Every leader already has an illustrated portrait drawn by the game from `leader.portrait` in
`packages/content/base/leaders.json` (face, skin, hair, beard, headwear, clothes, jewelry,
expression). Painted portraits can replace them one at a time: put the image in
`packages/client/public/leaders/<leader id>.webp` and set `"image": "leaders/<leader id>.webp"` in
that leader's `portrait`. Nothing else changes; the game crops and frames it.

## The look (keep every leader consistent)

- **Format:** 1000 × 1200 px (5:6), WebP, under 250 KB. Head and shoulders, the face centered
  horizontally with the eyes about 40% from the top. Leave a little air above the head: the frame
  is an arch that trims the top corners.
- **Style:** a painted historical portrait, like a museum oil painting brought to life: soft
  brushwork, visible but fine strokes, rich but not saturated color, no line art, no anime, no
  photo realism, no 3D render look.
- **Light:** one warm key light from the upper left, soft fill, a gentle rim light on the right
  shoulder. Late-afternoon gold, matching the game's 3D world.
- **Background:** a soft abstract wash in the civ's primary color, darker toward the edges, with
  no scenery, text or props. The game adds the gold frame and the emblem itself.
- **Pose and mood:** three-quarter view, looking toward the viewer, a composed expression that
  fits the leader (see `expression`). Dignified, never a caricature.
- **Accuracy:** dress, hair and jewelry plausible for the leader's time and place; when the
  record is thin, choose what is typical of their culture rather than inventing a costume.
- **Never:** copied art from other games, film stills, real photographs of living people, logos,
  signatures or watermarks.

## Prompt template

> Painted historical portrait of {leader name}, {title}, {one line on age, build and bearing},
> wearing {clothes and headwear from the portrait spec, in period detail}, three-quarter view,
> looking toward the viewer, {expression} expression. Oil painting style with soft visible
> brushwork, warm golden key light from the upper left, soft rim light, rich muted colors.
> Plain abstract background in {civ primary color}, darker at the edges. Head and shoulders,
> centered, 5:6. No text, no frame, no logo.

## Checklist before committing one

1. It reads at 32 px (the chips) and at 240 px (the intro): the face is clear, the silhouette
   (hat, hair, collar) is distinct.
2. The background color matches the civ's `colors.primary`.
3. Next to the other painted portraits, the light, brushwork and framing match.
4. The `image` path works in the gallery (`#gallery` in the URL shows every leader).
