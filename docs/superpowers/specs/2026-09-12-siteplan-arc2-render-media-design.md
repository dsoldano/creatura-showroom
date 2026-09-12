# Site-plan walkthrough — arc 2: render quality (Phase B) and media/hotspot experience (Phase C)

Date: 2026-09-12. Status: APPROVED (owner, section by section, 14 rulings below). Supersedes nothing: extends the delivered `2026-09-12-siteplan-walkthrough-design.md`. Live `https://walk.csoul.cloud/belvedere/`. Ten sub-phases shipped one at a time; each ends with screenshots the owner can see, `tools/check.mjs` green on the live URL, and the owner's phone as the final gate.

## Context

The Belvedere demo (Three.js r170 fly-over, 44 hotspots, postcards, 3 tours) is live and phone-verified. The owner wants it to look much closer to Brigade's own renders while staying an honest model, and wants each place to carry video (developer clips, official embeds, AI loops), a swipeable gallery with fullscreen, and a "peek" mode that circles the place while its media plays. Carried rules: nothing invented beyond the plan legend and public facts; every image/video labelled by kind; no compass words in captions; project-agnostic (`docs/adding-a-project.md` must still hold: new project = new folder, no viewer change); phone performance is a gate; keep the mobile-flicker fixes (opaque canvas, log depth on phones, plinth cap gap −0.3, no backdrop-filter on phones, idle loop ≈11 fps never stopped).

**Owner rule (2026-09-12):** any video generation must first name the model, its capability, the resources we provide, and how the prompt is crafted (§C2 below).

## Rulings (owner, 2026-09-12)

1. Quality **tiered by device**: high (desktop) / mid (phone, coarse pointer) / low (check.mjs); `?q=` overrides.
2. Target look = **stylised render** (cream fins + balcony bands, dark sky-catching glazing, real greenery colours, sky in water, soft sun + sky shadows, hazy horizon). Clearly not a photo; labels remain.
3. Belvedere video sources = **official YouTube only**: local-clip path built + documented but empty for Belvedere; Brigade's model-flat video `MNK81dwrJp4` (channel @BrigadeGroupOfficial) embedded at `tower-a-info` and `tower-b-info`, labelled "Developer video · YouTube", loaded on tap only; no broker videos.
4. Hero order = **provenance first**: developer video > developer render > official embed > AI loop > AI still > plan detail; video before still within a tier.
5. Peek phone layout = **P1** mini-player inside the existing 204 px collapsed sheet.
6. AI loops = **Kling 3.0 pro**, silent, 5 s, 16:9, start_image = end_image = the postcard; pilot 2 then batch 12 × 2 candidates; ceiling ≈270 credits (of 5,914).
7. Facades = **hybrid**: instanced geometry (fins, piers, slab rings, crown) + one glazing shader on an inset core; ghosts get a faint fin rhythm.
8. Sky/IBL = **procedural `objects/Sky.js`** as dome and PMREM environment; dusk sun lowered to ≈13°.
9. AO/shadows = **desktop AO pass (GTAO, log depth OFF on high only), phones baked**; ground AO map + fitted shadow frustum on all tiers.
10. Greenery = **procedural** lobed trees, hedge split, lawn mask, animated water normals.
11. Ground spike = **≤2 generations**, tracer overlay acceptance (6 px @1200), pass → **"Plan / As built (AI)" toggle with plan default**.
12. B order = B1 sky → B2 facades → B3 greenery → B4 shadows/AO → B5 spike.
13. C §1 approved; **muted autoplay with a gate**.
14. C §2 approved; peek **circles until stopped, 3-turn cap**.

## Phase B design

Baseline (measured live at `q=low`, overview): 55 draw calls, 56k tris, 474 trees, 16 programs. Triangles are not the phone constraint; fill rate, shadow pass and DPR are.

### Tiers (`viewer/quality.js`)
`QUALITY = ?q in {high,mid,low} ? q : (COARSE ? 'mid' : 'high')`.

| | high | mid | low |
|---|---|---|---|
| log depth | OFF (near 3) unless `?fx=log` | on | on |
| DPR cap | 1.5 | 1.35 | 1 |
| composer / GTAO / MSAA RT | yes / yes / 4 | no | no |
| Sky + PMREM | live re-bake during transition | 2 cached bakes, cross-fade | Sky only, hemi 1.05 |
| shadow map / fitted frustum | 4096 / yes | 2048 / yes | 1024 / yes |
| fins+rings cast shadows | yes | no | no |
| ground AO map | yes | yes | yes |
| tree detail / variants | 1 / 3 | 0 / 3 | 0 / 1 |
| hedge spacing | 1.0 m | 1.5 m | 1.5 m |
| lawn mask / water normals | yes / yes | yes / yes | no / no |
| check.mjs ceilings (calls / tris) | 180 / 600k | 100 / 250k | 80 / 150k |

`__walk` gains `quality, tier, stats(), hedgeCount, PRESETS, autoTier, plinthTopY`. `renderer.info.autoReset=false` + manual reset per frame. Flags stay: `?fx=alpha|nolog|stop|blur` + new `log`, `noao`.

### B1 — sky + IBL (`viewer/sky.js`, `applyLighting` in app.js)
- `Sky` mesh replaces the vertex dome (renderOrder −10, depthWrite false, frustumCulled false, `userData.noAO`); `#sky` CSS layer kept for `?fx=alpha`. `scene.background` stays null.
- `PMREMGenerator.fromScene(skyScene)` replaces `RoomEnvironment` (`app.js:40`); generator kept alive on high; mid bakes day+dusk at load and swaps at k=0.5 with an `environmentIntensity` dip; low none.
- Presets (`app.js:80-83`) gain `sky:{turbidity, rayleigh, mie, g}` (start day `{6,1.6,0.008,0.85}`, dusk `{9,2.4,0.012,0.9}`), `sunDir` (dusk elevation ≈13°), `shadowIntensity` (0.85/0.6), fog colours matched to the tone-mapped horizon by eye; exposure retuned (~0.6/0.5) with sun intensity raised; hemi ≈0.3 on mid/high. `applyLighting(k)` remains the single choke point and now also sets Sky uniforms + `sunPosition`.
- Tune live via `__walk.PRESETS` against `source/render-exterior-aerial.webp`.

### B2 — facades (`viewer/facade.js`, volumes loop `app.js:186-194`, replaces `bandedMaterial` `app.js:113-136`)
- `site.facades` block (defaults in code; no block = today's banded look):
  `tower: {style:'fins', bayM:3.7, finW:0.4, finGap:0.5, recess:0.5, slabH:0.45, crownH:4.5, baseH, fin, band, glass, source:'rhythm read from the published render, not from drawings'}`, `clubhouse: {style:'stoneGlass', bayM:6, …}`, `future: {style:'ghost', rhythm:'faint'}`. Resolution: `volume.facade` → `site.facades[kind]` → `FACADE_DEFAULTS[kind]`.
- Geometry per tower from the traced polygon: miter-inset core (glazing shader) at `recess`; edge walk → `bays = round(L/bayM)`, two fins per bay, one shared `InstancedMesh(BoxGeometry)`; first/last fin per edge + 4 corner piers rise `crownH` (stepped crown); per-floor slab rings = `ExtrudeGeometry(shape − inset)` instanced × floors from `baseH`; parapet ring. ≈2.5k tris, 4 calls per tower on all tiers. Drop `EdgesGeometry` for `fins` style. Occlusion raycast keeps using the core meshes.
- Shader (world-space, injected after `color_fragment`, `roughnessmap_fragment`, `metalnessmap_fragment`, `emissivemap_fragment`): tangent from `cross(up, N)`, `u = dot(vWp, T)`, fin/bay/slab/podium masks → `glazing`; glass colour with recess AO + ledge shadow; `roughness→0.16`, `metalness→0.55` on glazing (dark glass reflecting the sky PMREM); dusk glow hash masked by `glazing`; `bandedShaders` push pattern kept for `uDusk`.
- Ghosts: `matGhost` opacity `mix(0.22, 0.34, finMask)`, no shadows. Clubhouse `stoneGlass`: `uFins=0`, wide bays, stone podium.
- Belvedere `site.json` gets the block; `docs/adding-a-project.md` gets the facade schema + the "read from the render" wording; intro limits line updated.

### B3 — greenery + water (`viewer/greenery.js`, `plantTrees` `app.js:247-281`)
- Trees: 3 canopy variants via `BufferGeometryUtils.mergeGeometries` of offset icosahedrons (detail per tier); 3 InstancedMeshes chosen by the existing `p.c` hash; shader: local-y shade gradient + rim term; trunks unchanged.
- Hedges: on the 640 px sample, `thin = mask AND NOT dilate(erode(mask, ~1.2 m))` → hedge box instances every 1.0/1.5 m (1.1×0.9×1.4 m, yaw from mask gradient, no shadow); trees sample `mask AND NOT thin`. Counts exposed.
- Lawn: mask `g>r+8 && g>b+25 && g>140` → `CanvasTexture`; ground `onBeforeCompile`: 0.5 m hash noise ±5 %, slight green lift, `roughness = mix(0.82,1.0,lawn)`. No normal map (the plan stays a picture).
- Water: 256² procedural normal map (sines + value noise → normals), `RepeatWrapping` (~0.15 m/texel), `normalScale 0.35`, `roughness 0.05`, `ior 1.33`, `opacity 0.92`; offset from the clock; `dirty=true` while water is within 260 m and in frustum.
- `site.plan.sampleImage` (default `plan.jpg`) so sampling never reads an AI ground.

### B4 — shadows + AO (`viewer/post.js`, loop `app.js:483-493`, `resize()` `app.js:471-479`)
- All tiers: fitted shadow frustum (frustum-corner rays ∩ y=0, clamp to site ±40 m, smallest of half-sizes [640,320,160], texel-snapped centre, `sun.target`+`position` composed from `sunDir`); `sun.shadow.intensity` per preset; ground AO map (1024 px canvas over `plan.crop`: volumes alpha 0.55 + 2-pass box blur ~6 m, radial gradients per tree/hedge) as `aoMap` (`aoMapIntensity 0.9`) on the ground material.
- high only: `EffectComposer(renderer, WebGLRenderTarget({type: HalfFloatType, samples: 4}))` → `RenderPass → GTAOPass → OutputPass`; GTAO `{radius 5, distanceExponent 1.5, thickness 3, scale 1.2, samples 12, screenSpaceRadius false}`, denoise `{lumaPhi 10, depthPhi 2, normalPhi 3, radius 6, rings 3, samples 12}`, `blendIntensity 0.75`, `setSceneClipBox` site ±50 m; wrap `overrideVisibility` to hide `userData.noAO` (ghosts, ring, sky); `shadowMap.autoUpdate=false` + `needsUpdate` once per frame; `composer.setSize` in `resize()` (view offset is inside the projection matrix, safe).
- high only: `logarithmicDepthBuffer:false`, `near 3`; coplanar audit: court line plane gets `polygonOffsetUnits:-2`. Phones untouched. `?fx=log` forces log depth on high; `?fx=noao` disables the pass. Optional auto-downgrade to mid if the first 60 frames average >40 ms (`__walk.autoTier`).
- Checkpoint includes a max-radius z-fight scan at day and dusk on desktop.

### B5 — AI ground spike (`tools/trace.html`, `tools/make-ground.mjs`)
- Tracer: `img2`, `overlayAlpha`, URL input + range slider, `?img2=`, `__tracer.setOverlay({src, alpha})`, key `o` blinks 0/1; draw after `ctx.drawImage(img,0,0)` stretched to the plan frame.
- ≤2 generations, Nano Banana Pro, references: `masterplan-4k.png` (≤2048) + `render-exterior-aerial.webp`; prompt: photoreal orthographic top-down "as built", identical framing/orientation, flat roofs only, every footprint/road/path/court/rink/lawn exactly where and how large it is, remove numbers/labels/legend/north arrow, add nothing.
- Acceptance at 1200 width vs traced polygons: every edge within 6 px; no digits/arrow; nothing invented (no pool at grade). Pass → `plan-photo.jpg` via `make-ground.mjs`, toggle "Plan / As built (AI)" beside Day/Dusk (plan default), intro label "AI reinterpretation of the published plan · indicative". Fail twice → `source/PROVENANCE.md` note, dropped.

### Out of reach without the architect's 3D model (state in README/intro/pitch)
Real roof forms and crown detail, the true Bofill facade beyond the rhythm read from one render, terrain/podium levels, basements and ramps as 3D, the elevated jogging track, exact planting, interiors. None is modelled because none can be verified.

## Phase C design

### C1 — data model + tools + gallery
- `postcards/manifest.json` keeps `{images:{<id>:[…]}}`; entries by `kind`:
  `ai|developer|plan` (as today) · `video {file, poster, duration, width, height, loop:false, audio, title, credit}` · `embed {provider:'youtube'|'vimeo', id, poster, title, credit, start}` (no `file`) · `ai-video {file, poster, duration, width, height, loop:true, from, jobId, credit:'AI visualisation via Higgsfield · indicative, not a developer video'}`.
- `site.json`: `developerVideos[] {file, hotspots[], credit, title, poster?, trim?}`, `embeds[] {provider, id, hotspots[], title, credit, start}` (official channel only — documented rule).
- `tools/media-lib.mjs` (shared, not `_`-prefixed): `RANK` (ruling 4), `readManifest`, `mergeOwned(existing, ownedKinds, entries)`, `sortByRank`, `writeManifest`, `ffprobe`, `encodeH264`, `posterFrom`. `make-postcards.mjs` owns `developer|plan`, keeps everything else (replaces the `kind==='ai'`-only preserve at line 10; dedupe embeds by provider+id). `tools/make-videos.mjs` (ffmpeg) owns `video|embed` (transcode dev clips → `dev-<name>.mp4` + poster; embed poster `yt-<id>.jpg` from maxres/hqdefault or Vimeo oEmbed). `tools/import-ai-video.mjs` mirrors `import-ai.mjs` (selection-video.json → `ai-<id>.mp4` + `ai-<id>-poster.jpg` + manifest + `ai-log.json`).
- Viewer: one `renderMedia(entry)` factory (img / video / embed facade) used by the strip and fullscreen; `select()` (`app.js:386-389`) → `gallery.show(h)`; `KIND_LABEL` + `.badge.<kind>` extended (video/embed share developer green, ai-video shares ai orange); hotlist chip maps kinds; strip aspect 16:9 if any video/embed else 3:2; `SHEET_H` read from `--sheet-h` so the two cannot drift.
- Gallery: CSS scroll-snap strip, dots, desktop hover arrows, ←/→, active index via IntersectionObserver.

### C2 — AI loops (owner rule: model / capability / resources / prompt)
- **Model:** `kling3_0`, `mode:'pro'`, `sound:'off'`, `duration:5`, `aspect_ratio:'16:9'`. Runner-up MiniMax H3 (auto aspect, 2K, 10 cr). Rejected: Seedance/FLUX (4–5× cost, no loop advantage), Kling Turbo/Veo 3/Grok (start frame only).
- **Capability:** start+end-frame conditioning → clip returns to frame 0 (seamless loop); animates foliage, water, cloud shadows, small drift; cannot guarantee geometry; no negative-prompt field (avoid-list lives in the prompt).
- **Resources:** `media_import_url` of `https://walk.csoul.cloud/belvedere/postcards/ai-<id>.jpg` → one media_id used twice (`start_image`, `end_image`); no style references. Pilot: `stepped-well-plaza` (water) + `yoga-lawn` (foliage) = 15 cr; batch 12 × 2 via `generate_video_batch` (≤12/call) + `jobs_wait` + one `show_generation_by_ids` = 180 cr; rejects ≤75 cr.
- **Prompt:** base = one continuous locked-off shot, ≤2° drift returning to the start composition, light/exposure unchanged, keep every building/tree/path/line exactly, no new buildings/people/vehicles/text/signs/logos, no water unless visible, seamless loop; + class clause: water / lawn-foliage / plaza-court / portal-arrival (from `ai-log.json` subjects). Stored verbatim in `ai-log.json`.
- **Aspect route:** pilot compares frame 0 vs a centre 16:9 crop of the postcard (`convert … -crop`, `compare -metric RMSE`); clean crop → batch as is; squash → pre-crop postcards to 1024×576 in `postcards/` first.
- **Selection:** 3-frame review strip (0 / 2.5 / 5 s) per candidate; reject: invented elements, tower count change, bent geometry, cuts/zooms, first≠last frame (RMSE threshold from the pilot).
- **Post:** drop the duplicated last frame; optional 0.5 s `xfade` only if RMSE is high; `libx264 -profile high -preset slow -crf 23 -g 48 -movflags +faststart -vf scale=1280:-2,format=yuv420p -an`, ceiling 1.5 MB (CRF 25 if over); poster from frame 0. Dev clips keep AAC 96k, ceiling 6 MB.

### C3 — playback + embeds
- `<video muted playsinline preload="none" poster loop?>`, `src` in `data-src` until active; activation sets src + `play()`; rejection → poster + play button; deactivation `pause(); removeAttribute('src'); load()`; `visibilitychange` pause/resume; single decoder at a time. Autoplay gate (ruling 13): visible tab, no `prefers-reduced-motion`, no `saveData`, no tour. Dev clips get native controls; loops none.
- Embed facade `<button class="embed-facade">` (local poster + play glyph + provider word); on click only → `<iframe src="https://www.youtube-nocookie.com/embed/<id>?autoplay=1&rel=0&modestbranding=1&playsinline=1&start=<s>" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen>` (Vimeo `player.vimeo.com/video/<id>?autoplay=1&dnt=1`). No third-party request before the tap.
- HTML video is DOM-composited, not a WebGL texture: the render loop needs no change for playback. If the phone gate shows heat, slow the ring pulse to ~20 fps while a video plays; drop `border-radius` on the phone video if compositing stutters.

### C4 — fullscreen
Fixed `#lightbox` z-index 9 (above `#panel` 6, `#tourbar` 7; `#intro` 10 is hidden by then), solid black, no backdrop-filter, own strip with `object-fit: contain`, bar with number/name/badge/credit, close ✕ / Escape (handler order: lightbox → peek → tour) / `popstate` (`pushState({lb:1})` on open, `history.back()` on close; `#h=` keeps `replaceState`). Opening moves the live slide nodes into the overlay (playing video not reloaded) and back on close. No Fullscreen API, no pinch-zoom.

### C5 — peek
`peek = {id, view, elapsed, paused, blendFrom, blendT}`; `startPeek(id)`: `endTour(false)`, `select(id,false,true)`, view as `flyToHotspot`, `tween=null`, `controls.enabled=false`, `replaceState('#peek='+id)`; `stepPeek(dt)`: θ = θ0 + 5°/s·elapsed, 1.2 s ease-in with θ-unwrap (as `stepTour` `app.js:455-456`), `applyView`; stop after 3 turns; `animating ||= peek && !peek.paused` (`app.js:488`); pointerdown pauses; `endPeek()` restores controls + `#h=`; deselect / startTour / double-tap bail; Prev/Next re-target. UI: "Look around"/"Stop" in `.detail-actions`; phone P1 (compact detail in the collapsed sheet: mini 16:9 player, name, badge, dots, Stop, fullscreen). `#peek=` via `afterReveal`; `__walk.startPeek/endPeek/peek`.

### Docs (every sub-phase updates its part)
`docs/adding-a-project.md`: facade block + "rhythm read from the render" rule (B2); `plan.sampleImage` (B3); tiers + "all checks green" (B1/B4); `developerVideos[]`/`embeds[]` (official only), `make-videos.mjs`, §4b AI loops (model/settings/resources/prompt/pilot/review/import), label rule (C1–C3). README: tiers + flags, six labelled kinds, new commands, out-of-reach list. `projects/belvedere/source/PROVENANCE.md`: facade-rhythm source, YouTube id line, spike outcome.

## Sub-phases and checkpoint evidence (one at a time; owner approves before the next)

| # | Scope | Files | Evidence at checkpoint |
|---|---|---|---|
| B1 | tiers + Sky/IBL + retune | new `viewer/quality.js`, `viewer/sky.js`; `app.js` (renderer, `applyLighting`, presets, loop); `tools/check.mjs` (tier boots, shader-error capture, flicker-contract asserts at mid); README | day/dusk × desktop/phone shots beside `render-exterior-aerial.webp`; check green at 3 tiers; dusk toggle smooth on the owner's phone |
| B2 | facades | new `viewer/facade.js`; `app.js` volumes loop; `projects/belvedere/site.json` (`facades`); guide + PROVENANCE | Tower A hotspot, overview, dusk, ghost + clubhouse close-ups; `stats()` per tier; phone gate |
| B3 | greenery + water | new `viewer/greenery.js`; `app.js`; `site.json` (`sampleImage`) | stepped well / tree court / jogging loop shots vs today; tree+hedge counts; phone gate |
| B4 | shadows + AO | new `viewer/post.js`; `app.js` loop + `resize()`; `tools/check.mjs` ceilings | `?fx=noao` A/B pair; z-fight scan day+dusk at max radius; check green at 3 tiers incl. high on SwiftShader; phone gate (mid path unchanged) |
| B5 | ground spike | `tools/trace.html`; `make-ground.mjs` run; `site.json` toggle if pass; PROVENANCE | tracer blink shots with edge offsets; go/no-go recorded |
| C1 | data model + tools + gallery (images) | new `tools/media-lib.mjs`; `make-postcards.mjs`; `import-ai.mjs`; `app.js` (renderMedia, strip, badges, SHEET_H from CSS); `index.html`; `style.css`; `check.mjs` (parametrised counts, images[*], gallery); guide | check green live; desktop+phone shots of a two-entry hotspot with dots; phone: swipe feels native |
| C2 | video playback + AI pilot (15 cr) | `app.js` (video lifecycle, gate); `style.css`; new `tools/import-ai-video.mjs`; `media-lib` ffmpeg helpers; Belvedere postcards (2 loops + posters + manifest + log) | two labelled loops live; check incl. decode + Range; owner watches on phone (autoplay, heat); aspect route decided |
| C3 | batch 12 (≈180 cr) + embeds + make-videos | `tools/make-videos.mjs`; `site.json` `embeds[]`; Belvedere postcards; PROVENANCE | contact strip of the 14 chosen; facade shot; owner taps the facade on phone; check: facade present, zero iframes |
| C4 | fullscreen | `index.html`, `style.css`, `app.js`, `check.mjs`, `shoot.mjs` (scenes gallery/fullscreen/peek) | shots both sizes; phone back button closes without deselecting |
| C5 | peek | `app.js`, `index.html`, `style.css`, `check.mjs`, `shoot.mjs`, README | check: θ advances, controls restored; phone gate with a loop playing while circling |

Commit locally after each sub-phase (no remote exists); deploy with `tools/deploy.sh belvedere`; always run `node tools/check.mjs https://walk.csoul.cloud/belvedere/` after touching `app.js` (TDZ bugs only surface there).

## Verification rules for this arc
- `check.mjs` reads counts from `site.json` (no 41/44/6 literals); asserts at `low|mid|high`; fails on any `THREE.WebGLProgram: Shader Error`; per-tier draw-call/triangle ceilings; flicker contract at mid (`logarithmicDepthBuffer===true`, `alpha===false`, no composer, `plinthTopY===-0.3`); every media entry fetched (videos: `video/`, `accept-ranges`, 206 on `Range: bytes=0-99`, no `content-encoding`, size ceilings); one real `<video>` decode (`readyState>=2`, `videoWidth>0`) then unload; gallery counts + keyboard; fullscreen open/close + history; peek θ advance + restore; embed facade present, iframe count 0; error sink filtered to our origin. Headless Chromium decodes H.264/VP9/AV1 (probed this session).
- `shoot.mjs` desktop+phone at each checkpoint; the PNGs are read as images, not just produced. Frame rate is unmeasurable here: the owner's phone is the gate.
- Mutation proof for each new check before calling it done: break the feature, watch the named check go red, restore.
- Guard the flicker fixes: never reintroduce a transparent canvas, coplanar caps, backdrop-filter on phones, or a fully stopped idle loop; phones keep log depth.
