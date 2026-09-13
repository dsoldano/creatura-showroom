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
