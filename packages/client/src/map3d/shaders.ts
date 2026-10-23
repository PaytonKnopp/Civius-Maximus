/**
 * GLSL for the look in docs/10-art-direction.md: a darker, more realistic painted world. Low
 * golden sun with cool sky light, subtle brush texture, slope-based rock and snow, drifting cloud
 * shadows, dark Civ VII-style fog of war, deep water with sun glints and see-through shallows.
 * Every shader ends with tone mapping + color space so it matches three's lit materials.
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

const ATMOSPHERE = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uHaze;
  uniform vec3 uFogDark;
  // vis: 1 visible, ~0.5 remembered, 0 unexplored.
  vec3 applyVisibility(vec3 col, float vis, vec2 wp) {
    float grey = dot(col, vec3(0.299, 0.587, 0.114));
    // Bright things (snow) shouldn't glow through the fog: compress them first.
    grey = grey / (1.0 + grey * 1.5);
    vec3 memory = mix(vec3(grey), col, 0.08) * vec3(0.3, 0.34, 0.42);
    vec3 seen = mix(memory, col, smoothstep(0.6, 0.95, vis));
    vec3 unknown = uFogDark * (0.75 + 0.5 * fbm(wp * 0.4 + vec2(uTime * 0.01, 0.0)));
    return mix(unknown, seen, smoothstep(0.08, 0.45, vis));
  }
  vec3 applyHaze(vec3 col, vec3 world) {
    float d = distance(cameraPosition, world);
    return mix(col, uHaze, smoothstep(38.0, 150.0, d) * 0.92);
  }
  // Slow cloud shadows drifting across land and sea.
  float cloudShadow(vec2 wp) {
    return smoothstep(0.48, 0.72, fbm(wp * 0.055 + vec2(uTime * 0.006, uTime * 0.003)));
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
  ${ATMOSPHERE}
  uniform vec3 uRock;
  uniform vec3 uSnow;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vVis;

  vec3 detailNormal(vec3 n, vec2 p) {
    #ifdef DETAIL
      float e = 0.07;
      float h0 = fbm(p * 2.6);
      float hx = fbm((p + vec2(e, 0.0)) * 2.6);
      float hz = fbm((p + vec2(0.0, e)) * 2.6);
      return normalize(n + vec3(h0 - hx, 0.0, h0 - hz) * 2.2);
    #else
      return n;
    #endif
  }

  void main() {
    vec3 n0 = normalize(vNormal);
    vec2 wp = vWorld.xz;
    vec3 base = vColor;

    // Rock on steep slopes, snow on high ground that isn't too steep.
    float slope = 1.0 - n0.y;
    float rock = smoothstep(0.22, 0.42, slope) * smoothstep(0.1, 0.45, vWorld.y);
    base = mix(base, uRock * (0.75 + 0.45 * fbm(wp * 2.4)), rock);
    float snowLine = 1.28 + (fbm(wp * 1.3) - 0.5) * 0.4;
    float snow = smoothstep(snowLine, snowLine + 0.3, vWorld.y) * smoothstep(0.62, 0.32, slope);
    base = mix(base, uSnow, snow);

    vec3 n = detailNormal(n0, wp);
    float stroke = brush(wp);
    float ndl = dot(n, normalize(uLightDir)) + (stroke - 0.5) * 0.1;
    // Soft wrapped light with a hint of painted banding.
    float diff = smoothstep(-0.1, 0.9, ndl);
    diff = mix(diff, floor(diff * 4.0 + 0.5) / 4.0, 0.2);
    float shade = 1.0 - cloudShadow(wp) * 0.55;
    vec3 ambient = mix(uGroundColor, uSkyColor, 0.5 + 0.5 * n.y);
    // Lower ground sits a little deeper in shadow, which reads as scale.
    float valley = mix(0.78, 1.0, smoothstep(-0.2, 0.7, vWorld.y));
    vec3 col = base * (uSunColor * diff * shade + ambient) * valley * (0.95 + stroke * 0.1);

    col = applyVisibility(col, vVis, wp);
    col = applyHaze(col, vWorld);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
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
    world.y += sin(world.x * 0.9 + uTime * 0.7) * cos(world.z * 0.7 + uTime * 0.5) * 0.03 * smoothstep(0.2, 0.5, aDepth);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const waterFragment = /* glsl */ `
  ${NOISE}
  ${ATMOSPHERE}
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
    // Wave normal from two drifting noise layers.
    float e = 0.12;
    vec2 p1 = wp * 1.1 + vec2(uTime * 0.05, uTime * 0.03);
    vec2 p2 = wp * 2.4 - vec2(uTime * 0.04, -uTime * 0.05);
    float h0 = fbm(p1) + 0.5 * fbm(p2);
    float hx = fbm(p1 + vec2(e, 0.0)) + 0.5 * fbm(p2 + vec2(e, 0.0));
    float hz = fbm(p1 + vec2(0.0, e)) + 0.5 * fbm(p2 + vec2(0.0, e));
    vec3 n = normalize(vec3((h0 - hx) * 1.3, 1.0, (h0 - hz) * 1.3));
    vec3 v = normalize(cameraPosition - vWorld);

    float d = vDepth + (fbm(wp * 0.7 + uTime * 0.02) - 0.5) * 0.06;
    vec3 col = mix(uShallow, uCoast, smoothstep(0.02, 0.16, d));
    col = mix(col, uDeep, smoothstep(0.18, 0.36, d));
    col = mix(col, uAbyss, smoothstep(0.4, 0.6, d));
    col *= 0.8 + 0.25 * max(dot(n, normalize(uLightDir)), 0.0);
    col *= 1.0 - cloudShadow(wp) * 0.4;

    // Sky reflection at grazing angles and a glint of sun.
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    col = mix(col, uSkyColor * 1.4, fres * 0.6);
    vec3 h = normalize(normalize(uLightDir) + v);
    col += uSunColor * pow(max(dot(n, h), 0.0), 120.0) * 1.2;
    col *= 0.95 + brush(wp * 0.5 + uTime * 0.01) * 0.08;

    // Shoreline foam: thin bands lapping toward the coast.
    float wave = fract(d * 8.0 - uTime * 0.2 + fbm(wp * 1.4) * 0.9);
    float foam = smoothstep(0.1, 0.0, d) * smoothstep(0.62, 0.82, wave) * (0.5 + 0.5 * fbm(wp * 3.5 + uTime * 0.1));
    foam += smoothstep(0.025, 0.0, d) * 0.7;
    foam = clamp(foam, 0.0, 0.7);
    col = mix(col, uFoam, foam);

    // See-through shallows show the seabed.
    float alpha = max(mix(0.5, 0.96, smoothstep(0.0, 0.32, d)), foam);
    col = applyVisibility(col, vVis, wp);
    col = applyHaze(col, vWorld);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Fog of war cover: a dark mist that swirls slowly over unexplored land, with a soft edge. */
export const mistVertex = /* glsl */ `
  attribute float aVis;
  uniform float uTime;
  varying float vVis;
  varying vec3 vWorld;
  void main() {
    vVis = aVis;
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.y += sin(world.x * 0.4 + uTime * 0.3) * cos(world.z * 0.35 - uTime * 0.25) * 0.06;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const mistFragment = /* glsl */ `
  ${NOISE}
  ${ATMOSPHERE}
  uniform vec3 uMist;
  uniform vec3 uMistEdge;
  varying float vVis;
  varying vec3 vWorld;
  void main() {
    float cover = 1.0 - smoothstep(0.03, 0.5, vVis);
    if (cover < 0.01) discard;
    vec2 wp = vWorld.xz;
    float swirl = fbm(wp * 0.3 + vec2(uTime * 0.02, uTime * 0.012)) + 0.6 * fbm(wp * 0.85 - vec2(uTime * 0.03, -uTime * 0.02));
    vec3 col = mix(uFogDark, uMist, smoothstep(0.65, 1.35, swirl));
    // A faint silver rim where the mist thins out.
    float rim = cover * (1.0 - cover) * 4.0;
    col = mix(col, uMistEdge, rim * 0.16 * (0.6 + 0.4 * swirl));
    col = applyHaze(col, vWorld);
    gl_FragColor = vec4(col, cover * (0.9 + 0.1 * swirl));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Final pass: optional Kuwahara brush filter (High), color grade and vignette. */
export const paintPassFragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uTexel;
  uniform float uPaint;
  varying vec2 vUv;

  vec3 kuwahara() {
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
    return outc;
  }

  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    if (uPaint > 0.0) c = mix(c, kuwahara(), uPaint);
    // Split-tone grade: cool shadows, warm highlights.
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c * vec3(0.9, 0.97, 1.1), c * vec3(1.06, 1.0, 0.9), smoothstep(0.05, 0.7, l));
    // Vignette draws the eye to the middle of the map.
    vec2 q = vUv - 0.5;
    c *= mix(0.62, 1.0, smoothstep(0.9, 0.28, length(q * vec2(1.15, 1.0))));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const paintPassVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
