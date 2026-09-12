import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveQuality, TIERS } from '../viewer/quality.js';

test('an explicit ?q wins over the device', () => {
  assert.equal(resolveQuality('low', false), 'low');
  assert.equal(resolveQuality('mid', false), 'mid');
  assert.equal(resolveQuality('high', true), 'high');
});

test('no or unknown ?q falls back by pointer type', () => {
  assert.equal(resolveQuality(null, true), 'mid');
  assert.equal(resolveQuality(undefined, false), 'high');
  assert.equal(resolveQuality('ultra', true), 'mid');
  assert.equal(resolveQuality('toString', false), 'high');   // must not resolve through Object.prototype
});

test('phone and check tiers keep the flicker contract; low has no environment map', () => {
  for (const [name, t] of Object.entries(TIERS)) {
    assert.equal(typeof t.dpr, 'number', name + '.dpr');
    assert.ok(['live', 'cached', 'none'].includes(t.pmrem), name + '.pmrem');
    assert.equal(typeof t.shadowMap, 'number', name + '.shadowMap');
    assert.equal(typeof t.hemiScale, 'number', name + '.hemiScale');
  }
  assert.equal(TIERS.mid.logDepth, true); assert.equal(TIERS.mid.alpha, false);
  assert.equal(TIERS.low.logDepth, true); assert.equal(TIERS.low.alpha, false);
  assert.equal(TIERS.low.pmrem, 'none');
  assert.equal(TIERS.low.dpr, 1);
});
