import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHiddenDiscoveryItems,
  buildHiddenTargetSets,
  parseDiscoveryPreferencePayload,
  parseDiscoveryPreferencesListQuery,
  removeHiddenDiscoveryItem,
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

test('parseDiscoveryPreferencesListQuery validates preference/target/pagination', () => {
  const parsed = parseDiscoveryPreferencesListQuery({
    rawPreference: 'hide',
    rawTargetType: 'creator',
    rawLimit: '10',
    rawOffset: '5',
  })
  assert.equal(parsed.ok, true)
  if (parsed.ok) {
    assert.equal(parsed.preference, 'hide')
    assert.equal(parsed.target_type, 'creator')
    assert.equal(parsed.limit, 10)
    assert.equal(parsed.offset, 5)
  }

  const invalidPreference = parseDiscoveryPreferencesListQuery({
    rawPreference: 'mute',
    rawTargetType: null,
    rawLimit: null,
    rawOffset: null,
  })
  assert.equal(invalidPreference.ok, false)

  const defaults = parseDiscoveryPreferencesListQuery({
    rawPreference: null,
    rawTargetType: null,
    rawLimit: null,
    rawOffset: null,
  })
  assert.equal(defaults.ok, true)
  if (defaults.ok) {
    assert.equal(defaults.limit, 20)
    assert.equal(defaults.offset, 0)
    assert.equal(defaults.preference, 'hide')
  }
})

test('buildHiddenDiscoveryItems uses metadata fallback labels safely', () => {
  const items = buildHiddenDiscoveryItems({
    rows: [
      {
        target_type: 'creator',
        target_id: '123e4567-e89b-12d3-a456-426614174111',
        created_at: '2026-03-10T00:00:00.000Z',
      },
      {
        target_type: 'project',
        target_id: '123e4567-e89b-12d3-a456-426614174222',
        created_at: '2026-03-10T00:00:00.000Z',
      },
    ],
    creatorsById: {},
    projectsById: {},
  })

  assert.equal(items[0].label, 'Unknown creator')
  assert.equal(items[1].label, 'Unknown project')
})

test('removeHiddenDiscoveryItem removes matching item only', () => {
  const next = removeHiddenDiscoveryItem({
    items: [
      { target_type: 'creator' as const, target_id: 'c1' },
      { target_type: 'project' as const, target_id: 'p1' },
    ],
    target_type: 'creator',
    target_id: 'c1',
  })
  assert.deepEqual(next, [{ target_type: 'project', target_id: 'p1' }])
})
