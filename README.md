# Site-plan walkthrough

An interactive master-plan demonstration: a developer's published site plan becomes a 3D scale model you can fly over, with numbered places, postcards, themes and guided tours. Built by CreatiSoul as a pitch demo, first dataset **Brigade Belvedere** (Bengaluru), rebuilt from public data.

Live: **https://walk.csoul.cloud/belvedere/** · hub: https://walk.csoul.cloud/

## What it is, honestly

- The ground is the developer's published master plan (AI-upscaled to 4K for crispness), clipped to the site boundary on a plinth.
- Towers are massing extruded from traced footprints at true floor count, not the architect's facade. Phase 2 blocks are ghosts.
- Courts, rink, stepped well, plazas, portal and domes are simple 3D read off the plan. Trees are sampled from the plan's greens at load time.
- Postcards are one of three kinds, always labelled: **developer render**, **AI visualisation · indicative**, or **plan detail**. Nothing is invented beyond the plan's legend and the developer's public facts.

## Layout

```
viewer/            index.html, app.js, quality.js, sky.js, style.css  — the Three.js viewer (ES modules from jsDelivr, no build step)
projects/<slug>/   site.json (everything about one project), plan.jpg (ground), postcards/ (+ manifest.json, ai-log.json), source/ (originals + PROVENANCE.md), og.jpg
tools/             trace.html (tracer), make-ground.mjs, make-postcards.mjs, import-ai.mjs, deploy.sh, check.mjs, shoot.mjs, crop.mjs
docs/              superpowers/specs (the approved designs), adding-a-project.md, pitch/ (screenshot set), checkpoints/ (per-sub-phase evidence)
tests/             node --test unit tests for the pure viewer modules (quality.js)
```

## Commands

```bash
# local dev server (viewer + tracer read from ../projects/<slug>/)
python3 -m http.server 8765 --directory .
#   viewer:  http://127.0.0.1:8765/viewer/index.html?project=../projects/belvedere/
#   tracer:  http://127.0.0.1:8765/tools/trace.html?json=../projects/belvedere/site.json

# one-time: Playwright for the tools (ESM ignores NODE_PATH, so link it into tools/)
mkdir -p tools/node_modules && ln -sfn /root/projects/gcr-rebuild/tools/node_modules/playwright tools/node_modules/playwright && ln -sfn /root/projects/gcr-rebuild/tools/node_modules/playwright-core tools/node_modules/playwright-core

node tools/make-ground.mjs projects/belvedere/source/masterplan-4k.png projects/belvedere/site.json projects/belvedere/plan.jpg 2048
node tools/make-postcards.mjs projects/belvedere          # developer renders + a plan-detail crop per hotspot → manifest.json
node tools/import-ai.mjs projects/belvedere selection.json # selected AI images → manifest (prepended) + ai-log.json
tools/deploy.sh belvedere                                  # → /root/walk/belvedere (served by the walk-csoul container)
node tools/check.mjs https://walk.csoul.cloud/belvedere/   # live checks: boot, pins, postcards, interactions, tours, per-tier boots + flicker contract + draw budgets, zero errors — must be all green
node --test tests/                                         # unit tests for the pure viewer modules
node tools/shoot.mjs <url> <outPrefix>                     # desktop + phone screenshots with console-error capture
```

Viewer URL parameters: `?project=<base>` (dev only), `autostart=<ms>` (skip the intro, reveal in ms), `light=dusk`, `q=high|mid|low` (quality tier; default: phones and tablets `mid`, everything else `high`; the checks run `low`), `tourSpeed=<n>` (tests), `fx=alpha|nolog|stop|blur` (restore one pre-fix behaviour each, for bisecting flicker on a real phone), and hashes `#h=<hotspotId>`, `#tour=<tourId>`.

Mobile flicker (2026-09-12): fixed by an opaque canvas + sky dome, logarithmic depth with no coplanar surfaces, no backdrop-filter on phones, and an idle loop that keeps rendering at ~11 fps. Owner-verified on a real phone.

Quality tiers (arc 2, B1): `mid` (phones) and `low` (checks) keep every one of those fixes; render-quality features land on `high` first. The sky is procedural (three/addons Sky) and is also the environment map that lights the model; `applyLighting(k)` in app.js is the one place day/dusk is defined. Design: `docs/superpowers/specs/2026-09-12-siteplan-arc2-render-media-design.md`.

## Hosting

`walk-csoul` is a plain `nginx:alpine` container on the `coolify` network serving `/root/walk` read-only, routed by the Coolify Traefik with the labels below (Let's Encrypt via the `letsencrypt` resolver). It is independent of every other app on the host and safe to remove and recreate:

```bash
docker rm -f walk-csoul
docker run -d --name walk-csoul --restart unless-stopped --network coolify -v /root/walk:/usr/share/nginx/html:ro \
  -l traefik.enable=true \
  -l 'traefik.http.routers.walk-http.rule=Host(`walk.csoul.cloud`)'  -l traefik.http.routers.walk-http.entryPoints=http  -l traefik.http.routers.walk-http.middlewares=walk-redirect -l traefik.http.routers.walk-http.service=walk \
  -l 'traefik.http.routers.walk-https.rule=Host(`walk.csoul.cloud`)' -l traefik.http.routers.walk-https.entryPoints=https -l traefik.http.routers.walk-https.tls=true -l traefik.http.routers.walk-https.tls.certresolver=letsencrypt -l traefik.http.routers.walk-https.middlewares=walk-gzip -l traefik.http.routers.walk-https.service=walk \
  -l traefik.http.middlewares.walk-redirect.redirectscheme.scheme=https -l traefik.http.middlewares.walk-gzip.compress=true -l traefik.http.services.walk.loadbalancer.server.port=80 nginx:alpine
```

DNS: `walk.csoul.cloud` A → `62.72.56.130` (Hostinger, unproxied). `robots.txt` disallows everything; pages carry `noindex`.

## Verification rules

Every change: `node tools/check.mjs <live url>` must be green, and screenshots (desktop + phone) must be looked at, not just produced. Frame rate cannot be judged on this server (software GL, ~1 fps); the owner's phone is the performance gate.

## Adding the next project

See `docs/adding-a-project.md` — a new project is a new `projects/<slug>/` folder, no code changes.
