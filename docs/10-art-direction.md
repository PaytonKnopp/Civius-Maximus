# 10 — Art direction

> **Direction (decided):** stylized **3D**, close to Civ VII's look, painted like **Outer Wilds**
> and **Puss in Boots: The Last Wish**. Light enough to run on ordinary laptops. No heavy
> physics or animation.

## The look in one paragraph

A dark, grand, beautiful world at dusk. A low golden sun throws long light across muted, natural
land (moss greens, dry ochre, dark sand, slate rock); shadows are deep and cool. It reads as
realistic first and painted second: Outer Wilds' hand-made warmth inside Civ VII's grandeur, never
toy-like or candy-colored. Water is deep and dark, catches the sun in glints, reflects the sky at
the horizon, and turns see-through in the shallows over a sandy seabed. Cloud shadows drift
slowly over everything. Mountains gather into snow-capped rock ranges; forests are dense mixes of
pines and broadleaf; rocks and shrubs fill open land, so the world has scale. Zoomed in, the camera
drops low enough to see the horizon; zoomed out, it becomes a map. Unexplored land lies under a
**dark**, slowly swirling mist and gives nothing away; land you've seen but can't see now is a
dim, cold slate.

> **Revised after the first prototype (D11):** darker and more realistic than the first pass,
> less vibrant, less toon-shaded, and a much darker fog of war.

## What we take from each reference

| Reference | What we borrow |
|---|---|
| **Civ VII** | Tilted camera with smooth zoom, continuous sculpted terrain, settlements and districts that physically grow on their tiles, readable silhouettes at strategy zoom, fog of war (clouds over the unknown, a faded "memory" look for explored land you can't currently see) |
| **Outer Wilds** | Hand-painted texture feel, simple chunky shapes, warm/cool color contrast, soft gradient skies, cozy small-world charm |
| **Puss in Boots: The Last Wish** | Painterly shading with visible brush strokes, bold stepped lighting, stylized stepped-frame effects (explosions, spells and impacts animate "on twos") so effects feel crafted and cost little |

## How it's built (and why it stays light)

- **Three.js (WebGL2)** in the same web/desktop client. The 2D map from M4 becomes the **strategic
  view** (Civ V's flat map), always one key away, and the fallback on very weak devices.
- **Stylization does the work, not polygons:** low-poly geometry, vertex colors plus a few
  tiling brush-stroke textures, toon/stepped lighting with soft color ramps, subtle outlines.
- **Painterly post-process** (a Kuwahara-style brush filter) only on the High quality preset.
- **Instancing everywhere:** thousands of trees, rocks and buildings drawn in a handful of calls.
  Terrain in chunked meshes with frustum culling and lower detail at strategy zoom.
- **Animation budget:** idle bobs, slides and pose-to-pose attacks. No skeletal crowds, no cloth,
  no physics. Effects use flipbook-style stepped frames.
- **Quality presets** Low / Medium / High, plus render scale. **Target:** 60 fps on Medium at
  1080p on a laptop with integrated graphics; 30+ fps on a recent phone on Low.

## Element by element

| Element | Treatment |
|---|---|
| **Terrain** | Sculpted heightfield from the hex map, blended between tiles. Hills are rolling, mountains are tall painted peaks with snow caps. Each terrain has its own painted palette and brush texture. |
| **Water** | Depth-banded painted colors, animated scrolling brush foam on coasts, gentle vertex swell on ocean, lakes calmer and greener. Rivers are carved painted ribbons along tile edges, navigable rivers wider. |
| **Features** | Instanced stylized trees (broad canopy blobs for woods, tall layered fronds for rainforest), reeds for marsh, reef coral clusters in shallow water, ice sheets. |
| **Resources** | Small 3D props on the tile (wheat sheaves, horses, iron outcrops), plus a crisp icon badge for readability. |
| **Settlements** | Buildings grow in rings as population rises. Districts are distinct building clusters. Architecture style varies by civ's culture group and era. Wonders are hero models. |
| **Units** | Chunky stylized figures, small squads on a tile, player-colored banners, pose-to-pose animation. Commanders carry a banner showing packed units. |
| **Fog of war** | Dark and mysterious: unexplored land is flattened under a near-black swirling mist with a faint silver edge; explored-but-unseen land is dim, desaturated slate with last-known structures. |
| **Lighting & sky** | One low golden key light (late afternoon), cool sky ambient, film-style (ACES) tone mapping, a split-tone grade and vignette, drifting cloud shadows, a dusk sky at the horizon. No day/night cycle (keeps it cheap and readable). |
| **Leaders** | Painted 2D portraits (bust and full-figure for diplomacy) in one consistent style, with gentle parallax/breathing motion. No 3D animated leaders (too heavy, too costly to make 30+). |
| **Icons** | One unified painted icon set: yields, resources, units, buildings, promotions, policies. Big, bold, instantly readable at small size. Yields on tiles shown large with these icons. |
| **UI** | Clean and calm like Civ VII, with Civ VI's information where you want it. Dark translucent panels, metallic gold/brass/copper for headings, numbers and highlights, Roman inscription type for titles. The map and the numbers are the stars. |

## Where art comes from

1. **Procedural first:** terrain, water, trees, rocks, clouds and simple buildings are generated in
   code with the painterly shaders, so the world looks finished without any asset files.
2. **Free CC0 model packs** (e.g. Quaternius, Kenney) for units and buildings, restyled by our
   shaders so they match. Only CC0 / public-domain assets, with a credits file.
3. **Portraits and key art:** painted images you supply (e.g. made with an image generator from
   a prompt style guide Claude writes, so all 30+ leaders match), dropped into the content files.
   Until then, generated silhouette placeholders.

All art is referenced from content files, so swapping a placeholder for real art never touches code.

**Built so far (V1 part 10):** units are procedural low-poly squads, one model family per unit
(`model` in its content): settler, scout, warrior, archer, cavalry, ship, rifle, siege (catapult),
cannon, tank, steamship, commander (with a banner) and robed (missionaries, great people). The
Map Lab's "Unit models" switch puts one of each on the map, for checking new art.

**Built so far (V1 final, F4): leaders and emblems.** Every leader has an illustrated portrait
drawn in vector from traits in content (`leader.portrait`: face shape, skin, eyes, hair style,
beard, headwear from laurels and crowns to a mian or a bicorne, clothes from togas to kimonos,
jewelry, expression), lit from the upper left over a wash of the civ's colors, with a painted
grain at large sizes (`ui/Portrait.tsx`). Painted art replaces any of them by setting
`portrait.image` ([portrait-style-guide.md](portrait-style-guide.md) has the look and a prompt
template). Every civ has an emblem, a symbol on a heraldic shield in its colors (`civ.emblem`,
26 symbols, `ui/Emblem.tsx`). `#gallery` in the URL shows every leader and emblem.

**Built so far (V1 final, F3): units, cities and effects.** Every unit is a squad of chunky
figures with gear by era: bronze helmets, round shields and spears; crested helmets, tower shields
and swords; plumed knights on barded horses; tricorns and muskets; shakos and rifles; steel
helmets. There are horses, chariots, a pack mule for traders, a covered wagon with an ox for
settlers, catapults, cannon, field guns, tanks, galleys with oars, three-masted frigates,
ironclads, destroyers, and planes, bombers and helicopters ready for the Atomic era. Each unit is
two merged meshes (`map3d/unitModels.ts`). Cities are built in their civ's architecture
(`civ.architecture`: Mediterranean, European, Northern, East Asian, South Asian, Middle Eastern,
African, American, steppe), each with its own palace (a domed temple hall, a castle keep, a
three-tier hall, a great dome with minarets, an adobe hall with buttress towers, a step
pyramid, a great tent). Cities change with their owner's era: huts, round houses and tents;
stone towns in the civ's style; taller Renaissance streets; brick rows, chimneys and a factory;
concrete blocks and glass towers. Walls ring a city that has them and lose stretches when
damaged. Particle effects (`map3d/effects3d.ts`, two draw calls): chimney and factory smoke,
fire and black smoke over burning or badly damaged cities, dust and sparks where a blow lands.
The Map Lab's "Buildings" switch shows every style and age side by side. Every world wonder
has its own landmark (`map3d/districts3d.ts` and `map3d/wonders3d.ts`): pyramids, ziggurat,
lighthouse, mausoleum, rows of terracotta soldiers, temples, domes and minarets, Khmer towers in
a moat, a stepped pyramid, mountain terraces, a gothic front, curved stone walls, mud-brick
towers, palaces, a shipyard, a white castle, a porcelain pagoda, a giant sundial, onion domes,
a clock tower, a lattice tower, a stadium, a dam, sail-like shells and a needle tower. Each natural wonder has its own landmark (F7,
`map3d/naturalWonders3d.ts`): great summits with snow and mist, a coral reef, the red monolith,
terraced canyon walls, a waterfall with spray, salt flats, islets, limestone pillars, granite
cliffs with pines, a wetland, basalt columns stepping into the sea and desert rings.

**Built so far (V1 final, F2): the icon set.** About 140 icons drawn as vector paths on a 24×24
grid (`packages/client/src/ui/icons.ts`): the yields, all 24 resources, every unit model, the
districts, improvements, great person classes, key buildings, and the UI verbs (fortify, sleep,
found, upgrade...). Each is a colored disc with a white glyph, so they read at 14px. The same
path data draws as SVG in the interface, on a canvas for 3D labels, and as textures in the 2D
map, so one set looks the same everywhere. Text that mentions a yield ("+2🔬") shows the icon in
its place.
