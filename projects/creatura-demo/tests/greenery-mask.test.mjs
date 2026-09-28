import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masksFrom, morph, thinOf, strandYaw, waterNormalData, TREE_RULE, LAWN_RULE } from '../viewer/greenery-mask.js';

const W = 40, H = 40;
const blank = () => new Uint8Array(W * H);
const disc = (m, cx, cy, r) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * W + x] = 1; return m; };
const strip = (m, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = 1; return m; };
const count = m => m.reduce((a, v) => a + v, 0);

test('colour rules: dark green is tree, light green is lawn, grey is neither', () => {
  assert.equal(TREE_RULE(70, 130, 60), true); assert.equal(LAWN_RULE(70, 130, 60), false);
  assert.equal(LAWN_RULE(150, 200, 120), true); assert.equal(TREE_RULE(150, 200, 120), false);
  assert.equal(TREE_RULE(180, 180, 180), false); assert.equal(LAWN_RULE(180, 180, 180), false);
});
test('masksFrom reads RGBA', () => {
  const data = new Uint8ClampedArray([70, 130, 60, 255, 150, 200, 120, 255, 180, 180, 180, 255, 0, 0, 0, 255]);
  const m = masksFrom(data, 2, 2); assert.deepEqual([...m.tree], [1, 0, 0, 0]); assert.deepEqual([...m.lawn], [0, 1, 0, 0]);
});
test('morph: erosion shrinks a disc, dilation grows it, outside the image is empty', () => {
  const d = disc(blank(), 20, 20, 8); const e = morph(d, W, H, 2, true), g = morph(d, W, H, 2, false);
  assert.ok(count(e) < count(d) && count(g) > count(d)); assert.equal(e[20 * W + 20], 1); assert.equal(e[20 * W + 13], 0);
  const edge = strip(blank(), 0, 0, 3, 39); assert.equal(morph(edge, W, H, 1, true)[0], 0, 'a cell on the image edge erodes');
});
test('thinOf: a 3-wide strip is thin, a 17-wide disc is not, a disc with 1-cell highlight holes closes before the test', () => {
  const m = strip(disc(blank(), 12, 12, 8), 0, 30, 39, 32);
  const t = thinOf(m, W, H);
  for (let x = 2; x < W - 2; x++) assert.equal(t[31 * W + x], 1, 'strip cell ' + x);
  assert.equal(t[12 * W + 12], 0, 'disc centre is not thin');
  const ring = disc(blank(), 12, 12, 8); for (let y = 8; y <= 16; y += 2) for (let x = 8; x <= 16; x += 2) ring[y * W + x] = 0;
  assert.equal(thinOf(ring, W, H)[12 * W + 12], 0, 'holes are closed before the thinness test');
});
test('strandYaw follows the strip axis', () => {
  const hz = strip(blank(), 0, 19, 39, 21), vt = strip(blank(), 19, 0, 21, 39);
  assert.ok(Math.abs(strandYaw(hz, W, H, 20, 20)) < 0.05);
  assert.ok(Math.abs(Math.abs(strandYaw(vt, W, H, 20, 20)) - Math.PI / 2) < 0.05);
});
test('waterNormalData: unit normals, mostly up, seamless at the tile edge', () => {
  const S = 64, d = waterNormalData(S); assert.equal(d.length, S * S * 4);
  let maxLenErr = 0, sumZ = 0;
  for (let i = 0; i < S * S; i++) { const nx = d[i * 4] / 127.5 - 1, ny = d[i * 4 + 1] / 127.5 - 1, nz = d[i * 4 + 2] / 127.5 - 1; maxLenErr = Math.max(maxLenErr, Math.abs(Math.hypot(nx, ny, nz) - 1)); sumZ += nz; }
  assert.ok(maxLenErr < 0.02, 'unit length: ' + maxLenErr); assert.ok(sumZ / (S * S) > 0.9, 'mostly up');
  let seam = 0; for (let y = 0; y < S; y++) for (let c = 0; c < 3; c++) seam = Math.max(seam, Math.abs(d[(y * S) * 4 + c] - d[(y * S + S - 1) * 4 + c]));
  assert.ok(seam < 40, 'left/right columns are neighbours when tiled: ' + seam);
});
