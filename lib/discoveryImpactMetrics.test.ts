import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDiscoveryImpactEventFields } from './discoveryImpactMetrics'

test('buildDiscoveryImpactEventFields returns additive analytics fields shape', () => {
  const fields = buildDiscoveryImpactEventFields({
    preferenceSeedBoost: 1.26,
    sortMode: 'trending',
    positionIndex: 2,
  })

  assert.deepEqual(fields, {
    used_preference_seed: true,
    boost_applied: 1.3,
    sort_mode: 'trending',
    position_index: 2,
  })
})

test('buildDiscoveryImpactEventFields handles null boost safely', () => {
  const fields = buildDiscoveryImpactEventFields({
    preferenceSeedBoost: null,
    sortMode: null,
    positionIndex: 0,
  })

  assert.deepEqual(fields, {
    used_preference_seed: false,
    boost_applied: 0,
    sort_mode: 'default',
    position_index: 0,
  })
})
