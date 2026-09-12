# Site-plan walkthrough demo — Brigade Belvedere (design + week plan)

Date: 2026-09-12. Status: design approved section by section in the brainstorm; this file is the spec. On day 1 copy it into the new repo as `docs/superpowers/specs/2026-09-12-siteplan-walkthrough-design.md`.

## Context

CreatiSoul wants a pitch demo to win real-estate developer clients: a master plan that a prospect can "walk through" instead of reading. Brigade Belvedere (Budigere Cross, Bengaluru) is the first dataset because its material is public and the real page exists for comparison. The owner asked to be strict about what is achievable and to avoid far-fetched goals.

Decisions made in the brainstorm (all owner-confirmed):

- Purpose: pitch demo, not a sales tool for Brigade.
- Experience: drone fly-over with click hotspots. Not a first-person walk, not a game.
- Look: architect's scale-model maquette plus AI photoreal "postcards" at hotspots.
- Effort: one week, one checkpoint per day (phase-by-phase approval).
- IP: keep the Brigade name and renders, labelled "rebuilt from public data by CreatiSoul as a demonstration".
- Build approach: plan image draped as ground, 3D only where it earns it.
- Hosting: proper subdomain `walk.csoul.cloud`, not a mockups subpath.

### What exists (verified 2026-09-12)

Brigade's own site returns 403 to this host's IP (curl and headless Chromium alike). Two mirrors carry the same assets; local copies are in the session scratchpad and must be moved into the repo on day 1:

- Master plan render, 1200x848, with a 41-item legend (`brigadebelvedere.net/assets/plans/brigade-belvedere-masterplan.webp`). Clean, north arrow bottom-left, towers A and B plus five "Future Development" blocks.
- Aerial tower render and 7 landscape renders on the same mirror (`assets/gallery/`). The `street-street-level` image is stock art, do not use.
- Floor plans per unit type; location map.
- Facts: 10.75 acres, 5 towers of 3B+S+G+43, 1,750 homes, Phase 1 = towers A and B with 773 units, RERA PRM/KA/RERA/1251/446/PR/240326/008549, architect Ricardo Bofill Taller de Arquitectura, possession March 2031.
- No developer 3D model, tour or video exists publicly. Photoreal free-roam is therefore out of reach and must not be promised.

Infrastructure verified: `mockups-csoul` nginx container pattern (Traefik labels, Let's Encrypt) works and is the template for the new host. Three.js is on cdnjs and jsDelivr. Higgsfield account has 5,974 credits; Nano Banana Pro and GPT Image 2.5 accept reference images; a pair of 3:2 images preflighted at 2 credits. Playwright Chromium on the host renders pages and WebP for screenshot review. DNS for csoul.cloud is on Hostinger (no wildcard, no API on host) so the owner adds A records by hand, as was done for s3.csoul.cloud.

## Design

### 1. Scene and data model

One JSON file per project (`projects/<slug>/site.json`) drives the viewer. Coordinates are plan pixels; scale in metres per pixel is derived from the site polygon area and the acreage (Belvedere: about 0.33 m/px, so a 43-floor tower of about 140 m is about 420 plan units tall).

- Ground: the plan image cropped to the site trapezoid, legend removed, draped on a plane.
- Volumes: six traced footprints (corrected on day 1 from the plan itself): towers A and B as cream massing with a slab line per floor; three future towers as translucent ghost material tagged "Phase 2"; one low block beside the clubhouse drop-off modelled as the clubhouse. Plus two one-storey service blocks.
- Earned 3D detail: skating rink as a smooth recessed surface, the stepped-well plaza as concentric rings with a water centre, the kids' splash area as shallow water; three courts as raised slabs with painted lines; the entrance portal; two meditation domes. There is NO swimming pool at grade on the published plan (the pools are presumably on the clubhouse), so none is modelled.
- Trees: instanced simple canopies placed by sampling green pixels along the site perimeter in the plan image. No hand placement.
- Hotspots: all 41 legend items with plan position, theme, caption, camera framing and postcard reference.
- Lighting: one directional sun, sky ambient, contact shadows; day and dusk presets.
- Stack: Three.js from CDN, ES modules, no build step, static files.

### 2. Camera and navigation

- Orbit by default. Pitch clamped to about 20°–80°, zoom floor at roughly a 40 m wide view so the ground stays crisp, pan fenced to the site.
- Three guided tours as keyframe lists in the JSON, 30–45 s each, pausable, highlighting the hotspot being passed: Arrival (portal, boulevard, drop-offs), Amenities loop (along the jogging track past pool, courts, plaza, pet park), Towers (rise up the facade to the crown, look back over the site).
- Hotspot fly-to: click a pin or list entry to ease to its preset framing; Escape or back returns to overview.
- Mobile: touch orbit, panel becomes a bottom sheet, tours are the primary mobile mode.
- Entry: intro overlay with project name and the "rebuilt from public data" line, then a 5 s reveal from above to the three-quarter view.

### 3. Hotspots and content panel

- Numbered pins matching the plan's own legend numbers; scale with distance; fade at widest zoom.
- Six themes as toggles: Arrival, Sports, Water and play, Gardens and quiet, Social, Towers.
- Panel (right on desktop, bottom sheet on mobile): number, name, two-line caption, postcard. Developer renders where they exist, labelled "developer render"; otherwise an AI image labelled "AI visualisation, indicative".
- Facts strip at top: acreage, towers and floors, homes, Phase 1 scope, RERA number.
- No lead form. Footer link "Built by CreatiSoul".

### 4. AI postcard pipeline

- About 10 hotspots lack a developer render: pool and kids' pool, skating rink, stepped-well plaza, clubhouse drop-off, event plaza, pet park, yoga lawn and meditation deck, outdoor workstation, kids' play on EPDM, arrival portal. One 3:2 landscape each.
- Consistency: every prompt carries the same two references (aerial tower render, elevated garden render), same time of day, same lens feel, same warm late-afternoon grade. Model Nano Banana Pro (fallback GPT Image 2.5). Preflight cost, then one batch via `generate_image_batch`.
- Honesty rule: every AI image labelled; nothing invented beyond the legend; never presented as a developer render.
- Selection: two candidates per hotspot, screenshot review, pick one, reject wrong tower counts or impossible geometry. Budget a second short batch.
- Fallback: a zoomed crop of the master plan. Nothing ships blank.

### 5. Authoring and reusable pipeline

- `tools/trace.html`: loads a plan image; draw site boundary and footprints; drop numbered pins; set north and acreage; export `site.json`. First Belvedere trace is done by pixel measurement and refined visually; the owner corrects in the tracer.
- Project folder: shared viewer + `site.json` + `plan.jpg` + `postcards/` with `manifest.json` marking each image developer / ai / plan-crop.
- New repo `/root/projects/siteplan-walk` (git). Deploy = copy the built project folder to the host directory. A second project is a new folder with no code changes.

### 6. Hosting, verification, limits

- Host: new `nginx:alpine` container `walk-csoul`, volume `/root/walk` -> html read-only, on the `coolify` network, Traefik labels copied from `mockups-csoul` with `Host(walk.csoul.cloud)` and the letsencrypt resolver. Demo URL `https://walk.csoul.cloud/belvedere/`; root index lists projects.
- Owner action, requested on day 1 so the cert issues before day 6: Hostinger DNS A record `walk.csoul.cloud -> 62.72.56.130`, not proxied. Until it resolves, verify with Playwright host mapping.
- Verification after every day: Playwright screenshots at 1440 and 390 widths read as images. `tools/check.mjs` against the live URL: canvas non-blank, 41 pins present, every postcard URL returns a real non-empty file, three tours complete, zero console errors. Frame rate is not measurable on this box's software renderer, so the final gate is the owner clicking through on a real phone.
- Stated limits (in the intro overlay and the pitch): ground is a picture, not terrain, and that picture is an AI 4K upscale of the published plan (verified faithful for geometry; a couple of baked-in legend digits drift slightly, the 3D pins carry the authoritative numbers); towers are massing, not the Bofill facade; Phase 2 blocks are read off the plan; AI images are indicative; assets come from mirror copies; branding swaps if a developer objects.

## The week (one checkpoint per day, owner approves before the next)

| Day | Deliverable | Checkpoint evidence |
|---|---|---|
| 1 | Repo, `site.json` schema, tracer page, first Belvedere trace (boundary, 7 footprints, 41 pins, north, scale), assets moved in, DNS request sent | Tracer overlay screenshot showing footprints and pins aligned on the plan |
| 2 | Viewer: ground drape, extruded towers with banding, ghost Phase 2 blocks, sun and shadows, clamped orbit, reveal intro | Desktop + phone screenshots of the overview |
| 3 | Pool, rink, courts, plaza rings, clubhouse, pergolas, instanced trees, day/dusk toggle | Screenshots of both presets |
| 4 | Pins, themes, panel and bottom sheet, fly-to framing, facts strip, all 41 captions, developer renders placed | Check script passes pin count; screenshots of panel open |
| 5 | AI postcards: references, batch, review, selection, placement, labels, fallbacks | Contact sheet of chosen images; manifest complete |
| 6 | Tours, mobile pass, performance (pixel-ratio cap, texture sizes), `walk-csoul` container, deploy, check script green on the live URL | Live URL screenshots; owner real-phone click-through |
| 7 | Buffer, `docs/adding-a-project.md`, screenshot set for the pitch deck | Doc reviewed; screenshots delivered |

## Files

- `/root/projects/siteplan-walk/` (new): `viewer/index.html`, `viewer/app.js`, `viewer/style.css`; `tools/trace.html`, `tools/check.mjs`, `tools/shoot.mjs`; `projects/belvedere/{site.json, plan.jpg, postcards/, manifest.json}`; `docs/superpowers/specs/...`; `docs/adding-a-project.md`.
- `/root/walk/belvedere/` (deploy target) and `/root/walk/index.html`.
- Reuse: Playwright pattern from `/root/projects/gcr-rebuild/tools` (require via `NODE_PATH`); Traefik label set from `docker inspect mockups-csoul`.

## Risks to watch

- Tracing accuracy: the plan is a slightly perspective render, not orthographic; footprints may need a manual nudge. The tracer exists for this.
- Postcards drifting from Brigade's style: mitigated by fixed references and the selection pass.
- Old Android performance: cap devicePixelRatio at 1.5, keep the ground texture at 2048 px, instance trees.
- DNS delay: if the A record isn't live by day 6, demo still deploys and is verified via host mapping; the URL follows.
