/**
 * GLSL for the painterly look (docs/10-art-direction.md): stepped "toon" light with soft edges,
 * warm light / cool shade, brush-stroke texture from stretched noise, Civ VII-style fog states,
 * painted water bands with drifting foam. Cheap enough for integrated graphics.
 */

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.03) * 0.3 + vnoise(p * 4.11) * 0.15; }
  // Brush strokes: noise stretched along a slanted direction, like dry-brush texture.
  float brush(vec2 p) {
    vec2 q = vec2(p.x * 0.8 + p.y * 0.55, p.y * 4.2 - p.x * 1.1);
    return fbm(q * 2.2);
  }
`;

const FOG_OF_WAR = /* glsl */ `
  uniform float uTime;
  uniform vec3 uHaze;
  uniform vec3 uCloud;
  // vis: 1 visible, ~0.5 remembered, 0 unexplored.
  vec3 applyVisibility(vec3 col, float vis, vec2 wp) {
    float grey = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 memory = mix(vec3(grey), col, 0.25) * vec3(0.78, 0.82, 0.92);
    vec3 seen = mix(memory, col, smoothstep(0.55, 0.95, vis));
    float clouds = fbm(wp * 0.45 + vec2(uTime * 0.01, 0.0));
    vec3 unknown = uCloud * (0.86 + 0.18 * clouds);
    return mix(unknown, seen, smoothstep(0.05, 0.45, vis));
  }
  vec3 applyHaze(vec3 col, float dist) {
    return mix(col, uHaze, smoothstep(55.0, 140.0, dist) * 0.85);
  }
`;

const LIGHT = /* glsl */ `
  uniform vec3 uLightDir;
  // Two soft steps: shade, mid, light. Warm in the light, cool in the shade.
  vec3 paintLight(vec3 base, vec3 n, vec2 wp) {
    float l = dot(normalize(n), normalize(uLightDir));
    float stroke = brush(wp);
    l += (stroke - 0.5) * 0.22;
    float band = 0.58 + 0.27 * smoothstep(0.08, 0.2, l) + 0.18 * smoothstep(0.55, 0.68, l);
    vec3 warm = vec3(1.08, 1.0, 0.86);
    vec3 cool = vec3(0.78, 0.86, 1.08);
    vec3 tint = mix(cool, warm, smoothstep(0.62, 0.95, band));
    return base * band * tint * (0.94 + stroke * 0.12);
  }
`;

export const terrainVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aVis;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vVis;
  void main() {
    vColor = aColor;
    vVis = aVis;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const terrainFragment = /* glsl */ `
  ${NOISE}
  ${FOG_OF_WAR}
  ${LIGHT}
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vVis;
  void main() {
    vec3 col = paintLight(vColor, vNormal, vWorld.xz);
    col = applyVisibility(col, vVis, vWorld.xz);
    col = applyHaze(col, distance(cameraPosition, vWorld));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export const waterVertex = /* glsl */ `
  attribute float aDepth;
  attribute float aVis;
  uniform float uTime;
  varying float vDepth;
  varying float vVis;
  varying vec3 vWorld;
  void main() {
    vDepth = aDepth;
    vVis = aVis;
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Gentle swell in deep water only.
    world.y += sin(world.x * 0.9 + uTime * 0.8) * cos(world.z * 0.7 + uTime * 0.6) * 0.025 * smoothstep(0.2, 0.5, aDepth);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const waterFragment = /* glsl */ `
  ${NOISE}
  ${FOG_OF_WAR}
  uniform vec3 uShallow;
  uniform vec3 uCoast;
  uniform vec3 uDeep;
  uniform vec3 uAbyss;
  uniform vec3 uFoam;
  varying float vDepth;
  varying float vVis;
  varying vec3 vWorld;
  void main() {
    vec2 wp = vWorld.xz;
    float wobble = (fbm(wp * 0.7 + uTime * 0.02) - 0.5) * 0.08;
    float d = vDepth + wobble;
    // Painted depth bands with soft edges.
    vec3 col = mix(uShallow, uCoast, smoothstep(0.03, 0.14, d));
    col = mix(col, uDeep, smoothstep(0.2, 0.34, d));
    col = mix(col, uAbyss, smoothstep(0.42, 0.56, d));
    // Brush strokes drifting across open water.
    float strokes = brush(wp * 0.6 + vec2(uTime * 0.03, uTime * 0.01));
    col *= 0.93 + strokes * 0.14;
    float glint = smoothstep(0.78, 0.86, brush(wp * 0.35 - vec2(uTime * 0.02, 0.0)));
    col = mix(col, uFoam, glint * 0.18 * smoothstep(0.15, 0.4, d));
    // Shoreline foam: animated bands that lap toward the coast.
    float wave = fract(d * 9.0 - uTime * 0.25 + fbm(wp * 1.3) * 0.8);
    float foam = smoothstep(0.12, 0.0, d) * smoothstep(0.55, 0.75, wave) * (0.6 + 0.4 * fbm(wp * 3.0 + uTime * 0.1));
    foam += smoothstep(0.035, 0.0, d);
    col = mix(col, uFoam, clamp(foam, 0.0, 0.9));
    col = applyVisibility(col, vVis, wp);
    col = applyHaze(col, distance(cameraPosition, vWorld));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Kuwahara filter: flattens areas into brush-like patches while keeping edges (High quality). */
export const paintPassFragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    const int R = 3;
    vec3 m[4]; vec3 s[4];
    for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
    ivec2 starts[4];
    starts[0] = ivec2(-R, -R); starts[1] = ivec2(0, -R); starts[2] = ivec2(-R, 0); starts[3] = ivec2(0, 0);
    float n = float((R + 1) * (R + 1));
    for (int k = 0; k < 4; k++) {
      for (int j = 0; j <= R; j++) {
        for (int i = 0; i <= R; i++) {
          vec3 c = texture2D(tScene, vUv + vec2(float(starts[k].x + i), float(starts[k].y + j)) * uTexel).rgb;
          m[k] += c; s[k] += c * c;
        }
      }
    }
    float best = 1e9; vec3 outc = vec3(0.0);
    for (int k = 0; k < 4; k++) {
      vec3 mean = m[k] / n;
      vec3 v = abs(s[k] / n - mean * mean);
      float sigma = v.r + v.g + v.b;
      if (sigma < best) { best = sigma; outc = mean; }
    }
    gl_FragColor = vec4(outc, 1.0);
    #include <colorspace_fragment>
  }
`;

export const paintPassVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
