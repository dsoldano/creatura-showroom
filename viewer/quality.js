// Quality tiers, resolved once at boot: ?q=high|mid|low wins; otherwise coarse-pointer devices (phones, tablets) get mid, everything else high.
// low is what tools/check.mjs runs on the software renderer. mid and low keep every mobile-flicker fix: opaque canvas + logarithmic depth (README "Mobile flicker"). high turns log depth OFF (near 3) because the GTAO pass reconstructs positions from linear depth.
// dpr: devicePixelRatio cap · pmrem: how the sky environment map is baked (live = re-bake as day/dusk mixes, cached = day+dusk baked once, none = dome only)
// shadowMap: sun shadow map size · hemiScale: multiplier on the hemisphere light (the sky PMREM already lights the scene on mid/high)
// canopy: icosahedron detail + number of canopy variants · hedgeSpacingM: hedge box spacing along thin green strips · lawn: lawn tint in the ground shader · waterFps: idle frame rate while a pool is on screen (0 = flat water)
// shadowMap: sun shadow map size (the frustum is fitted to the view on every tier) · near: camera near plane · composer: RenderPass → GTAO → Output on a HalfFloat MSAA target (desktop only)
export const TIERS = {
  high: { dpr: 1.5,  pmrem: 'live',   shadowMap: 4096, hemiScale: 0.35, logDepth: false, alpha: false, near: 3, composer: true,  facadeShadows: true,  canopy: { detail: 1, variants: 3 }, hedgeSpacingM: 1.0, lawn: true,  waterFps: 60 },
  mid:  { dpr: 1.35, pmrem: 'cached', shadowMap: 2048, hemiScale: 0.35, logDepth: true,  alpha: false, near: 2, composer: false, facadeShadows: false, canopy: { detail: 0, variants: 3 }, hedgeSpacingM: 1.5, lawn: true,  waterFps: 30 },
  low:  { dpr: 1,    pmrem: 'none',   shadowMap: 1024, hemiScale: 1.0,  logDepth: true,  alpha: false, near: 2, composer: false, facadeShadows: false, canopy: { detail: 0, variants: 1 }, hedgeSpacingM: 1.5, lawn: false, waterFps: 0 },
};
export function resolveQuality(qParam, coarse) {
  return Object.prototype.hasOwnProperty.call(TIERS, qParam) ? qParam : (coarse ? 'mid' : 'high');
}
