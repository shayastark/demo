import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildExploreProjectItems,
  parseExploreProjectsQuery,
  selectPublicExploreRows,
  type ExploreProjectRow,
} from './explore'
import { buildPaginatedItems } from './pagination'

test('parseExploreProjectsQuery validates sort and pagination', () => {
  const valid = parseExploreProjectsQuery({
    rawSort: 'most_supported',
    rawLimit: '10',
    rawOffset: '20',
    rawQ: 'demo',
  })
  assert.equal(valid.ok, true)
  if (valid.ok) {
    assert.equal(valid.sort, 'most_supported')
    assert.equal(valid.limit, 10)
    assert.equal(valid.offset, 20)
    assert.equal(valid.q, 'demo')
  }

  const invalidSort = parseExploreProjectsQuery({
    rawSort: 'popular',
    rawLimit: null,
    rawOffset: null,
    rawQ: null,
  })
  assert.equal(invalidSort.ok, false)
})

test('selectPublicExploreRows keeps public visibility only', () => {
  const rows: ExploreProjectRow[] = [
    {
      id: 'public-1',
      title: 'Public',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'a',
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'private-1',
      title: 'Private',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'private',
      sharing_enabled: false,
      share_token: 'b',
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'unlisted-1',
      title: 'Unlisted',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'unlisted',
      sharing_enabled: true,
      share_token: 'c',
      created_at: '2026-03-01T00:00:00.000Z',
    },
  ]

  const visible = selectPublicExploreRows(rows)
  assert.deepEqual(visible.map((row) => row.id), ['public-1'])
})

test('buildExploreProjectItems sorts newest and most_supported deterministically', () => {
  const rows: ExploreProjectRow[] = [
    {
      id: 'p-old',
      title: 'Old',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'a',
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'p-new',
      title: 'New',
      cover_image_url: null,
      creator_id: 'c2',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'b',
      created_at: '2026-03-02T00:00:00.000Z',
    },
  ]

  const creatorsById = {
    c1: { id: 'c1', username: 'alpha', email: null },
    c2: { id: 'c2', username: 'beta', email: null },
  }

  const byNewest = buildExploreProjectItems({
    projects: rows,
    creatorsById,
    supporterCountByProjectId: { 'p-old': 100, 'p-new': 1 },
    sort: 'newest',
  })
  assert.deepEqual(byNewest.map((item) => item.project_id), ['p-new', 'p-old'])

  const bySupported = buildExploreProjectItems({
    projects: rows,
    creatorsById,
    supporterCountByProjectId: { 'p-old': 100, 'p-new': 1 },
    sort: 'most_supported',
  })
  assert.deepEqual(bySupported.map((item) => item.project_id), ['p-old', 'p-new'])
})

test('pagination correctness for explore items', () => {
  const rows: ExploreProjectRow[] = Array.from({ length: 6 }, (_, index) => ({
    id: `p-${index}`,
    title: `Project ${index}`,
    cover_image_url: null,
    creator_id: 'c1',
    visibility: 'public',
    sharing_enabled: true,
    share_token: `t-${index}`,
    created_at: `2026-03-0${index + 1}T00:00:00.000Z`,
  }))
  const items = buildExploreProjectItems({
    projects: rows,
    creatorsById: { c1: { id: 'c1', username: 'alpha', email: null } },
    supporterCountByProjectId: {},
    sort: 'newest',
  })
  const pageRows = items.slice(2, 2 + 2 + 1)
  const page = buildPaginatedItems({ rows: pageRows, limit: 2, offset: 2 })
  assert.equal(page.items.length, 2)
  assert.equal(page.hasMore, true)
  assert.equal(page.nextOffset, 4)
})
