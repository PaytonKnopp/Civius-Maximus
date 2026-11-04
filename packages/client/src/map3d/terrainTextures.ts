import {
  DataTexture,
  LinearMipmapLinearFilter,
  LinearFilter,
  RepeatWrapping,
  RGBAFormat,
  Texture,
  TextureLoader,
  UnsignedByteType,
} from 'three';
import dirtUrl from '../assets/terrain/dirt.webp';
import dryUrl from '../assets/terrain/dry.webp';
import grassUrl from '../assets/terrain/grass.webp';
import rockUrl from '../assets/terrain/rock.webp';
import sandUrl from '../assets/terrain/sand.webp';
import snowUrl from '../assets/terrain/snow.webp';

/**
 * Ground detail maps (CC0, from Poly Haven; see docs/ART-CREDITS.md). Each is a tiling
 * photograph reduced to a "detail" map: its average is 0.4, so the shader multiplies by 2.5 and
 * the texture adds grain and color variation to the painted palette without changing its overall
 * brightness. Until a file has loaded the uniform holds a flat 0.4 placeholder (no change).
 */
export const TERRAIN_TEXTURES = {
  tGrass: grassUrl,
  tDry: dryUrl,
  tSand: sandUrl,
  tDirt: dirtUrl,
  tRock: rockUrl,
  tSnow: snowUrl,
} as const;

export type TerrainTextureName = keyof typeof TERRAIN_TEXTURES;

function placeholder(): Texture {
  const t = new DataTexture(
    new Uint8Array([102, 102, 102, 255]),
    1,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  t.needsUpdate = true;
  return t;
}

/**
 * Start loading every detail map. `uniforms` gets one `{ value }` per name, swapped in as each
 * image arrives; `onLoad` is called after each one so a caller can redraw.
 */
export function loadTerrainTextures(
  uniforms: Record<TerrainTextureName, { value: Texture }>,
  anisotropy: number,
  onLoad: () => void,
): void {
  const loader = new TextureLoader();
  for (const name of Object.keys(TERRAIN_TEXTURES) as TerrainTextureName[]) {
    uniforms[name].value = placeholder();
    loader.load(
      TERRAIN_TEXTURES[name],
      (tex) => {
        tex.wrapS = tex.wrapT = RepeatWrapping;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.magFilter = LinearFilter;
        tex.anisotropy = anisotropy;
        tex.generateMipmaps = true;
        uniforms[name].value = tex;
        onLoad();
      },
      undefined,
      () => {
        // A missing file just leaves the plain painted palette.
      },
    );
  }
}
