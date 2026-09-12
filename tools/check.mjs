// Live checks for a deployed/served viewer. usage: node tools/check.mjs <viewer url with ?project=… or a deployed project url>
import { chromium } from 'playwright';
const url = process.argv[2]; if (!url) { console.error('usage: node tools/check.mjs <url>'); process.exit(2); }
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (info ? '  — ' + info : '')); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
const errs = []; const wire = pg => { pg.on('pageerror', e => errs.push('pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('requestfailed', r => errs.push('requestfailed: ' + r.url())); }; wire(p);
const u = new URL(url); u.searchParams.set('autostart', '800'); u.searchParams.set('q', 'low'); u.searchParams.set('tourSpeed', '60');
const resp = await p.goto(u.toString(), { waitUntil: 'networkidle', timeout: 90000 }); ok('page loads', !!resp && resp.status() === 200, 'status ' + (resp && resp.status()));
await p.waitForTimeout(4000);
const state = await p.evaluate(() => { const w = window.__walk; if (!w) return null;
  const numbered = w.hotspots.filter(h => typeof h.n === 'number').length;
  const pins = document.querySelectorAll('#labels .pin').length;
  const imgs = w.hotspots.map(h => ({ id: h.id, file: h.images[0] && h.images[0].file, kind: h.images[0] && h.images[0].kind }));
  return { numbered, pins, trees: w.treeCount, imgs, base: w.site.slug };
});
ok('viewer booted (window.__walk)', !!state);
if (state) {
  // the WebGL buffer is not readable after present (no preserveDrawingBuffer), so judge blankness by JPEG entropy of a canvas capture
  const jpg = await p.locator('#gl').screenshot({ type: 'jpeg', quality: 60, timeout: 150000 }); ok('canvas is non-blank', jpg.length > 40000, 'jpeg bytes=' + jpg.length);
  ok('41 numbered hotspots + 3 tower pins in DOM', state.numbered === 41 && state.pins === 44, `numbered=${state.numbered} pins=${state.pins}`);
  ok('trees planted', state.trees > 100, 'trees=' + state.trees);
  const fac = await p.evaluate(() => { const w = window.__walk; return { info: w.facades || [], block: !!w.site.facades, floors: Object.fromEntries(w.site.volumes.map(v => [v.id, v.floors])) }; });
  const finsVols = fac.info.filter(f => f.style === 'fins');
  ok('facades: every fins-style volume has paired fins, corner piers, one slab ring per floor and a source label', !fac.block || (finsVols.length > 0 && finsVols.every(f => f.fins >= 8 && f.piers >= 3 && f.rings === fac.floors[f.id] && !!f.source)), JSON.stringify(finsVols.map(f => [f.id, f.fins, f.piers, f.rings, !!f.source])));
  const missing = state.imgs.filter(i => !i.file); ok('every hotspot has a postcard', missing.length === 0, missing.length ? 'missing: ' + missing.map(m => m.id).join(',') : `${state.imgs.length} images`);
  const base = new URL(u.searchParams.get('project') || './', u).toString();
  let bad = 0; for (const i of state.imgs) { if (!i.file) continue; const r = await p.request.get(base + 'postcards/' + i.file); const len = +(r.headers()['content-length'] || 0); if (!r.ok() || (len && len < 2000)) { bad++; console.log('   bad image', i.file, r.status(), len); } }
  ok('all postcard files load (200, >2 KB)', bad === 0, 'checked ' + state.imgs.length);
  // interaction 1: click a pin at the overview (all pins are in the frustum here)
  await p.click('#labels .pin[data-id="stepped-well-plaza"]'); await p.waitForTimeout(2400);
  const det2 = await p.evaluate(() => ({ name: document.getElementById('dName').textContent, sel: window.__walk.selected, hidden: document.getElementById('panelDetail').hidden }));
  ok('clicking a pin selects it and opens the detail', det2.sel === 'stepped-well-plaza' && det2.name === 'Stepped well plaza' && !det2.hidden, JSON.stringify(det2));
  // interaction 2: back to the list, select from the list, confirm image + deep link
  await p.click('#btnBack'); await p.click('#hotlist li.item[data-id="tennis-court"]'); await p.waitForTimeout(2400);
  const det = await p.evaluate(() => ({ hidden: document.getElementById('panelDetail').hidden, name: document.getElementById('dName').textContent, sel: window.__walk.selected, src: document.getElementById('dImg').getAttribute('src'), hash: location.hash }));
  ok('selecting from the list opens the detail with image + deep link', !det.hidden && det.name === 'Tennis court' && det.sel === 'tennis-court' && !!det.src && det.hash === '#h=tennis-court', JSON.stringify(det));
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
const tierFacts = () => { const w = window.__walk; if (!w) return null;
  return { quality: w.quality, logDepth: w.renderer.capabilities.logarithmicDepthBuffer, clearAlpha: w.renderer.getClearAlpha(), env: !!w.scene.environment, stats: w.stats(), plinthTopY: w.plinthTopY }; };   // r170 always creates the context with alpha:true; the renderer's alpha:false is a clear alpha of 1
const facts = { low: state ? await p.evaluate(tierFacts) : null };
for (const tier of ['mid', 'high']) {
  const pg = await ctx.newPage(); wire(pg);
  const tu = new URL(url); tu.searchParams.set('autostart', '800'); tu.searchParams.set('q', tier);
  const t0 = Date.now(); const r = await pg.goto(tu.toString(), { waitUntil: 'networkidle', timeout: 120000 });
  const booted = await pg.waitForFunction(() => !!window.__walk, null, { timeout: 180000 }).then(() => true).catch(() => false); await pg.waitForTimeout(3000);   // boot = top-level awaits + tree planting + (mid) two environment bakes; slow under software GL
  facts[tier] = r && r.status() === 200 && booted ? { ...(await pg.evaluate(tierFacts)), bootMs: Date.now() - t0 } : { failed: { status: r && r.status(), booted, ms: Date.now() - t0 } }; await pg.close();
}
for (const tier of ['low', 'mid', 'high']) {
  const f = facts[tier] && !facts[tier].failed ? facts[tier] : null; const why = facts[tier] && facts[tier].failed ? JSON.stringify(facts[tier]) : '';
  ok(`tier ${tier} boots as itself (env map ${WANT_ENV[tier] ? 'on' : 'off'}, log depth on, opaque canvas, plinth cap -0.3)`,
    !!f && f.quality === tier && f.env === WANT_ENV[tier] && f.logDepth === true && f.clearAlpha === 1 && f.plinthTopY === -0.3, f ? JSON.stringify(f) : why);
  ok(`tier ${tier} draw budget (≤${CEIL[tier][0]} calls, ≤${CEIL[tier][1]} tris)`, !!f && f.stats.calls > 0 && f.stats.calls <= CEIL[tier][0] && f.stats.triangles <= CEIL[tier][1], f ? JSON.stringify(f.stats) : 'no facts');
}
ok('no shader compile errors on any tier', !errs.some(e => /Shader Error|WebGLProgram|WebGLShader|GLSL/i.test(e)), errs.filter(e => /Shader|GLSL/i.test(e)).slice(0, 3).join(' | '));
ok('zero console errors / failed requests', errs.length === 0, errs.slice(0, 5).join(' | '));
await b.close();
const fails = results.filter(r => !r.pass).length; console.log(`\n${results.length - fails}/${results.length} checks passed`); process.exit(fails ? 1 : 0);
