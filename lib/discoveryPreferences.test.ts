import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHiddenTargetSets,
  parseDiscoveryPreferencePayload,
  upsertDiscoveryPreferenceRows,
} from './discoveryPreferences'

test('parseDiscoveryPreferencePayload validates input and target ids', () => {
  const valid = parseDiscoveryPreferencePayload({
    target_type: 'project',
    target_id: '123e4567-e89b-12d3-a456-426614174000',
    preference: 'hide',
  })
  assert.equal(valid.ok, true)

  const invalidTargetType = parseDiscoveryPreferencePayload({
    target_type: 'track',
    target_id: '123e4567-e89b-12d3-a456-426614174000',
    preference: 'hide',
  })
  assert.equal(invalidTargetType.ok, false)

  const invalidTargetId = parseDiscoveryPreferencePayload({
    target_type: 'creator',
    target_id: 'not-a-uuid',
    preference: 'hide',
  })
  assert.equal(invalidTargetId.ok, false)
})

test('buildHiddenTargetSets maps hidden projects and creators', () => {
  const sets = buildHiddenTargetSets([
    {
      target_type: 'project',
      target_id: '123e4567-e89b-12d3-a456-426614174000',
      preference: 'hide',
    },
    {
      target_type: 'creator',
      target_id: '123e4567-e89b-12d3-a456-426614174001',
      preference: 'hide',
    },
    {
      target_type: 'creator',
      target_id: '123e4567-e89b-12d3-a456-426614174002',
      preference: 'mute',
    },
  ])

  assert.equal(sets.hiddenProjectIds.has('123e4567-e89b-12d3-a456-426614174000'), true)
  assert.equal(sets.hiddenCreatorIds.has('123e4567-e89b-12d3-a456-426614174001'), true)
  assert.equal(sets.hiddenCreatorIds.has('123e4567-e89b-12d3-a456-426614174002'), false)
})

test('upsertDiscoveryPreferenceRows keeps idempotent uniqueness', () => {
  const row = {
    user_id: '123e4567-e89b-12d3-a456-426614174010',
    target_type: 'project' as const,
    target_id: '123e4567-e89b-12d3-a456-426614174020',
    preference: 'hide' as const,
  }
  const once = upsertDiscoveryPreferenceRows([], row)
  const twice = upsertDiscoveryPreferenceRows(once, row)
  assert.equal(once.length, 1)
  assert.equal(twice.length, 1)
})
