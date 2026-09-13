# B5 — AI ground spike (tracer overlay + measured acceptance, ≤2 Nano Banana Pro generations, "Plan / As built (AI)" toggle on pass) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find out — with a measurement, not an opinion — whether an AI "as built" photoreal reinterpretation of the published master plan can sit under the 3D model without lying about where anything is. Two generations at most. Pass → a "Plan / As built (AI)" toggle (plan default, labelled indicative). Fail → recorded in PROVENANCE and dropped, nothing shipped to the viewer.

**Architecture:** `tools/trace.html` gains a second image layer (`img2`) with an alpha slider, a blink key, URL params and a `__tracer.measureOverlay()` that samples every traced edge (boundary, volumes, court rects, rink/pool circles) and reports the offset of the strongest luminance edge in the overlay within ±12 px — median per edge, worst, count over 6 px. The metric is validated on the plan itself (≈0) and on a copy shifted by 10 px (≈10) before any AI image is judged. The generation is the ground **crop** at 3:4 (the plan's crop is 620×828 = 0.749), referenced from the live `plan.jpg` and the developer's aerial render. On pass, `make-ground.mjs` gets a `full` mode (the image already is the crop), `site.plan.groundAlt` drives a toggle button + an "indicative" note, and check.mjs proves the swap.

**Tech Stack:** Higgsfield MCP (`media_import_url`, `generate_image` with `nano_banana_pro`, `jobs_wait`/`job_status`), Playwright (tracer shots + measurement), Three.js texture swap.

**Spec:** `docs/superpowers/specs/2026-09-12-siteplan-arc2-render-media-design.md` §"B5 — AI ground spike", ruling 11 (≤2 generations, 6 px @1200 acceptance, toggle with plan default), the "Out of reach" honesty list. Owner rule for any generation: name the model, its capability, the resources and the prompt first ([[feedback-video-generation-model-card]]) — the card is in Task 2 and this plan's approval is its approval; it is restated in one line before the call.

## Context

B1–B4 are merged (`e751c3c`) and live. The ground is the developer's own plan drawing (AI-upscaled), which reads as a *drawing* under a stylised model — the last remaining "picture" element. The spec's question is whether a photoreal top-down reinterpretation can replace it **without moving anything**: the pins, the 3D footprints, the tours and the captions all assume the plan's geometry, so an AI ground that shifts a court by 3 m would put pin 10 on grass. Hence the hard acceptance: every traced edge within 6 px at 1200 width (≈2 m), no digits/arrow, nothing invented (the owner's standing rule: no swimming pool at grade — the blue shapes are a skating rink, the stepped-well pool and a splash pad).

**Verified before planning (2026-09-13):** `nano_banana_pro` = Google Nano Banana Pro ("ultimate quality, text and diagrams"), image-to-image with multiple `image_references`, resolutions 1k/2k/4k, aspect ratios incl. **3:4** — the plan crop is 3:4 within 0.2 %, so the generation can be the ground crop itself (no legend, no margins, 1:1 with `plan.jpg`). Both references are served live (`plan.jpg` 507 KB, `postcards/dev-render-exterior-aerial.webp` 112 KB) for `media_import_url`. Balance: 5,914 credits.

**Honest expectation:** image-to-image models "beautify" — they redraw paths, merge tree clusters and add pools. A strict 6 px pass is *unlikely*; the spike exists to settle it with a number instead of a debate. Both outcomes are planned and both are cheap (≤2 generations).

## Global Constraints

- ≤2 generations, `count: 1` each, credits preflighted with `get_cost: true` before the first real call; no batch, no upscales, no video.
- Nothing invented: the prompt forbids additions; the acceptance rejects them; the label says "AI reinterpretation of the published plan · indicative"; the plan stays the default ground; sampling (`plan.sampleImage`) and the baked AO keep reading the plan.
- The tracer is a dev tool (not deployed); the viewer change (Task 3) lands only on PASS.
- `window.__walk` / `window.__tracer` are the verification contracts; check.mjs runs ALONE in the background (≈12 min, 1500 s budget); screenshots and AI outputs are read as images; on the software renderer always pass `q=` in viewer shot URLs.
- Commit locally after each task (no remote); attribution trailers on every commit; branch `arc2-b5` off master; merge only after the owner's verdict.

## File structure

| File | Responsibility |
|---|---|
| `tools/trace.html` (modify) | `img2` layer: URL input, alpha range, `?img2=&img2alpha=&img2fit=frame|crop&img2dx=&img2dy=`, key `o` blink, `__tracer.setOverlay({src, alpha, fit, dx, dy})`, `__tracer.measureOverlay({band, step})`. |
| `tools/make-ground.mjs` (modify) | 5th arg `crop` (default) / `full` — `full` scales the whole source to ≤maxDim without cropping (the AI image already is the crop). |
| `projects/belvedere/source/ai-ground-log.json` (new) | per attempt: model, settings, references, prompt (verbatim), job id, cost, measurement summary, verdict. |
| `projects/belvedere/source/PROVENANCE.md` (modify) | spike outcome line(s). |
| `docs/checkpoints/b5/` (new) | tracer blink shots + measurement JSON per attempt; viewer shots on pass. |
| **PASS only:** `projects/belvedere/plan-photo.jpg` (new), `projects/belvedere/site.json` (`plan.groundAlt`), `viewer/index.html` (`#btnGround`, `#groundNote`), `viewer/style.css`, `viewer/app.js` (`setGround`, `?ground=`), `tools/check.mjs` (toggle check), `README.md`, `docs/adding-a-project.md` | the "Plan / As built (AI)" toggle. |
| `docs/superpowers/plans/2026-09-13-b5-ai-ground-spike.md` (new) | this plan, committed. |
| `tools/_b5-tracer-shots.mjs`, `tools/_b5-measure.mjs` (new, gitignored) | tracer screenshots + measurement runs. |

---

### Task 0: branch + plan file

- [ ] `git switch -c arc2-b5`; copy this plan to `docs/superpowers/plans/2026-09-13-b5-ai-ground-spike.md`; commit "B5 implementation plan (AI ground spike): measured 6 px acceptance in the tracer, ≤2 generations, toggle on pass". `mkdir -p docs/checkpoints/b5`.

---

### Task 1: tracer overlay + measured acceptance, validated on known inputs

**Files:** Modify `tools/trace.html`.

**Interfaces (produced):**
- `__tracer.setOverlay({ src, alpha = 0.5, fit = 'frame', dx = 0, dy = 0 })` → Promise (loads `src`, redraws). `fit: 'frame'` stretches to the full plan (`0,0,plan.width,plan.height`); `fit: 'crop'` stretches to `state.plan.crop`; `dx/dy` shift the drawn rect (plan px) — for the control measurement.
- `__tracer.overlay` → `{ src, alpha, fit, dx, dy, loaded }`.
- `__tracer.measureOverlay({ band = 12, step = 4 })` → `{ edges: [{ kind, id, i, n, median, mad }], count, over6, worst, byKind: { boundary, volume, court, circle } }` — offsets in plan px along each edge's normal; `median` signed, `worst` = max |median|, `over6` = edges with |median| > 6. Uses an offscreen canvas at `state.plan.width × height`, luminance `0.299R+0.587G+0.114B`, nearest-pixel sampling, gradient `|L(t+1) − L(t−1)|` for t ∈ [−band+1, band−1], argmax → t*. Polygons: boundary, every volume, feature polygons; rects: court/portal `rect` edges; circles: `steppedWell`/`splash`/`plazaDisc` (radial normal, samples every `step` px of arc); ellipses skipped.
- Key `o`: blink — toggles the overlay between alpha 0 and the slider value.

- [ ] **Step 1: toolbar** — after the `…or pick files` label in `<aside>` add
```html
  <h2>Overlay <span class="muted">(<kbd>o</kbd> blinks)</span></h2>
  <label>Second image URL <input type="text" id="img2Url" placeholder="../projects/x/source/ai-ground-1.png"></label>
  <div class="row"><label>Fit <select id="img2Fit"><option value="frame">plan frame</option><option value="crop">plan crop</option></select></label><button id="btnImg2">Load overlay</button></div>
  <label>Alpha <input type="range" id="img2Alpha" min="0" max="1" step="0.05" value="0.5"></label>
  <div class="muted" id="img2Info">no overlay</div>
```
- [ ] **Step 2: state + draw** — next to `let img = null, …` add `let img2 = null; const overlay = { src: '', alpha: 0.5, fit: 'frame', dx: 0, dy: 0, loaded: false, blink: false };` and a helper
```js
  function overlayRect() { const c = overlay.fit === 'crop' && state.plan.crop ? state.plan.crop : { x: 0, y: 0, w: state.plan.width || (img && img.width) || 0, h: state.plan.height || (img && img.height) || 0 }; return { x: c.x + overlay.dx, y: c.y + overlay.dy, w: c.w, h: c.h }; }
```
In `draw()`, right after `ctx.drawImage(img, 0, 0);` add
```js
    if (img2 && overlay.loaded) { const r = overlayRect(), a = overlay.blink ? 0 : overlay.alpha; if (a > 0) { ctx.save(); ctx.globalAlpha = a; ctx.drawImage(img2, r.x, r.y, r.w, r.h); ctx.restore(); } }
```
- [ ] **Step 3: loading, params, blink, API** — in the loading section add
```js
  async function setOverlay(o = {}) {
    Object.assign(overlay, o); if (overlay.src) { img2 = await loadImage(overlay.src); overlay.loaded = true; } else { img2 = null; overlay.loaded = false; }
    $('#img2Url').value = overlay.src; $('#img2Alpha').value = overlay.alpha; $('#img2Fit').value = overlay.fit;
    $('#img2Info').textContent = overlay.loaded ? `${img2.width}×${img2.height} → ${overlay.fit}${overlay.dx || overlay.dy ? ` +(${overlay.dx},${overlay.dy})` : ''}` : 'no overlay'; draw();
  }
  $('#btnImg2').onclick = () => setOverlay({ src: $('#img2Url').value.trim(), fit: $('#img2Fit').value }).catch(e => alert('Overlay failed: ' + e.message));
  $('#img2Alpha').oninput = e => { overlay.alpha = +e.target.value; draw(); };
  $('#img2Fit').onchange = e => { overlay.fit = e.target.value; draw(); };
```
In the `keydown` handler add `if (e.key === 'o') { overlay.blink = !overlay.blink; draw(); }` (before the mode map line). After the `?img`/`?json` handling add
```js
  if (q.get('img2')) setOverlay({ src: q.get('img2'), alpha: +(q.get('img2alpha') || 0.5), fit: q.get('img2fit') || 'frame', dx: +(q.get('img2dx') || 0), dy: +(q.get('img2dy') || 0) }).catch(e => alert('Overlay failed: ' + e.message));
```
and extend `window.__tracer` with `setOverlay, get overlay() { return { ...overlay }; }, measureOverlay`.
- [ ] **Step 4: measurement** — before `window.__tracer = …` add
```js
  // ---------- overlay measurement: where is the strongest luminance edge of the overlay, along the normal of every traced edge? ----------
  function measureOverlay({ band = 12, step = 4 } = {}) {
    if (!img2 || !overlay.loaded) throw new Error('no overlay loaded');
    const W = state.plan.width, H = state.plan.height, r = overlayRect();
    const oc = document.createElement('canvas'); oc.width = W; oc.height = H; const g = oc.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.drawImage(img2, r.x, r.y, r.w, r.h);
    const d = g.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const lum = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi < 0 || yi < 0 || xi >= W || yi >= H ? 0 : L[yi * W + xi]; };
    const median = a => { const s = [...a].sort((p, q) => p - q); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
    const bestT = (px, py, nx, ny) => { let best = 0, bt = 0; for (let t = -band + 1; t <= band - 1; t++) { const gr = Math.abs(lum(px + nx * (t + 1), py + ny * (t + 1)) - lum(px + nx * (t - 1), py + ny * (t - 1))); if (gr > best) { best = gr; bt = t; } } return bt; };
    const edges = [];
    const segment = (kind, id, i, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); if (len < 8) return; const nx = -dy / len, ny = dx / len, ts = [];
      for (let s = 3; s <= len - 3; s += step) { const u = s / len; ts.push(bestT(a[0] + dx * u, a[1] + dy * u, nx, ny)); }
      const m = median(ts); edges.push({ kind, id, i, n: ts.length, median: m, mad: median(ts.map(t => Math.abs(t - m))) }); };
    const polygon = (kind, id, pts) => pts.forEach((p, i) => segment(kind, id, i, p, pts[(i + 1) % pts.length]));
    const circle = (kind, id, cx, cy, rad) => { const ts = [], n = Math.max(12, Math.round(2 * Math.PI * rad / step)); for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, nx = Math.cos(a), ny = Math.sin(a); ts.push(bestT(cx + nx * rad, cy + ny * rad, nx, ny)); } const m = median(ts); edges.push({ kind, id, i: 0, n, median: m, mad: median(ts.map(t => Math.abs(t - m))) }); };
    if (state.boundary.length) polygon('boundary', 'boundary', state.boundary);
    state.volumes.forEach(v => polygon('volume', v.id, v.polygon));
    state.features.forEach(f => { if (f.rect) { const [x0, y0, x1, y1] = f.rect; polygon('court', f.id, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); } else if (f.circle) circle('circle', f.id, f.circle.cx, f.circle.cy, f.circle.r); else if (f.polygon) polygon('feature', f.id, f.polygon); });
    const byKind = {}; for (const e of edges) { const k = byKind[e.kind] || (byKind[e.kind] = { n: 0, over6: 0, worst: 0 }); k.n++; if (Math.abs(e.median) > 6) k.over6++; k.worst = Math.max(k.worst, Math.abs(e.median)); }
    return { edges, count: edges.length, over6: edges.filter(e => Math.abs(e.median) > 6).length, worst: Math.max(0, ...edges.map(e => Math.abs(e.median))), byKind, band, step, rect: r };
  }
```
- [ ] **Step 5: validate the metric on known inputs** — start the dev server (`setsid nohup python3 -m http.server 8765 --directory /root/projects/siteplan-walk >/dev/null 2>&1 &`, confirm with `ss -ltn | grep ':8765 '`). `tools/_b5-measure.mjs` (gitignored): boots `http://127.0.0.1:8765/tools/trace.html?json=../projects/belvedere/site.json` at 1400×1000, waits for `window.__tracer.state.volumes.length > 0` and the image, then for each case calls `setOverlay` and `measureOverlay()` and prints the summary; writes the JSON to the path given:
  (a) **self**: `{ src: '../projects/belvedere/plan.jpg', fit: 'crop' }` → expect `worst ≤ 3`, `over6 === 0` (the polygons were traced on this very image);
  (b) **shifted control**: `{ src: '../projects/belvedere/plan.jpg', fit: 'crop', dx: 10 }` → expect most vertical-ish edges at |median| ≈ 10 and `over6 ≥ 0.5 × count` (horizontal edges see no shift along their normal — that is correct, not a flaw);
  (c) **shifted control y**: `dy: 10` → the complementary set.
  If (a) shows edges > 3 px, inspect which (an edge lying on a weak plan line is a known limitation — record it, exclude nothing silently). Save `docs/checkpoints/b5/measure-self.json` and `measure-shift.json`.
- [ ] **Step 6: blink shots** — `tools/_b5-tracer-shots.mjs` (gitignored): boots the tracer with `?json=…&img2=<src>&img2fit=crop`, calls `__tracer.fit()`, then shoots alpha 0 / 1 / 0.5 (`setOverlay({ alpha })`) at the full view and zoomed on the tennis court (`__tracer.setView({ s: 3, tx: -700, ty: -1500 })` — tune once so court 10 fills the frame) → `docs/checkpoints/b5/tracer-<tag>-{full,tennis}-{plan,ai,blend}.png`. Run it for the self case (`tag=self`) to prove the shots work; read one.
- [ ] **Step 7: commit** — `tools/trace.html` + `docs/checkpoints/b5/measure-*.json` + the self shots — "B5: tracer overlay (img2, alpha, blink, ?img2=) + measured edge-offset acceptance, validated on the plan itself (≈0) and a 10 px shifted copy (≈10)".

---

### Task 2: the spike — model card, preflight, ≤2 generations, measured verdict

**Files:** Create `projects/belvedere/source/ai-ground-log.json`, `docs/checkpoints/b5/{ai-ground-1.png, measure-attempt1.json, tracer-a1-*.png}` (+ `-2` on a second attempt); modify `projects/belvedere/source/PROVENANCE.md`.

**Model card (the owner's rule — this section is the disclosure; restate it in one line before the call):**
- **Model:** `nano_banana_pro` — Google Nano Banana Pro ("ultimate quality, text and diagrams"; served as `nano_banana_2` on 2026-09-12). Settings: `aspect_ratio: '3:4'`, `resolution: '2k'` (≈1536×2048, the same size as `plan.jpg`), `count: 1`.
- **Capability:** image-to-image with several `image_references`; strong at diagrams and layout preservation, photoreal materials; **cannot guarantee geometry** — it may redraw paths, merge tree clusters, invent pools, keep or hallucinate digits; no negative-prompt field (the avoid-list lives in the prompt). That is exactly what the measurement tests.
- **Resources:** two references via `media_import_url`: `https://walk.csoul.cloud/belvedere/plan.jpg` (the 4K-upscaled plan crop — the geometry) and `https://walk.csoul.cloud/belvedere/postcards/dev-render-exterior-aerial.webp` (the developer's aerial render — the material language). Credits: preflight with `get_cost: true`; expected single digits per generation (the 3:2 1k pairs cost 2); ceiling for the whole spike ≤ 20 credits. Attempt 2 (only if attempt 1 fails on geometry but is within ~20 px): the plan reference ONLY, materials described in words — the aerial render pulls the composition toward perspective.
- **Prompt (verbatim, attempt 1):**
  > Photorealistic nadir aerial photograph, straight down, orthographic, no perspective and no tilt, of this residential master plan exactly as built. Same framing, scale and orientation as the first reference image, edge to edge. Reproduce every building footprint, road, path, court, rink, plaza, lawn and tree cluster exactly where it is and exactly as large as it is in the plan. The two tall towers and the low clubhouse have flat roofs seen from above; the three areas marked as future development are flat, graded, empty plots with no buildings. The blue shapes are a skating rink, a small stepped-well pool and a children's splash pad, not swimming pools. Materials and colours as in the second reference: cream stone towers, brick-paved paths, tropical planting, blue tennis and basketball courts. Remove every number, label, legend, north arrow and piece of text. Add nothing that is not in the plan: no extra pools, buildings, cars or people. Soft midday sun, faint shadows, even exposure.
- **Prompt (attempt 2, if needed):** the same with the second sentence replaced by "Treat the reference as a map to be textured, not redesigned: keep every line exactly where it is." and the materials sentence unchanged but with no second reference attached.

- [ ] **Step 1: references + preflight** — `media_import_url` × 2 (type `image`) → `media_ids`; `generate_image` with the card's params and `get_cost: true` → record the credits. If the cost exceeds 20 credits, STOP and ask.
- [ ] **Step 2: generation 1** — one line restating model/settings/refs/prompt, then `generate_image` (no `get_cost`). Wait (`jobs_wait`/`job_status`), fetch the result URL, `curl` it to `projects/belvedere/source/ai-ground-1.png` (gitignored? No — commit it under `docs/checkpoints/b5/ai-ground-1.png` (≈2–4 MB) and keep `source/` copy untracked). Read the PNG: digits/labels/arrow present? towers/clubhouse/courts/rink where expected? anything invented (pool at grade, extra buildings)? Note the visual verdict.
- [ ] **Step 3: measure** — `node tools/_b5-measure.mjs` with `{ src: '../projects/belvedere/source/ai-ground-1.png', fit: 'crop' }` → `docs/checkpoints/b5/measure-attempt1.json`; blink shots `tag=a1` (full + tennis, plan/ai/blend). Read the blend shots. Verdict rule (spec): PASS = `over6 === 0` across boundary + volumes + courts + circles AND no digits/arrow AND nothing invented. Anything else = FAIL, with the numbers.
- [ ] **Step 4: attempt 2 (only on a near miss)** — if attempt 1 fails with `worst ≤ 20 px` and no invented elements, run the attempt-2 prompt/refs, download as `ai-ground-2.png`, measure (`measure-attempt2.json`, `tag=a2`), verdict. If attempt 1 is a gross miss (worst > 20 px, invented pools, digits), do not spend the second generation — record why.
- [ ] **Step 5: log + provenance + commit** — `projects/belvedere/source/ai-ground-log.json`: `[{ attempt, date, model, settings, references, prompt, jobId, credits, visual: {digits, arrow, invented, notes}, measure: {count, over6, worst, byKind}, verdict }]`. PROVENANCE.md append: "AI ground spike (2026-09-13, arc 2 B5): N generation(s) of a photoreal top-down 'as built' from the plan crop with Nano Banana Pro; measured against the traced polygons in tools/trace.html — worst edge offset X px, Y of Z edges over 6 px → PASSED/FAILED; [shipped as an opt-in 'As built (AI)' ground, plan default | dropped]. Log: source/ai-ground-log.json." Commit "B5 spike: attempt 1 [and 2] — measured, verdict …" with the checkpoint PNG/JSONs. **Then follow Task 3A on PASS or Task 3B on FAIL.**

---

### Task 3A (PASS only): `plan-photo.jpg` + "Plan / As built (AI)" toggle

**Files:** Modify `tools/make-ground.mjs`, `projects/belvedere/site.json`, `viewer/index.html`, `viewer/style.css`, `viewer/app.js`, `tools/check.mjs`, `README.md`, `docs/adding-a-project.md`; create `projects/belvedere/plan-photo.jpg`, `docs/checkpoints/b5/after-*.png`.

- [ ] **Step 1: make-ground `full` mode** — change the usage line to `// usage: … <src image> <site.json> <out.jpg> [maxDim=2048] [crop|full]   (full: the source already is the crop — scale only)`, read `const mode = process.argv[6] || 'crop';`, and compute `const sx = mode === 'full' ? 0 : c.x * k, sy = mode === 'full' ? 0 : c.y * k, sw = mode === 'full' ? info.w : c.w * k, sh = mode === 'full' ? info.h : c.h * k;` in place of the current four assignments. Run `node tools/make-ground.mjs projects/belvedere/source/ai-ground-<n>.png projects/belvedere/site.json projects/belvedere/plan-photo.jpg 2048 full` → 1536×2048-ish JPEG, quality 88.
- [ ] **Step 2: site.json** — in `plan` add `"groundAlt": { "file": "plan-photo.jpg", "label": "As built (AI)", "note": "AI reinterpretation of the published plan · indicative" }`.
- [ ] **Step 3: markup + style** — `viewer/index.html`: before `#btnLight` add `<button class="btn" id="btnGround" title="Toggle the ground: published plan / AI reinterpretation" aria-pressed="false" hidden>As built (AI)</button>`; after the `#titleChip` div add `<div class="chip note" id="groundNote" hidden>AI reinterpretation of the published plan · indicative</div>`. `viewer/style.css`: `.chip.note { font-weight: 500; color: var(--muted, #6b655c); font-size: 12px; }` and in the phone media block `.chip.note { display: none; }` is NOT acceptable (the label must show on phones) — instead `#topbar .chip.note { max-width: 46vw; white-space: normal; line-height: 1.2; }`.
- [ ] **Step 4: app.js** — after the ground block (after `world.add(ground); }`) add
```js
// ---- alternative ground (B5): an AI reinterpretation of the plan, opt-in, labelled; the plan stays the default and keeps feeding the sampler and the AO map ----
let altTex = null, groundMode = 'plan';
const btnGround = $('#btnGround'), groundNote = $('#groundNote');
async function setGround(mode) {
  if (!site.plan.groundAlt) return;
  if (mode === 'ai' && !altTex) { altTex = await texLoader.loadAsync(BASE + site.plan.groundAlt.file); altTex.colorSpace = THREE.SRGBColorSpace; altTex.anisotropy = groundTex.anisotropy; }
  groundMode = mode; groundMat.map = mode === 'ai' ? altTex : groundTex; groundMat.needsUpdate = true;
  btnGround.textContent = mode === 'ai' ? 'Plan' : site.plan.groundAlt.label; btnGround.setAttribute('aria-pressed', String(mode === 'ai')); groundNote.hidden = mode !== 'ai'; markDirty();
}
if (site.plan.groundAlt) { btnGround.hidden = false; groundNote.textContent = site.plan.groundAlt.note; btnGround.addEventListener('click', () => setGround(groundMode === 'ai' ? 'plan' : 'ai')); }
```
where `markDirty` is a tiny hoisted function declared next to the loop state: change `let lastT = performance.now(), dirty = true, …` to be followed by `function markDirty() { dirty = true; }` (function declarations hoist; the `let` is initialised by the time any click or boot call runs). After the loop state declarations add `if (site.plan.groundAlt && q.get('ground') === 'ai') setGround('ai');`. Add `setGround, get ground() { return groundMode; }, groundMat` to `__walk`.
- [ ] **Step 5: check** — after the greenery/ground-AO checks add
```js
  const gAlt = await p.evaluate(async () => { const w = window.__walk; if (!w.site.plan.groundAlt) return { skipped: true }; const before = w.ground; await w.setGround('ai'); const aiSrc = w.groundMat.map.image && w.groundMat.map.image.src; const shown = !document.getElementById('groundNote').hidden; await w.setGround('plan'); return { before, aiSrc, shown, after: w.ground, planSrc: w.groundMat.map.image && w.groundMat.map.image.src }; });
  ok('ground toggle: plan by default, "As built (AI)" swaps the map to plan-photo.jpg and shows the indicative note', gAlt.skipped || (gAlt.before === 'plan' && /plan-photo\.jpg$/.test(gAlt.aiSrc || '') && gAlt.shown && gAlt.after === 'plan' && /plan\.jpg$/.test(gAlt.planSrc || '')), JSON.stringify(gAlt));
```
(`groundMat` is added to `__walk` in step 4). Mutation: make `setGround` ignore `mode` (`groundMode = 'plan'` always, no map swap) → the check fails; restore. Run ALONE in the background → 25/25.
- [ ] **Step 6: docs** — README honesty list: "The optional 'As built (AI)' ground is an AI reinterpretation of the published plan, generated once and measured against the traced plan (every edge within 6 px); it is labelled on screen and never the default." README params: `ground=ai`. Guide §3: `groundAlt` + the spike procedure (tracer `?img2=`, `measureOverlay`, the 6 px rule) and `make-ground.mjs … full`. Commit.
- [ ] **Step 7: deploy + evidence + STOP** — `tools/deploy.sh belvedere`; live check (background) → 25/25; shots (explicit `q=high`): overview plan vs `?ground=ai`, `#h=tennis-court` with `?ground=ai`, phone `q=mid&ground=ai` → `docs/checkpoints/b5/after-*.png`; read them; commit; memory; send the owner the plan/AI pair + the blink shots + the numbers; ask the gate: "Does the AI ground look honest next to the plan, and does the label read clearly on the phone?"

### Task 3B (FAIL only): record and close

- [ ] README "What it is, honestly" add: "An AI photoreal ground was tried (Nano Banana Pro, N generations, 2026-09-13) and rejected: the best attempt moved edges by up to X px (limit 6 px at 1200 wide) [and invented …]. The plan stays the ground." Guide: a short "AI ground: how to re-test" paragraph pointing at the tracer's `?img2=` and `measureOverlay`. Commit "B5: AI ground spike FAILED — measured, recorded, dropped". Memory; send the owner the blink shots + numbers; STOP (nothing to deploy; the branch merges after the owner reads the outcome).

## Verification (end to end)

1. Tracer metric validated: self overlay `worst ≤ 3`, `over6 = 0`; 10 px shift → `over6 ≥ 50 %` of edges; JSON + blink PNGs in `docs/checkpoints/b5/`.
2. Every generation preceded by the model card; cost preflighted; ≤2 generations; outputs read as images; measurement JSON per attempt.
3. Verdict by the spec's rule, written to `ai-ground-log.json` + PROVENANCE.
4. PASS branch: unit tests unchanged, dev check 25/25 (toggle check mutation-proved), live 25/25, shots read, owner gate. FAIL branch: docs + memory, owner informed.

## Self-review

- **Spec §B5 coverage:** tracer `img2`, `overlayAlpha`, URL input + range, `?img2=`, `__tracer.setOverlay`, key `o` blink, drawn after the plan (T1); ≤2 generations, Nano Banana Pro, references = the plan (≤2048: `plan.jpg` is the 4K crop at 2048) + the aerial render, the spec's prompt intent (T2 card); acceptance at 1200 width vs traced polygons within 6 px, no digits/arrow, nothing invented (T1 `measureOverlay` + T2 visual); pass → `plan-photo.jpg` via `make-ground.mjs`, toggle "Plan / As built (AI)" beside Day/Dusk, plan default, intro/label text (T3A); fail twice → PROVENANCE note, dropped (T3B); checkpoint = tracer blink shots with edge offsets, go/no-go recorded (T2). Deviation, stated: the generation is the 3:4 ground **crop**, not the full 1200×848 sheet — same acceptance (measured in plan px through the crop rect), cleaner input (no legend), and the result is the ground texture directly.
- **Placeholders:** none; the prompt is verbatim; the measurement code is complete.
- **Type consistency:** `measureOverlay` returns `{ edges, count, over6, worst, byKind, band, step, rect }` and T2 reads `over6/worst/byKind`; `setOverlay({src, alpha, fit, dx, dy})` is what `_b5-measure.mjs`/`_b5-tracer-shots.mjs` call; `site.plan.groundAlt.{file,label,note}` is what app.js and check.mjs read; `__walk.setGround/ground` is what the check uses.
