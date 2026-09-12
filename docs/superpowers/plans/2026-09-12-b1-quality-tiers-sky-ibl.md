# B1 — Quality tiers + procedural sky and image-based lighting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship sub-phase B1 of arc 2: a device-resolved quality tier (`high|mid|low`) and a procedural sky that is both the visible dome and the environment map lighting every material, with day/dusk retuned against Brigade's aerial render — live at https://walk.csoul.cloud/belvedere/, checks green at all three tiers, then STOP for the owner's checkpoint (screenshots + phone).

**Architecture:** Two new ES modules beside `viewer/app.js` (no build step): `viewer/quality.js` (pure tier table + resolver, node-testable) and `viewer/sky.js` (three/addons `Sky` mesh + PMREM baking in `live|cached|none` modes). `app.js` keeps `applyLighting(k)` as the single day/dusk choke point; it now also drives the sky uniforms, the sun direction, shadow intensity and the environment map. `tools/check.mjs` boots each tier and asserts the flicker contract on phones.

**Tech Stack:** Three.js r170 from the jsDelivr importmap (`three/addons/objects/Sky.js`, `THREE.PMREMGenerator`), Playwright Chromium (SwiftShader) for checks/screenshots, `node --test` for the pure module, ImageMagick 6 `convert` for pixel sampling.

**Spec:** `docs/superpowers/specs/2026-09-12-siteplan-arc2-render-media-design.md` — §"Tiers", §"B1 — sky + IBL", §"Verification rules", ruling 1 (tiers), ruling 8 (Sky.js, dusk sun ≈13°), ruling 12 (B1 first).

## Global Constraints

- No build step; every import resolves through the importmap in `viewer/index.html` (`three`, `three/addons/`). Nothing installed.
- Keep the mobile-flicker fixes byte-for-byte in behaviour on `mid` and `low`: opaque canvas (`alpha:false`), `logarithmicDepthBuffer:true`, plinth cap at y = −0.3 (never coplanar with the ground at 0), no `backdrop-filter` on phones, idle loop keeps rendering at ≈11 fps (`now - lastRender < 90`), `?fx=alpha|nolog|stop|blur` still restore each old behaviour.
- Project-agnostic: nothing Belvedere-specific in `viewer/`; a second project needs no code change.
- `window.__walk` is the verification contract: every new runtime fact gets an accessor there.
- After any change to `viewer/app.js`, run `tools/check.mjs` (TDZ bugs only surface there).
- Screenshots on this host take 25–55 s each (software GL): `page.screenshot({ timeout: 150000 })`; frame rate cannot be measured here — the owner's phone is the gate.
- Honesty: the sky is procedural (no photo); no new claim about the building. Labels unchanged.
- Commit locally after each task (no git remote). Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Ww5MSzHLNRbzu3Hzh5J8zF
  ```

## File structure

| File | Responsibility |
|---|---|
| `viewer/quality.js` (new) | `TIERS` table + `resolveQuality(qParam, coarse)`. Pure; no three import; unit-tested with `node --test`. |
| `viewer/sky.js` (new) | `createSky(renderer, scene, mode)` → `{ mesh, setParams, environment, intensityScale, mode }`. Owns the `Sky` mesh, the PMREM generator and its caches. |
| `viewer/app.js` (modify) | boot: resolve tier, renderer options from the tier; sky section replaced by `createSky`; presets gain `sky`, `sunDir`, `shadowI`; `applyLighting(k, force)` extended; plinth constants; loop resets `renderer.info`; `__walk` accessors. |
| `tests/quality.test.mjs` (new) | node:test for `quality.js`. |
| `tools/check.mjs` (modify) | per-tier boot checks, flicker contract, draw budget, shader-compile errors. |
| `README.md`, `docs/adding-a-project.md` (modify) | tiers, URL params, "all checks green". |
| `docs/checkpoints/b1/*.png` (new) | the checkpoint evidence set from the live URL. |

Dev server for every browser step: `python3 -m http.server 8765 --directory /root/projects/siteplan-walk` (run in the background once; viewer URL `http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/`). Playwright is symlinked into `tools/node_modules` (README §Commands) — scratch scripts must live in `tools/` as `_*.mjs` (gitignored).

---

### Task 1: `viewer/quality.js` — tier table and resolver (pure, unit-tested)

**Files:**
- Create: `viewer/quality.js`
- Create: `tests/quality.test.mjs`

**Interfaces:**
- Produces: `export const TIERS = { high, mid, low }` where each tier is `{ dpr:number, pmrem:'live'|'cached'|'none', shadowMap:number, hemiScale:number, logDepth:boolean, alpha:boolean }`; `export function resolveQuality(qParam: string|null|undefined, coarse: boolean): 'high'|'mid'|'low'`.
- Consumed by Task 3 (`app.js`) and asserted by Task 4 (`check.mjs`).

- [ ] **Step 1: Write the failing test**

`tests/quality.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveQuality, TIERS } from '../viewer/quality.js';

test('an explicit ?q wins over the device', () => {
  assert.equal(resolveQuality('low', false), 'low');
  assert.equal(resolveQuality('mid', false), 'mid');
  assert.equal(resolveQuality('high', true), 'high');
});

test('no or unknown ?q falls back by pointer type', () => {
  assert.equal(resolveQuality(null, true), 'mid');
  assert.equal(resolveQuality(undefined, false), 'high');
  assert.equal(resolveQuality('ultra', true), 'mid');
  assert.equal(resolveQuality('toString', false), 'high');   // must not resolve through Object.prototype
});

test('phone and check tiers keep the flicker contract; low has no environment map', () => {
  for (const [name, t] of Object.entries(TIERS)) {
    assert.equal(typeof t.dpr, 'number', name + '.dpr');
    assert.ok(['live', 'cached', 'none'].includes(t.pmrem), name + '.pmrem');
    assert.equal(typeof t.shadowMap, 'number', name + '.shadowMap');
    assert.equal(typeof t.hemiScale, 'number', name + '.hemiScale');
  }
  assert.equal(TIERS.mid.logDepth, true); assert.equal(TIERS.mid.alpha, false);
  assert.equal(TIERS.low.logDepth, true); assert.equal(TIERS.low.alpha, false);
  assert.equal(TIERS.low.pmrem, 'none');
  assert.equal(TIERS.low.dpr, 1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /root/projects/siteplan-walk && node --test tests/quality.test.mjs`
Expected: FAIL — `Cannot find module '.../viewer/quality.js'`.

- [ ] **Step 3: Write the module**

`viewer/quality.js`:
```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /root/projects/siteplan-walk && node --test tests/quality.test.mjs`
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /root/projects/siteplan-walk && git add viewer/quality.js tests/quality.test.mjs && git commit -q -m "B1: quality tiers table + resolver (high/mid/low), node tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ww5MSzHLNRbzu3Hzh5J8zF"
```

---

### Task 2: `viewer/sky.js` — procedural sky dome + PMREM environment

**Files:**
- Create: `viewer/sky.js`

**Interfaces:**
- Consumes: `three` and `three/addons/objects/Sky.js` (uniforms `turbidity, rayleigh, mieCoefficient, mieDirectionalG, sunPosition`; the shader pins the box to the far plane and is `depthWrite:false`, `BackSide`).
- Produces: `createSky(renderer, scene, mode)` → object:
  - `mesh` — the `Sky` mesh (scale 4000, `renderOrder -10`, `frustumCulled false`, `userData.noAO = true`); caller adds it to the scene.
  - `setParams({ turbidity, rayleigh, mie, g }, sunDir: THREE.Vector3)` — writes the uniforms (`sunDir` unit length).
  - `environment(k: number, lerpParams: (k) => void, force = false)` → `THREE.Texture | null` — the environment texture for mix `k` (0 day … 1 dusk). `lerpParams` must call `setParams` for a given k (the cached mode uses it to bake both endpoints).
  - `intensityScale(k)` → number — multiply `scene.environmentIntensity` by this (dips to 0.5 at k = 0.5 in cached mode to hide the swap; 1 otherwise).
  - `mode` — `'live'|'cached'|'none'` as passed.

- [ ] **Step 1: Write the module**

`viewer/sky.js`:
```js
// Procedural sky (three/addons Sky — Preetham-style atmosphere) used two ways: the visible dome, and the image-based light (PMREM) every material reflects.
// mode: 'live'   → re-bake the PMREM while the day/dusk mix moves (desktop)
//       'cached' → bake day and dusk once at load, swap at k = 0.5 with an intensity dip (phones)
//       'none'   → dome only, no environment map (the check runner)
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export function createSky(renderer, scene, mode) {
  const mesh = new Sky();
  mesh.scale.setScalar(4000);   // the orbit never leaves ±900 m of the origin; the shader pins the box to the far plane regardless
  mesh.renderOrder = -10; mesh.frustumCulled = false; mesh.userData.noAO = true;
  const u = mesh.material.uniforms;
  const envScene = new THREE.Scene();
  const pmrem = mode === 'none' ? null : new THREE.PMREMGenerator(renderer);
  const cache = [];               // cached: [day, dusk] render targets
  let live = null, liveK = null;  // live: current render target and the k it was baked at

  function setParams(p, sunDir) {
    u.turbidity.value = p.turbidity; u.rayleigh.value = p.rayleigh; u.mieCoefficient.value = p.mie; u.mieDirectionalG.value = p.g;
    u.sunPosition.value.copy(sunDir);
  }
  function bake() {
    // PMREMGenerator renders envScene from the origin with tone mapping off → linear HDR sky. The mesh is re-parented for the bake and put back.
    const parent = mesh.parent, vis = mesh.visible; mesh.visible = true; envScene.add(mesh);
    const rt = pmrem.fromScene(envScene);
    if (parent) parent.add(mesh); mesh.visible = vis;
    return rt;
  }
  function environment(k, lerpParams, force = false) {
    if (mode === 'none') return null;
    if (mode === 'cached') {
      if (!cache.length) { lerpParams(0); cache[0] = bake(); lerpParams(1); cache[1] = bake(); lerpParams(k); }
      return (k < 0.5 ? cache[0] : cache[1]).texture;
    }
    const endpoint = (k === 0 || k === 1) && liveK !== k;
    if (force || liveK === null || endpoint || Math.abs(k - liveK) > 0.12) { const rt = bake(); if (live) live.dispose(); live = rt; liveK = k; }
    return live.texture;
  }
  function intensityScale(k) { return mode === 'cached' ? 1 - 0.5 * Math.sin(Math.PI * k) : 1; }
  return { mesh, setParams, environment, intensityScale, mode };
}
```

- [ ] **Step 2: Syntax-check the module**

Run: `cd /root/projects/siteplan-walk && node --check viewer/sky.js && echo SYNTAX-OK`
Expected: `SYNTAX-OK` (bare specifiers are fine for a parse-only check; the browser resolves them through the importmap).

- [ ] **Step 3: Commit**

```bash
cd /root/projects/siteplan-walk && git add viewer/sky.js && git commit -q -m "B1: sky.js — procedural Sky dome + PMREM environment (live/cached/none)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ww5MSzHLNRbzu3Hzh5J8zF"
```

---

### Task 3: wire tiers + sky into `viewer/app.js`

**Files:**
- Modify: `viewer/app.js` (imports 1–4; project 9–10; renderer 29–30; environment 40; sky dome 61–70; shadow map 75; presets + `applyLighting` 80–94; plinth 169; loop 491–492; `__walk` 495)

**Interfaces:**
- Consumes: `TIERS`, `resolveQuality` (Task 1); `createSky` (Task 2).
- Produces on `window.__walk`: `quality` (string), `tier` (the tier object), `PRESETS` (mutable), `applyLighting(k, force)`, `lightK` (getter), `sky` (mesh), `stats()` → `{ calls, triangles, programs, textures }`, `plinthTopY` (number, the real plinth cap y).

- [ ] **Step 1: Start the dev server and record the baseline**

```bash
cd /root/projects/siteplan-walk && (python3 -m http.server 8765 --directory /root/projects/siteplan-walk >/dev/null 2>&1 &) && sleep 1
node tools/check.mjs 'http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/'
```
Expected: `12/12 checks passed` (baseline before touching app.js).

- [ ] **Step 2: Edit the imports (lines 1–4)**

Replace
```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
```
with
```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { TIERS, resolveQuality } from './quality.js';
import { createSky } from './sky.js';
```

- [ ] **Step 3: Resolve the tier (lines 9–10)**

Replace
```js
const COARSE = matchMedia('(pointer: coarse)').matches;
const LOWQ = q.get('q') === 'low';
```
with
```js
const COARSE = matchMedia('(pointer: coarse)').matches;
const QUALITY = resolveQuality(q.get('q'), COARSE), TIER = TIERS[QUALITY];   // high (desktop) / mid (phones) / low (check.mjs) — viewer/quality.js
```

- [ ] **Step 4: Renderer options from the tier (lines 29–30) and drop the studio environment (line 40)**

Replace
```js
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: FX.has('alpha'), powerPreference: 'high-performance', logarithmicDepthBuffer: !FX.has('nolog') });
renderer.setPixelRatio(LOWQ ? 1 : Math.min(devicePixelRatio || 1, COARSE ? 1.35 : 1.5));
```
with
```js
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: TIER.alpha || FX.has('alpha'), powerPreference: 'high-performance', logarithmicDepthBuffer: TIER.logDepth && !FX.has('nolog') });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, TIER.dpr));
renderer.info.autoReset = false;   // reset once per rendered frame in the loop so __walk.stats() reports whole frames
```
Delete the line
```js
if (!LOWQ) { const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose(); }
```

- [ ] **Step 5: Replace the sky dome section (lines 61–70, from `// ============ sky dome ============` through `paintSky(0);`)**

New section:
```js
// ============ sky: procedural dome + image-based light ============
const skyCtl = createSky(renderer, scene, TIER.pmrem);
const sky = skyCtl.mesh; sky.visible = !FX.has('alpha'); scene.add(sky);   // ?fx=alpha: transparent canvas over the CSS #sky gradient, the pre-fix behaviour
```

- [ ] **Step 6: Shadow map size from the tier (line 75)**

Replace `sun.shadow.mapSize.set(LOWQ || COARSE ? 1024 : 2048, LOWQ || COARSE ? 1024 : 2048);` with `sun.shadow.mapSize.set(TIER.shadowMap, TIER.shadowMap);`

- [ ] **Step 7: Presets and `applyLighting` (lines 80–94, from `const PRESETS = {` through the closing `}` of `applyLighting`)**

Replace with:
```js
const PRESETS = {   // starting values; Task 5 tunes them against source/render-exterior-aerial.webp. sunDir is a unit vector (dusk ≈ 13° elevation so the sky turns orange)
  day:  { hemiSky: new THREE.Color(0xdfe9ff), hemiGround: new THREE.Color(0xc2b49a), hemiI: 1.05, sunColor: new THREE.Color(0xfff1dc), sunI: 2.4, sunDir: new THREE.Vector3(300, 520, 260).normalize(), shadowI: 0.85,
          sky: { turbidity: 6, rayleigh: 1.6, mie: 0.008, g: 0.85 }, fog: new THREE.Color(0xece7de), base: new THREE.Color(0xe9e3d8), exposure: 0.7, env: 0.8 },
  dusk: { hemiSky: new THREE.Color(0x6e7fb0), hemiGround: new THREE.Color(0x5b4b3e), hemiI: 0.8, sunColor: new THREE.Color(0xffa565), sunI: 1.9, sunDir: new THREE.Vector3(-0.8315, 0.2250, 0.5082).normalize(), shadowI: 0.6,
          sky: { turbidity: 9, rayleigh: 2.4, mie: 0.012, g: 0.9 }, fog: new THREE.Color(0x8b8796), base: new THREE.Color(0x9599a6), exposure: 0.6, env: 0.7 },
};
let lightK = q.get('light') === 'dusk' ? 1 : 0, lightTarget = lightK;
const bandedShaders = [];
const sunDirAt = (k, out = new THREE.Vector3()) => out.lerpVectors(PRESETS.day.sunDir, PRESETS.dusk.sunDir, k).normalize();
function skyParamsAt(k) { const a = PRESETS.day.sky, b = PRESETS.dusk.sky, L = THREE.MathUtils.lerp; return { turbidity: L(a.turbidity, b.turbidity, k), rayleigh: L(a.rayleigh, b.rayleigh, k), mie: L(a.mie, b.mie, k), g: L(a.g, b.g, k) }; }
const lerpSky = k => skyCtl.setParams(skyParamsAt(k), sunDirAt(k));
function applyLighting(k, force = false) {   // the single day/dusk choke point: lights, sun, shadow, fog, exposure, sky uniforms, environment map, tower glow
  const a = PRESETS.day, b = PRESETS.dusk, L = THREE.MathUtils.lerp;
  hemi.color.lerpColors(a.hemiSky, b.hemiSky, k); hemi.groundColor.lerpColors(a.hemiGround, b.hemiGround, k); hemi.intensity = L(a.hemiI, b.hemiI, k) * TIER.hemiScale;
  sun.color.lerpColors(a.sunColor, b.sunColor, k); sun.intensity = L(a.sunI, b.sunI, k); sun.position.copy(sunDirAt(k)).multiplyScalar(700); sun.shadow.intensity = L(a.shadowI, b.shadowI, k);
  scene.fog.color.lerpColors(a.fog, b.fog, k); matBase.color.lerpColors(a.base, b.base, k);
  renderer.toneMappingExposure = L(a.exposure, b.exposure, k);
  lerpSky(k);
  scene.environment = skyCtl.environment(k, lerpSky, force); scene.environmentIntensity = L(a.env, b.env, k) * skyCtl.intensityScale(k);
  for (const sh of bandedShaders) sh.uniforms.uDusk.value = k;
  document.getElementById('sky').style.opacity = FX.has('alpha') ? k.toFixed(3) : '0';
}
```
(`sun.position` at 700 m along the direction keeps the shadow camera's `near 50 / far 1400` covering the whole model at either preset.)

- [ ] **Step 8: Plinth constants (line 169)**

Replace
```js
world.add(extrudeShape(shapeFromPlan(site.boundary, wellHoles), 1.3, matPlinth, null, -1.6));   // top cap at -0.3: never coplanar with the ground
```
with
```js
const PLINTH_TOP = -0.3, PLINTH_H = 1.3;   // cap below the ground plane at 0: never coplanar (mobile-flicker fix); asserted by check.mjs via __walk.plinthTopY
world.add(extrudeShape(shapeFromPlan(site.boundary, wellHoles), PLINTH_H, matPlinth, null, PLINTH_TOP - PLINTH_H));
```

- [ ] **Step 9: Loop (lines 491–492)**

Replace
```js
  sky.position.set(camera.position.x, 0, camera.position.z);
  updateCompass(); updatePins(now); renderer.render(scene, camera); labelRenderer.render(scene, camera);
```
with
```js
  renderer.info.reset();
  updateCompass(); updatePins(now); renderer.render(scene, camera); labelRenderer.render(scene, camera);
```

- [ ] **Step 10: `__walk` (line 495)**

Replace the `window.__walk = { … };` line with
```js
window.__walk = { scene, camera, controls, site, flyTo, fitView, DEFAULT_VIEW, currentView, volumeMeshes, renderer, THREE, treeCount, setLight, select, deselect, setTheme, hotspots, startTour, endTour, tourState, get tour() { return tour; }, get selected() { return selected; },
  quality: QUALITY, tier: TIER, PRESETS, applyLighting, get lightK() { return lightK; }, sky, plinthTopY: PLINTH_TOP,
  stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length, textures: renderer.info.memory.textures }) };
```

- [ ] **Step 11: Prove nothing else references the removed symbols**

Run: `cd /root/projects/siteplan-walk && grep -n "LOWQ\|paintSky\|RoomEnvironment\|skyGeo\|SKY\." viewer/app.js; echo "exit=$?"`
Expected: no lines printed, `exit=1`.

- [ ] **Step 12: Boot at each tier in the browser and read the facts**

Create the scratch script `tools/_b1-facts.mjs` (gitignored):
```js
import { chromium } from 'playwright';
const base = 'http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/&autostart=800';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const tier of ['low', 'mid', 'high']) {
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(base + '&q=' + tier, { waitUntil: 'networkidle', timeout: 90000 }); await p.waitForTimeout(6000);
  const f = await p.evaluate(() => { const w = window.__walk; const gl = w.renderer.getContext(); return { q: w.quality, env: !!w.scene.environment, log: w.renderer.capabilities.logarithmicDepthBuffer, clearAlpha: w.renderer.getClearAlpha(), plinth: w.plinthTopY, stats: w.stats(), exposure: w.renderer.toneMappingExposure, sunY: +w.scene.children.find(o => o.isDirectionalLight).position.y.toFixed(0) }; });
  console.log(tier, JSON.stringify(f), errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors'); await p.close();
}
await b.close();
```
Run: `cd /root/projects/siteplan-walk && node tools/_b1-facts.mjs`
Expected: three lines, `no errors` on each; `low` → `env:false`, `mid`/`high` → `env:true`; all `log:true, clearAlpha:1, plinth:-0.3`; `stats.calls` ≈ 87 and `triangles` ≈ 98k (whole frame incl. the shadow pass; master measured 55/56k because three's automatic reset runs after the shadow pass); `q` equals the requested tier.

- [ ] **Step 13: Run the existing checks (still 12) against the dev server**

Run: `cd /root/projects/siteplan-walk && node tools/check.mjs 'http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/'`
Expected: `12/12 checks passed`. If `viewer booted` fails, the console error text names the TDZ or import fault — fix and re-run.

- [ ] **Step 14: Commit**

```bash
cd /root/projects/siteplan-walk && git add viewer/app.js && git commit -q -m "B1: tiers + procedural sky wired into the viewer; applyLighting drives sky, sun, shadow intensity, environment

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ww5MSzHLNRbzu3Hzh5J8zF"
```

---

### Task 4: `tools/check.mjs` — per-tier boots, flicker contract, draw budget, shader errors (with mutation proofs)

**Files:**
- Modify: `tools/check.mjs` (error-sink lines 7; after the `if (state) { … }` block, before `ok('zero console errors …')` on line 44)

**Interfaces:**
- Consumes: `window.__walk.quality`, `.stats()`, `.plinthTopY`, `.scene.environment`, `.renderer.capabilities.logarithmicDepthBuffer`, `.renderer.getClearAlpha()` (Task 3).
- Produces: 7 new named checks: `tier low|mid|high boots as itself …` (3), `tier low|mid|high draw budget …` (3), `no shader compile errors on any tier` (1). Total becomes 19.

- [ ] **Step 1: Turn the error sink into a reusable `wire(page)`**

Replace line 7
```js
const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('requestfailed', r => errs.push('requestfailed: ' + r.url()));
```
with
```js
const errs = []; const wire = pg => { pg.on('pageerror', e => errs.push('pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('requestfailed', r => errs.push('requestfailed: ' + r.url())); }; wire(p);
```

- [ ] **Step 2: Add the tier block**

Insert immediately after the closing `}` of `if (state) { … }` (the line before `ok('zero console errors / failed requests', …)`):
```js
// ---- quality tiers: each boots as itself, keeps the flicker contract (opaque canvas, log depth, plinth cap -0.3), stays under its draw budget, compiles every shader ----
const CEIL = { low: [120, 200000], mid: [140, 300000], high: [220, 700000] };   // [draw calls, triangles] per WHOLE frame incl. the shadow pass (B1 baseline 87 / 98k); recalibrate when a sub-phase adds geometry
const WANT_ENV = { low: false, mid: true, high: true };
const tierFacts = () => { const w = window.__walk; if (!w) return null;
  return { quality: w.quality, logDepth: w.renderer.capabilities.logarithmicDepthBuffer, clearAlpha: w.renderer.getClearAlpha(), env: !!w.scene.environment, stats: w.stats(), plinthTopY: w.plinthTopY }; };   // r170 always creates the context with alpha:true; the renderer's alpha:false is a clear alpha of 1
const facts = { low: state ? await p.evaluate(tierFacts) : null };
for (const tier of ['mid', 'high']) {
  const pg = await ctx.newPage(); wire(pg);
  const tu = new URL(url); tu.searchParams.set('autostart', '800'); tu.searchParams.set('q', tier);
  const r = await pg.goto(tu.toString(), { waitUntil: 'networkidle', timeout: 90000 }); await pg.waitForTimeout(6000);
  facts[tier] = r && r.status() === 200 ? await pg.evaluate(tierFacts) : null; await pg.close();
}
for (const tier of ['low', 'mid', 'high']) {
  const f = facts[tier];
  ok(`tier ${tier} boots as itself (env map ${WANT_ENV[tier] ? 'on' : 'off'}, log depth on, opaque canvas, plinth cap -0.3)`,
    !!f && f.quality === tier && f.env === WANT_ENV[tier] && f.logDepth === true && f.clearAlpha === 1 && f.plinthTopY === -0.3, JSON.stringify(f));
  ok(`tier ${tier} draw budget (≤${CEIL[tier][0]} calls, ≤${CEIL[tier][1]} tris)`, !!f && f.stats.calls > 0 && f.stats.calls <= CEIL[tier][0] && f.stats.triangles <= CEIL[tier][1], f ? JSON.stringify(f.stats) : 'no facts');
}
ok('no shader compile errors on any tier', !errs.some(e => /Shader Error|WebGLProgram|WebGLShader|GLSL/i.test(e)), errs.filter(e => /Shader|GLSL/i.test(e)).slice(0, 3).join(' | '));
```

- [ ] **Step 3: Run the checks — all green**

Run: `cd /root/projects/siteplan-walk && node tools/check.mjs 'http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/'`
Expected: `19/19 checks passed`.

- [ ] **Step 4: Mutation proof 1 — the mid boot check sees a lost environment map**

Temporarily edit `viewer/quality.js`: change `mid:  { dpr: 1.35, pmrem: 'cached',` to `mid:  { dpr: 1.35, pmrem: 'none',`. Run the checks.
Expected: exactly `FAIL  tier mid boots as itself …` (info shows `"env":false`), 18/19. Restore the line (`git checkout viewer/quality.js`) and confirm `git diff --quiet viewer/quality.js`.

- [ ] **Step 5: Mutation proof 2 — a broken shader is caught**

Temporarily edit `viewer/app.js`: in `bandedMaterial`, change `float slab = smoothstep(0.86, 0.90, fl);` to `float slab = smoothstepp(0.86, 0.90, fl);`. Run the checks.
Expected: `FAIL  no shader compile errors on any tier` (and `zero console errors` fails too). Restore with `git checkout viewer/app.js`; confirm `git diff --quiet viewer/app.js`.

- [ ] **Step 6: Re-run green, commit**

Run the checks once more → `19/19`. Then:
```bash
cd /root/projects/siteplan-walk && git add tools/check.mjs && git commit -q -m "check: per-tier boots, flicker contract at mid/low, draw budgets, shader-compile errors (mutation-proved)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ww5MSzHLNRbzu3Hzh5J8zF"
```

---

### Task 5: tune day and dusk against Brigade's aerial render (screenshots read as images)

**Files:**
- Modify: `viewer/app.js` (only the numbers inside `PRESETS`)

**Interfaces:** none new. Uses `tools/shoot.mjs` (desktop + phone PNGs) and ImageMagick `convert` for a horizon pixel.

Reference: `projects/belvedere/source/render-exterior-aerial.webp` — deep blue zenith fading to a pale warm horizon with haze, cream towers reading around sRGB 205–235 on lit faces and 150–175 in shade, no blown highlights, shadows never black.

- [ ] **Step 1: Shoot round 1 (high tier, day and dusk)**

```bash
cd /root/projects/siteplan-walk && S=/tmp/claude-0/-root/93ec20f7-fb99-41d6-96a4-b5c71922f589/scratchpad
node tools/shoot.mjs 'http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/&autostart=1200&q=high' $S/b1-r1-day
node tools/shoot.mjs 'http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/&autostart=1200&q=high&light=dusk' $S/b1-r1-dusk
```
Then READ all four PNGs with the Read tool next to the aerial render. Judge, per image: (a) sky: gradient from blue zenith to pale haze at the horizon, sun glow visible at dusk, no banding; (b) towers: lit faces cream, not white-clipped (sample with `convert b1-r1-day-desktop.png -format '%[pixel:p{X,Y}]' info:` on a lit face — want roughly `srgb(215,208,195)` ± 15); (c) shadows: grey-brown, ground texture still readable inside them; (d) horizon: the base disc edge should dissolve into the haze, not show as a hard grey line.

- [ ] **Step 2: Adjust the knobs, one cause at a time**

Rules of thumb, applied in `PRESETS` (day and dusk separately):
- towers too bright / clipped → lower `exposure` by 0.05; too dull → raise `sunI` by 0.2 before touching exposure.
- shadows too dark → raise `env` by 0.1 (sky light fills shadows) or `shadowI` down by 0.05; too flat → the reverse.
- sky too pale at zenith → `rayleigh` up 0.3; too saturated → down; haze too thin → `turbidity` up 1; sun glow too small at dusk → `mie` up 0.002, `g` up 0.02.
- horizon line visible → set `fog` (and `base`) to the sampled horizon colour: `convert b1-r1-day-desktop.png -format '%[pixel:p{700,330}]' info:` (pick X,Y on the sky just above the base-disc edge in the desktop shot; read the image to choose). Three.js applies fog in display space after tone mapping, so the sampled sRGB hex is the value to write.
- dusk sky not orange → lower the dusk `sunDir` elevation (recompute: `y = sin(elev)`, xz = `(-0.8534, 0.5216) * cos(elev)`; 13° is the ruling, go no lower than 10°).

- [ ] **Step 3: Rounds 2–3**

Repeat Step 1 with prefixes `b1-r2-*`, `b1-r3-*` after each edit; stop when (a)–(d) hold in all four images. Do not exceed three rounds: if something still looks wrong, note it in the checkpoint message for the owner rather than tuning blind.

- [ ] **Step 4: Confirm mid and low still look right and the checks stay green**

```bash
cd /root/projects/siteplan-walk && S=/tmp/claude-0/-root/93ec20f7-fb99-41d6-96a4-b5c71922f589/scratchpad
node tools/shoot.mjs 'http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/&autostart=1200&q=mid' $S/b1-mid-day
node tools/check.mjs 'http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/'
```
Expected: the mid shots match the high shots in tone (same presets, cached bakes); `19/19`.

- [ ] **Step 5: Commit the tuned presets**

```bash
cd /root/projects/siteplan-walk && git add viewer/app.js && git commit -q -m "B1: day/dusk presets tuned against the published aerial render

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ww5MSzHLNRbzu3Hzh5J8zF"
```

---

### Task 6: docs, deploy, live checks, checkpoint evidence — then STOP for the owner

**Files:**
- Modify: `README.md` (layout block line 17–21; commands line 38; URL params line 42; flicker paragraph line 44)
- Modify: `docs/adding-a-project.md` (line 54)
- Create: `docs/checkpoints/b1/{day-desktop,day-phone,dusk-desktop,dusk-phone,mid-phone}.png`

- [ ] **Step 1: README**

In the layout block, change the `viewer/` line to
```
viewer/            index.html, app.js, quality.js, sky.js, style.css  — the Three.js viewer (ES modules from jsDelivr, no build step)
```
and add after the `docs/` line
```
tests/             node --test unit tests for the pure viewer modules (quality.js)
```
Change line 38 to
```
node tools/check.mjs https://walk.csoul.cloud/belvedere/   # live checks: boot, pins, postcards, interactions, tours, per-tier boots + flicker contract + draw budgets, zero errors — must be all green
```
Change the URL-parameters line to
```
Viewer URL parameters: `?project=<base>` (dev only), `autostart=<ms>` (skip the intro, reveal in ms), `light=dusk`, `q=high|mid|low` (quality tier; default: phones and tablets `mid`, everything else `high`; the checks run `low`), `tourSpeed=<n>` (tests), `fx=alpha|nolog|stop|blur` (restore one pre-fix behaviour each, for bisecting flicker on a real phone), and hashes `#h=<hotspotId>`, `#tour=<tourId>`.
```
Append to the flicker paragraph:
```
Quality tiers (arc 2, B1): `mid` (phones) and `low` (checks) keep every one of those fixes; render-quality features land on `high` first. The sky is procedural (three/addons Sky) and is also the environment map that lights the model; `applyLighting(k)` in app.js is the one place day/dusk is defined.
```
Also add `node --test tests/` to the commands block, after the Playwright symlink line.

- [ ] **Step 2: Guide**

`docs/adding-a-project.md` line 54: replace `# must be 12/12` with `# must be all green (the count grows with each arc)`.

- [ ] **Step 3: Deploy and check live**

```bash
cd /root/projects/siteplan-walk && tools/deploy.sh belvedere && node tools/check.mjs https://walk.csoul.cloud/belvedere/
```
Expected: `deployed belvedere -> /root/walk/belvedere (…)`, then `19/19 checks passed` against the live URL.

- [ ] **Step 4: Checkpoint evidence from the live URL**

```bash
cd /root/projects/siteplan-walk && mkdir -p docs/checkpoints/b1 && S=/tmp/claude-0/-root/93ec20f7-fb99-41d6-96a4-b5c71922f589/scratchpad
node tools/shoot.mjs 'https://walk.csoul.cloud/belvedere/?autostart=1200&q=high' $S/b1-live-day
node tools/shoot.mjs 'https://walk.csoul.cloud/belvedere/?autostart=1200&q=high&light=dusk' $S/b1-live-dusk
node tools/shoot.mjs 'https://walk.csoul.cloud/belvedere/?autostart=1200&q=mid' $S/b1-live-mid
cp $S/b1-live-day-desktop.png docs/checkpoints/b1/day-desktop.png; cp $S/b1-live-day-phone.png docs/checkpoints/b1/day-phone.png
cp $S/b1-live-dusk-desktop.png docs/checkpoints/b1/dusk-desktop.png; cp $S/b1-live-dusk-phone.png docs/checkpoints/b1/dusk-phone.png
cp $S/b1-live-mid-phone.png docs/checkpoints/b1/mid-phone.png
```
READ the five PNGs (Read tool) and confirm they show what Task 5 accepted. Send them to the owner with SendUserFile, alongside `projects/belvedere/source/render-exterior-aerial.webp` for comparison.

- [ ] **Step 5: Commit and update memory**

```bash
cd /root/projects/siteplan-walk && git add README.md docs/adding-a-project.md docs/checkpoints/b1 && git commit -q -m "B1: docs (tiers, params, all-green rule) + checkpoint evidence from the live URL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ww5MSzHLNRbzu3Hzh5J8zF"
```
Update `/root/.claude/projects/-root/memory/siteplan-walk-belvedere.md`: B1 DEPLOYED (commit hash), 19 live checks, awaiting the owner's phone gate; next = B2 facades.

- [ ] **Step 6: STOP — owner checkpoint**

Report: what changed, the five screenshots, the check count (19/19 live), the two things only a phone can judge (dusk toggle smoothness during the cached-bake swap, overall smoothness unchanged), and ask for the phone gate. Do not start B2 until the owner approves.

---

## Self-review (done while writing)

- Spec coverage for B1: tiers table (T1, T3), Sky as dome + PMREM with live/cached/none (T2, T3), `applyLighting` as the choke point incl. sky uniforms, sunDir, shadow intensity (T3), dusk sun ≈13° (T3 preset), hemi reduced on mid/high (T1 `hemiScale`), exposure/fog retune (T5), `__walk` additions (T3), `renderer.info` bookkeeping (T3), check.mjs tier boots + shader errors + flicker contract + ceilings (T4), README/guide wording (T6), checkpoint evidence + phone gate (T6). Not in B1 by design: fitted shadow frustum, 4096 map, composer, `?fx=log|noao` (B4); `?fx=alpha` kept working (T3 step 5).
- Placeholders: none; every code step is complete.
- Type consistency: `createSky(renderer, scene, mode)` returns `{ mesh, setParams, environment, intensityScale, mode }` and T3 calls exactly those; `resolveQuality(qParam, coarse)` and `TIERS[...]` fields (`dpr, pmrem, shadowMap, hemiScale, logDepth, alpha`) are the ones T3 reads and T1 tests; `__walk.stats()/quality/plinthTopY/scene/renderer` are what T4 reads.
