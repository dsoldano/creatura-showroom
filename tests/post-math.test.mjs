import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HALVES, lightBasis, clampHits, pickHalf, fitShadow, boxBlur } from '../viewer/post-math.js';
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const SITE = { minX: -100, maxX: 100, minZ: -150, maxZ: 150 };

test('lightBasis: orthonormal, right is horizontal, straight-up sun does not degenerate', () => {
  const b = lightBasis([300, 520, 260]);
  for (const v of [b.dir, b.right, b.up]) assert.ok(near(Math.hypot(...v), 1));
  assert.ok(near(b.right[1], 0)); assert.ok(near(dot(b.right, b.dir), 0)); assert.ok(near(dot(b.up, b.dir), 0)); assert.ok(near(dot(b.up, b.right), 0));
  const o = lightBasis([0, 1, 0]); assert.deepEqual(o.right, [1, 0, 0]); assert.deepEqual(o.up.map(v => +v.toFixed(6)), [0, 0, -1]);
});
test('clampHits: inside the padded site; none → the padded corners', () => {
  const c = clampHits([[5000, -5000], [3, 4]], SITE, 40);
  assert.deepEqual(c, [[140, -190], [3, 4]]);
  assert.equal(clampHits([], SITE, 40).length, 4);
});
test('pickHalf: smallest that covers, largest when nothing does, hysteresis keeps the previous box until need drops well below it', () => {
  assert.equal(pickHalf(50), 160); assert.equal(pickHalf(160), 160); assert.equal(pickHalf(161), 320); assert.equal(pickHalf(900), 640); assert.equal(pickHalf(10, [100, 50]), 50);
  assert.equal(pickHalf(150, HALVES, 320), 320, 'still covered and above 40 % of 320 → keep');
  assert.equal(pickHalf(100, HALVES, 320), 160, 'below 40 % of 320 → shrink');
  assert.equal(pickHalf(200, HALVES, 160), 320, 'no longer covered → grow');
});
test('fitShadow (overhead sun): half from the visible extent, centre snapped to the texel grid', () => {
  const basis = lightBasis([0, 1, 0]);
  const near160 = fitShadow([[-40, -40], [60, 40]], SITE, { mapSize: 4096, basis });
  assert.equal(near160.half, 160); assert.ok(near(near160.texel, 320 / 4096));
  assert.ok(near(near160.centre[0] / near160.texel, Math.round(near160.centre[0] / near160.texel), 1e-6), 'x on the grid');
  assert.ok(Math.abs(near160.centre[0] - 10) <= near160.texel && Math.abs(near160.centre[2] - 0) <= near160.texel, 'centre near the box middle');
  const wide = fitShadow([[-300, -300], [300, 300]], SITE, { mapSize: 2048, basis });
  assert.equal(wide.half, 320, 'clamped to site±40 (280×380) → half-extent 190 → 320');
  assert.equal(fitShadow([], SITE, { mapSize: 1024, basis }).half, 320);
});
test('fitShadow (tilted sun): centre is perpendicular to the light direction and snapped in light space', () => {
  const basis = lightBasis([-0.83, 0.225, 0.51]);
  const f = fitShadow([[10, 20], [90, 60], [30, 70]], SITE, { mapSize: 4096, basis });
  assert.ok(near(dot(f.centre, basis.dir), 0, 1e-6));
  const u = dot(f.centre, basis.right), v = dot(f.centre, basis.up);
  assert.ok(near(u / f.texel, Math.round(u / f.texel), 1e-6)); assert.ok(near(v / f.texel, Math.round(v / f.texel), 1e-6));
  assert.equal(f.half, 160);
});
test('boxBlur: constant stays constant; a delta spreads to a (2r+1)² plateau and keeps its sum', () => {
  const w = 21, h = 21, flat = new Float32Array(w * h).fill(0.5);
  assert.ok(boxBlur(flat, w, h, 3).every(v => near(v, 0.5)));
  const d = new Float32Array(w * h); d[10 * w + 10] = 1; const o = boxBlur(d, w, h, 2);
  assert.ok(near(o[10 * w + 10], 1 / 25)); assert.ok(near(o[8 * w + 12], 1 / 25)); assert.ok(near(o[7 * w + 10], 0));
  assert.ok(near(o.reduce((a, b) => a + b, 0), 1, 1e-5));
});
