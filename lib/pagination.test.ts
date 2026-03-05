import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPaginatedItems, parseOffsetLimitQuery } from './pagination'

test('parseOffsetLimitQuery validates strict limit and offset', () => {
  assert.deepEqual(
    parseOffsetLimitQuery({
      rawLimit: null,
      rawOffset: null,
      defaultLimit: 20,
      maxLimit: 50,
    }),
    { ok: true, limit: 20, offset: 0 }
  )
  assert.equal(
    parseOffsetLimitQuery({
      rawLimit: '0',
      rawOffset: '0',
      defaultLimit: 20,
      maxLimit: 50,
    }).ok,
    false
  )
  assert.equal(
    parseOffsetLimitQuery({
      rawLimit: '10',
      rawOffset: '-1',
      defaultLimit: 20,
      maxLimit: 50,
    }).ok,
    false
  )
})

test('buildPaginatedItems returns hasMore and nextOffset correctly', () => {
  const page1 = buildPaginatedItems({
    rows: [1, 2, 3],
    limit: 2,
    offset: 0,
  })
  assert.deepEqual(page1, {
    items: [1, 2],
    limit: 2,
    offset: 0,
    hasMore: true,
    nextOffset: 2,
  })

  const page2 = buildPaginatedItems({
    rows: [3, 4],
    limit: 2,
    offset: 2,
  })
  assert.deepEqual(page2, {
    items: [3, 4],
    limit: 2,
    offset: 2,
    hasMore: false,
    nextOffset: null,
  })
})
