// Screenshot a viewer URL at desktop + phone sizes, report console errors.
// usage: node tools/shoot.mjs <url> <outPrefix> [waitMs=6500]
import { chromium } from 'playwright';
const [url, prefix, waitArg] = process.argv.slice(2);
const wait = +(waitArg || 6500);
const sizes = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = false;
for (const [name, vp] of Object.entries(sizes)) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor || 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  p.on('requestfailed', r => errs.push('requestfailed: ' + r.url()));
  await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(wait);
  const out = `${prefix}-${name}.png`;
  await p.screenshot({ path: out });
  const stats = await p.evaluate(() => {
    const w = window.__walk; if (!w) return null;
    const info = w.renderer.info; const c = document.getElementById('gl');
    return { calls: info.render.calls, tris: info.render.triangles, canvas: [c.width, c.height], cam: w.camera.position.toArray().map(v => +v.toFixed(0)) };
  });
  console.log(name, out, JSON.stringify(stats), errs.length ? '\n  ' + errs.join('\n  ') : 'no console errors');
  if (errs.length) failed = true;
  await ctx.close();
}
await b.close();
process.exit(failed ? 2 : 0);
