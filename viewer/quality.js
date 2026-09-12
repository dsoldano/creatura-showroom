// Quality tiers, resolved once at boot: ?q=high|mid|low wins; otherwise coarse-pointer devices (phones, tablets) get mid, everything else high.
// low is what tools/check.mjs runs on the software renderer. mid and low keep every mobile-flicker fix: opaque canvas + logarithmic depth (README "Mobile flicker").
// dpr: devicePixelRatio cap · pmrem: how the sky environment map is baked (live = re-bake as day/dusk mixes, cached = day+dusk baked once, none = dome only)
// shadowMap: sun shadow map size · hemiScale: multiplier on the hemisphere light (the sky PMREM already lights the scene on mid/high)
export const TIERS = {
  high: { dpr: 1.5,  pmrem: 'live',   shadowMap: 2048, hemiScale: 0.35, logDepth: true, alpha: false },
  mid:  { dpr: 1.35, pmrem: 'cached', shadowMap: 1024, hemiScale: 0.35, logDepth: true, alpha: false },
  low:  { dpr: 1,    pmrem: 'none',   shadowMap: 1024, hemiScale: 1.0,  logDepth: true, alpha: false },
};
export function resolveQuality(qParam, coarse) {
  return Object.prototype.hasOwnProperty.call(TIERS, qParam) ? qParam : (coarse ? 'mid' : 'high');
}
