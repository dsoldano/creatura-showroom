# C1 — Media data model + tools + image gallery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single postcard per hotspot into a labelled, provenance-ordered media gallery — a swipeable strip with dots, hover arrows and ←/→ — on a data model that already has room for developer clips, official embeds and AI loops (C2/C3 fill it), with the tools that write `manifest.json` sharing one kind/rank table with the viewer so they can never disagree.

**Architecture:** `viewer/media-kinds.js` is the single source of truth for kinds, labels, list chips and ruling-4 ranking (pure; imported by the viewer AND the node tools). `tools/media-lib.mjs` wraps it with manifest I/O and `mergeOwned()` — a tool owns some kinds, replaces exactly those for the hotspots it touches, keeps everything else, dedupes, sorts. `make-postcards.mjs` (owns `developer|plan`) and `import-ai.mjs` (owns `ai`) move onto it. `viewer/gallery.js` owns the strip: `renderMedia(entry)` is the one place a manifest entry becomes DOM (images now; video/embed/ai-video render their poster with a play glyph until C3 wires playback), `createGallery()` handles slides, dots, arrows, keys and the active index via IntersectionObserver. `app.js` calls `gallery.show(h)` from `select()`, reads `SHEET_H` from the CSS variable, and exposes `__walk.gallery`.

**Tech Stack:** vanilla DOM + CSS scroll-snap + IntersectionObserver, `node --test`, Playwright/SwiftShader checks.

**Spec:** `docs/superpowers/specs/2026-09-12-siteplan-arc2-render-media-design.md` §"C1 — data model + tools + gallery", rulings 3 (official embeds only — documented in the guide now, data lands in C3), 4 (hero order provenance-first: developer video > developer render > official embed > AI loop > AI still > plan detail; video before still within a tier), 13 (autoplay gate — C3). Sub-phase row C1: files `tools/media-lib.mjs`, `make-postcards.mjs`, `import-ai.mjs`, `app.js` (renderMedia, strip, badges, SHEET_H from CSS), `index.html`, `style.css`, `check.mjs` (parametrised counts, images[*], gallery), guide; evidence = check green live + desktop/phone shots of a two-entry hotspot with dots + phone swipe gate.

## Context

Phase B is complete and merged (`b536245`). Today `select()` (`app.js:404-418`) shows only `h.images[0]` in `#dImg`; 14 hotspots already hold two entries (AI + plan) that the visitor never sees, `import-ai.mjs` and `make-postcards.mjs` each carry their own preserve-the-other-kinds logic, `KIND_LABEL` lives in the viewer only, and `SHEET_H = 204` in `app.js:63` duplicates `--sheet-h: 204px` in `style.css:3`. Phase C adds three more kinds; without a shared table and a merge rule the manifest would drift the first time two tools run in the wrong order.

**Verified before planning:** the manifest has 44 hotspots, kinds `plan 44 / ai 14 / developer 12`, at most 2 entries per hotspot and no hotspot with both AI and developer — so ruling-4 sorting changes nothing today (it is proven as a no-op on the committed manifest). `og.py` does not read the manifest. `ffmpeg`/`ffprobe` exist on the host (C2). `check.mjs` reads `#dImg` for the deep-link check — updated here to the active slide.

## Global Constraints

- No build step; ES modules. `viewer/media-kinds.js` has no `three` import so node can load it.
- Every media entry is labelled on screen (badge + credit) — the six kinds all have a label; AI kinds keep "· indicative". The label/credit shown always describes the **active** slide.
- Phones: no backdrop-filter, no new layout thrash — the strip is the same width as today's image; the sheet height is read from CSS (`--sheet-h`) so viewer and stylesheet cannot drift.
- Tools keep what they do not own: re-running `make-postcards.mjs` must not drop AI entries; re-running `import-ai.mjs` must not drop developer/plan entries. Belvedere's committed manifest must come out identical (order included) from a dry merge.
- `window.__walk` is the verification contract; `check.mjs` runs alone in the background (1500 s); screenshots read as images; explicit `q=` in shot URLs; the owner's phone is the gate ("swipe feels native").
- Unit tests `node --test tests/*.test.mjs`; commit per task with the attribution trailers; branch `arc2-c1` off master; merge after the gate.

## File structure

| File | Responsibility |
|---|---|
| `viewer/media-kinds.js` (new, pure) | `RANK`, `KIND_LABEL`, `CHIP`, `isVideoKind`, `labelOf(entry)`, `chipOf(entry)`, `sortByRank(list)`. |
| `tools/media-lib.mjs` (new, node) | `readManifest(dir)`, `writeManifest(dir, m)`, `entryKey(e)`, `mergeOwned(existing, ownedKinds, entriesById)`, `countByKind(m)`; re-exports the kinds. |
| `tools/make-postcards.mjs`, `tools/import-ai.mjs` (modify) | build `entriesById`, then `mergeOwned` + `writeManifest`. |
| `viewer/gallery.js` (new) | `renderMedia(entry, hotspot, base)`, `createGallery({strip, dots, prev, next, badge, credit, base})` → `{ show, go, index, count, entries, hotspot }`. |
| `viewer/index.html`, `viewer/style.css` (modify) | strip + dots + arrows markup; strip/slide/dot/arrow/poster styles; `.badge.video/.embed/.ai-video`. |
| `viewer/app.js` (modify) | import kinds + gallery; `SHEET_H` from CSS; `select()` → `gallery.show(h)`; hotlist chip via `chipOf` (+ count); ←/→ keys; `__walk.gallery`. |
| `tests/media-kinds.test.mjs`, `tests/media-lib.test.mjs` (new) | unit tests incl. the Belvedere manifest dry-merge fixture. |
| `tools/check.mjs` (modify) | parametrised counts, every media file loads, hero order per ruling 4, gallery check; deep-link check reads the active slide. |
| `README.md`, `docs/adding-a-project.md` (modify) | six labelled kinds, `developerVideos[]`/`embeds[]` schema + "official channel only" rule, tools own kinds. |
| `docs/superpowers/plans/2026-09-13-c1-media-model-gallery.md` (new), `docs/checkpoints/c1/*.png` (new) | plan + evidence. |
| `tools/_c1-shots.mjs` (new, gitignored) | gallery shots desktop + phone. |

---

### Task 0: branch + plan file

- [ ] `git switch -c arc2-c1`; copy this plan to `docs/superpowers/plans/2026-09-13-c1-media-model-gallery.md`; commit "C1 implementation plan (media data model + tools + image gallery)". `mkdir -p docs/checkpoints/c1`.

---

### Task 1: `viewer/media-kinds.js` — one table for kinds, labels, chips, rank (node-tested)

**Files:** Create `viewer/media-kinds.js`, `tests/media-kinds.test.mjs`.

**Interfaces (produced):**
- `RANK = { video: 0, developer: 1, embed: 2, 'ai-video': 3, ai: 4, plan: 5 }` (ruling 4).
- `KIND_LABEL = { video: 'Developer video', developer: 'Developer render', embed: 'Developer video', 'ai-video': 'AI loop · indicative', ai: 'AI visualisation · indicative', plan: 'Plan detail' }`; `labelOf(entry)` → the label, with ` · YouTube`/` · Vimeo` appended for embeds (ruling 3 wording).
- `CHIP = { video: 'video', developer: 'render', embed: 'video', 'ai-video': 'ai loop', ai: 'ai', plan: 'plan' }`; `chipOf(entry)` → chip text ('' for none).
- `isVideoKind(kind)` → true for `video|embed|ai-video`.
- `sortByRank(list)` → new array, stable, unknown kinds last.

- [ ] **Step 1: failing tests** — `tests/media-kinds.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANK, KIND_LABEL, CHIP, isVideoKind, labelOf, chipOf, sortByRank } from '../viewer/media-kinds.js';

test('ruling 4: developer video > developer render > official embed > AI loop > AI still > plan detail', () => {
  const order = Object.entries(RANK).sort((a, b) => a[1] - b[1]).map(e => e[0]);
  assert.deepEqual(order, ['video', 'developer', 'embed', 'ai-video', 'ai', 'plan']);
});
test('every kind has a label and a chip; AI kinds say indicative; embeds name the provider', () => {
  for (const k of Object.keys(RANK)) { assert.ok(KIND_LABEL[k], k + ' label'); assert.ok(CHIP[k], k + ' chip'); }
  assert.match(KIND_LABEL.ai, /indicative/); assert.match(KIND_LABEL['ai-video'], /indicative/);
  assert.equal(labelOf({ kind: 'embed', provider: 'youtube' }), 'Developer video · YouTube');
  assert.equal(labelOf({ kind: 'embed', provider: 'vimeo' }), 'Developer video · Vimeo');
  assert.equal(labelOf({ kind: 'developer' }), 'Developer render'); assert.equal(labelOf({ kind: 'weird' }), 'weird');
  assert.equal(chipOf({ kind: 'developer' }), 'render'); assert.equal(chipOf(null), '');
});
test('isVideoKind', () => { assert.ok(isVideoKind('video') && isVideoKind('embed') && isVideoKind('ai-video')); assert.ok(!isVideoKind('ai') && !isVideoKind('plan') && !isVideoKind('developer')); });
test('sortByRank: provenance first, stable within a kind, unknown kinds last, input untouched', () => {
  const list = [{ kind: 'plan', f: 1 }, { kind: 'ai', f: 2 }, { kind: 'weird', f: 3 }, { kind: 'developer', f: 4 }, { kind: 'ai', f: 5 }, { kind: 'video', f: 6 }];
  const out = sortByRank(list);
  assert.deepEqual(out.map(e => e.f), [6, 4, 2, 5, 1, 3]); assert.deepEqual(list.map(e => e.f), [1, 2, 3, 4, 5, 6]);
});
```
- [ ] **Step 2: run → fails** (`Cannot find module`).
- [ ] **Step 3: module** — `viewer/media-kinds.js`:
```js
// Media kinds shared by the viewer and the postcard tools — one table, so a manifest written by a tool and read by the viewer can never disagree.
// Ruling 4 (hero order, provenance first): developer video > developer render > official embed > AI loop > AI still > plan detail; video before still within a tier.
export const RANK = { video: 0, developer: 1, embed: 2, 'ai-video': 3, ai: 4, plan: 5 };
export const KIND_LABEL = { video: 'Developer video', developer: 'Developer render', embed: 'Developer video', 'ai-video': 'AI loop · indicative', ai: 'AI visualisation · indicative', plan: 'Plan detail' };
export const CHIP = { video: 'video', developer: 'render', embed: 'video', 'ai-video': 'ai loop', ai: 'ai', plan: 'plan' };
const PROVIDER = { youtube: 'YouTube', vimeo: 'Vimeo' };
export const isVideoKind = k => k === 'video' || k === 'embed' || k === 'ai-video';
export const labelOf = e => !e ? '' : (KIND_LABEL[e.kind] || e.kind) + (e.kind === 'embed' && e.provider ? ' · ' + (PROVIDER[e.provider] || e.provider) : '');
export const chipOf = e => e ? (CHIP[e.kind] || e.kind) : '';
export function sortByRank(list) { return list.map((e, i) => [e, i]).sort((a, b) => ((RANK[a[0].kind] ?? 99) - (RANK[b[0].kind] ?? 99)) || (a[1] - b[1])).map(x => x[0]); }
```
- [ ] **Step 4: pass + commit** — `node --test tests/*.test.mjs`; commit "C1: media-kinds — one kind/label/chip/rank table for viewer and tools (ruling 4) + tests".

---

### Task 2: `tools/media-lib.mjs` + the two tools on it (node-tested with the Belvedere manifest as a fixture)

**Files:** Create `tools/media-lib.mjs`, `tests/media-lib.test.mjs`; modify `tools/make-postcards.mjs`, `tools/import-ai.mjs`.

**Interfaces (produced):**
- `readManifest(dir)` → `{ images: {} }` when absent; `writeManifest(dir, m)`; `manifestPath(dir)`.
- `entryKey(e)` → `embed:<provider>:<id>` for embeds, else `file:<file>`.
- `mergeOwned(existing, ownedKinds, entriesById)` → new manifest: for each id in `entriesById`, existing entries of the owned kinds are dropped, the given entries added (deduped by key), the list sorted by rank; ids not in `entriesById` are untouched.
- `countByKind(m)` → `{ kind: n }`.

- [ ] **Step 1: failing tests** — `tests/media-lib.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { readManifest, writeManifest, entryKey, mergeOwned, countByKind } from '../tools/media-lib.mjs';
import { sortByRank } from '../viewer/media-kinds.js';

test('readManifest defaults, writeManifest round-trips', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-')); assert.deepEqual(readManifest(dir), { images: {} });
  writeManifest(dir, { images: { a: [{ file: 'x.jpg', kind: 'plan' }] } }); assert.deepEqual(readManifest(dir).images.a[0].file, 'x.jpg');
});
test('entryKey: files by name, embeds by provider+id', () => {
  assert.equal(entryKey({ kind: 'plan', file: 'p.jpg' }), 'file:p.jpg'); assert.equal(entryKey({ kind: 'embed', provider: 'youtube', id: 'abc' }), 'embed:youtube:abc');
});
test('mergeOwned: replaces only the owned kinds for the touched hotspots, keeps the rest, dedupes, sorts by rank', () => {
  const existing = { images: { a: [{ file: 'ai-a.jpg', kind: 'ai' }, { file: 'plan-a.jpg', kind: 'plan' }], b: [{ file: 'plan-b.jpg', kind: 'plan' }] } };
  const out = mergeOwned(existing, ['developer', 'plan'], { a: [{ file: 'dev-1.webp', kind: 'developer' }, { file: 'plan-a.jpg', kind: 'plan' }, { file: 'plan-a.jpg', kind: 'plan' }] });
  assert.deepEqual(out.images.a.map(e => e.kind), ['developer', 'ai', 'plan'], 'developer first (rank), ai kept, plan replaced once');
  assert.deepEqual(out.images.b, existing.images.b, 'untouched hotspot keeps everything');
  assert.deepEqual(existing.images.a.map(e => e.kind), ['ai', 'plan'], 'input not mutated');
  const emb = mergeOwned({ images: { a: [{ kind: 'embed', provider: 'youtube', id: 'X' }] } }, ['embed'], { a: [{ kind: 'embed', provider: 'youtube', id: 'X', title: 't' }] });
  assert.equal(emb.images.a.length, 1);
});
test('Belvedere fixture: a dry merge of the committed manifest reproduces it exactly (order included)', () => {
  const m = readManifest('projects/belvedere/postcards');
  const devPlan = Object.fromEntries(Object.entries(m.images).map(([id, l]) => [id, l.filter(e => e.kind === 'developer' || e.kind === 'plan')]));
  const out = mergeOwned(m, ['developer', 'plan'], devPlan);
  assert.deepEqual(out.images, Object.fromEntries(Object.entries(m.images).map(([id, l]) => [id, sortByRank(l)])));
  assert.deepEqual(countByKind(out), countByKind(m));
});
```
- [ ] **Step 2: run → fails.**
- [ ] **Step 3: module** — `tools/media-lib.mjs`:
```js
// Shared manifest helpers for the postcard tools (node). Kinds and ranking come from viewer/media-kinds.js so the tools and the viewer cannot disagree.
import fs from 'node:fs'; import path from 'node:path';
import { sortByRank } from '../viewer/media-kinds.js';
export { RANK, KIND_LABEL, sortByRank } from '../viewer/media-kinds.js';
export const manifestPath = dir => path.join(dir, 'manifest.json');
export function readManifest(dir) { const p = manifestPath(dir); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { images: {} }; }
export function writeManifest(dir, m) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(manifestPath(dir), JSON.stringify(m, null, 2) + '\n'); }
export const entryKey = e => e.kind === 'embed' ? `embed:${e.provider}:${e.id}` : `file:${e.file}`;
// A tool owns some kinds: for every hotspot it touches, its owned entries are replaced by what it produced now; every other kind is kept. Hotspots it does not mention keep everything.
export function mergeOwned(existing, ownedKinds, entriesById) {
  const owned = new Set(ownedKinds), out = { ...existing, images: { ...(existing.images || {}) } };
  for (const [id, entries] of Object.entries(entriesById)) {
    const kept = (out.images[id] || []).filter(e => !owned.has(e.kind)), seen = new Set(kept.map(entryKey)), add = [];
    for (const e of entries) { const k = entryKey(e); if (!seen.has(k)) { seen.add(k); add.push(e); } }
    out.images[id] = sortByRank([...kept, ...add]);
  }
  return out;
}
export const countByKind = m => Object.values(m.images).flat().reduce((a, e) => (a[e.kind] = (a[e.kind] || 0) + 1, a), {});
```
- [ ] **Step 4: tools** — `make-postcards.mjs`: replace the `existing`/`manifest`/`push` lines and the "1. keep any AI entries" loop with `import { readManifest, writeManifest, mergeOwned, countByKind } from './media-lib.mjs';` + `const existing = readManifest(out), built = {}; const push = (id, e) => { (built[id] ||= []); built[id].push(e); };`; keep steps 2 and 3 as they are (they call `push`); replace the final write + counts with `const manifest = mergeOwned(existing, ['developer', 'plan'], built); writeManifest(out, manifest); console.log('postcards:', Object.keys(manifest.images).length, 'hotspots;', JSON.stringify(countByKind(manifest)));`. Header comment: "owns developer|plan; every other kind (ai, ai-video, video, embed) is kept". `import-ai.mjs`: import `readManifest, writeManifest, mergeOwned`; replace the manifest read/`manifest.images[id] = […]`/write with `let manifest = readManifest(out);` … per pick `manifest = mergeOwned(manifest, ['ai'], { [id]: [{ file, kind: 'ai', credit: sel.credit }] });` … `writeManifest(out, manifest)`. Do NOT re-run either tool on Belvedere (they regenerate binaries); the fixture test proves the merge.
- [ ] **Step 5: pass + commit** — `node --test tests/*.test.mjs` (from the repo root — the fixture path is relative); `node --check` both tools; commit "C1: media-lib (manifest I/O + mergeOwned) — make-postcards owns developer|plan, import-ai owns ai; Belvedere manifest dry-merge fixture".

---

### Task 3: `viewer/gallery.js` + markup + styles

**Files:** Create `viewer/gallery.js`; modify `viewer/index.html`, `viewer/style.css`.

**Interfaces (produced):**
- `renderMedia(entry, hotspot, base)` → element: `img.media` for `developer|ai|plan`; `div.media.poster.<kind>` (poster img + `.play` glyph, no interaction yet — C3) for `video|embed|ai-video`.
- `createGallery({ strip, dots, prev, next, badge, credit, base })` → `{ show(hotspot), go(i), get index(), get count(), get entries(), get hotspot() }`; `show` sorts by rank, builds slides + dots, sets `.wide` when any video-kind, `.single` on the figure when ≤ 1 entry, resets scroll, observes slides; `go(i)` clamps, smooth-scrolls, sets the active state synchronously.

- [ ] **Step 1: module** — `viewer/gallery.js`:
```js
// Postcard gallery (C1): a scroll-snap strip of media entries per hotspot with dots, hover arrows, ←/→ and an IntersectionObserver-driven active index.
// renderMedia() is the one place a manifest entry becomes DOM; the strip and (C4) fullscreen both use it.
import { labelOf, sortByRank, isVideoKind } from './media-kinds.js';

export function renderMedia(entry, hotspot, base) {
  const alt = hotspot.name + ' — ' + labelOf(entry);
  if (isVideoKind(entry.kind)) {   // video | embed | ai-video: poster + play glyph for now; playback and the embed facade land in C3
    const wrap = document.createElement('div'); wrap.className = 'media poster ' + entry.kind;
    const im = document.createElement('img'); im.loading = 'lazy'; im.decoding = 'async'; im.src = base + 'postcards/' + entry.poster; im.alt = alt; wrap.appendChild(im);
    const play = document.createElement('span'); play.className = 'play'; play.setAttribute('aria-hidden', 'true'); wrap.appendChild(play); return wrap;
  }
  const im = document.createElement('img'); im.className = 'media'; im.loading = 'lazy'; im.decoding = 'async'; im.src = base + 'postcards/' + entry.file; im.alt = alt; return im;
}

export function createGallery({ strip, dots, prev, next, badge, credit, base }) {
  let entries = [], index = 0, hotspot = null, io = null;
  function setActive(i) {
    index = i; const e = entries[i];
    [...strip.children].forEach((s, k) => s.classList.toggle('active', k === i));
    [...dots.children].forEach((d, k) => d.setAttribute('aria-current', k === i ? 'true' : 'false'));
    badge.textContent = labelOf(e); badge.className = 'badge ' + (e ? e.kind : ''); credit.textContent = e ? (e.credit || '') : '';
    prev.disabled = i <= 0; next.disabled = i >= entries.length - 1;
  }
  function show(h) {
    hotspot = h; entries = sortByRank(h.images || []); if (io) io.disconnect();
    strip.replaceChildren(...entries.map((e, i) => { const s = document.createElement('div'); s.className = 'slide'; s.dataset.i = i; s.appendChild(renderMedia(e, h, base)); return s; }));
    dots.replaceChildren(...entries.map((e, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'dot'; b.setAttribute('aria-label', `${labelOf(e)} (${i + 1} of ${entries.length})`); b.addEventListener('click', () => go(i)); return b; }));
    strip.classList.toggle('wide', entries.some(e => isVideoKind(e.kind)));
    strip.parentElement.classList.toggle('single', entries.length <= 1); strip.parentElement.hidden = entries.length === 0;
    strip.scrollLeft = 0; setActive(0);
    io = new IntersectionObserver(items => { let best = null; for (const it of items) if (it.isIntersecting && (!best || it.intersectionRatio > best.intersectionRatio)) best = it; if (best) setActive(+best.target.dataset.i); }, { root: strip, threshold: [0.6] });
    for (const s of strip.children) io.observe(s);
  }
  function go(i) { if (!entries.length) return; const k = Math.max(0, Math.min(entries.length - 1, i)); strip.scrollTo({ left: k * strip.clientWidth, behavior: 'smooth' }); setActive(k); }
  prev.addEventListener('click', () => go(index - 1)); next.addEventListener('click', () => go(index + 1));
  return { show, go, get index() { return index; }, get count() { return entries.length; }, get entries() { return entries; }, get hotspot() { return hotspot; } };
}
```
- [ ] **Step 2: markup** — in `viewer/index.html` replace
`<figure class="postcard"><img id="dImg" alt=""><figcaption><span class="badge" id="dBadge"></span> <span id="dCredit"></span></figcaption></figure>`
with
```html
      <figure class="postcard single">
        <div class="strip" id="dStrip" aria-label="Postcards"></div>
        <button class="arrow prev" id="dPrev" type="button" aria-label="Previous postcard">‹</button><button class="arrow next" id="dNext" type="button" aria-label="Next postcard">›</button>
        <div class="dots" id="dDots" role="tablist"></div>
        <figcaption><span class="badge" id="dBadge"></span> <span id="dCredit"></span></figcaption>
      </figure>
```
- [ ] **Step 3: styles** — in `viewer/style.css` replace `.postcard img { … }` with
```css
.postcard { position: relative; }
.postcard .strip { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; border-radius: 12px; background: var(--paper-2); -webkit-overflow-scrolling: touch; }
.postcard .strip::-webkit-scrollbar { display: none; }
.postcard .slide { flex: 0 0 100%; scroll-snap-align: start; scroll-snap-stop: always; }
.postcard .media { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; display: block; background: var(--paper-2); }
.postcard .strip.wide .media { aspect-ratio: 16 / 9; }
.postcard .poster { position: relative; }
.postcard .poster img { width: 100%; aspect-ratio: inherit; object-fit: cover; display: block; }
.postcard .poster .play { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(29,26,22,.7); }
.postcard .poster .play::after { content: ""; position: absolute; left: 18px; top: 13px; border-style: solid; border-width: 9px 0 9px 14px; border-color: transparent transparent transparent #fff; }
.postcard .dots { display: flex; justify-content: center; gap: 6px; margin-top: 8px; }
.postcard .dot { width: 7px; height: 7px; padding: 0; border: 0; border-radius: 50%; background: rgba(29,26,22,.22); cursor: pointer; }
.postcard .dot[aria-current="true"] { background: var(--accent); }
.postcard .arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(247,243,236,.9); color: var(--ink); font: 700 18px/32px system-ui; cursor: pointer; opacity: 0; transition: opacity .15s; }
.postcard .arrow.prev { left: 8px; } .postcard .arrow.next { right: 8px; }
.postcard .arrow[disabled] { visibility: hidden; }
@media (hover: hover) { .postcard:hover .arrow:not([disabled]) { opacity: 1; } }
.postcard.single .dots, .postcard.single .arrow { display: none; }
.badge.video, .badge.embed { background: #e8f0e6; border-color: #b9d1b4; color: #2f5a2a; }
.badge.ai-video { background: #fff2e4; border-color: #f0c9a3; color: #8a4c12; }
```
(the `.postcard .media` aspect is set on the strip's media so a mixed strip stays one height; the poster's `aspect-ratio: inherit` follows it.) On phones nothing extra: arrows never show (no hover), dots stay.
- [ ] **Step 4:** `node --check viewer/gallery.js`; commit "C1: gallery.js (renderMedia + createGallery: scroll-snap strip, dots, arrows, IntersectionObserver) + markup + styles".

---

### Task 4: wire into `app.js`; check.mjs; verify; look

**Files:** Modify `viewer/app.js`, `tools/check.mjs`.

- [ ] **Step 1: imports + SHEET_H + sorted images** — add `import { chipOf, sortByRank } from './media-kinds.js';` and `import { createGallery } from './gallery.js';`; delete the `KIND_LABEL` const (`app.js:358`); replace `const PANEL_W = 374, SHEET_H = 204;` with `const PANEL_W = 374, SHEET_H = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-h')) || 204;   // one number, owned by style.css`; in the hotspots map (`app.js:355`) change `images: manifest.images[h.id] || []` to `images: sortByRank(manifest.images[h.id] || [])` so the hero (`images[0]`) is the provenance-first entry everywhere (hotlist chip, checks), whatever order the manifest came in.
- [ ] **Step 2: gallery instance** — after `const pinEls = new Map(); let selected = null, activeTheme = null;` add
`const gallery = createGallery({ strip: $('#dStrip'), dots: $('#dDots'), prev: $('#dPrev'), next: $('#dNext'), badge: $('#dBadge'), credit: $('#dCredit'), base: BASE });`
- [ ] **Step 3: hotlist chip** — in the hotlist template replace `<span class="kind">${h.images[0] ? (h.images[0].kind === 'developer' ? 'render' : h.images[0].kind) : ''}</span>` with `<span class="kind">${chipOf(h.images[0])}${h.images.length > 1 ? ' ·' + h.images.length : ''}</span>`.
- [ ] **Step 4: select()** — replace the three lines from `const img = h.images[0];` through the `$('#dBadge')…$('#dCredit')…` line with
```js
  $('#dNum').textContent = h.n; $('#dName').textContent = h.name; $('#dCaption').textContent = h.caption || '';
  gallery.show(h);
```
(keep the `$('#panelHome').hidden = true; …` line that follows).
- [ ] **Step 5: keys** — after the existing Escape `keydown` listener add
`window.addEventListener('keydown', e => { if ($('#panelDetail').hidden || ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return; if (e.key === 'ArrowRight') { gallery.go(gallery.index + 1); e.preventDefault(); } if (e.key === 'ArrowLeft') { gallery.go(gallery.index - 1); e.preventDefault(); } });`
- [ ] **Step 6: `__walk`** — add `gallery,` to the `__walk` object (after `hotspots,`).
- [ ] **Step 7: check.mjs** — (a) parametrise: in the `state` evaluate add `wantNumbered: w.site.hotspots.filter(h => typeof h.n === 'number').length, wantPins: w.site.hotspots.length, media: w.hotspots.map(h => ({ id: h.id, kinds: h.images.map(e => e.kind), files: h.images.map(e => e.file || e.poster) }))`; change the pins check to `ok(\`${state.wantNumbered} numbered hotspots + ${state.wantPins - state.wantNumbered} tower pins in DOM\`, state.numbered === state.wantNumbered && state.pins === state.wantPins, …)`. (b) replace the "all postcard files load" loop with one over `state.media[*].files` (every entry, not just [0]) — name it 'every media file of every hotspot loads (200, >2 KB)'. (c) add `import { RANK } from '../viewer/media-kinds.js';` at the top and, after the postcard check, `ok('hero order follows ruling 4 (provenance first) on every hotspot', state.media.every(m => m.kinds.every((k, i) => i === 0 || (RANK[k] ?? 99) >= (RANK[m.kinds[i - 1]] ?? 99))), JSON.stringify(state.media.filter(m => m.kinds.length > 1).slice(0, 3)));`. (d) deep-link check: replace `src: document.getElementById('dImg').getAttribute('src')` with `src: (() => { const im = document.querySelector('#dStrip .slide.active img'); return im ? im.getAttribute('src') : null; })()`. (e) gallery check, after the deep-link check:
```js
  const gal = await p.evaluate(async () => { const w = window.__walk; const two = w.hotspots.find(h => h.images.length >= 2); if (!two) return { skipped: true }; w.select(two.id, false);
    const g = w.gallery, dots = document.querySelectorAll('#dDots .dot').length, badge0 = document.getElementById('dBadge').textContent, i0 = g.index; g.go(1); await new Promise(r => setTimeout(r, 900));
    const badge1 = document.getElementById('dBadge').textContent, scrolled = document.getElementById('dStrip').scrollLeft > 10, i1 = g.index;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await new Promise(r => setTimeout(r, 900));
    return { id: two.id, count: g.count, dots, i0, i1, badge0, badge1, scrolled, back: g.index, kinds: g.entries.map(e => e.kind) }; });
  ok('gallery: a two-entry hotspot shows dots, go(1) scrolls the strip and relabels the badge, ← returns', gal.skipped || (gal.count >= 2 && gal.dots === gal.count && gal.i0 === 0 && gal.i1 === 1 && gal.badge1 !== gal.badge0 && gal.scrolled && gal.back === 0), JSON.stringify(gal));
```
(`keydown` is dispatched on `document` and bubbles to `window` where the listener lives.)
- [ ] **Step 8: dev check** — dev server up (`ss -ltn | grep ':8765 '`); `node --check viewer/app.js`; `node tools/check.mjs <dev url>` in the background (1500 s) → **26/26** (24 existing + hero order + gallery). If the gallery check fails on `scrolled` because headless smooth scroll did not move within 900 ms, switch `go()` to `behavior: 'auto'` when `matchMedia('(prefers-reduced-motion: reduce)')` matches OR when a `__walk`-set flag `gallery.instant = true` is on for tests — prefer the reduced-motion route and set that media feature in check.mjs via `ctx = b.newContext({ reducedMotion: 'reduce' })`.
- [ ] **Step 9: look** — `tools/_c1-shots.mjs` (gitignored): desktop `q=high` `#h=entrance-portal` (AI + plan), shot after 4 s → `after-entrance-desktop.png`; `gallery.go(1)` + 1.2 s → `after-entrance-desktop-2.png`; phone `q=mid` same hotspot → `after-entrance-phone.png`, then `go(1)` → `after-entrance-phone-2.png`; plus `#h=tennis-court` (developer + plan) desktop. Read them: dots visible and the second dot active after go(1); badge/credit change with the slide; the strip is the same width/height as the old single image; nothing overflows the sheet on the phone; hotlist chips read `ai ·2` / `render ·2`.
- [ ] **Step 10: commit** — "C1: gallery wired into the panel (SHEET_H from CSS, chips with counts, ←/→), check.mjs parametrised counts + every media file + hero order + gallery".

---

### Task 5: mutation proof, docs, deploy, evidence, STOP

- [ ] **Step 1: one combined mutation run (background)** — (a) `viewer/media-kinds.js`: `sortByRank` → `return list.slice().reverse();` (the viewer now sorts `hotspots[*].images` with it, so Belvedere's two-entry hotspots present `plan, ai` → the hero-order check fails); (b) `viewer/gallery.js`: `go()` body → `return;` → the gallery check fails (`i1` stays 0, no scroll). Expect exactly those two to fail → 24/26 (the deep-link check still passes: it reads whatever slide is active). `git checkout viewer/media-kinds.js viewer/gallery.js` → final run 26/26. Commit "check: hero order + gallery — mutation-proved".
- [ ] **Step 2: docs** — README "What it is, honestly": replace the "Postcards are one of three kinds" bullet with "Every postcard is labelled with its provenance — **developer video**, **developer render**, **developer video · YouTube** (official channel only, loaded on tap), **AI loop · indicative**, **AI visualisation · indicative**, **plan detail** — and galleries always lead with the most trustworthy source (video before still). Nothing is invented beyond the plan's legend and the developer's public facts." Guide §2: add `developerVideos[] {file, hotspots[], credit, title, poster?, trim?}` and `embeds[] {provider: youtube|vimeo, id, hotspots[], title, credit, start}` with the rule "official developer channel only — no broker or third-party videos" and note that C2/C3 tools consume them; §4: "`make-postcards.mjs` owns developer + plan entries and keeps everything else; `import-ai.mjs` owns AI stills; each tool re-sorts by provenance (`viewer/media-kinds.js`)". Commit.
- [ ] **Step 3: deploy + live + evidence** — `tools/deploy.sh belvedere`; live check (background) → 26/26; re-shoot the Task 4 set from the live URL → `docs/checkpoints/c1/`; read; commit "C1: checkpoint evidence from the live URL".
- [ ] **Step 4: hand-off + STOP** — memory; send the owner the desktop pair + phone pair; gate: "On your phone open **1 Entrance portal** — swipe between the AI postcard and the plan detail: does it feel native (snap, no jitter), do the dots and the label follow, does the sheet stay put?"

## Verification (end to end)

1. `node --test tests/*.test.mjs` → all green (media-kinds 4, media-lib 4, + the 24 existing).
2. Dev check 26/26 (two new checks, each mutation-proved); parametrised counts still 41 + 3; every media file (70) loads.
3. Shots read: dots + second slide active after `go(1)`, labels follow the slide, phone sheet intact.
4. Live 26/26 → live shots → owner phone gate (swipe).

## Self-review

- **Spec §C1 coverage:** manifest entries by kind incl. the three video kinds' shapes (documented in the guide, honoured by `entryKey`/`renderMedia`; data lands in C2/C3); `site.json` `developerVideos[]`/`embeds[]` schema + official-only rule (T5 docs); `media-lib` with `RANK`, `readManifest`, `mergeOwned`, `sortByRank`, `writeManifest` (T2; `ffprobe/encodeH264/posterFrom` are C2's row and stay there); `make-postcards` owns developer|plan and keeps everything else, dedupes embeds by provider+id (T2); `import-ai` mirrored on media-lib (T2); one `renderMedia` factory for strip + (C4) fullscreen (T3); `select()` → `gallery.show(h)` (T4); `KIND_LABEL` + `.badge.<kind>` extended, video/embed green, ai-video orange (T1, T3); hotlist chip maps kinds (T4); strip aspect 16:9 if any video/embed else 3:2 (T3 `.wide`); `SHEET_H` from `--sheet-h` (T4); scroll-snap strip, dots, desktop hover arrows, ←/→, IntersectionObserver active index (T3, T4); check.mjs parametrised counts, images[*], gallery (T4); guide (T5); evidence desktop + phone two-entry hotspot with dots + phone swipe gate (T4/T5).
- **Placeholders:** none.
- **Type consistency:** `createGallery` returns `{ show, go, index, count, entries, hotspot }` and app.js/check.mjs use exactly those; `mergeOwned(existing, ownedKinds, entriesById)` is called that way by both tools and the tests; `labelOf/chipOf/sortByRank/isVideoKind/RANK` names match across media-kinds, gallery, app.js, media-lib and check.mjs.
