# B4 — Shadows + AO (fitted sun frustum, baked ground AO, desktop GTAO) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sharper, better-grounded light on every tier — a sun-shadow frustum that fits only the ground in view (4096 / 2048 / 1024 maps), a baked ambient-occlusion map on the ground (soft darkening at building bases, under trees and hedges) — and, on desktop only, a screen-space GTAO pass through an EffectComposer with logarithmic depth switched off. Phones keep every flicker fix.

**Architecture:** `viewer/post-math.js` is pure and node-tested (light basis, light-space fit of the visible ground to the shadow texel grid, separable box blur). `viewer/ground-ao.js` paints the AO canvas → `aoMap`. `viewer/post.js` owns the desktop chain `RenderPass → GTAOPass → OutputPass` on a HalfFloat MSAA×4 target, hides `userData.noAO` objects from the AO g-buffer, and guarantees one shadow pass per frame; when off it is a plain `renderer.render`. `app.js` refits the shadow camera before every rendered frame, tags ghosts/ring as `noAO`, sets the court line plane's polygon offset, and measures the reveal flight to auto-drop AO (then reload as `mid`) on a slow device-resolved desktop.

**Tech Stack:** Three.js r170 (`DirectionalLightShadow`, `EffectComposer`, `RenderPass`, `GTAOPass`, `OutputPass`, `WebGLRenderTarget{HalfFloatType, samples:4}`, `CanvasTexture` as `aoMap`), `node --test`, Playwright/SwiftShader.

**Spec:** `docs/superpowers/specs/2026-09-12-siteplan-arc2-render-media-design.md` §"B4 — shadows + AO" + the tier table rows (log depth OFF on high · shadow map 4096/2048/1024 · fitted frustum yes/yes/yes · ground AO map yes/yes/yes · composer/GTAO/MSAA only on high). B1's plan explicitly deferred the fitted frustum, the 4096 map, the composer and `?fx=log|noao` to B4.

## Context

B1–B3 are merged (`0b3da3c`) and live 21/21. Today the sun's ortho shadow box is a fixed ±261 m square (`app.js:72`) — at a hotspot view the shadow texels are ~13 cm on a 2048 map and edges look soft/blocky; the ground has no ambient occlusion (bases of towers float on the plan); desktop has no screen-space AO. The spec's answer is this sub-phase.

**Verified before planning (2026-09-13):**
- The r170 `GTAOPass` API is exactly what the spec names (`updateGtaoMaterial{radius,distanceExponent,thickness,scale,samples,screenSpaceRadius}`, `updatePdMaterial{lumaPhi,depthPhi,normalPhi,radius,rings,samples}`, `blendIntensity`, `setSceneClipBox`, `overrideVisibility`/`restoreVisibility`). Its g-buffer pass calls `renderer.render` a second time per frame (hence `shadowMap.autoUpdate=false`), `overrideVisibility` only hides points/lines (hence the `noAO` wrapper), and it reconstructs positions from the depth texture via the inverse projection (hence log depth OFF on high).
- r170 tone-maps only when drawing to the screen (`WebGLPrograms` line 20770), so `RenderPass → HalfFloat target → OutputPass` does not double tone-map. `Texture.channel` defaults to 0, so `aoMap` reads the ground's existing custom `uv`.
- SwiftShader (the check runner) runs the whole high path — WebGL2, MSAA×4 HalfFloat composer, GTAO, 4096 shadow map — framebuffer complete, zero GL/console errors. Whole-frame calls on a 3-mesh scene came to 13 (shadow + beauty + g-buffer + 4 quads), so Belvedere high should land ≈150 calls / ≈390k tris, inside the current ceilings.

**One design refinement, stated so it is not mistaken for drift:** the fit is done in **light space** — project the visible ground hits onto the shadow camera's `right`/`up` axes, take the 2-D box there, pick the smallest half-size that covers it, snap its centre to the texel grid there, map back to world. Because a caster shadows exactly the receivers that share its light-space (x, y), every tower whose shadow falls on visible ground is inside the box automatically (dusk included); no special caster handling. Same intent as the spec's world-space wording, correct for a tilted sun.

Everything else follows the spec: `sun.shadow.intensity` per preset (B1 already), ground AO 1024 px canvas over `plan.crop` (volumes alpha 0.55, 2-pass box blur ≈6 m, radial gradients per tree/hedge) as `aoMap` intensity 0.9; high-only composer with the spec's GTAO/denoise numbers, `blendIntensity 0.75`, clip box site ±50 m, `noAO` for ghosts/ring/sky, one shadow pass per frame, `composer.setSize` in `resize()`; high-only `logarithmicDepthBuffer:false`, `near 3`, court line plane `polygonOffsetUnits:-2`; `?fx=log` forces log depth on high (and therefore turns the AO pass off — the pass cannot read log depth); `?fx=noao` disables the pass; auto-downgrade when the reveal flight averages >40 ms/frame (`__walk.autoTier`); checkpoint z-fight scan at max radius, day and dusk.

## Global Constraints

- No build step; ES modules via the jsDelivr importmap (`three@0.170.0`, `three/addons/`).
- `mid`/`low` keep every flicker fix: opaque canvas, logarithmic depth ON, no backdrop-filter, idle loop never fully stops. Nothing in this sub-phase touches the phone render path except the fitted frustum (all tiers), the 2048 map on mid, and the ground `aoMap`.
- Project-agnostic: derived from `site.json` + the scene; no site.json change.
- `window.__walk` is the verification contract; `check.mjs` runs ALONE (it now takes ≈10 min — run it in the background with a 900 s budget); always run it after touching `app.js`; screenshots are read as images; the owner's phone is the gate.
- On the software renderer ALWAYS pass `q=` explicitly in shot URLs (a device-resolved `high` would auto-drop AO / reload as mid on SwiftShader).
- Unit tests: `node --test tests/*.test.mjs`. Headless shots: `timeout: 150000` (high with GTAO may need more — use 240000 there).
- Commit locally after each task (no remote); every commit ends with the two attribution trailers used on this repo.
- Branch: `arc2-b4` off master; merge only after the owner's phone gate.

## File structure

| File | Responsibility |
|---|---|
| `viewer/post-math.js` (new, pure) | `HALVES`, `lightBasis(sunDir)`, `clampHits(hits, site, pad)`, `pickHalf(need, halves)`, `fitShadow(hits, site, {pad, halves, mapSize, basis})`, `boxBlur(src, w, h, r)`. Node-tested. |
| `viewer/ground-ao.js` (new) | `buildGroundAO({crop, toPx, mpp, volumes, trees, hedges, width})` → `{ texture, size, darkened }`. |
| `viewer/post.js` (new) | `GTAO_PARAMS`, `DENOISE_PARAMS`, `createPost(renderer, scene, camera, {clipBox, enabled})` → `{ enabled (get/set), gtao, render(), setSize(w,h) }`. |
| `viewer/quality.js` (modify) | `shadowMap` 4096/2048/1024, `logDepth` false on high, `near` 3/2/2, `composer` true/false/false. |
| `viewer/greenery.js` (modify) | `plantGreenery` also returns `treePts`, `hedgePts`. |
| `viewer/app.js` (modify) | renderer flags, camera near, shadow fit per frame, `noAO` tags, court offset units, `aoMap`, post chain + resize, auto-tier, `__walk` additions. |
| `tests/post-math.test.mjs` (new), `tests/quality.test.mjs` (modify) | unit tests. |
| `tools/check.mjs` (modify) | per-tier log-depth/AO expectations, shadow-fit check, ground-AO check, GTAO A/B check; ceilings if needed. |
| `tools/shoot.mjs` (modify) | print `quality`, `post`, `autoTier` in the stats line. |
| `README.md`, `docs/adding-a-project.md` (modify) | tiers + flags wording, software-renderer `q=` gotcha. |
| `docs/superpowers/plans/2026-09-13-b4-shadows-ao.md` (new) | this plan, committed. |
| `docs/checkpoints/b4/*.png` (new) | evidence. |
| `tools/_b4-facts.mjs`, `tools/_b4-shots.mjs` (new, gitignored) | per-tier facts; A/B, z-fight, close-up shots via `__walk`. |

---

### Task 0: branch, plan file, baseline "before" shots

**Files:** Create `docs/superpowers/plans/2026-09-13-b4-shadows-ao.md`, `docs/checkpoints/b4/before-*.png`.

- [ ] **Step 1: branch + plan** — `git switch -c arc2-b4`; copy this plan to `docs/superpowers/plans/2026-09-13-b4-shadows-ao.md`; commit "B4 implementation plan (shadows + AO): light-space shadow fit, ground AO map, desktop GTAO".

- [ ] **Step 2: baseline shots from the LIVE url (master = B3), explicit `q=high`** — `mkdir -p docs/checkpoints/b4`; one at a time:
```bash
node tools/shoot.mjs "https://walk.csoul.cloud/belvedere/?autostart=1200&q=high#h=stepped-well-plaza" docs/checkpoints/b4/before-stepped-well 9000
node tools/shoot.mjs "https://walk.csoul.cloud/belvedere/?autostart=1200&q=high#h=clubhouse-drop-off" docs/checkpoints/b4/before-clubhouse 9000
node tools/shoot.mjs "https://walk.csoul.cloud/belvedere/?autostart=1200&q=high" docs/checkpoints/b4/before-overview 9000
```
Keep only the `-desktop.png` of each (delete the phone ones). Read `before-stepped-well-desktop.png` once (note the shadow edge softness). Commit "B4: baseline shots before shadows/AO".

---

### Task 1: `viewer/post-math.js` — light-space shadow fit + box blur (node-tested)

**Files:** Create `viewer/post-math.js`, `tests/post-math.test.mjs`.

**Interfaces (produced):**
- `HALVES = [640, 320, 160]`.
- `lightBasis(sunDir /*[x,y,z]*/)` → `{ dir, right, up }` unit vectors (three's lookAt convention: `dir` toward the light, `right = up_world × dir`, `up = dir × right`; a straight-up sun falls back to `right = [1,0,0]`).
- `clampHits(hits, site, pad = 40)` → hits clamped into `site ± pad` (world x/z); empty input → the four padded site corners.
- `pickHalf(need, halves = HALVES, prevHalf = null)` → smallest half ≥ `need`, else `halves[0]`; with hysteresis: keeps `prevHalf` while it still covers `need` and `need > 0.4·prevHalf` (no 160↔320 popping during a slow zoom).
- `fitShadow(hits, site, { pad = 40, halves = HALVES, mapSize, basis, prevHalf })` → `{ half, texel, centre:[x,y,z], u:[min,max], v:[min,max] }` — `centre` lies in the plane through the origin perpendicular to `dir`, snapped so its light-space coordinates are multiples of `texel = 2·half/mapSize`.
- Expectation on this site (42° fov, pitch ≤ 70°, 2:1 desktop aspect): 320 at the overview AND at ordinary hotspot views (the visible ground spans ~300 m), 160 at close zoom / steep pitch (radius ≈ 60, polar ≈ 20°); 640 never. The map-size step (4096/2048) gives ≈1.6× sharper texels everywhere; the fit adds another 2× when zoomed in.
- `boxBlur(src: Float32Array, w, h, r)` → new `Float32Array`, one separable box pass, clamp-to-edge.

- [ ] **Step 1: failing tests** — `tests/post-math.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HALVES, lightBasis, clampHits, pickHalf, fitShadow, boxBlur } from '../viewer/post-math.js';
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const SITE = { minX: -100, maxX: 100, minZ: -150, maxZ: 150 };

test('lightBasis: orthonormal, right is horizontal, straight-up sun does not degenerate', () => {
  const b = lightBasis([300, 520, 260]);
  for (const v of [b.dir, b.right, b.up]) assert.ok(near(Math.hypot(...v), 1));
  assert.ok(near(b.right[1], 0)); assert.ok(near(dot(b.right, b.dir), 0)); assert.ok(near(dot(b.up, b.dir), 0)); assert.ok(near(dot(b.up, b.right), 0));
  const o = lightBasis([0, 1, 0]); assert.deepEqual(o.right, [1, 0, 0]); assert.deepEqual(o.up.map(v => +v.toFixed(6)), [0, 0, -1]);
});
test('clampHits: inside the padded site; none → the padded corners', () => {
  const c = clampHits([[5000, -5000], [3, 4]], SITE, 40);
  assert.deepEqual(c, [[140, -190], [3, 4]]);
  assert.equal(clampHits([], SITE, 40).length, 4);
});
test('pickHalf: smallest that covers, largest when nothing does, hysteresis keeps the previous box until need drops well below it', () => {
  assert.equal(pickHalf(50), 160); assert.equal(pickHalf(160), 160); assert.equal(pickHalf(161), 320); assert.equal(pickHalf(900), 640); assert.equal(pickHalf(10, [100, 50]), 50);
  assert.equal(pickHalf(150, HALVES, 320), 320, 'still covered and above 40 % of 320 → keep');
  assert.equal(pickHalf(100, HALVES, 320), 160, 'below 40 % of 320 → shrink');
  assert.equal(pickHalf(200, HALVES, 160), 320, 'no longer covered → grow');
});
test('fitShadow (overhead sun): half from the visible extent, centre snapped to the texel grid', () => {
  const basis = lightBasis([0, 1, 0]);
  const near160 = fitShadow([[-40, -40], [60, 40]], SITE, { mapSize: 4096, basis });
  assert.equal(near160.half, 160); assert.ok(near(near160.texel, 320 / 4096));
  assert.ok(near(near160.centre[0] / near160.texel, Math.round(near160.centre[0] / near160.texel), 1e-6), 'x on the grid');
  assert.ok(Math.abs(near160.centre[0] - 10) <= near160.texel && Math.abs(near160.centre[2] - 0) <= near160.texel, 'centre near the box middle');
  const wide = fitShadow([[-300, -300], [300, 300]], SITE, { mapSize: 2048, basis });
  assert.equal(wide.half, 320, 'clamped to site±40 (280×380) → half-extent 190 → 320');
  assert.equal(fitShadow([], SITE, { mapSize: 1024, basis }).half, 320);
});
test('fitShadow (tilted sun): centre is perpendicular to the light direction and snapped in light space', () => {
  const basis = lightBasis([-0.83, 0.225, 0.51]);
  const f = fitShadow([[10, 20], [90, 60], [30, 70]], SITE, { mapSize: 4096, basis });
  assert.ok(near(dot(f.centre, basis.dir), 0, 1e-6));
  const u = dot(f.centre, basis.right), v = dot(f.centre, basis.up);
  assert.ok(near(u / f.texel, Math.round(u / f.texel), 1e-6)); assert.ok(near(v / f.texel, Math.round(v / f.texel), 1e-6));
  assert.equal(f.half, 160);
});
test('boxBlur: constant stays constant; a delta spreads to a (2r+1)² plateau and keeps its sum', () => {
  const w = 21, h = 21, flat = new Float32Array(w * h).fill(0.5);
  assert.ok(boxBlur(flat, w, h, 3).every(v => near(v, 0.5)));
  const d = new Float32Array(w * h); d[10 * w + 10] = 1; const o = boxBlur(d, w, h, 2);
  assert.ok(near(o[10 * w + 10], 1 / 25)); assert.ok(near(o[8 * w + 12], 1 / 25)); assert.ok(near(o[7 * w + 10], 0));
  assert.ok(near(o.reduce((a, b) => a + b, 0), 1, 1e-5));
});
```

- [ ] **Step 2: run → fails** — `node --test tests/post-math.test.mjs` → `Cannot find module`.

- [ ] **Step 3: module** — `viewer/post-math.js`:
```js
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
```

- [ ] **Step 4: run → passes** — `node --test tests/*.test.mjs` (23 tests). If the delta-sum assertion in `boxBlur` fails by clamp-to-edge duplication, the delta is 8 cells from the edge with r = 2 — it must pass; investigate rather than loosen.
- [ ] **Step 5: commit** — "B4: post-math — light basis, light-space shadow fit snapped to the texel grid, box blur + tests".

---

### Task 2: tiers + greenery points

**Files:** Modify `viewer/quality.js`, `tests/quality.test.mjs`, `viewer/greenery.js`.

- [ ] **Step 1: failing test** — append to `tests/quality.test.mjs`:
```js
test('B4: log depth off only on high (the AO pass reads linear depth); shadow maps 4096/2048/1024; composer on high only; camera near', () => {
  assert.equal(TIERS.high.logDepth, false); assert.equal(TIERS.mid.logDepth, true); assert.equal(TIERS.low.logDepth, true);
  assert.equal(TIERS.high.shadowMap, 4096); assert.equal(TIERS.mid.shadowMap, 2048); assert.equal(TIERS.low.shadowMap, 1024);
  assert.equal(TIERS.high.composer, true); assert.equal(TIERS.mid.composer, false); assert.equal(TIERS.low.composer, false);
  assert.equal(TIERS.high.near, 3); assert.equal(TIERS.mid.near, 2); assert.equal(TIERS.low.near, 2);
});
```
`node --test tests/quality.test.mjs` → FAIL.

- [ ] **Step 2: tiers** — in `viewer/quality.js` replace the comment line `// low is what tools/check.mjs runs on the software renderer. mid and low keep every mobile-flicker fix: opaque canvas + logarithmic depth (README "Mobile flicker").` with
`// low is what tools/check.mjs runs on the software renderer. mid and low keep every mobile-flicker fix: opaque canvas + logarithmic depth (README "Mobile flicker"). high turns log depth OFF (near 3) because the GTAO pass reconstructs positions from linear depth.`
add after the canopy comment line: `// shadowMap: sun shadow map size (the frustum is fitted to the view on every tier) · near: camera near plane · composer: RenderPass → GTAO → Output on a HalfFloat MSAA target (desktop only)`
and set the rows:
```js
  high: { dpr: 1.5,  pmrem: 'live',   shadowMap: 4096, hemiScale: 0.35, logDepth: false, alpha: false, near: 3, composer: true,  facadeShadows: true,  canopy: { detail: 1, variants: 3 }, hedgeSpacingM: 1.0, lawn: true,  waterFps: 60 },
  mid:  { dpr: 1.35, pmrem: 'cached', shadowMap: 2048, hemiScale: 0.35, logDepth: true,  alpha: false, near: 2, composer: false, facadeShadows: false, canopy: { detail: 0, variants: 3 }, hedgeSpacingM: 1.5, lawn: true,  waterFps: 30 },
  low:  { dpr: 1,    pmrem: 'none',   shadowMap: 1024, hemiScale: 1.0,  logDepth: true,  alpha: false, near: 2, composer: false, facadeShadows: false, canopy: { detail: 0, variants: 1 }, hedgeSpacingM: 1.5, lawn: false, waterFps: 0 },
```
- [ ] **Step 3: greenery points** — in `viewer/greenery.js` change the return line to
`return { trees: trees.length, hedges: hedges.length, variants: V, treeMeshes, trunks, hedgeMesh, lawnTexture, treePts: trees.map(p => ({ x: p.x, z: p.z, s: 0.75 + p.r2 * 0.7 })), hedgePts: hedges.map(p => ({ x: p.x, z: p.z })) };`
(the same `s` formula the canopy instance uses, so the AO disc matches the crown).
- [ ] **Step 4:** `node --test tests/*.test.mjs` → all pass; `node --check viewer/greenery.js`. Commit "B4: tiers — 4096/2048/1024 shadow maps, log depth off + composer + near 3 on high; greenery exposes tree/hedge points for the AO map".

---

### Task 3: `viewer/ground-ao.js` + `viewer/post.js`

**Files:** Create both.

**Interfaces (produced):**
- `buildGroundAO({ crop, toPx, mpp, volumes, trees, hedges, width = 1024 })` → `{ texture: CanvasTexture, size: [W, H], darkened: fraction of texels with red < 250 }`. `toPx(x, z)` → plan px `[px, py]`; `volumes` = site volumes to darken (caller excludes `future`); `trees` = `[{x, z, s}]`, `hedges` = `[{x, z}]` (world metres).
- `createPost(renderer, scene, camera, { clipBox: Box3, enabled: boolean })` → `{ get/set enabled, get gtao, render(), setSize(w, h) }`. `render()` always requests exactly one shadow-map pass, then either `composer.render()` or `renderer.render(scene, camera)`.

- [ ] **Step 1: ground-ao.js**
```js
// Baked ground ambient occlusion (B4): a canvas over plan.crop — building footprints darkened and blurred (~6 m), crisp contact discs under trees and hedges — used as the ground material's aoMap.
import * as THREE from 'three';
import { boxBlur } from './post-math.js';

export function buildGroundAO({ crop, toPx, mpp, volumes, trees, hedges, width = 1024 }) {
  const W = width, H = Math.round(W * crop.h / crop.w), k = W / crop.w, pxPerM = k / mpp;   // canvas px per plan px, per metre
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (const v of volumes) { g.beginPath(); v.polygon.forEach((p, i) => i ? g.lineTo((p[0] - crop.x) * k, (p[1] - crop.y) * k) : g.moveTo((p[0] - crop.x) * k, (p[1] - crop.y) * k)); g.closePath(); g.fill(); }
  const id = g.getImageData(0, 0, W, H), n = W * H; let grey = new Float32Array(n);
  for (let i = 0; i < n; i++) grey[i] = id.data[i * 4];
  const r = Math.max(1, Math.round(6 * pxPerM)); grey = boxBlur(boxBlur(grey, W, H, r), W, H, r);   // two passes ≈ soft 6 m falloff from every wall
  for (let i = 0; i < n; i++) { const v = grey[i]; id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  g.putImageData(id, 0, 0);
  const disc = (px, py, rad, a) => { const gr = g.createRadialGradient(px, py, 0, px, py, rad); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(px - rad, py - rad, 2 * rad, 2 * rad); };
  for (const t of trees) { const [px, py] = toPx(t.x, t.z); disc((px - crop.x) * k, (py - crop.y) * k, 2.2 * t.s * pxPerM, 0.35); }
  for (const h of hedges) { const [px, py] = toPx(h.x, h.z); disc((px - crop.x) * k, (py - crop.y) * k, 1.0 * pxPerM, 0.25); }
  const d2 = g.getImageData(0, 0, W, H).data; let dark = 0; for (let i = 0; i < n; i++) if (d2[i * 4] < 250) dark++;
  const texture = new THREE.CanvasTexture(cv); texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;   // same uv space + flipY as the ground map and the lawn mask
  return { texture, size: [W, H], darkened: dark / n };
}
```
- [ ] **Step 2: post.js**
```js
// Desktop post chain (B4): RenderPass → GTAOPass → OutputPass on a HalfFloat MSAA×4 target. Off = a plain renderer.render. Tone mapping + sRGB happen in OutputPass (r170 only tone-maps when drawing to the screen).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const GTAO_PARAMS = { radius: 5, distanceExponent: 1.5, thickness: 3, scale: 1.2, samples: 12, screenSpaceRadius: false };
export const DENOISE_PARAMS = { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 3, samples: 12 };

export function createPost(renderer, scene, camera, { clipBox, enabled }) {
  let composer = null, gtao = null, on = false;
  function build() {
    const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, size.x * pr, size.y * pr);
    gtao.updateGtaoMaterial(GTAO_PARAMS); gtao.updatePdMaterial(DENOISE_PARAMS); gtao.blendIntensity = 0.75; gtao.setSceneClipBox(clipBox);
    const base = gtao.overrideVisibility.bind(gtao);   // the addon hides only points/lines from its g-buffer; we also drop ghosts, the selection ring and the sky (userData.noAO)
    gtao.overrideVisibility = () => { base(); scene.traverse(o => { if (o.userData.noAO) o.visible = false; }); };
    composer.addPass(gtao); composer.addPass(new OutputPass());
  }
  const api = {
    get enabled() { return on; },
    set enabled(v) { on = !!v; if (on && !composer) build(); },
    get gtao() { return gtao; },
    render() { renderer.shadowMap.needsUpdate = true; if (on) composer.render(); else renderer.render(scene, camera); },   // one shadow pass per frame even though the AO g-buffer renders the scene a second time
    setSize(w, h) { if (composer) composer.setSize(w, h); },
  };
  api.enabled = enabled; return api;
}
```
- [ ] **Step 3:** `node --check viewer/ground-ao.js && node --check viewer/post.js`. Commit "B4: ground-ao.js (baked aoMap canvas) + post.js (GTAO composer with noAO g-buffer, one shadow pass per frame)".

---

### Task 4: wire into `viewer/app.js`; `shoot.mjs` quality; minimal `check.mjs` expectation; verify; look

**Files:** Modify `viewer/app.js`, `tools/shoot.mjs`, `tools/check.mjs` (only the per-tier log-depth/AO expectation — new checks are Task 5).

- [ ] **Step 1: imports** — after the greenery import add
```js
import { lightBasis, fitShadow } from './post-math.js';
import { buildGroundAO } from './ground-ao.js';
import { createPost } from './post.js';
```
- [ ] **Step 2: renderer + camera** — replace `app.js:32`
`const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: TIER.alpha || FX.has('alpha'), powerPreference: 'high-performance', logarithmicDepthBuffer: TIER.logDepth && !FX.has('nolog') });`
with
```js
const LOG_DEPTH = !FX.has('nolog') && (TIER.logDepth || FX.has('log'));   // ?fx=log: log depth on high (the AO pass then stays off — it reconstructs positions from linear depth)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: TIER.alpha || FX.has('alpha'), powerPreference: 'high-performance', logarithmicDepthBuffer: LOG_DEPTH });
```
after `renderer.shadowMap.type = THREE.PCFSoftShadowMap;` add `renderer.shadowMap.autoUpdate = false;   // B4: exactly one shadow pass per frame, requested by post.render()`
and replace `const camera = new THREE.PerspectiveCamera(42, 1, 2, 3600);` with `const camera = new THREE.PerspectiveCamera(42, 1, TIER.near, 3600);`.
- [ ] **Step 3: shadow camera** — replace `app.js:72`
`{ const sc = sun.shadow.camera, R = Math.max(siteW, siteD) * 0.9; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 50; sc.far = 1400; }`
with `{ const sc = sun.shadow.camera; sc.left = -320; sc.right = 320; sc.top = 320; sc.bottom = -320; sc.near = 50; sc.far = 1400; }   // box refitted to the view every frame by fitShadowToView()`
and after the `applyLighting` function (after its closing `}` at the line following `document.getElementById('sky').style.opacity = …`) add
```js
// ---- fitted shadow frustum (B4): the ortho box covers only the ground in view, fitted and texel-snapped in light space (viewer/post-math.js) ----
const NDC_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]], fitNear = new THREE.Vector3(), fitFar = new THREE.Vector3(), fitDir = new THREE.Vector3();
let shadowFit = null;
function fitShadowToView() {
  camera.updateMatrixWorld();
  const hits = [[controls.target.x, controls.target.z]];
  for (const [x, y] of NDC_CORNERS) {
    fitNear.set(x, y, -1).unproject(camera); fitFar.set(x, y, 1).unproject(camera);
    const dy = fitFar.y - fitNear.y; if (Math.abs(dy) < 1e-6) continue; const t = -fitNear.y / dy; if (t < 0) continue; const s = Math.min(t, 1);   // corner ray ∩ y=0 (rays that never reach the ground use their far point; clampHits fences them)
    hits.push([fitNear.x + (fitFar.x - fitNear.x) * s, fitNear.z + (fitFar.z - fitNear.z) * s]);
  }
  sunDirAt(lightK, fitDir);
  shadowFit = fitShadow(hits, bounds, { pad: 40, mapSize: TIER.shadowMap, basis: lightBasis([fitDir.x, fitDir.y, fitDir.z]), prevHalf: shadowFit && shadowFit.half });
  sun.target.position.fromArray(shadowFit.centre); sun.position.copy(sun.target.position).addScaledVector(fitDir, 700); sun.target.updateMatrixWorld();
  const sc = sun.shadow.camera; if (sc.right !== shadowFit.half) { sc.left = -shadowFit.half; sc.right = shadowFit.half; sc.top = shadowFit.half; sc.bottom = -shadowFit.half; sc.updateProjectionMatrix(); }
}
```
(`sunDirAt`, `lightK`, `bounds`, `controls` all exist above this point.)
- [ ] **Step 4: noAO tags + court offset** — in the volumes loop line `mesh = extrude(v.polygon, h, ghostMats.get(key), matGhostEdge); mesh.castShadow = false; facadeInfo.push({ id: v.id, style: 'ghost', rhythm: key }); }` insert `mesh.userData.noAO = true;` after `mesh.castShadow = false;`. On the court line plane material (`app.js:243`) change `polygonOffset: true, polygonOffsetFactor: -1 }` to `polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }`. After `ring.rotation.x = -Math.PI / 2; ring.position.y = 0.45; ring.visible = false; scene.add(ring);` add `ring.userData.noAO = true;`.
- [ ] **Step 5: ground AO map** — after `const treeCount = greenery.trees;` add
```js
// ---- baked ground AO (B4): building bases, trees and hedges darken the plan softly (viewer/ground-ao.js) ----
const toPx = (x, z) => [x / mpp + cen[0], z / mpp + cen[1]];
const groundAO = buildGroundAO({ crop: site.plan.crop, toPx, mpp, volumes: site.volumes.filter(v => v.kind !== 'future'), trees: greenery.treePts, hedges: greenery.hedgePts });
groundMat.aoMap = groundAO.texture; groundMat.aoMapIntensity = 0.9; groundMat.needsUpdate = true;
```
- [ ] **Step 6: post chain** — before `// ============ loop ============` add
```js
// ============ post (B4): desktop GTAO through an EffectComposer; off on phones, with ?fx=noao, or whenever log depth is on ============
const post = createPost(renderer, scene, camera, { clipBox: new THREE.Box3(new THREE.Vector3(bounds.minX - 50, -10, bounds.minZ - 50), new THREE.Vector3(bounds.maxX + 50, 200, bounds.maxZ + 50)), enabled: !!TIER.composer && !FX.has('noao') && !LOG_DEPTH });
```
In `resize()` after `renderer.setSize(w, h, false); labelRenderer.setSize(w, h);` add `post.setSize(w, h);`.
- [ ] **Step 7: loop + auto-tier** — before `renderer.setAnimationLoop(now => {` add
```js
// auto-tier (B4): on a device-resolved high tier, if continuously rendered frames average > 40 ms, drop the AO pass; if still slow, reload as mid. Explicit ?q= or ?autotier=0 keeps whatever was asked for.
const autoTier = { samples: [], stage: 0, avgMs: null, decided: q.get('q') ? 'kept (explicit ?q)' : (q.get('autotier') === '0' ? 'kept (autotier=0)' : null) };
let prevBusy = false;
function noteFrame(now, busy) {
  if (busy && prevBusy && lastRender) autoTier.samples.push(now - lastRender);
  prevBusy = busy;
  if (autoTier.decided || QUALITY !== 'high' || autoTier.samples.length < 70) return;
  const s = autoTier.samples.slice(10); autoTier.avgMs = +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1);
  if (autoTier.avgMs <= 40) { autoTier.decided = 'kept'; return; }
  if (post.enabled && autoTier.stage === 0) { post.enabled = false; autoTier.stage = 1; autoTier.samples = []; console.info('walk: AO pass off, avg ' + autoTier.avgMs + ' ms/frame'); return; }
  autoTier.decided = 'reload as mid'; const u = new URL(location.href); u.searchParams.set('q', 'mid'); u.searchParams.set('autotier', '1'); location.replace(u);
}
```
and in the loop replace
```js
  if (!dirty && !animating) { if (FX.has('stop') || now - lastRender < (water ? 1000 / TIER.waterFps : 90)) return; }   // idle: ~11 fps keeps the compositor fed; TIER.waterFps while a pool is on screen
  dirty = false; lastRender = now;
  renderer.info.reset();
  updateCompass(); updatePins(now); renderer.render(scene, camera); labelRenderer.render(scene, camera);
```
with
```js
  if (!dirty && !animating) { if (FX.has('stop') || now - lastRender < (water ? 1000 / TIER.waterFps : 90)) { prevBusy = false; return; } }   // idle: ~11 fps keeps the compositor fed; TIER.waterFps while a pool is on screen
  const busy = dirty || animating; noteFrame(now, busy);
  dirty = false; lastRender = now;
  renderer.info.reset();
  updateCompass(); updatePins(now); fitShadowToView(); post.render(); labelRenderer.render(scene, camera);
```
- [ ] **Step 8: `__walk`** — after `greenery: { … }, hedgeCount: greenery.hedges, waterMeshes,` add
`post, sun, get shadowFit() { return shadowFit; }, groundAO: { size: groundAO.size, darkened: groundAO.darkened }, autoTier, logDepth: LOG_DEPTH,`
- [ ] **Step 9: shoot.mjs** — in its stats evaluate add `quality: w.quality, post: !!(w.post && w.post.enabled), autoTier: w.autoTier ? w.autoTier.decided : null` to the returned object.
- [ ] **Step 10: check.mjs minimal expectation** — replace `const WANT_ENV = { low: false, mid: true, high: true };` with
```js
const WANT_ENV = { low: false, mid: true, high: true };
const WANT_LOG = { low: true, mid: true, high: false }, WANT_POST = { low: false, mid: false, high: true };   // B4: high renders through the GTAO composer with linear depth; phones keep log depth (flicker fix)
```
in `tierFacts` add `post: w.post.enabled, shadowMapSize: w.sun.shadow.mapSize.x, fitHalf: w.shadowFit && w.shadowFit.half` to the returned object, and change the boots-as-itself check to
```js
  ok(`tier ${tier} boots as itself (env map ${WANT_ENV[tier] ? 'on' : 'off'}, log depth ${WANT_LOG[tier] ? 'on' : 'off'}, AO pass ${WANT_POST[tier] ? 'on' : 'off'}, ${[4096, 2048, 1024][['high', 'mid', 'low'].indexOf(tier)]} shadow map, opaque canvas, plinth cap -0.3, ${WANT_G[tier].variants} canopy variant(s), lawn ${WANT_G[tier].lawn ? 'on' : 'off'}, water ${WANT_G[tier].water ? 'rippled' : 'flat'})`,
    !!f && f.quality === tier && f.env === WANT_ENV[tier] && f.logDepth === WANT_LOG[tier] && f.post === WANT_POST[tier] && f.shadowMapSize === [4096, 2048, 1024][['high', 'mid', 'low'].indexOf(tier)] && f.clearAlpha === 1 && f.plinthTopY === -0.3 && !!f.greenery && f.greenery.hedges >= 100 && f.greenery.variants === WANT_G[tier].variants && f.greenery.lawn === WANT_G[tier].lawn && f.greenery.water === WANT_G[tier].water, f ? JSON.stringify(f) : why);
```
- [ ] **Step 11: facts per tier** — start the dev server (`setsid nohup python3 -m http.server 8765 --directory /root/projects/siteplan-walk >/dev/null 2>&1 &`; confirm with `ss -ltn | grep ':8765 '`, never `pgrep -f`). `tools/_b4-facts.mjs` (gitignored; the `_b3-facts.mjs` shape) prints per tier `{ post: w.post.enabled, logDepth: w.logDepth, shadowMap: w.sun.shadow.mapSize.x, fit: w.shadowFit, groundAO: w.groundAO, autoTier: w.autoTier.decided, stats: w.stats() }` plus, after `w.select('tennis-court', true)` and 4 s, `fitHotspot: w.shadowFit.half`, then after `w.flyTo({ ...w.currentView(), radius: 60, phi: 0.35 }, 100)` and 1.5 s, `fitClose: w.shadowFit.half`. Expected: high `post true, logDepth false, 4096`, mid/low `post false, logDepth true, 2048/1024`; `fit.half` 320 at the overview, 320 at the tennis court (hysteresis keeps it — the visible ground is ~300 m across), 160 zoomed in at radius 60 / polar 20°, on every tier; `groundAO.darkened` ≈ 0.05–0.3; `autoTier.decided === 'kept (explicit ?q)'`; stats high ≈ 150 calls / ≈ 390k tris (whole frame incl. the g-buffer pass), mid/low ≈ 94 / 90k; zero errors. Record in the commit.
- [ ] **Step 12: look** — `tools/_b4-shots.mjs` (gitignored): boots the dev url with explicit `q=`; desktop 1440×900:
  (a) `q=high#h=clubhouse-drop-off` → `after-ao-on-clubhouse-desktop.png`; then `w.post.enabled = false`, wait ≥2 frames (`w.renderer.info.render.frame` advances by 2), → `after-ao-off-clubhouse-desktop.png` (the `?fx=noao` A/B pair, same view, same frame state);
  (b) `q=high#h=stepped-well-plaza` → `after-stepped-well-desktop.png` (shadow sharpness vs `before-`);
  (c) `q=high` then `w.flyTo({ ...w.fitView(), radius: 900 }, 100)`, wait 3 s → `after-zfight-max-day-desktop.png`; a second page booted with `q=high&light=dusk`, same fly → `after-zfight-max-dusk-desktop.png` (never toggle dusk on SwiftShader — the blend is frame-time based);
  (d) `q=high` overview → `after-overview-desktop.png`; phone 390×844 `q=mid#h=tower-a-info` → `after-tower-a-phone.png`.
  Screenshot timeout 240000 on high. Read every PNG. Judge: AO-on shows darkening where fins meet slabs, under the portal beams, at tower bases, in the stepped-well pit; AO-off is flatter but otherwise identical (no shift, no colour change — the OutputPass tone mapping must match the non-composer look); shadow edges at the stepped well are crisper than `before-` and not swimming/blocky; the max-radius scans show no striping/flicker on the courts (line plane vs slab), rink or plaza rims, day and dusk; the phone shot has sharper shadows than B3 and no other change. If tone or exposure differs between AO-on and AO-off beyond the AO itself, stop and investigate `OutputPass` vs renderer settings before tuning anything else. One tuning round allowed (`blendIntensity`, `radius`, AO map alphas, blur radius); re-shoot only the affected view.
- [ ] **Step 13: check on the dev server** — background job, 900 s budget: `node tools/check.mjs 'http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/'` → 21/21 (the high boot now takes the GTAO path). If a `CEIL` is exceeded, raise only that ceiling to measured × 1.3 and say so.
- [ ] **Step 14: commit** — "B4: fitted light-space shadow frustum, baked ground AO map, desktop GTAO composer with linear depth, fx=log|noao, auto-tier; shoot.mjs prints quality" (numbers from step 11 in the body).

---

### Task 5: new checks (+ one combined mutation proof), docs, deploy, evidence, STOP for the phone gate

**Files:** Modify `tools/check.mjs`, `README.md`, `docs/adding-a-project.md`; add `docs/checkpoints/b4/after-*.png`.

- [ ] **Step 1: checks** — in `tools/check.mjs`:
  (i) in the `state` evaluate add `fitOverview: w.shadowFit ? w.shadowFit.half : null, groundAO: w.groundAO` to the returned object;
  (ii) after the greenery check add
```js
  ok('ground AO map painted (1024 px, building bases + trees + hedges darken the plan)', !!state.groundAO && state.groundAO.size[0] === 1024 && state.groundAO.darkened > 0.02 && state.groundAO.darkened < 0.6, JSON.stringify(state.groundAO));
```
  (iii) after the "selecting from the list opens the detail" check (camera now at the tennis court, radius 110) add
```js
  await p.evaluate(() => { const w = window.__walk; w.flyTo({ ...w.currentView(), radius: 60, phi: 0.35 }, 100); }); await p.waitForTimeout(1500);   // zoom floor, steep pitch: little ground in view
  const fitClose = await p.evaluate(() => window.__walk.shadowFit && window.__walk.shadowFit.half);
  ok('fitted shadow frustum: 320 (or 640) at the overview, 160 when zoomed in at the floor (light-space fit, texel-snapped)', [640, 320].includes(state.fitOverview) && fitClose === 160, JSON.stringify({ overview: state.fitOverview, close: fitClose }));
  await p.evaluate(() => window.__walk.flyTo(window.__walk.fitView(), 100)); await p.waitForTimeout(1500);   // back to the overview for the theme + tour checks
```
  (iv) GTAO A/B on the high page — inside the `for (const tier of ['mid', 'high'])` loop, before `await pg.close();`, add
```js
  if (tier === 'high' && facts.high && !facts.high.failed) {   // A/B: the same frame with the AO pass on, then off — GTAO must change the picture, and only modestly
    const shotA = await pg.locator('#gl').screenshot({ type: 'png', timeout: 240000 });
    const f0 = await pg.evaluate(() => window.__walk.renderer.info.render.frame);
    await pg.evaluate(() => { window.__walk.post.enabled = false; }); await pg.waitForFunction(f0 => window.__walk.renderer.info.render.frame >= f0 + 2, f0, { timeout: 120000 });
    const shotB = await pg.locator('#gl').screenshot({ type: 'png', timeout: 240000 });
    aoDiff = await pg.evaluate(async ([a, b]) => { const load = src => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = src; }); const A = await load(a), B = await load(b);
      const W = Math.min(A.width, B.width), H = Math.min(A.height, B.height), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, W, H).data; g.clearRect(0, 0, W, H); g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, W, H).data;
      let sum = 0; for (let i = 0; i < da.length; i += 4) sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      return { meanAbsDiff: +(sum / (da.length / 4 * 3)).toFixed(2), w: W, h: H }; }, ['data:image/png;base64,' + shotA.toString('base64'), 'data:image/png;base64,' + shotB.toString('base64')]);
  }
```
  with `let aoDiff = null;` declared before the loop, and after the per-tier checks add
```js
ok('GTAO changes the high-tier frame (A/B: AO pass on vs off, mean |Δ| per channel in 1..40)', !!aoDiff && aoDiff.meanAbsDiff > 1.0 && aoDiff.meanAbsDiff < 40, JSON.stringify(aoDiff));
```
  (`renderer.info.reset()` zeroes calls/triangles only; `render.frame` keeps counting, +2 per composer frame, +1 per plain frame.)
  Run in the background (900 s) on the dev server → **24/24**.
- [ ] **Step 2: one combined mutation run** (three independent breaks, each aimed at one new check): (a) `viewer/post-math.js`: `pickHalf` → `return halves[0];` as its first line; (b) `viewer/ground-ao.js`: change `for (const v of volumes)` to `for (const v of [])` and `for (const t of trees)` to `for (const t of [])` and `for (const h of hedges)` to `for (const h of [])`; (c) `viewer/post.js`: `set enabled(v) { on = true; if (!composer) build(); }`. Run → expect EXACTLY these to fail: "fitted shadow frustum…", "ground AO map painted…", "GTAO changes the high-tier frame…", and "tier mid boots as itself…" + "tier low boots as itself…" (the composer is now on there) → 19/24. `git checkout viewer/post-math.js viewer/ground-ao.js viewer/post.js` → re-run → 24/24. Commit "check: ground AO map, fitted shadow frustum, GTAO A/B — mutation-proved".
- [ ] **Step 3: docs** — README URL-params line: after `fx=alpha|nolog|stop|blur (…)` add `, fx=log (log depth on the desktop tier — this also turns the AO pass off), fx=noao (desktop without the AO pass), autotier=0 (never auto-downgrade)`. README tier paragraph append: "B4: the sun-shadow box is fitted to the ground in view on every tier (4096/2048/1024 maps) and the plan carries a baked ambient-occlusion map; the desktop tier renders through a GTAO composer with logarithmic depth OFF (near 3) and drops the pass — then reloads as `mid` — if a device-resolved desktop averages over 40 ms a frame during the reveal." Guide Gotchas add: "On the software renderer always pass `q=` in shot URLs: a device-resolved `high` measures its own frame time and would drop AO / reload as `mid`." Commit "B4 docs: flags, tiers, software-renderer q= gotcha".
- [ ] **Step 4: deploy + live check + evidence** — `tools/deploy.sh belvedere`; `node tools/check.mjs https://walk.csoul.cloud/belvedere/` in the background (900 s) → 24/24. Re-point `_b4-shots.mjs` at `https://walk.csoul.cloud/belvedere/` and re-shoot the after-set from the LIVE url: `after-ao-on-clubhouse-desktop`, `after-ao-off-clubhouse-desktop`, `after-stepped-well-desktop`, `after-zfight-max-day-desktop`, `after-zfight-max-dusk-desktop`, `after-overview-desktop`, `after-tower-a-phone`. Read them. Commit `docs/checkpoints/b4/` — "B4: checkpoint evidence from the live URL".
- [ ] **Step 5: hand-off + STOP** — update memory (B4 deployed on `arc2-b4`, unmerged; numbers; lessons), send the owner the A/B pair, the stepped-well before/after, the two max-radius scans and the phone shot, and ask the phone gate: "Phones only got sharper shadows (2048 map, fitted box) and the baked ground AO — any new flicker, any heat, does the dusk toggle still feel smooth? On a laptop: does the AO read as depth rather than dirt, and does the site look the same brightness with `?fx=noao`?" Do NOT merge until the answer.

## Verification (end to end)

1. `node --test tests/*.test.mjs` → all green (post-math 6, quality 5, facade-geom 7, greenery-mask 6).
2. Dev server → `node tools/_b4-facts.mjs` → high `post true / logDepth false / 4096`, mid `false / true / 2048`, low `false / true / 1024`; `fit.half` 320 at the overview and the tennis court, 160 zoomed in at radius 60 / polar 20°; `groundAO.darkened` in 0.02..0.6; `autoTier.decided = 'kept (explicit ?q)'`; zero errors; stats under `CEIL`.
3. `node tools/check.mjs <dev url>` alone, background → 24/24; the combined mutation fails exactly the 3 new checks + the mid/low boots (19/24); restore → 24/24.
4. Screenshots read as images: AO on/off pair (AO adds contact darkening, nothing else shifts), stepped-well before/after (crisper shadow edge), max-radius day + dusk scans (no z-fighting), phone.
5. Deploy → live 24/24 → live shots → owner phone gate.

## Self-review

- **Spec §B4 coverage:** fitted frustum on all tiers with clamp ±40 m, halves [640,320,160], texel-snapped centre, sun target+position from sunDir (T1 `fitShadow`, T4 `fitShadowToView`; refined to light space, see Context); `sun.shadow.intensity` per preset (already B1, untouched); ground AO map 1024 px, volumes α 0.55, 2-pass box blur ≈6 m, radial gradients per tree/hedge, `aoMap` 0.9 (T3 `buildGroundAO`, T4 step 5); high-only composer HalfFloat MSAA×4 → RenderPass → GTAOPass → OutputPass with the spec's GTAO/denoise numbers, `blendIntensity 0.75`, clip box ±50 m, `overrideVisibility` wrapped for `noAO` (T3 `createPost`, T4 steps 4/6), `shadowMap.autoUpdate=false` + one `needsUpdate` per frame (T3 `render`, T4 step 2), `composer.setSize` in `resize()` (T4 step 6); high-only log depth OFF + near 3 (T2 tiers, T4 step 2); court line `polygonOffsetUnits −2` (T4 step 4); `?fx=log` (forces log depth, AO off) and `?fx=noao` (T4 steps 2/6); auto-downgrade `__walk.autoTier` (T4 step 7); z-fight scan day + dusk at max radius (T4 step 12c, T5 evidence); shadow map sizes 4096/2048/1024 (T2); evidence: `?fx=noao` A/B pair, check green at 3 tiers incl. high on SwiftShader, phone gate (T5).
- **Placeholders:** none — every code step carries its code; scratch scripts are specified by exact `__walk` calls and outputs.
- **Type consistency:** `fitShadow` returns `{ half, texel, centre, u, v }` and T4 reads `.centre`/`.half`; `createPost` exposes `enabled`/`gtao`/`render`/`setSize` and T4/T5 use exactly those; `buildGroundAO` returns `{ texture, size, darkened }` and T4/T5 read those; `TIERS[t].{shadowMap, logDepth, near, composer}` are the names used in T2, T4, T5; `__walk.{post, sun, shadowFit, groundAO, autoTier, logDepth}` is what `check.mjs`, `shoot.mjs` and the scratch scripts read.
