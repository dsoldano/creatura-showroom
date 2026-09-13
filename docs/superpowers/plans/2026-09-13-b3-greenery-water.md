# B3 — Greenery + water (procedural trees, hedges, lawn, rippled water) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-sphere trees with lobed low-poly canopies in three variants, turn the plan's thin dark-green strips into clipped hedges, give the lawn areas a matte tinted response in the ground shader, and put a scrolling procedural normal map on the two water surfaces — all read from the plan's own colours, per quality tier, with phones keeping every flicker fix.

**Architecture:** `viewer/greenery-mask.js` is pure mask work (colour rules, disc morphology, thin-strip extraction, strip orientation, tileable water normals) and is node-tested. `viewer/greenery.js` turns that into three.js objects (canopy geometry builder + shaded canopy material, `plantGreenery()` → instanced canopies/trunks/hedges + a lawn `CanvasTexture`, `lawnify()` for the ground material, `waterMaterial()`/`waterDisc()`). `app.js` swaps its `plantTrees()` for `plantGreenery()`, builds the two pools with `waterDisc`, and gains a water-in-view test that raises the idle frame rate only while a pool is near and on screen. Tiers (`quality.js`) carry canopy detail/variants, hedge spacing, lawn on/off and a water frame-rate cap.

**Tech Stack:** Three.js r170 (`InstancedMesh`, `IcosahedronGeometry`, `BufferGeometryUtils.mergeGeometries`, `CanvasTexture`, `DataTexture` normal map on `MeshPhysicalMaterial`, `onBeforeCompile`), `node --test`, Playwright/SwiftShader for checks and shots.

**Spec:** `docs/superpowers/specs/2026-09-12-siteplan-arc2-render-media-design.md` §"B3 — greenery + water", the tier table under "Phase B design" (tree detail/variants 1/3 · 0/3 · 0/1, hedge spacing 1.0/1.5/1.5 m, lawn+water off on low), ruling 10 ("Greenery = procedural lobed trees, hedge split, lawn mask, animated water normals").

## Context

B1 (sky/IBL) and B2 (facades) are merged to master (`972f62f`) and live at https://walk.csoul.cloud/belvedere/ with 20/20 checks. B3 is the next sub-phase in the approved arc-2 order. Today's greenery is 474 identical icosahedron spheres sampled from the plan's dark greens (`app.js:263-297`), the lawn is just the plan picture, and the water is a flat clearcoat disc.

**Two deviations from the spec text, both measured against the real `plan.jpg` before planning (2026-09-13):**

1. **Hedge rule re-derived.** The spec's `thin = mask AND NOT dilate(erode(mask, ~1.2 m))` classifies **62–73 % of the green as hedge** on Belvedere, because the plan draws each canopy with a light highlight, so the dark-green mask is a *ring* per tree and rings erode to nothing at any radius. Replacing it with a 1-cell **closing** (fills the highlight holes) followed by a 2-cell **opening** (0.33 m cells at the 640-px sample → strips narrower than ≈1.3 m) gives **11.7 % thin** — the court hedges and path edgings — while the ≈4 m boundary tree rows stay trees. Simulated with the viewer's own sampler: ≈452 trees (474 today) + ≈700 hedge boxes at 1.0 m spacing (≈310 at 1.5 m); 87 % of thin cells have a confident strip axis. Same intent as the spec (thin strips = hedges), calibrated to the plan.
2. **Water frame rate bounded per tier.** The spec says `dirty=true while water is within 260 m and in frustum`; since most close-up views on this 210×290 m site have a pool within 260 m, that would make phones render flat-out for most of a session. The plan keeps the intent (ripples move while a pool is on screen) but caps it: `waterFps` 60 (high) / 30 (mid) / 0 (low). The owner's phone gate judges the mid rate.

Everything else follows the spec: trees from `mask AND NOT thin`, hedges `1.1×0.9×1.4 m` boxes with yaw from the strip axis and no shadow, lawn rule `g>r+8 && g>b+25 && g>140` → `CanvasTexture` + `onBeforeCompile` (0.5 m hash noise ±5 %, slight green lift, `roughness = mix(0.82, 1.0, lawn)`, no normal map), water 256² procedural normals at ≈0.15 m/texel with `RepeatWrapping`, `normalScale 0.35`, `roughness 0.05`, `ior 1.33`, `opacity 0.92`, offset from the clock; `site.plan.sampleImage` (default `plan.jpg`) so the sampler never reads an AI ground (B5). Draw-budget ceilings stay the B1 whole-frame ones in `check.mjs` (`120/200k · 140/300k · 220/700k`), recalibrated only if a measured tier exceeds them.

## Global Constraints

- No build step; ES modules via the jsDelivr importmap (`three@0.170.0`, `three/addons/`).
- Flicker fixes untouched on `mid`/`low`: opaque canvas, logarithmic depth, no backdrop-filter on phones, idle loop never fully stops (`?fx=stop` still restores the old behaviour). No new coplanar visible surfaces (hedge boxes stand on y=0 like the courts; water discs sit ≥6 cm off any other face).
- Project-agnostic: everything is derived from `site.json` + the sample image; a project without `plan.sampleImage` samples the ground image, exactly as today.
- `window.__walk` is the verification contract; `check.mjs` runs ALONE on this host; always run it after touching `app.js` (TDZ bugs only surface there); screenshots are read as images before any claim; the owner's phone is the gate.
- Honesty: trees/hedges/lawn come from the plan's colours, never invented; README says so. Tower count/heights untouched. No pool at grade — the only water is the stepped-well pool and the kids' splash.
- Unit tests: `node --test tests/*.test.mjs` (directory arg fails on Node 22). Headless shots: `timeout: 150000`.
- Commit locally after each task (no remote); every commit ends with the two attribution trailers used on this repo (`Co-Authored-By: Claude …`, `Claude-Session: …`).
- Branch: `arc2-b3` off master; merge only after the owner's phone gate (as B1/B2).

## File structure

| File | Responsibility |
|---|---|
| `viewer/greenery-mask.js` (new) | Pure: `TREE_RULE`, `LAWN_RULE`, `masksFrom(data,W,H)`, `morph(src,W,H,rad,erode)`, `thinOf(tree,W,H,closeR,openR)`, `strandYaw(thin,W,H,x,y,R)`, `waterNormalData(size,seed)`. Node-tested. |
| `viewer/greenery.js` (new) | three.js: `canopyGeometry({variant,detail,lobes})`, `canopyMaterial()`, `plantGreenery(site,img,ctx)`, `lawnify(material,tex)`, `waterMaterial(tier)`, `waterDisc(r,x,y,z,mat)`, `WATER_TILE_M`. |
| `viewer/quality.js` (modify) | `canopy {detail, variants}`, `hedgeSpacingM`, `lawn`, `waterFps` per tier. |
| `viewer/app.js` (modify) | materials (`matWater`, `matCanopy`, `matHedge`), ground material handle, water discs + `waterMeshes`, replace `plantTrees`, loop water gate, `__walk.greenery` + `hedgeCount`. |
| `projects/belvedere/site.json` (modify) | `plan.sampleImage: "plan.jpg"`. |
| `tests/greenery-mask.test.mjs` (new), `tests/quality.test.mjs` (modify) | unit tests. |
| `tools/check.mjs` (modify) | greenery check (low) + per-tier greenery facts; ceilings recalibrated if needed. |
| `README.md`, `docs/adding-a-project.md` (modify) | honesty bullet, tier line, `plan.sampleImage`, highlight-ring gotcha. |
| `docs/superpowers/plans/2026-09-13-b3-greenery-water.md` (new) | this plan, committed. |
| `docs/checkpoints/b3/*.png` (new) | before/after evidence from the live URL. |
| `tools/_b3-facts.mjs`, `tools/_b3-shots.mjs` (new, gitignored) | per-tier facts; close-up shots via `__walk`. |

---

### Task 0: branch, plan file, baseline "before" shots

**Files:** Create `docs/superpowers/plans/2026-09-13-b3-greenery-water.md`, `docs/checkpoints/b3/before-*.png`.

- [ ] **Step 1: branch + plan** — `git switch -c arc2-b3`; copy this plan to `docs/superpowers/plans/2026-09-13-b3-greenery-water.md`; `git add` + commit "B3 implementation plan (greenery + water): hedge rule re-derived from the plan, water fps per tier".

- [ ] **Step 2: baseline shots from the LIVE url (master = B2)** — `mkdir -p docs/checkpoints/b3`, then one at a time (each ≈1–2 min; do not run check.mjs concurrently):
```bash
for h in stepped-well-plaza tree-court tennis-court; do node tools/shoot.mjs "https://walk.csoul.cloud/belvedere/?autostart=1200#h=$h" docs/checkpoints/b3/before-$h 9000; done
node tools/shoot.mjs "https://walk.csoul.cloud/belvedere/?autostart=1200" docs/checkpoints/b3/before-overview 9000
```
Keep only the `-desktop.png` of each plus `before-tree-court-phone.png` (delete the rest). Read them once (they are the "vs today" half of the checkpoint). Commit "B3: baseline shots before greenery".

---

### Task 1: `viewer/greenery-mask.js` — pure mask work (node-tested)

**Files:** Create `viewer/greenery-mask.js`, `tests/greenery-mask.test.mjs`.

**Interfaces (produced):**
- `TREE_RULE(r,g,b)`, `LAWN_RULE(r,g,b)` → boolean.
- `masksFrom(data, W, H)` → `{ tree: Uint8Array, lawn: Uint8Array }` (row-major, image space x right / y down).
- `morph(src, W, H, rad, erode)` → `Uint8Array` (disc structuring element; outside the image counts as empty).
- `thinOf(tree, W, H, closeR = 1, openR = 2)` → `Uint8Array` (closed AND NOT opened(closed)).
- `strandYaw(thin, W, H, x, y, R = 3)` → radians in image space (0 = along +x, π/2 = along +y).
- `waterNormalData(size = 256, seed = 3)` → `Uint8ClampedArray` RGBA, tileable, +z up encoded as (n·0.5+0.5).

- [ ] **Step 1: failing tests** — `tests/greenery-mask.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masksFrom, morph, thinOf, strandYaw, waterNormalData, TREE_RULE, LAWN_RULE } from '../viewer/greenery-mask.js';

const W = 40, H = 40;
const blank = () => new Uint8Array(W * H);
const disc = (m, cx, cy, r) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * W + x] = 1; return m; };
const strip = (m, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = 1; return m; };
const count = m => m.reduce((a, v) => a + v, 0);

test('colour rules: dark green is tree, light green is lawn, grey is neither', () => {
  assert.equal(TREE_RULE(70, 130, 60), true); assert.equal(LAWN_RULE(70, 130, 60), false);
  assert.equal(LAWN_RULE(150, 200, 120), true); assert.equal(TREE_RULE(150, 200, 120), false);
  assert.equal(TREE_RULE(180, 180, 180), false); assert.equal(LAWN_RULE(180, 180, 180), false);
});
test('masksFrom reads RGBA', () => {
  const data = new Uint8ClampedArray([70, 130, 60, 255, 150, 200, 120, 255, 180, 180, 180, 255, 0, 0, 0, 255]);
  const m = masksFrom(data, 2, 2); assert.deepEqual([...m.tree], [1, 0, 0, 0]); assert.deepEqual([...m.lawn], [0, 1, 0, 0]);
});
test('morph: erosion shrinks a disc, dilation grows it, outside the image is empty', () => {
  const d = disc(blank(), 20, 20, 8); const e = morph(d, W, H, 2, true), g = morph(d, W, H, 2, false);
  assert.ok(count(e) < count(d) && count(g) > count(d)); assert.equal(e[20 * W + 20], 1); assert.equal(e[20 * W + 13], 0);
  const edge = strip(blank(), 0, 0, 3, 39); assert.equal(morph(edge, W, H, 1, true)[0], 0, 'a cell on the image edge erodes');
});
test('thinOf: a 3-wide strip is thin, a 17-wide disc is not, a disc with 1-cell highlight holes closes before the test', () => {
  const m = strip(disc(blank(), 12, 12, 8), 0, 30, 39, 32);
  const t = thinOf(m, W, H);
  for (let x = 2; x < W - 2; x++) assert.equal(t[31 * W + x], 1, 'strip cell ' + x);
  assert.equal(t[12 * W + 12], 0, 'disc centre is not thin');
  const ring = disc(blank(), 12, 12, 8); for (let y = 8; y <= 16; y += 2) for (let x = 8; x <= 16; x += 2) ring[y * W + x] = 0;
  assert.equal(thinOf(ring, W, H)[12 * W + 12], 0, 'holes are closed before the thinness test');
});
test('strandYaw follows the strip axis', () => {
  const hz = strip(blank(), 0, 19, 39, 21), vt = strip(blank(), 19, 0, 21, 39);
  assert.ok(Math.abs(strandYaw(hz, W, H, 20, 20)) < 0.05);
  assert.ok(Math.abs(Math.abs(strandYaw(vt, W, H, 20, 20)) - Math.PI / 2) < 0.05);
});
test('waterNormalData: unit normals, mostly up, seamless at the tile edge', () => {
  const S = 64, d = waterNormalData(S); assert.equal(d.length, S * S * 4);
  let maxLenErr = 0, sumZ = 0;
  for (let i = 0; i < S * S; i++) { const nx = d[i * 4] / 127.5 - 1, ny = d[i * 4 + 1] / 127.5 - 1, nz = d[i * 4 + 2] / 127.5 - 1; maxLenErr = Math.max(maxLenErr, Math.abs(Math.hypot(nx, ny, nz) - 1)); sumZ += nz; }
  assert.ok(maxLenErr < 0.02, 'unit length: ' + maxLenErr); assert.ok(sumZ / (S * S) > 0.9, 'mostly up');
  let seam = 0; for (let y = 0; y < S; y++) for (let c = 0; c < 3; c++) seam = Math.max(seam, Math.abs(d[(y * S) * 4 + c] - d[(y * S + S - 1) * 4 + c]));
  assert.ok(seam < 40, 'left/right columns are neighbours when tiled: ' + seam);
});
```

- [ ] **Step 2: run → fails** — `node --test tests/greenery-mask.test.mjs` → `Cannot find module`.

- [ ] **Step 3: module** — `viewer/greenery-mask.js`:
```js
// Pure mask work for procedural greenery (no three import; node-tested). Masks are Uint8Array(W*H), row-major, image space: x right, y down.
export const TREE_RULE = (r, g, b) => g > r + 18 && g > b + 28 && g < 168 && r < 150;   // dark saturated green: canopies + hedges (the rule the viewer has used since day 3)
export const LAWN_RULE = (r, g, b) => g > r + 8 && g > b + 25 && g > 140;               // light green: lawn, planted grid, gardens

export function masksFrom(data, W, H) {
  const tree = new Uint8Array(W * H), lawn = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; if (TREE_RULE(r, g, b)) tree[i] = 1; if (LAWN_RULE(r, g, b)) lawn[i] = 1; }
  return { tree, lawn };
}
// Erode (erode=true) or dilate with a disc of radius rad cells. Outside the image counts as empty.
export function morph(src, W, H, rad, erode) {
  const out = new Uint8Array(W * H), offs = [];
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) offs.push([dx, dy]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let hit = false;
    for (const [dx, dy] of offs) { const xx = x + dx, yy = y + dy; const s = xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : src[yy * W + xx]; if (erode ? !s : s) { hit = true; break; } }
    out[y * W + x] = erode ? (hit ? 0 : 1) : (hit ? 1 : 0);
  }
  return out;
}
// Thin strips of the tree mask = hedges. Drawn canopies carry highlight holes, so close first (fills holes ≤ closeR), then whatever an opening of openR removes is "thin".
// Measured on Belvedere at 640 px (0.33 m cells): closeR 1 / openR 2 → 11.7 % of the green is thin (court hedges, path edgings); the spec's 1.2 m erosion alone made 62–73 % thin.
export function thinOf(tree, W, H, closeR = 1, openR = 2) {
  const closed = morph(morph(tree, W, H, closeR, false), W, H, closeR, true);
  const opened = morph(morph(closed, W, H, openR, true), W, H, openR, false);
  const thin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) thin[i] = closed[i] && !opened[i] ? 1 : 0;
  return thin;
}
// Axis of the strip through (x, y): structure tensor of the set cells in a (2R+1)² window. Angle in image space (0 = along +x, π/2 = along +y).
export function strandYaw(thin, W, H, x, y, R = 3) {
  let sxx = 0, syy = 0, sxy = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || !thin[yy * W + xx]) continue; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}
// Tileable water normal map: size² RGBA bytes. Height = integer-frequency sine waves + wrapped value noise (both periodic → seamless tile); normals by central differences with wrap.
export function waterNormalData(size = 256, seed = 3) {
  const h = new Float32Array(size * size), lat = 8, grid = new Float32Array(lat * lat);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < lat * lat; i++) grid[i] = rnd();
  const smooth = t => t * t * (3 - 2 * t);
  const g = (x, y) => grid[(((y % lat) + lat) % lat) * lat + (((x % lat) + lat) % lat)];
  const noise = (u, v) => { const gx = u * lat, gy = v * lat, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = smooth(gx - x0), fy = smooth(gy - y0);
    return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy; };
  const waves = [[3, 1, 0.6], [1, 4, 0.45], [5, -3, 0.3], [-2, 6, 0.25]];   // [kx, ky, amplitude]
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const u = x / size, v = y / size; let z = 0;
    for (const [kx, ky, a] of waves) z += a * Math.sin(2 * Math.PI * (kx * u + ky * v));
    h[y * size + x] = z + 1.4 * (noise(u, v) - 0.5); }
  const out = new Uint8ClampedArray(size * size * 4), k = size * 0.012;   // slope gain: ripples read at normalScale ≈ 0.35 without looking like a storm
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const L = h[y * size + (x + size - 1) % size], R = h[y * size + (x + 1) % size], U = h[((y + size - 1) % size) * size + x], D = h[((y + 1) % size) * size + x];
    let nx = -(R - L) * k, ny = -(D - U) * k, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * size + x) * 4; out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}
```

- [ ] **Step 4: run → passes** — `node --test tests/*.test.mjs` → all pass (quality + facade-geom + greenery-mask).
- [ ] **Step 5: commit** `viewer/greenery-mask.js tests/greenery-mask.test.mjs` — "B3: greenery-mask — colour rules, disc morphology, thin-strip hedges (close 1 / open 2), strip axis, tileable water normals + tests".

---

### Task 2: `viewer/quality.js` — greenery per tier

**Files:** Modify `viewer/quality.js`, `tests/quality.test.mjs`.

**Interfaces (produced):** `TIERS[t].canopy = { detail, variants }`, `TIERS[t].hedgeSpacingM`, `TIERS[t].lawn`, `TIERS[t].waterFps` (0 = flat water, no animation).

- [ ] **Step 1: failing test** — in `tests/quality.test.mjs` add:
```js
test('greenery per tier (spec table): canopy detail/variants 1/3 · 0/3 · 0/1, hedge spacing 1.0/1.5/1.5, lawn + water off on low', () => {
  for (const [name, t] of Object.entries(TIERS)) {
    assert.equal(typeof t.canopy.detail, 'number', name + '.canopy.detail'); assert.ok(t.canopy.variants >= 1, name + '.canopy.variants');
    assert.equal(typeof t.hedgeSpacingM, 'number', name + '.hedgeSpacingM'); assert.equal(typeof t.lawn, 'boolean', name + '.lawn'); assert.equal(typeof t.waterFps, 'number', name + '.waterFps');
  }
  assert.deepEqual(TIERS.high.canopy, { detail: 1, variants: 3 }); assert.deepEqual(TIERS.mid.canopy, { detail: 0, variants: 3 }); assert.deepEqual(TIERS.low.canopy, { detail: 0, variants: 1 });
  assert.equal(TIERS.high.hedgeSpacingM, 1.0); assert.equal(TIERS.mid.hedgeSpacingM, 1.5); assert.equal(TIERS.low.hedgeSpacingM, 1.5);
  assert.equal(TIERS.low.lawn, false); assert.equal(TIERS.low.waterFps, 0); assert.ok(TIERS.mid.lawn && TIERS.mid.waterFps > 0 && TIERS.high.waterFps >= TIERS.mid.waterFps);
});
```
Run `node --test tests/quality.test.mjs` → FAIL (`canopy` undefined).

- [ ] **Step 2: tiers** — `viewer/quality.js`: extend the header comment with `// canopy: icosahedron detail + number of canopy variants · hedgeSpacingM: hedge box spacing along thin green strips · lawn: lawn tint in the ground shader · waterFps: idle frame rate while a pool is on screen (0 = flat water)` and the rows:
```js
  high: { dpr: 1.5,  pmrem: 'live',   shadowMap: 2048, hemiScale: 0.35, logDepth: true, alpha: false, facadeShadows: true,  canopy: { detail: 1, variants: 3 }, hedgeSpacingM: 1.0, lawn: true,  waterFps: 60 },
  mid:  { dpr: 1.35, pmrem: 'cached', shadowMap: 1024, hemiScale: 0.35, logDepth: true, alpha: false, facadeShadows: false, canopy: { detail: 0, variants: 3 }, hedgeSpacingM: 1.5, lawn: true,  waterFps: 30 },
  low:  { dpr: 1,    pmrem: 'none',   shadowMap: 1024, hemiScale: 1.0,  logDepth: true, alpha: false, facadeShadows: false, canopy: { detail: 0, variants: 1 }, hedgeSpacingM: 1.5, lawn: false, waterFps: 0 },
```
- [ ] **Step 3: run → passes**: `node --test tests/*.test.mjs`. Commit `viewer/quality.js tests/quality.test.mjs` — "B3: tiers carry canopy detail/variants, hedge spacing, lawn, water fps".

---

### Task 3: `viewer/greenery.js` — canopies, hedges, lawn, water (three.js)

**Files:** Create `viewer/greenery.js`.

**Interfaces (produced):**
- `canopyGeometry({ variant = 0, detail = 0, lobes = 3 })` → non-indexed `BufferGeometry`, unit ≈ a 3.8 m crown, origin at the crown centre.
- `canopyMaterial()` → `MeshStandardMaterial` (white, flat-shaded, per-instance colour; shader = local-height shade gradient + rim lift).
- `plantGreenery(site, img, { toX, toZ, mpp, pointInPoly, isBlocked, tier, mats: { canopy, trunk, hedge } })` → `{ trees, hedges, variants, treeMeshes: InstancedMesh[], trunks: InstancedMesh, hedgeMesh: InstancedMesh, lawnTexture: CanvasTexture|null }`.
- `lawnify(material, lawnTexture)` → the same ground material with the lawn `onBeforeCompile`.
- `waterMaterial(tier)` → `{ material: MeshPhysicalMaterial, texture: DataTexture|null }` (`texture` null on `waterFps 0` = today's flat look).
- `waterDisc(r, x, y, z, material)` → `Mesh` (uvs in world metres / `WATER_TILE_M`, `userData.water = true`); `WATER_TILE_M = 38.4`.

- [ ] **Step 1: module** — `viewer/greenery.js`:
```js
// Procedural greenery: lobed low-poly canopies (variants + detail per tier), hedges on the plan's thin green strips, a lawn mask for the ground shader, a tileable scrolling water normal map.
// Everything is read from the plan's own colours (viewer/greenery-mask.js); nothing is placed that the plan does not draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { masksFrom, thinOf, strandYaw, waterNormalData } from './greenery-mask.js';

export const WATER_TILE_M = 38.4;   // 256 texels × 0.15 m: one repeat of the ripple tile

// Canopy = `lobes` radially jittered icosahedra merged into one geometry. Variants differ by lobe layout and jitter seed.
export function canopyGeometry({ variant = 0, detail = 0, lobes = 3 } = {}) {
  let s = 11 + variant * 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const parts = [];
  for (let i = 0; i < lobes; i++) {
    const g = new THREE.IcosahedronGeometry(i === 0 ? 1.9 : 1.15 + rnd() * 0.5, detail), pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) { const j = 0.88 + rnd() * 0.24; pos.setXYZ(k, pos.getX(k) * j, pos.getY(k) * j, pos.getZ(k) * j); }   // ±12 % radial jitter breaks the sphere
    if (i > 0) { const a = rnd() * Math.PI * 2, r = 0.9 + rnd() * 0.5; g.translate(Math.cos(a) * r, 0.3 + rnd() * 0.9, Math.sin(a) * r); }
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false); merged.computeVertexNormals(); return merged;
}

export function canopyMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLy;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLy = position.y;');   // canopy-local height, before the instance matrix
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLy;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.68, 1.06, smoothstep(-1.6, 2.4, vLy));`)          // shaded underside, lit crown
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rim = pow(1.0 - saturate(dot(normalize(vViewPosition), normalize(normal))), 3.0);
        totalEmissiveRadiance += diffuseColor.rgb * rim * 0.18;`);                  // rim lift separates crowns from each other
  };
  return m;
}

// Sample the plan: dark greens → trees (off the thin strips), thin dark strips → hedges, light greens → lawn mask.
export function plantGreenery(site, img, ctx) {
  const { toX, toZ, mpp, pointInPoly, isBlocked, tier } = ctx;
  const W = 640, H = Math.round(W * img.height / img.width);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
  const { tree, lawn } = masksFrom(g.getImageData(0, 0, W, H).data, W, H);
  const thin = thinOf(tree, W, H, 1, 2);
  const c = site.plan.crop;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // jittered grid sampler with a minimum spacing; accept(i) tests the 640-px mask index
  function sample(accept, stepM, cellM) {
    const stepPx = stepM / mpp, taken = new Map(), pts = [];
    for (let py = c.y; py < c.y + c.h; py += stepPx) for (let px = c.x; px < c.x + c.w; px += stepPx) {
      const jx = px + (rnd() - 0.5) * stepPx, jy = py + (rnd() - 0.5) * stepPx;
      const ix = Math.floor((jx - c.x) / c.w * W), iy = Math.floor((jy - c.y) / c.h * H); if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      if (!accept(iy * W + ix)) continue;
      if (!pointInPoly([jx, jy], site.boundary) || isBlocked(jx, jy)) continue;
      const x = toX(jx), z = toZ(jy), gx = Math.floor(x / cellM), gz = Math.floor(z / cellM); let near = false;
      for (let dx = -1; dx <= 1 && !near; dx++) for (let dz = -1; dz <= 1; dz++) { const k = taken.get((gx + dx) + ',' + (gz + dz)); if (k && Math.hypot(k[0] - x, k[1] - z) < cellM) { near = true; break; } }
      if (near) continue;
      taken.set(gx + ',' + gz, [x, z]); pts.push({ x, z, ix, iy, r: rnd(), r2: rnd(), r3: rnd(), r4: rnd() });
    }
    return pts;
  }
  const trees = sample(i => tree[i] && !thin[i], 2.4, 3.0);
  const hedges = sample(i => thin[i], tier.hedgeSpacingM * 0.7, tier.hedgeSpacingM);
  // trees: one InstancedMesh per canopy variant (chosen by hash), one trunk mesh
  const V = tier.canopy.variants, byV = Array.from({ length: V }, () => []);
  trees.forEach(p => byV[Math.floor(p.r * V) % V].push(p));
  const m = new THREE.Matrix4(), col = new THREE.Color(), pal = [0x5f8f4a, 0x6f9b52, 0x4e7f3e, 0x7ea65c, 0x5a8a45];
  const treeMeshes = byV.map((pts, v) => {
    const im = new THREE.InstancedMesh(canopyGeometry({ variant: v, detail: tier.canopy.detail }), ctx.mats.canopy, Math.max(1, pts.length)); im.count = pts.length;
    pts.forEach((p, i) => { const s = 0.75 + p.r2 * 0.7, h = 1.1 + p.r3 * 1.1;
      m.compose(new THREE.Vector3(p.x, h + 1.5 * s, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.r4 * Math.PI * 2, 0)), new THREE.Vector3(s, s * 0.9, s)); im.setMatrixAt(i, m);
      im.setColorAt(i, col.setHex(pal[Math.floor(p.r * pal.length)]).offsetHSL(0, 0, (p.r - 0.5) * 0.08)); });
    im.castShadow = true; im.receiveShadow = true; im.name = 'canopies:' + v; return im;
  });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.17, 1, 6), ctx.mats.trunk, Math.max(1, trees.length)); trunks.count = trees.length;
  trees.forEach((p, i) => { const h = 1.1 + p.r3 * 1.1; m.compose(new THREE.Vector3(p.x, h / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)); trunks.setMatrixAt(i, m); });
  trunks.castShadow = false; trunks.name = 'trunks';
  // hedges: one box per site, long axis along the strip (image angle a → world yaw −a: plan y is world +z), clipped proportions with a little variation, no shadow
  const hedgeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.mats.hedge, Math.max(1, hedges.length)); hedgeMesh.count = hedges.length;
  const hpal = [0x3f6b32, 0x476f38, 0x3a6430];
  hedges.forEach((p, i) => { const a = strandYaw(thin, W, H, p.ix, p.iy), h = 0.9 * (0.85 + p.r2 * 0.3), L = 1.4 * (0.9 + p.r3 * 0.25);
    m.compose(new THREE.Vector3(p.x, h / 2, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)), new THREE.Vector3(L, h, 1.1)); hedgeMesh.setMatrixAt(i, m);
    hedgeMesh.setColorAt(i, col.setHex(hpal[Math.floor(p.r * hpal.length)]).offsetHSL(0, 0, (p.r4 - 0.5) * 0.06)); });
  hedgeMesh.castShadow = false; hedgeMesh.receiveShadow = true; hedgeMesh.name = 'hedges';
  // lawn mask → texture in plan.crop uv space (the same mapping the ground map uses)
  let lawnTexture = null;
  if (tier.lawn) {
    const lc = document.createElement('canvas'); lc.width = W; lc.height = H; const lg = lc.getContext('2d'), id = lg.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { const v = lawn[i] && !tree[i] ? 255 : 0; id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    lg.putImageData(id, 0, 0); lawnTexture = new THREE.CanvasTexture(lc); lawnTexture.minFilter = THREE.LinearFilter; lawnTexture.generateMipmaps = false;
  }
  return { trees: trees.length, hedges: hedges.length, variants: V, treeMeshes, trunks, hedgeMesh, lawnTexture };
}

// Ground shader: 0.5 m hash noise ±5 %, a slight green lift, matte lawn vs slightly sheened paving. No normal map — the plan stays a picture.
export function lawnify(material, lawnTexture) {
  material.onBeforeCompile = sh => {
    sh.uniforms.uLawn = { value: lawnTexture };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform sampler2D uLawn; float gLawn = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        gLawn = texture2D(uLawn, vMapUv).r;
        float n = fract(sin(dot(floor(vWp.xz * 2.0), vec2(12.9898, 78.233))) * 43758.5453);
        diffuseColor.rgb *= 1.0 + gLawn * (n - 0.5) * 0.10;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.95, 1.04, 0.90), gLawn * 0.7);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.82, 1.0, gLawn);');
  };
  return material;
}

export function waterMaterial(tier) {
  if (!tier.waterFps) return { material: new THREE.MeshPhysicalMaterial({ color: 0x3f9ec4, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.94 }), texture: null };   // flat water (low)
  const texture = new THREE.DataTexture(waterNormalData(256), 256, 256, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  const material = new THREE.MeshPhysicalMaterial({ color: 0x3f9ec4, roughness: 0.05, metalness: 0, ior: 1.33, transparent: true, opacity: 0.92, normalMap: texture, normalScale: new THREE.Vector2(0.35, 0.35) });
  return { material, texture };
}
// A water disc whose uvs are world metres / WATER_TILE_M: the ripple tile is continuous across every pool and scrolls with texture.offset.
export function waterDisc(r, x, y, z, material) {
  const g = new THREE.CircleGeometry(r, 64), pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + x) / WATER_TILE_M, (-pos.getY(i) + z) / WATER_TILE_M);   // rotated −90° about x below: local y → world −z
  const mesh = new THREE.Mesh(g, material); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); mesh.userData.water = true; return mesh;
}
```

- [ ] **Step 2:** `node --check viewer/greenery.js` → OK. Commit `viewer/greenery.js` — "B3: greenery.js — lobed canopy variants + shaded material, hedge/tree planter from the plan's greens, lawn ground shader, rippled water material + disc".

---

### Task 4: wire into `viewer/app.js` + `plan.sampleImage`; verify per tier; look

**Files:** Modify `viewer/app.js` (imports; materials `app.js:109,113`; ground `app.js:184`; features `app.js:250,253`; `plantTrees` `app.js:263-297`; loop `app.js:496-509`; `__walk` `app.js:511-513`), `projects/belvedere/site.json` (`plan.sampleImage`).

- [ ] **Step 1: import** — after `import { resolveFacade, … } from './facade.js';` add
`import { canopyMaterial, plantGreenery, lawnify, waterMaterial, waterDisc } from './greenery.js';`

- [ ] **Step 2: materials** — replace line 109 (`const matWater = …`) with
`const { material: matWater, texture: waterTex } = waterMaterial(TIER);   // B3: rippled on tiers with waterFps, flat on low`
and line 113 (`const matCanopy = …`) with
```js
const matCanopy = canopyMaterial();
const matHedge = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
```

- [ ] **Step 3: ground material handle** — in the ground block (line 184) change `const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 }));` to
```js
  groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(g, groundMat);
```
and declare `let groundMat;` on the line before `{` that opens the block (after `groundTex.anisotropy = …`).

- [ ] **Step 4: water discs** — before `for (const f of features) {` (line 235) add `const waterMeshes = [];`. In the `steppedWell` branch replace
`const water = new THREE.Mesh(new THREE.CircleGeometry(Rw, 64), matWater); water.rotation.x = -Math.PI / 2; water.position.set(x, -step * N + 0.06, z); world.add(water);`
with `const water = waterDisc(Rw, x, -step * N + 0.06, z, matWater); world.add(water); waterMeshes.push(water);`.
In the `splash` branch replace `world.add(cyl(c.r * mpp, c.r * mpp, 0.08, matWater, toX(c.cx), 0.04, toZ(c.cy), 48));` with
`const w = waterDisc(c.r * mpp, toX(c.cx), 0.08, toZ(c.cy), matWater); world.add(w); waterMeshes.push(w);` (the stone rim that follows stays; the water now sits 8 cm above the ground inside a 14 cm rim — nothing coplanar).

- [ ] **Step 5: replace `plantTrees`** — delete lines 263–297 (`// ---- trees: …` through `const treeCount = plantTrees();`) and put in their place
```js
// ---- greenery: trees, hedges and lawn read from the plan's greens (viewer/greenery.js). Sampled from plan.sampleImage so an AI ground (B5) never feeds the sampler. ----
const sampleSrc = site.plan.sampleImage || 'plan.jpg', groundSrc = site.plan.ground || 'plan.jpg';
const sampleImg = sampleSrc === groundSrc ? groundTex.image : (await texLoader.loadAsync(BASE + sampleSrc)).image;
const blocked = [...site.volumes.map(v => ({ polygon: v.polygon })), ...features];
const isBlocked = (px, py) => blocked.some(f => f.polygon ? pointInPoly([px, py], f.polygon) : f.rect ? (px >= f.rect[0] - 2 && px <= f.rect[2] + 2 && py >= f.rect[1] - 2 && py <= f.rect[3] + 2)
  : f.circle ? Math.hypot(px - f.circle.cx, py - f.circle.cy) <= f.circle.r + 2 : f.ellipse ? ((px - f.ellipse.cx) ** 2) / (f.ellipse.rx + 2) ** 2 + ((py - f.ellipse.cy) ** 2) / (f.ellipse.ry + 2) ** 2 <= 1 : false);
const greenery = plantGreenery(site, sampleImg, { toX, toZ, mpp, pointInPoly, isBlocked, tier: TIER, mats: { canopy: matCanopy, trunk: matTrunk, hedge: matHedge } });
for (const im of greenery.treeMeshes) world.add(im); world.add(greenery.trunks); world.add(greenery.hedgeMesh);
if (greenery.lawnTexture) { lawnify(groundMat, greenery.lawnTexture); groundMat.needsUpdate = true; }
const treeCount = greenery.trees;
```

- [ ] **Step 6: loop** — before `let lastT = performance.now(), dirty = true, …` (line 496) add
```js
const frustum = new THREE.Frustum(), pvm = new THREE.Matrix4();
function waterInView() {   // B3: ripples cost frames only while a pool is near and on screen (matrixWorldInverse is from the last render; a moving camera is dirty anyway)
  if (!TIER.waterFps || !waterMeshes.length) return false;
  frustum.setFromProjectionMatrix(pvm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  return waterMeshes.some(w => camera.position.distanceTo(w.position) < 260 && frustum.intersectsObject(w));
}
```
and in the animation loop replace
```js
  const animating = !!tween || (tour && !tour.paused) || ring.visible || now < dirtyUntil;
  if (!dirty && !animating) { if (FX.has('stop') || now - lastRender < 90) return; }   // idle: ~11 fps keeps the compositor fed without draining the battery
```
with
```js
  const water = waterInView(); if (water) waterTex.offset.set(now * 0.000012, now * 0.000007);   // ≈0.5 m/s drift across the 38.4 m tile
  const animating = !!tween || (tour && !tour.paused) || ring.visible || now < dirtyUntil;
  if (!dirty && !animating) { if (FX.has('stop') || now - lastRender < (water ? 1000 / TIER.waterFps : 90)) return; }   // idle: ~11 fps keeps the compositor fed; TIER.waterFps while a pool is on screen
```

- [ ] **Step 7: `__walk`** — after `facades: facadeInfo,` add
`greenery: { trees: greenery.trees, hedges: greenery.hedges, variants: greenery.variants, lawn: !!greenery.lawnTexture, water: !!waterTex }, hedgeCount: greenery.hedges, waterMeshes,`

- [ ] **Step 8: site.json** — in `plan` add `"sampleImage": "plan.jpg",` after `"ground": "plan.jpg"`.

- [ ] **Step 9: facts per tier** — `python3 -m http.server 8765 --directory /root/projects/siteplan-walk &` then `tools/_b3-facts.mjs` (gitignored, the `_b2-facts.mjs` pattern):
```js
import { chromium } from 'playwright';
const base = 'http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/&autostart=800';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const tier of ['low', 'mid', 'high']) {
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  await p.goto(base + '&q=' + tier, { waitUntil: 'networkidle', timeout: 120000 }); await p.waitForFunction(() => !!window.__walk, null, { timeout: 180000 }); await p.waitForTimeout(4000);
  const f = await p.evaluate(() => { const w = window.__walk; return { greenery: w.greenery, trees: w.treeCount, stats: w.stats(), water: w.waterMeshes.length, groundRough: w.scene.getObjectByProperty('type', 'Mesh') && true }; });
  console.log(tier, JSON.stringify(f), errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors'); await p.close();
}
await b.close();
```
Run `node tools/_b3-facts.mjs`. Expected: `greenery.variants` 1/3/3, `hedges` ≈300 (low, mid) / ≈700 (high), `trees` ≈450, `lawn` false/true/true, `water` false/true/true, `waterMeshes` 2, no errors; stats within `check.mjs` ceilings (expect low ≈ 91 calls / ≈95k tris, mid ≈ 95 / ≈90k, high ≈ 95 / ≈260k — canopies at detail 0 are cheaper than today's detail 1 spheres). Record the numbers in the commit message.

- [ ] **Step 10: look** — `tools/_b3-shots.mjs` (gitignored): boot `q=high` desktop 1440×900 and `q=mid` phone 390×844 (`isMobile, hasTouch, deviceScaleFactor 2`), for each of `stepped-well-plaza`, `tree-court`, `tennis-court`, `jogging-loop` call `window.__walk.select(id, true)`, wait 4 s, screenshot `docs/checkpoints/b3/after-<id>-<size>.png` (`timeout: 150000`); plus a water close-up: `select('stepped-well-plaza', false)` then `__walk.flyTo({ radius: 45, phi: 0.95, theta: 0.5, target: h.world.clone().setY(-1.3) }, 100)` where `h = __walk.hotspots.find(x => x.id === 'stepped-well-plaza')`, wait, shoot `after-water-close-desktop.png`; and the same water view with `setLight('dusk')` after a 3 s settle → `after-water-close-dusk-desktop.png`; and an overview `after-overview-desktop.png`. Read every PNG. Judge against the "before" set: canopies read as lobed crowns with a dark underside, not spheres; three silhouettes visible; hedges follow the court edges and path edgings as continuous low green walls (not a second row of trees); boundary tree rows still trees; lawn areas slightly matte/greener with a fine grain, paving unchanged; water shows ripple highlights from the sky, no seam, no tiling read; nothing coplanar flickering at the pool rims; pins still at the right heights. Tune once if needed (canopy gradient 0.68/1.06, rim 0.18, hedge palette, `normalScale`, lawn lift 0.7) and re-shoot only the affected view.

- [ ] **Step 11: check on the dev server** — `node tools/check.mjs 'http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/'` ALONE → 20/20 (the greenery check is Task 5; here the point is no regressions + budgets).

- [ ] **Step 12: commit** — `viewer/app.js projects/belvedere/site.json` — "B3: greenery + water wired in — lobed canopy variants, hedges on thin strips, lawn ground shader, rippled pools with a per-tier water fps; plan.sampleImage" (numbers from step 9 in the body).

---

### Task 5: `check.mjs` greenery check (+ mutation proof), docs, deploy, evidence, STOP for the phone gate

**Files:** Modify `tools/check.mjs`, `README.md`, `docs/adding-a-project.md`; add `docs/checkpoints/b3/after-*.png`.

- [ ] **Step 1: check** — in `tools/check.mjs` after the `trees planted` line add
```js
  const gr = await p.evaluate(() => ({ ...window.__walk.greenery, want: { variants: window.__walk.tier.canopy.variants, lawn: window.__walk.tier.lawn, water: window.__walk.tier.waterFps > 0 } }));
  ok('greenery: hedges on the plan\'s thin green strips; canopy variants, lawn and water match the tier', gr.hedges >= 100 && gr.trees >= 100 && gr.variants === gr.want.variants && gr.lawn === gr.want.lawn && gr.water === gr.want.water, JSON.stringify({ trees: gr.trees, hedges: gr.hedges, variants: gr.variants, lawn: gr.lawn, water: gr.water }));
```
In `tierFacts` add `greenery: w.greenery` to the returned object. Add `const WANT_G = { low: { variants: 1, lawn: false, water: false }, mid: { variants: 3, lawn: true, water: true }, high: { variants: 3, lawn: true, water: true } };` next to `WANT_ENV`, and change the per-tier boot check to
```js
  ok(`tier ${tier} boots as itself (env map ${WANT_ENV[tier] ? 'on' : 'off'}, log depth on, opaque canvas, plinth cap -0.3, ${WANT_G[tier].variants} canopy variant(s), lawn ${WANT_G[tier].lawn ? 'on' : 'off'}, water ${WANT_G[tier].water ? 'rippled' : 'flat'})`,
    !!f && f.quality === tier && f.env === WANT_ENV[tier] && f.logDepth === true && f.clearAlpha === 1 && f.plinthTopY === -0.3 && !!f.greenery && f.greenery.hedges >= 100 && f.greenery.variants === WANT_G[tier].variants && f.greenery.lawn === WANT_G[tier].lawn && f.greenery.water === WANT_G[tier].water, f ? JSON.stringify(f) : why);
```
Run ALONE on the dev server → 21/21. **Mutation:** in `viewer/greenery.js` change `const thin = thinOf(tree, W, H, 1, 2);` to `const thin = thinOf(tree, W, H, 1, 0);` → re-run → exactly the greenery check and the three tier checks FAIL (hedges 0); `git checkout viewer/greenery.js`; re-run → 21/21. If any tier's `stats` exceeded a `CEIL`, raise only that ceiling to measured × 1.3 rounded and say so in the commit. Commit `tools/check.mjs` — "check: greenery (hedges, canopy variants, lawn, water per tier) — mutation-proved".

- [ ] **Step 2: docs** — README "What it is, honestly" third bullet → "Courts, rink, stepped well, plazas, portal and domes are simple 3D read off the plan. Trees, hedges and lawn are read from the plan's own greens at load time (dark greens → lobed trees, thin dark strips → hedges, light greens → a lawn tint); the pool surfaces are procedural ripples. Nothing is planted that the plan does not draw." README tier paragraph (line 48) append: "B3: canopy detail/variants, hedge spacing, lawn tint and water ripples are per tier (`viewer/quality.js`); `low` keeps flat water and no lawn tint." Guide §2 add bullet: "`plan.sampleImage` (optional, default `plan.jpg`): the image the tree/hedge/lawn sampler reads. Keep it the published plan even if `plan.ground` becomes an AI reinterpretation." Guide Gotchas add: "Drawn canopies have light highlights, so the dark-green mask is a ring per tree; the sampler closes 1 cell before testing thinness (hedges = strips under ≈1.3 m at the 640-px sample). If a plan draws hedges wider than that, raise `openR` in `viewer/greenery.js`." Commit "B3 docs: greenery honesty bullet, per-tier line, plan.sampleImage, highlight-ring gotcha".

- [ ] **Step 3: deploy + live check + evidence** — `tools/deploy.sh belvedere`; `node tools/check.mjs https://walk.csoul.cloud/belvedere/` ALONE → 21/21. Re-point `tools/_b3-shots.mjs` at `https://walk.csoul.cloud/belvedere/?autostart=1200` and re-shoot the "after" set from the LIVE url (overwrite the dev ones): `after-{stepped-well-plaza,tree-court,tennis-court}-desktop.png`, `after-tree-court-phone.png`, `after-overview-desktop.png`, `after-water-close-desktop.png`, `after-water-close-dusk-desktop.png`. Read them. Commit `docs/checkpoints/b3/` — "B3: checkpoint evidence from the live URL (before/after)".

- [ ] **Step 4: hand-off + STOP** — update memory (`siteplan-walk-belvedere.md`: B3 deployed on `arc2-b3`, unmerged, awaiting the phone gate; numbers; lessons), then send the owner: the before/after pairs, the water close-ups, the counts (trees/hedges per tier), the two deviations (hedge rule, water fps), and the phone-gate ask: "Open a court hotspot and the stepped well on your phone — do the hedges read as hedges, does the water move without stutter or heat, any flicker at the pool rims? Toggle dusk." Do NOT merge until the answer.

## Verification (end to end)

1. `node --test tests/*.test.mjs` → all green (quality 4, facade-geom 7, greenery-mask 6).
2. `python3 -m http.server 8765 --directory /root/projects/siteplan-walk` → `node tools/_b3-facts.mjs` → variants 1/3/3, hedges ≥100 every tier, lawn/water off on low only, zero errors, stats under `CEIL`.
3. `node tools/check.mjs <dev url>` ALONE → 21/21; mutation `openR 2 → 0` breaks exactly the greenery + tier checks; restore → 21/21.
4. Screenshots read as images: before/after pairs at stepped-well, tree-court, tennis-court; phone tree-court; water close-ups day + dusk.
5. Deploy → `node tools/check.mjs https://walk.csoul.cloud/belvedere/` → 21/21 → live shots → owner phone gate.

## Self-review

- **Spec §B3 coverage:** 3 canopy variants via merged offset icosahedra with tier detail (T3 `canopyGeometry`, T2 tiers); InstancedMeshes chosen by hash (T3 `byV`); shader local-y gradient + rim (T3 `canopyMaterial`); trunks unchanged (T3); hedges from thin strips with yaw from the mask, no shadow, sizes 1.1×0.9×1.4 (T3 hedges; rule re-derived, see Context); trees `mask AND NOT thin` (T3); counts exposed (T4 `__walk.greenery`, `hedgeCount`); lawn rule + CanvasTexture + `onBeforeCompile` noise/lift/roughness, no normal map (T3 `lawnify`, T4); water 256² normals, RepeatWrapping ≈0.15 m/texel, normalScale 0.35, roughness 0.05, ior 1.33, opacity 0.92, clock offset (T3 `waterMaterial`/`waterDisc`, T4 loop); render while water near + in frustum (T4 `waterInView`, bounded by `waterFps`); `plan.sampleImage` (T4 step 5/8, docs T5); tier table rows for greenery (T2); checkpoint evidence stepped well / tree court / jogging loop vs today + counts + phone gate (T0, T4 step 10, T5).
- **Placeholders:** none — every code step carries the code; the two scratch scripts are specified by content or by exact `__walk` calls.
- **Type consistency:** `plantGreenery` returns `{ trees, hedges, variants, treeMeshes, trunks, hedgeMesh, lawnTexture }` and T4 reads exactly those; `waterMaterial` returns `{ material, texture }` destructured to `matWater`/`waterTex`; `TIER.canopy.{detail,variants}`, `TIER.hedgeSpacingM`, `TIER.lawn`, `TIER.waterFps` are the names used in T2, T3, T4, T5; `__walk.greenery.{trees,hedges,variants,lawn,water}` is what `check.mjs` asserts.
