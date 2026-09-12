# Adding a project

Target: a new master plan becomes a live walkthrough in about a day, without touching `viewer/`.

## 0. Gather (30 min)

- The master plan image at the best resolution you can get (PNG/WebP/JPG). If the site is under ~1500 px wide in it, run a 4K upscale (Higgsfield `upscale_image`) and eyeball a crop side by side: geometry must be faithful; tiny legend digits may drift, the 3D pins carry the numbers.
- Developer renders (as many as exist), the amenity legend, public facts (acres, towers/floors, homes, phases, RERA), the developer's own page URL.
- Put originals in `projects/<slug>/source/` with a `PROVENANCE.md` (where each file came from, what is stock, what is public fact).

## 1. Trace (1–2 h)

```bash
python3 -m http.server 8765 --directory .
# open http://127.0.0.1:8765/tools/trace.html?img=../projects/<slug>/source/masterplan.png
```

Draw, in this order: the **site boundary** (polygon; set `scale.acres` in the exported JSON — the tracer derives metres-per-pixel from the boundary area), then each **volume** (towers, future blocks, clubhouse, services; set `kind`, `floors`, `heightM`), then **features** (courts as rects with `sport`, `rink` ellipse, `steppedWell` circle + `waterR`, `splash`, `plazaDisc`, `portal` rect, `dome`, `ramp`), then a **pin** per legend item (numbers must match the plan's own legend). Export → `projects/<slug>/site.json`.

Read the plan's north arrow and set `plan.northDeg` (screen angle of north, clockwise from image-up). Set `plan.crop` to the region that becomes the ground texture (site plus a small margin, legend excluded).

Do not invent: if the plan shows no pool at grade, there is no pool.

## 2. Fill in site.json (1 h)

Copy the shape of `projects/belvedere/site.json`:

- `name`, `developer`, `location`, `disclaimer`, `facts[]` (label/value; long values get the wide row).
- `themes[]` (six is right) and each hotspot's `theme`, `caption` (two sentences, from the legend and public facts only, no compass words unless you have checked the arrow), `view` (`radius`, `phiDeg`, `thetaDeg`, `targetY`; θ=0 puts the camera on the plan's bottom side, +90° on the right, ±180° on the top, −90° on the left — aim from outside the site so ghost towers do not sit between camera and subject).
- `developerRenders[]`: each render file → the hotspot ids it illustrates.
- `tours[]`: keyframes `{t 0..1, pos [px,py], radius, phiDeg, thetaDeg, targetY?, hotspot?, overview?}`; keep consecutive θ differences under 180°; end with an `overview: true` frame.

## 3. Build assets (20 min)

```bash
node tools/make-ground.mjs projects/<slug>/source/masterplan-4k.png projects/<slug>/site.json projects/<slug>/plan.jpg 2048
node tools/make-postcards.mjs projects/<slug>      # copies developer renders, cuts a plan-detail crop per hotspot, writes postcards/manifest.json
```

## 4. AI postcards (1–2 h, optional but recommended)

Import two of the developer's renders into Higgsfield as style references (`media_import_url`). For each key place without a render, one prompt with the fixed style prefix (see `postcards/ai-log.json` for Belvedere's) and a subject sentence read off the plan; two candidates each (`generate_image_batch`, `nano_banana_pro`, 3:2, 1k). Download, lay out on a contact sheet, reject anything with text, wrong tower counts or impossible geometry, then:

```bash
node tools/import-ai.mjs projects/<slug> selection.json   # see tools/import-ai.mjs header for the selection shape
```

Every AI image is shown with the label "AI visualisation · indicative" and a credit line. Never present one as a developer render.

## 5. Deploy and verify (20 min)

```bash
tools/deploy.sh <slug>                                   # → https://walk.csoul.cloud/<slug>/  (hub index updates itself)
node tools/check.mjs https://walk.csoul.cloud/<slug>/    # must be 12/12
node tools/shoot.mjs "https://walk.csoul.cloud/<slug>/?autostart=1200" /tmp/<slug>   # then LOOK at both PNGs
```

Then open it on a phone: drag, pinch, play a tour. That is the performance gate; this server cannot measure it.

## Gotchas

- The tracer and viewer read `site.json` relative to their own folder in dev (`?project=../projects/<slug>/`); deployed, everything sits in one folder.
- ESM tools do not honour `NODE_PATH`; Playwright is symlinked into `tools/node_modules` (see README).
- Headless screenshots on this server take 25–55 s each; pass `timeout: 150000` to `page.screenshot`.
- `check.mjs` plays tours at 60× because the software renderer runs about one frame per second.
