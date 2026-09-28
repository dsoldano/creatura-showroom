// Pure maths for B4 (no three import; node-tested): the sun-shadow frustum fitted in light space, and a box blur for the baked ground AO.
export const HALVES = [640, 320, 160];   // ortho half-sizes in metres: the smallest that covers the visible ground wins (sharper texels when zoomed in)
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// The shadow camera's axes, in three's lookAt convention: dir = toward the light, right = worldUp × dir, up = dir × right.
export function lightBasis(sunDir) {
  const dir = norm(sunDir); let right = cross([0, 1, 0], dir);
  right = Math.hypot(...right) < 1e-6 ? [1, 0, 0] : norm(right);
  return { dir, right, up: cross(dir, right) };
}
export function clampHits(hits, site, pad = 40) {
  const x0 = site.minX - pad, x1 = site.maxX + pad, z0 = site.minZ - pad, z1 = site.maxZ + pad;
  if (!hits.length) return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  return hits.map(([x, z]) => [Math.min(x1, Math.max(x0, x)), Math.min(z1, Math.max(z0, z))]);
}
export function pickHalf(need, halves = HALVES, prevHalf = null) {
  if (prevHalf && prevHalf >= need && need > 0.4 * prevHalf && halves.includes(prevHalf)) return prevHalf;   // hysteresis: no popping between boxes during a slow zoom
  let best = halves[0]; for (const h of halves) if (h >= need && h < best) best = h; return best;
}
// Fit in light space: a caster shadows exactly the receivers that share its light-space (u, v), so a box around the visible GROUND already holds every caster that matters.
export function fitShadow(hits, site, { pad = 40, halves = HALVES, mapSize, basis, prevHalf = null }) {
  const pts = clampHits(hits, site, pad), { right, up } = basis;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of pts) { const u = x * right[0] + z * right[2], v = x * up[0] + z * up[2]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const half = pickHalf(Math.max(u1 - u0, v1 - v0) / 2 * 1.02, halves, prevHalf), texel = 2 * half / mapSize;
  const cu = Math.round((u0 + u1) / 2 / texel) * texel, cv = Math.round((v0 + v1) / 2 / texel) * texel;   // snapped → no shimmer while the camera pans
  return { half, texel, centre: [cu * right[0] + cv * up[0], cu * right[1] + cv * up[1], cu * right[2] + cv * up[2]], u: [u0, u1], v: [v0, v1] };
}
// One separable box pass over a grey Float32Array, clamp-to-edge. Two passes ≈ a soft Gaussian.
export function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { const row = y * w; let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[row + x] = acc / n; acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = acc / n; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}
