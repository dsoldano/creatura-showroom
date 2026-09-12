// Live checks for a deployed/served viewer. usage: node tools/check.mjs <viewer url with ?project=… or a deployed project url>
import { chromium } from 'playwright';
const url = process.argv[2]; if (!url) { console.error('usage: node tools/check.mjs <url>'); process.exit(2); }
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (info ? '  — ' + info : '')); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('requestfailed', r => errs.push('requestfailed: ' + r.url()));
const u = new URL(url); u.searchParams.set('autostart', '800'); u.searchParams.set('q', 'low');
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
  const tours = state.tours; // placeholder until day 6
}
ok('zero console errors / failed requests', errs.length === 0, errs.slice(0, 5).join(' | '));
await b.close();
const fails = results.filter(r => !r.pass).length; console.log(`\n${results.length - fails}/${results.length} checks passed`); process.exit(fails ? 1 : 0);
