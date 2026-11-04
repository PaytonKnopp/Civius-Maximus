# Art credits and licenses

Rule (D93): only **CC0 / public domain** art goes into this repository, so nothing here needs
attribution or can be taken back. We still list every source so it can be audited. Before adding
an asset, open the source's license page and check it says CC0 (or equivalent) for *that*
asset; note the date below.

## Poly Haven (CC0)

License page, checked 2026-11-04: <https://polyhaven.com/license> — "Our assets are all licensed
as CC0 ... You can use our assets for any purpose, including commercial work. You do not need
to give credit ... You can redistribute them".

| File in the game | Poly Haven asset | Artist(s) |
|---|---|---|
| `packages/client/src/assets/terrain/grass.webp` | `forrest_ground_01` | see the asset page |
| `packages/client/src/assets/terrain/dry.webp` | `grass_path_2` | see the asset page |
| `packages/client/src/assets/terrain/sand.webp` | `sand_01` | see the asset page |
| `packages/client/src/assets/terrain/dirt.webp` | `mud_forest` | see the asset page |
| `packages/client/src/assets/terrain/rock.webp` | `rock_face_03` | Dario Barresi (photography), Rico Cilliers (processing) |
| `packages/client/src/assets/terrain/snow.webp` | `snow_02` | Rob Tuytel |

Terrain files are the original photograph resized to 1024 px, with its colors divided by their average
(so it only adds detail) and saved as WebP. The original is at
`https://polyhaven.com/a/<asset name>`.

### Surface grain for trees, rocks, houses and figures

`packages/client/src/assets/surface/*.webp` (512 px, same treatment as above; one texture array
in `map3d/surface.ts`):

| File | Poly Haven asset |
|---|---|
| `foliage.webp` | `forest_leaves_02` |
| `bark.webp` | `bark_brown_01` |
| `stone.webp` | `medieval_blocks_05` |
| `plaster.webp` | `white_rough_plaster` |
| `roof.webp` | `roof_tiles_14` |
| `wood.webp` | `weathered_brown_planks` |
| `cloth.webp` | `rough_linen` |
| `rock.webp` | `rock_face_03` |

### Portraits

`packages/client/src/assets/portrait/canvas.webp`: the Poly Haven `hessian_230` photograph,
greyscale, 256 px, flattened to a canvas weave that overlays every painted leader portrait.

## Not used, on purpose

- **Quaternius** packs: his license changed on 2026-08-28 to a custom one that forbids
  redistributing the assets themselves; a public game repository could count. Revisit only if he
  confirms in writing that bundling in an open-source game is fine.
