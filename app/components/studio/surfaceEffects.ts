import * as THREE from 'three';

/**
 * Shader patches that let the car's own PBR materials show dirt, foam, gloss
 * and rain without swapping materials. Every effect is driven by a "sweep"
 * uniform (0 → 1) that moves across the surface along `uAxis`, so a product
 * visibly cleans the car from one side to the other.
 */

export type BodyUniforms = {
  uAxis: {value: THREE.Vector3};
  uRange: {value: THREE.Vector2};
  uFloor: {value: THREE.Vector2};
  uDirt: {value: number};
  uFoam: {value: number};
  uWash: {value: number};
  uGloss: {value: number};
  uTime: {value: number};
};

export type GlassUniforms = {
  uAxis: {value: THREE.Vector3};
  uRange: {value: THREE.Vector2};
  uUp: {value: THREE.Vector3};
  uGrime: {value: number};
  uClean: {value: number};
  uTreated: {value: number};
  /** Sweep of the product film sprayed on before wiping. */
  uWet: {value: number};
  /** Final polish highlight travelling across the glass. */
  uShine: {value: number};
  uRain: {value: number};
  uTime: {value: number};
};

export function createBodyUniforms(): BodyUniforms {
  return {
    uAxis: {value: new THREE.Vector3(0, 0, 1)},
    uRange: {value: new THREE.Vector2(-2, 2)},
    uFloor: {value: new THREE.Vector2(0, 1.2)},
    uDirt: {value: 1},
    uFoam: {value: -0.2},
    uWash: {value: -0.2},
    uGloss: {value: -0.2},
    uTime: {value: 0},
  };
}

export function createGlassUniforms(): GlassUniforms {
  return {
    uAxis: {value: new THREE.Vector3(1, 0, 0)},
    uRange: {value: new THREE.Vector2(-1, 1)},
    uUp: {value: new THREE.Vector3(0, 1, 0)},
    uGrime: {value: 1},
    uClean: {value: -0.2},
    uTreated: {value: -0.2},
    uWet: {value: -0.2},
    uShine: {value: -0.2},
    uRain: {value: 0},
    uTime: {value: 0},
  };
}

const NOISE = /* glsl */ `
varying vec3 vAlzWorld;
float alzHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float alzNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(alzHash(i + vec3(0,0,0)), alzHash(i + vec3(1,0,0)), f.x),
        mix(alzHash(i + vec3(0,1,0)), alzHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(alzHash(i + vec3(0,0,1)), alzHash(i + vec3(1,0,1)), f.x),
        mix(alzHash(i + vec3(0,1,1)), alzHash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float alzFbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * alzNoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
// 1.0 where the sweep has already passed, with a ragged, organic edge.
float alzSwept(float along, float sweep, float n) {
  return 1.0 - smoothstep(sweep - 0.04, sweep + 0.04, along + (n - 0.5) * 0.16);
}
`;

function patchVertex(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vAlzWorld;')
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nvAlzWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
}

/** Paint, trims and rims: dust + road grime, shampoo foam, ceramic gloss. */
export function applyBodyEffect(
  material: THREE.Material,
  uniforms: BodyUniforms,
) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform vec3 uAxis;
uniform vec2 uRange;
uniform vec2 uFloor;
uniform float uDirt;
uniform float uFoam;
uniform float uWash;
uniform float uGloss;
uniform float uTime;
${NOISE}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
float alzN = alzFbm(vAlzWorld * 2.6);
float alzAlong = clamp((dot(vAlzWorld, uAxis) - uRange.x) / (uRange.y - uRange.x), 0.0, 1.0);
float alzWashed = alzSwept(alzAlong, uWash, alzN);
float alzFoamed = alzSwept(alzAlong, uFoam, alzN) * (1.0 - alzWashed);
float alzGlossed = alzSwept(alzAlong, uGloss, alzN);
// Road grime collects low on the car; a lighter dust film sits everywhere.
float alzLow = 1.0 - smoothstep(uFloor.x, uFloor.x + (uFloor.y - uFloor.x) * 0.55, vAlzWorld.y);
float alzSpots = smoothstep(0.42, 0.72, alzFbm(vAlzWorld * 7.0));
float alzDirt = uDirt * (1.0 - alzWashed) * clamp(0.2 + 0.32 * alzSpots + 0.75 * alzLow * alzN, 0.0, 1.0);
vec3 alzDirtColor = vec3(0.21, 0.18, 0.14) * (0.65 + 0.5 * alzN);
diffuseColor.rgb = mix(diffuseColor.rgb, alzDirtColor, alzDirt * 0.88);
roughnessFactor = mix(roughnessFactor, 0.85, alzDirt);
float alzFoamBody = smoothstep(0.12, 0.3, alzFbm(vAlzWorld * 9.0 + vec3(0.0, uTime * 0.05, 0.0)));
float alzBubbles = alzFbm(vAlzWorld * 60.0);
float alzFoamMask = alzFoamed * alzFoamBody;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.95) * (0.86 + 0.16 * alzBubbles), alzFoamMask);
roughnessFactor = mix(roughnessFactor, 0.95, alzFoamMask);
diffuseColor.rgb *= mix(1.0, 1.08, alzGlossed * (1.0 - alzDirt));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
// Thin gold line riding the front of whatever sweep is active.
float alzFront = max(
  exp(-pow((alzAlong - uGloss) * 26.0, 2.0)) * step(0.0, uGloss) * step(uGloss, 1.0),
  exp(-pow((alzAlong - uWash) * 26.0, 2.0)) * step(0.0, uWash) * step(uWash, 1.0) * 0.5
);
totalEmissiveRadiance += vec3(1.0, 0.78, 0.38) * alzFront * 0.35;`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        /* glsl */ `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat = mix(material.clearcoat, 1.0, alzGlossed) * (1.0 - alzDirt * 0.9);
  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.03, alzGlossed);
#endif`,
      );
  };
  material.customProgramCacheKey = () => 'alzara-body';
  material.needsUpdate = true;
}

/** Windshield: grime film + water spots, cleaning sweep, rain beading test. */
export function applyGlassEffect(
  material: THREE.Material,
  uniforms: GlassUniforms,
) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform vec3 uAxis;
uniform vec2 uRange;
uniform vec3 uUp;
uniform float uGrime;
uniform float uClean;
uniform float uTreated;
uniform float uWet;
uniform float uShine;
uniform float uRain;
uniform float uTime;
${NOISE}
// Droplet field in glass-space. Treated glass: small round beads that run
// off quickly. Untreated: big, slow, smeared drops that spread into a film.
// Returns (drop body, specular glint).
vec2 alzDropLayer(vec2 p, float treated, float t, float seed) {
  float speed = mix(0.05, 1.4, treated);
  float scale = mix(7.0, 18.0, treated);
  vec2 q = p * scale;
  vec2 cell = floor(vec2(q.x, q.y));
  float lane = alzHash(vec3(cell.x, 0.0, seed));
  q.y += t * speed * scale * 0.12 * (0.6 + lane);
  cell = floor(q);
  vec2 f = fract(q) - 0.5;
  float h = alzHash(vec3(cell, seed + 3.7));
  vec2 offset = vec2(alzHash(vec3(cell, seed + 1.3)), alzHash(vec3(cell, seed + 8.1))) - 0.5;
  vec2 d = f - offset * 0.55;
  // Untreated water smears into long streaks; treated water stays round.
  d.y *= mix(0.45, 1.0, treated);
  float size = mix(0.3, 0.16, treated) * mix(0.55, 1.0, alzHash(vec3(cell, seed + 5.9)));
  float present = step(mix(0.45, 0.62, treated), h);
  float body = (1.0 - smoothstep(size * 0.75, size, length(d))) * present;
  float glint = (1.0 - smoothstep(0.0, size * 0.28, length(d - vec2(-0.3, 0.35) * size))) * present;
  return vec2(body, glint);
}
vec2 alzDrops(vec2 p, float treated, float t) {
  vec2 a = alzDropLayer(p, treated, t, 0.0);
  vec2 b = alzDropLayer(p * 1.37 + 4.1, treated, t * 1.2, 11.0);
  return max(a, b);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
float alzN = alzFbm(vAlzWorld * 5.5);
float alzAlong = clamp((dot(vAlzWorld, uAxis) - uRange.x) / (uRange.y - uRange.x), 0.0, 1.0);
float alzClean = alzSwept(alzAlong, uClean, alzN);
float alzTreated = alzSwept(alzAlong, uTreated, alzN);
float alzWaterSpots = smoothstep(0.55, 0.75, alzFbm(vAlzWorld * 16.0));
float alzGrime = uGrime * (1.0 - alzClean) * clamp(0.55 + 0.45 * alzN + 0.5 * alzWaterSpots, 0.0, 1.0);
vec2 alzGlassUv = vec2(dot(vAlzWorld, uAxis), dot(vAlzWorld, uUp));
vec2 alzDropData = uRain * alzDrops(alzGlassUv, alzTreated, uTime);
float alzDrop = alzDropData.x;
float alzGlint = alzDropData.y;
float alzFilm = uRain * (1.0 - alzTreated) * (0.45 + 0.35 * alzN);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.33, 0.28), alzGrime * 0.8);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.6, 0.66), alzFilm * 0.35);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55, alzDrop * 0.6);
roughnessFactor = mix(roughnessFactor, 0.75, max(alzGrime, alzFilm * 0.7));
roughnessFactor = mix(roughnessFactor, 0.02, alzDrop);
// Sprayed product: a glossy, slightly blue liquid film with runs, sitting on
// the grime until the cloth wipes it away.
float alzRuns = smoothstep(0.35, 0.8, alzFbm(vec3(alzGlassUv.x * 18.0, alzGlassUv.y * 2.5, 1.7)));
float alzWet = alzSwept(alzAlong, uWet, alzN) * (1.0 - alzClean);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.62, 0.82), alzWet * (0.3 + 0.25 * alzRuns));
roughnessFactor = mix(roughnessFactor, 0.06, alzWet * 0.85);
// Freshly cleaned glass is perfectly smooth.
roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.01), alzClean * (1.0 - alzFilm));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.85, 0.92, 1.0) * alzGlint * 0.9 + vec3(0.5, 0.6, 0.7) * alzDrop * 0.05;
totalEmissiveRadiance += vec3(0.45, 0.7, 1.0) * alzWet * alzRuns * 0.08;
// Diagonal polish glint.
float alzDiag = alzAlong + (dot(vAlzWorld, uUp) - 1.0) * 0.6;
float alzShine = exp(-pow((alzDiag - uShine) * 9.0, 2.0)) * step(-0.1, uShine) * step(uShine, 1.3);
totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * alzShine * alzClean * 0.55;`,
      )
      .replace(
        'material.transmission = transmission;',
        'material.transmission = transmission * (1.0 - alzGrime * 0.85) * (1.0 - alzFilm * 0.5) * (1.0 - alzWet * 0.25);',
      );
  };
  material.customProgramCacheKey = () => 'alzara-glass';
  material.needsUpdate = true;
}
