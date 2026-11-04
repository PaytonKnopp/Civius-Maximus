import {
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import bark from '../assets/surface/bark.webp';
import cloth from '../assets/surface/cloth.webp';
import foliage from '../assets/surface/foliage.webp';
import plaster from '../assets/surface/plaster.webp';
import rock from '../assets/surface/rock.webp';
import roof from '../assets/surface/roof.webp';
import stone from '../assets/surface/stone.webp';
import wood from '../assets/surface/wood.webp';

/**
 * Surface grain for the things standing on the land (trees, rocks, houses, figures). Their
 * geometry is colored per vertex; this multiplies real, tiling photograph detail (CC0, Poly
 * Haven, see docs/ART-CREDITS.md) over that color, picking the material from the color itself
 * (green is leaves, brown is bark or timber, grey is stone...). The maps are "detail" maps
 * (average 0.4, so x2.5 keeps the brightness), the lookup uses the model's own coordinates so it
 * never swims when a unit moves, and a flat placeholder holds until the images arrive.
 */

const LAYERS = [foliage, bark, stone, plaster, roof, wood, cloth, rock];
const SIZE = 512;

/** Layer numbers inside the texture array (must match LAYERS). */
export const SURFACE_LAYER = {
  foliage: 0,
  bark: 1,
  stone: 2,
  plaster: 3,
  roof: 4,
  wood: 5,
  cloth: 6,
  rock: 7,
} as const;

function placeholder(): DataArrayTexture {
  const data = new Uint8Array(LAYERS.length * 4);
  for (let i = 0; i < data.length; i += 4) data.set([102, 102, 102, 255], i);
  const t = new DataArrayTexture(data, 1, 1, LAYERS.length);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.needsUpdate = true;
  return t;
}

/** Shared by every material that uses the grain; the real texture replaces the placeholder. */
export const surfaceUniform: { value: DataArrayTexture } = { value: placeholder() };

let started = false;

export function loadSurfaceTextures(anisotropy: number): void {
  if (started) return;
  started = true;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  Promise.all(
    LAYERS.map(async (url) => {
      const blob = await (await fetch(url)).blob();
      return createImageBitmap(blob);
    }),
  )
    .then((images) => {
      const data = new Uint8Array(SIZE * SIZE * 4 * LAYERS.length);
      images.forEach((img, i) => {
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        data.set(ctx.getImageData(0, 0, SIZE, SIZE).data, i * SIZE * SIZE * 4);
        img.close();
      });
      const t = new DataArrayTexture(data, SIZE, SIZE, LAYERS.length);
      t.format = RGBAFormat;
      t.type = UnsignedByteType;
      t.wrapS = t.wrapT = RepeatWrapping;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = anisotropy;
      t.needsUpdate = true;
      surfaceUniform.value = t;
    })
    .catch(() => {
      // Without the images everything keeps its plain vertex colors.
    });
}

export type SurfaceKind = 'props' | 'buildings' | 'figures';

const FRAGMENT_COMMON = /* glsl */ `
  varying vec3 vSurfPos;
  uniform highp sampler2DArray tSurf;
  uniform float uSurfStrength;

  vec3 triSurf(float layer, vec3 p, vec3 n, float scale) {
    vec3 w = pow(abs(n), vec3(4.0));
    w /= w.x + w.y + w.z + 1e-4;
    vec3 a = texture(tSurf, vec3(p.zy * scale, layer)).rgb;
    vec3 b = texture(tSurf, vec3(p.xz * scale, layer)).rgb;
    vec3 c = texture(tSurf, vec3(p.xy * scale, layer)).rgb;
    return (a * w.x + b * w.y + c * w.z) * 2.5;
  }

  vec3 surfaceDetail(vec3 linear, vec3 p, vec3 n) {
    // Judge the color the way the eye does (roughly sRGB), not in linear light.
    vec3 c = pow(max(linear, vec3(0.0)), vec3(1.0 / 2.2));
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float sat = (mx - mn) / max(mx, 0.001);
    float layer;
    float scale;
    float amount = 1.0;
    #if SURF_KIND == 0
      const float GAIN = 2.2;
      // Trees, shrubs, rocks.
      if (c.g > c.b * 1.2 && c.g > c.r * 0.88) { layer = 0.0; scale = 3.2; amount = 0.9; }
      else if (sat < 0.2) { layer = 7.0; scale = 3.0; amount = 1.0; }
      else { layer = 1.0; scale = 7.0; amount = 1.0; }
    #elif SURF_KIND == 1
      const float GAIN = 2.0;
      // Houses, walls, wonders.
      if (c.r > c.g * 1.15 && c.r > c.b * 1.45 && sat > 0.4) { layer = 4.0; scale = 5.0; }
      else if (mx < 0.3 && sat < 0.3) { layer = 4.0; scale = 5.0; }
      else if (c.r >= c.g && c.g >= c.b && sat > 0.28 && mx < 0.55) { layer = 5.0; scale = 4.0; }
      else if (mx > 0.6 && sat < 0.45) { layer = 3.0; scale = 2.6; amount = 0.85; }
      else { layer = 2.0; scale = 3.2; }
    #else
      const float GAIN = 1.6;
      // Clothes and horses; metal keeps its shine without grain.
      if (sat < 0.12 && mx > 0.45) { layer = 6.0; scale = 16.0; amount = 0.5; }
      else { layer = 6.0; scale = 13.0; amount = 0.75; }
    #endif
    vec3 t = triSurf(layer, p, n, scale);
    return max(vec3(0.25), vec3(1.0) + (t - 1.0) * amount * uSurfStrength * GAIN);
  }
`;

const KINDS: Record<SurfaceKind, number> = { props: 0, buildings: 1, figures: 2 };

/** Adds the surface grain to a lit material (keeps any onBeforeCompile it already had). */
export function withSurface<T extends Material>(material: T, kind: SurfaceKind, strength = 1): T {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.tSurf = surfaceUniform;
    shader.uniforms.uSurfStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfPos = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n#define SURF_KIND ${KINDS[kind]}\n${FRAGMENT_COMMON}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= surfaceDetail(
          diffuseColor.rgb, vSurfPos, normalize(cross(dFdx(vSurfPos), dFdy(vSurfPos))));`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey()}|surface${KINDS[kind]}`;
  return material;
}
