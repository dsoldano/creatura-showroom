import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFacade, edgeFrames, offsetPolygon, finLayout, pierLayout, FACADE_DEFAULTS } from '../viewer/facade-geom.js';
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const SQ = [[0, 0], [10, 0], [10, 10], [0, 10]];

test('resolveFacade: no block → today\'s banded/ghost/plain looks', () => {
  assert.equal(resolveFacade({ kind: 'tower' }).style, 'banded');
  assert.equal(resolveFacade({ kind: 'clubhouse' }).style, 'banded');
  assert.deepEqual(resolveFacade({ kind: 'future' }), { style: 'ghost', rhythm: 'none' });
  assert.equal(resolveFacade({ kind: 'services' }).style, 'plain');
  assert.equal(resolveFacade({ kind: 'unknown' }).style, 'plain');
});
test('resolveFacade: site block + presets + per-volume override', () => {
  const site = { tower: { style: 'fins', bayM: 3.7, source: 'read from the render' }, future: { style: 'ghost', rhythm: 'faint' } };
  const t = resolveFacade({ kind: 'tower' }, site);
  assert.equal(t.style, 'fins'); assert.equal(t.fins, true); assert.equal(t.bayM, 3.7); assert.equal(t.finW, 0.4); assert.equal(t.recess, 0.5); assert.equal(t.source, 'read from the render');
  assert.equal(resolveFacade({ kind: 'future' }, site).rhythm, 'faint');
  assert.equal(resolveFacade({ kind: 'tower', facade: 'stoneGlass' }, site).fins, false);
  assert.equal(resolveFacade({ kind: 'tower', facade: { style: 'fins', bayM: 5 } }, site).bayM, 5);
});
test('edgeFrames: outward normals for either winding', () => {
  for (const poly of [SQ, [...SQ].reverse()]) {
    const f = edgeFrames(poly);
    for (const e of f) { const mid = [(e.start[0] + e.end[0]) / 2 + e.n[0] * 0.1, (e.start[1] + e.end[1]) / 2 + e.n[1] * 0.1];
      const inside = mid[0] > 0 && mid[0] < 10 && mid[1] > 0 && mid[1] < 10; assert.equal(inside, false, 'normal must point outward'); assert.ok(near(Math.hypot(e.n[0], e.n[1]), 1)); assert.ok(near(e.L, 10)); }
  }
});
test('offsetPolygon: a square insets to a smaller concentric square', () => {
  const inset = offsetPolygon(SQ, 1);
  assert.deepEqual(inset.map(p => p.map(v => +v.toFixed(6))), [[1, 1], [9, 1], [9, 9], [1, 9]]);
  const inset2 = offsetPolygon([...SQ].reverse(), 1);
  assert.deepEqual(inset2.map(p => p.map(v => +v.toFixed(6))).sort(), [[1, 1], [1, 9], [9, 1], [9, 9]].sort());
});
test('finLayout: paired fins per bay, corner fins tall, all between core face and footprint line', () => {
  const cfg = { bayM: 3.7, finW: 0.4, finGap: 0.5, recess: 0.5, crownH: 4.5 };
  const fins = finLayout(edgeFrames(SQ), cfg);
  assert.equal(fins.length, 4 * 2 * Math.round(10 / 3.7));
  assert.equal(fins.filter(f => f.tall).length, 8);
  for (const f of fins) { assert.ok(f.x > 0 && f.x < 10 && f.z > 0 && f.z < 10, 'fin centre inside the footprint'); assert.equal(f.w, 0.4); assert.equal(f.d, 0.5); }
  const bottom = fins.filter(f => near(f.z, 0.25)); assert.equal(bottom.length, 6, 'bottom edge fins sit recess/2 inside the line');
});
test('pierLayout: one pier per vertex, centred between the vertex and its inset', () => {
  const inset = offsetPolygon(SQ, 0.5), piers = pierLayout(SQ, inset, edgeFrames(SQ), { recess: 0.5 });
  assert.equal(piers.length, 4); assert.ok(near(piers[0].x, 0.25) && near(piers[0].z, 0.25)); assert.ok(piers.every(p => p.tall && p.w === 0.5 && p.d === 0.5));
});
test('FACADE_DEFAULTS covers the four known kinds', () => { assert.deepEqual(Object.keys(FACADE_DEFAULTS).sort(), ['clubhouse', 'future', 'services', 'tower']); });
