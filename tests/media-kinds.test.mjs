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
