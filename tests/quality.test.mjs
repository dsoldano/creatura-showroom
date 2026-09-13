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
    assert.equal(typeof t.facadeShadows, 'boolean', name + '.facadeShadows');
  }
  assert.equal(TIERS.mid.facadeShadows, false); assert.equal(TIERS.high.facadeShadows, true);
  assert.equal(TIERS.mid.logDepth, true); assert.equal(TIERS.mid.alpha, false);
  assert.equal(TIERS.low.logDepth, true); assert.equal(TIERS.low.alpha, false);
  assert.equal(TIERS.low.pmrem, 'none');
  assert.equal(TIERS.low.dpr, 1);
});

test('greenery per tier (spec table): canopy detail/variants 1/3 · 0/3 · 0/1, hedge spacing 1.0/1.5/1.5, lawn + water off on low', () => {
  for (const [name, t] of Object.entries(TIERS)) {
    assert.equal(typeof t.canopy.detail, 'number', name + '.canopy.detail'); assert.ok(t.canopy.variants >= 1, name + '.canopy.variants');
    assert.equal(typeof t.hedgeSpacingM, 'number', name + '.hedgeSpacingM'); assert.equal(typeof t.lawn, 'boolean', name + '.lawn'); assert.equal(typeof t.waterFps, 'number', name + '.waterFps');
  }
  assert.deepEqual(TIERS.high.canopy, { detail: 1, variants: 3 }); assert.deepEqual(TIERS.mid.canopy, { detail: 0, variants: 3 }); assert.deepEqual(TIERS.low.canopy, { detail: 0, variants: 1 });
  assert.equal(TIERS.high.hedgeSpacingM, 1.0); assert.equal(TIERS.mid.hedgeSpacingM, 1.5); assert.equal(TIERS.low.hedgeSpacingM, 1.5);
  assert.equal(TIERS.low.lawn, false); assert.equal(TIERS.low.waterFps, 0); assert.ok(TIERS.mid.lawn && TIERS.mid.waterFps > 0 && TIERS.high.waterFps >= TIERS.mid.waterFps);
});
