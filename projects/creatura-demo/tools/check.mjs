// Live checks for a deployed/served viewer. usage: node tools/check.mjs <viewer url with ?project=… or a deployed project url>
import { chromium } from 'playwright';
import { RANK } from '../viewer/media-kinds.js';
const url = process.argv[2]; if (!url) { console.error('usage: node tools/check.mjs <url>'); process.exit(2); }
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (info ? '  — ' + info : '')); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const p = await ctx.newPage();   // reduced motion: the gallery scrolls instantly (SwiftShader cannot animate a smooth scroll)
const errs = []; const wire = pg => { pg.on('pageerror', e => errs.push('pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('requestfailed', r => errs.push('requestfailed: ' + r.url())); }; wire(p);
const u = new URL(url); u.searchParams.set('autostart', '800'); u.searchParams.set('q', 'low'); u.searchParams.set('tourSpeed', '60');
const resp = await p.goto(u.toString(), { waitUntil: 'networkidle', timeout: 90000 }); ok('page loads', !!resp && resp.status() === 200, 'status ' + (resp && resp.status()));
await p.waitForTimeout(4000);
const state = await p.evaluate(() => { const w = window.__walk; if (!w) return null;
  const numbered = w.hotspots.filter(h => typeof h.n === 'number').length;
  const pins = document.querySelectorAll('#labels .pin').length;
  const imgs = w.hotspots.map(h => ({ id: h.id, file: h.images[0] && h.images[0].file, kind: h.images[0] && h.images[0].kind }));
  const media = w.hotspots.map(h => ({ id: h.id, kinds: h.images.map(e => e.kind), files: h.images.map(e => e.file || e.poster) }));
  return { numbered, pins, trees: w.treeCount, imgs, media, wantNumbered: w.site.hotspots.filter(h => typeof h.n === 'number').length, wantPins: w.site.hotspots.length, base: w.site.slug, fitOverview: w.shadowFit ? w.shadowFit.half : null, groundAO: w.groundAO };
});
ok('viewer booted (window.__walk)', !!state);
if (state) {
  // the WebGL buffer is not readable after present (no preserveDrawingBuffer), so judge blankness by JPEG entropy of a canvas capture
  const jpg = await p.locator('#gl').screenshot({ type: 'jpeg', quality: 60, timeout: 150000 }); ok('canvas is non-blank', jpg.length > 40000, 'jpeg bytes=' + jpg.length);
  ok(`${state.wantNumbered} numbered hotspots + ${state.wantPins - state.wantNumbered} tower pins in DOM`, state.numbered === state.wantNumbered && state.pins === state.wantPins, `numbered=${state.numbered} pins=${state.pins}`);
  ok('trees planted', state.trees > 100, 'trees=' + state.trees);
  const gr = await p.evaluate(() => ({ ...window.__walk.greenery, want: { variants: window.__walk.tier.canopy.variants, lawn: window.__walk.tier.lawn, water: window.__walk.tier.waterFps > 0 } }));
  ok('greenery: hedges on the plan\'s thin green strips; canopy variants, lawn and water match the tier', gr.hedges >= 100 && gr.trees >= 100 && gr.variants === gr.want.variants && gr.lawn === gr.want.lawn && gr.water === gr.want.water, JSON.stringify({ trees: gr.trees, hedges: gr.hedges, variants: gr.variants, lawn: gr.lawn, water: gr.water }));
  ok('ground AO map painted (1024 px, building bases + trees + hedges darken the plan)', !!state.groundAO && state.groundAO.size[0] === 1024 && state.groundAO.darkened > 0.02 && state.groundAO.darkened < 0.6, JSON.stringify(state.groundAO));
  const fac = await p.evaluate(() => { const w = window.__walk; return { info: w.facades || [], block: !!w.site.facades, floors: Object.fromEntries(w.site.volumes.map(v => [v.id, v.floors])) }; });
  const finsVols = fac.info.filter(f => f.style === 'fins');
  ok('facades: every fins-style volume has paired fins, corner piers, one slab ring per floor and a source label', !fac.block || (finsVols.length > 0 && finsVols.every(f => f.fins >= 8 && f.piers >= 3 && f.rings === fac.floors[f.id] && !!f.source)), JSON.stringify(finsVols.map(f => [f.id, f.fins, f.piers, f.rings, !!f.source])));
  const missing = state.imgs.filter(i => !i.file); ok('every hotspot has a postcard', missing.length === 0, missing.length ? 'missing: ' + missing.map(m => m.id).join(',') : `${state.imgs.length} images`);
  const base = new URL(u.searchParams.get('project') || './', u).toString();
  const files = [...new Set(state.media.flatMap(m => m.files).filter(Boolean))]; let bad = 0;
  for (const f of files) { const r = await p.request.get(base + 'postcards/' + f); const len = +(r.headers()['content-length'] || 0); if (!r.ok() || (len && len < 2000)) { bad++; console.log('   bad file', f, r.status(), len); } }
  ok('every media file of every hotspot loads (200, >2 KB)', bad === 0, 'checked ' + files.length);
  ok('hero order follows ruling 4 (provenance first) on every hotspot', state.media.every(m => m.kinds.every((k, i) => i === 0 || (RANK[k] ?? 99) >= (RANK[m.kinds[i - 1]] ?? 99))), JSON.stringify(state.media.filter(m => m.kinds.length > 1).slice(0, 3)));
  // interaction 1: click a pin at the overview (all pins are in the frustum here)
  await p.click('#labels .pin[data-id="stepped-well-plaza"]'); await p.waitForTimeout(2400);
  const det2 = await p.evaluate(() => ({ name: document.getElementById('dName').textContent, sel: window.__walk.selected, hidden: document.getElementById('panelDetail').hidden }));
  ok('clicking a pin selects it and opens the detail', det2.sel === 'stepped-well-plaza' && det2.name === 'Stepped well plaza' && !det2.hidden, JSON.stringify(det2));
  // interaction 2: back to the list, select from the list, confirm image + deep link
  await p.click('#btnBack'); await p.click('#hotlist li.item[data-id="tennis-court"]'); await p.waitForTimeout(2400);
  const det = await p.evaluate(() => ({ hidden: document.getElementById('panelDetail').hidden, name: document.getElementById('dName').textContent, sel: window.__walk.selected, src: (() => { const im = document.querySelector('#dStrip .slide.active img'); return im ? im.getAttribute('src') : null; })(), hash: location.hash }));
  ok('selecting from the list opens the detail with image + deep link', !det.hidden && det.name === 'Tennis court' && det.sel === 'tennis-court' && !!det.src && det.hash === '#h=tennis-court', JSON.stringify(det));
  const gal = await p.evaluate(async () => { const w = window.__walk; const two = w.hotspots.find(h => h.images.length >= 2); if (!two) return { skipped: true }; w.select(two.id, false);
    const g = w.gallery, dots = document.querySelectorAll('#dDots .dot').length, badge0 = document.getElementById('dBadge').textContent, i0 = g.index; g.go(1); await new Promise(r => setTimeout(r, 900));
    const badge1 = document.getElementById('dBadge').textContent, scrolled = document.getElementById('dStrip').scrollLeft > 10, i1 = g.index;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await new Promise(r => setTimeout(r, 900));
    return { id: two.id, count: g.count, dots, i0, i1, badge0, badge1, scrolled, back: g.index, kinds: g.entries.map(e => e.kind) }; });
  ok('gallery: a two-entry hotspot shows dots, go(1) scrolls the strip and relabels the badge, ← returns', gal.skipped || (gal.count >= 2 && gal.dots === gal.count && gal.i0 === 0 && gal.i1 === 1 && gal.badge1 !== gal.badge0 && gal.scrolled && gal.back === 0), JSON.stringify(gal));
  await p.evaluate(() => { const w = window.__walk; w.flyTo({ ...w.currentView(), radius: 60, phi: 0.35 }, 100); }); await p.waitForTimeout(1500);   // zoom floor, steep pitch: little ground in view
  const fitClose = await p.evaluate(() => window.__walk.shadowFit && window.__walk.shadowFit.half);
  ok('fitted shadow frustum: 320 (or 640) at the overview, 160 when zoomed in at the floor (light-space fit, texel-snapped)', [640, 320].includes(state.fitOverview) && fitClose === 160, JSON.stringify({ overview: state.fitOverview, close: fitClose }));
  await p.evaluate(() => window.__walk.flyTo(window.__walk.fitView(), 100)); await p.waitForTimeout(1500);   // back to the overview for the theme + tour checks
  await p.click('#btnBack'); await p.click('#themes button[data-theme="sports"]'); await p.waitForTimeout(300);
  const th = await p.evaluate(() => ({ dim: document.querySelectorAll('#labels .pin.dim').length, shown: document.querySelectorAll('#hotlist li.item:not(.filtered)').length }));
  ok('theme filter dims other pins and filters the list', th.dim > 30 && th.shown === 6, JSON.stringify(th));
  // tours: play each at 25x and confirm it ends, selects hotspots on the way, and leaves no errors
  await p.click('#btnBack').catch(() => {}); await p.click('#themes button[data-theme=""]');
  const tourRes = await p.evaluate(async () => { const w = window.__walk; const out = []; for (const t of w.site.tours) { const seen = new Set(); w.startTour(t.id); const t0 = Date.now();
      while (w.tour && Date.now() - t0 < 90000) { if (w.selected) seen.add(w.selected); await new Promise(r => setTimeout(r, 120)); } out.push({ id: t.id, ended: w.tourState.ended.includes(t.id), seen: seen.size }); } return out; });
  ok('three tours run to completion (60x on this software renderer), each passing ≥3 hotspots', tourRes.length === 3 && tourRes.every(t => t.ended && t.seen >= 3), JSON.stringify(tourRes));
}
// ---- quality tiers: each boots as itself, keeps the flicker contract (opaque canvas = clear alpha 1, log depth, plinth cap -0.3), stays under its draw budget, compiles every shader ----
const CEIL = { low: [120, 200000], mid: [140, 300000], high: [220, 700000] };   // [draw calls, triangles] per WHOLE frame incl. the shadow pass (B1 baseline 87 / 98k); recalibrate when a sub-phase adds geometry
const WANT_ENV = { low: false, mid: true, high: true };
const WANT_LOG = { low: true, mid: true, high: false }, WANT_POST = { low: false, mid: false, high: true };   // B4: high renders through the GTAO composer with linear depth; phones keep log depth (flicker fix)
const WANT_G = { low: { variants: 1, lawn: false, water: false }, mid: { variants: 3, lawn: true, water: true }, high: { variants: 3, lawn: true, water: true } };   // B3 greenery per tier (viewer/quality.js)
const tierFacts = () => { const w = window.__walk; if (!w) return null;
  return { quality: w.quality, logDepth: w.renderer.capabilities.logarithmicDepthBuffer, clearAlpha: w.renderer.getClearAlpha(), env: !!w.scene.environment, stats: w.stats(), plinthTopY: w.plinthTopY, greenery: w.greenery, post: w.post.enabled, shadowMapSize: w.sun.shadow.mapSize.x, fitHalf: w.shadowFit && w.shadowFit.half }; };   // r170 always creates the context with alpha:true; the renderer's alpha:false is a clear alpha of 1
const facts = { low: state ? await p.evaluate(tierFacts) : null }; let aoDiff = null;
for (const tier of ['mid', 'high']) {
  const pg = await ctx.newPage(); wire(pg);
  const tu = new URL(url); tu.searchParams.set('autostart', '800'); tu.searchParams.set('q', tier);
  const t0 = Date.now(); const r = await pg.goto(tu.toString(), { waitUntil: 'networkidle', timeout: 120000 });
  const booted = await pg.waitForFunction(() => !!window.__walk, null, { timeout: 180000 }).then(() => true).catch(() => false); await pg.waitForTimeout(3000);   // boot = top-level awaits + tree planting + (mid) two environment bakes; slow under software GL
  facts[tier] = r && r.status() === 200 && booted ? { ...(await pg.evaluate(tierFacts)), bootMs: Date.now() - t0 } : { failed: { status: r && r.status(), booted, ms: Date.now() - t0 } };
  if (tier === 'high' && facts.high && !facts.high.failed) {   // A/B: the same frame with the AO pass on, then off — GTAO must change the picture, and only modestly
    const shotA = await pg.locator('#gl').screenshot({ type: 'png', timeout: 240000 });
    const f0 = await pg.evaluate(() => window.__walk.renderer.info.render.frame);
    await pg.evaluate(() => { window.__walk.post.enabled = false; }); await pg.waitForFunction(f0 => window.__walk.renderer.info.render.frame >= f0 + 2, f0, { timeout: 120000 });
    const shotB = await pg.locator('#gl').screenshot({ type: 'png', timeout: 240000 });
    aoDiff = await pg.evaluate(async ([a, b]) => { const load = src => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = src; }); const A = await load(a), B = await load(b);
      const W = Math.min(A.width, B.width), H = Math.min(A.height, B.height), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, W, H).data; g.clearRect(0, 0, W, H); g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, W, H).data;
      let sum = 0, changed = 0; for (let i = 0; i < da.length; i += 4) { const d0 = Math.abs(da[i] - db[i]), d1 = Math.abs(da[i + 1] - db[i + 1]), d2 = Math.abs(da[i + 2] - db[i + 2]); sum += d0 + d1 + d2; if (Math.max(d0, d1, d2) > 6) changed++; }
      // changed = share of pixels moved by > 6 levels: framing-independent, 0 when the pass is stuck on
      return { meanAbsDiff: +(sum / (da.length / 4 * 3)).toFixed(2), changed: +(changed / (da.length / 4)).toFixed(4), w: W, h: H }; }, ['data:image/png;base64,' + shotA.toString('base64'), 'data:image/png;base64,' + shotB.toString('base64')]);
  }
  await pg.close();
}
for (const tier of ['low', 'mid', 'high']) {
  const f = facts[tier] && !facts[tier].failed ? facts[tier] : null; const why = facts[tier] && facts[tier].failed ? JSON.stringify(facts[tier]) : '';
  ok(`tier ${tier} boots as itself (env map ${WANT_ENV[tier] ? 'on' : 'off'}, log depth ${WANT_LOG[tier] ? 'on' : 'off'}, AO pass ${WANT_POST[tier] ? 'on' : 'off'}, ${[4096, 2048, 1024][['high', 'mid', 'low'].indexOf(tier)]} shadow map, opaque canvas, plinth cap -0.3, ${WANT_G[tier].variants} canopy variant(s), lawn ${WANT_G[tier].lawn ? 'on' : 'off'}, water ${WANT_G[tier].water ? 'rippled' : 'flat'})`,
    !!f && f.quality === tier && f.env === WANT_ENV[tier] && f.logDepth === WANT_LOG[tier] && f.post === WANT_POST[tier] && f.shadowMapSize === [4096, 2048, 1024][['high', 'mid', 'low'].indexOf(tier)] && f.clearAlpha === 1 && f.plinthTopY === -0.3 && !!f.greenery && f.greenery.hedges >= 100 && f.greenery.variants === WANT_G[tier].variants && f.greenery.lawn === WANT_G[tier].lawn && f.greenery.water === WANT_G[tier].water, f ? JSON.stringify(f) : why);
  ok(`tier ${tier} draw budget (≤${CEIL[tier][0]} calls, ≤${CEIL[tier][1]} tris)`, !!f && f.stats.calls > 0 && f.stats.calls <= CEIL[tier][0] && f.stats.triangles <= CEIL[tier][1], f ? JSON.stringify(f.stats) : 'no facts');
}
ok('GTAO changes the high-tier frame (A/B: AO pass on vs off — > 1 % of pixels move by > 6 levels, mean |Δ| < 40)', !!aoDiff && aoDiff.changed > 0.01 && aoDiff.meanAbsDiff < 40, JSON.stringify(aoDiff));
ok('no shader compile errors on any tier', !errs.some(e => /Shader Error|WebGLProgram|WebGLShader|GLSL/i.test(e)), errs.filter(e => /Shader|GLSL/i.test(e)).slice(0, 3).join(' | '));
ok('zero console errors / failed requests', errs.length === 0, errs.slice(0, 5).join(' | '));
await b.close();
const fails = results.filter(r => !r.pass).length; console.log(`\n${results.length - fails}/${results.length} checks passed`); process.exit(fails ? 1 : 0);
