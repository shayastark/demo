import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildExploreProjectItems,
  filterExploreRowsByHiddenTargets,
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
  assert.equal(invalidSort.ok, true)
  if (invalidSort.ok) {
    assert.equal(invalidSort.sort, 'trending')
  }
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

test('filterExploreRowsByHiddenTargets excludes hidden projects and creators', () => {
  const rows: ExploreProjectRow[] = [
    {
      id: 'p1',
      title: 'A',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'a',
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'p2',
      title: 'B',
      cover_image_url: null,
      creator_id: 'c2',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'b',
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'p3',
      title: 'C',
      cover_image_url: null,
      creator_id: 'c3',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'c',
      created_at: '2026-03-01T00:00:00.000Z',
    },
  ]

  const filtered = filterExploreRowsByHiddenTargets({
    rows,
    hiddenProjectIds: new Set(['p1']),
    hiddenCreatorIds: new Set(['c2']),
  })

  assert.deepEqual(filtered.map((row) => row.id), ['p3'])
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
    engagementCountByProjectId: {},
    recentUpdatesCountByProjectId: {},
    latestUpdateAtByProjectId: {},
    sort: 'newest',
  })
  assert.deepEqual(byNewest.map((item) => item.project_id), ['p-new', 'p-old'])

  const bySupported = buildExploreProjectItems({
    projects: rows,
    creatorsById,
    supporterCountByProjectId: { 'p-old': 100, 'p-new': 1 },
    engagementCountByProjectId: {},
    recentUpdatesCountByProjectId: {},
    latestUpdateAtByProjectId: {},
    sort: 'most_supported',
  })
  assert.deepEqual(bySupported.map((item) => item.project_id), ['p-old', 'p-new'])
})

test('buildExploreProjectItems trending prioritizes recent engagement', () => {
  const rows: ExploreProjectRow[] = [
    {
      id: 'p-supported-old',
      title: 'Supported old',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'a',
      created_at: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'p-trending',
      title: 'Trending now',
      cover_image_url: null,
      creator_id: 'c2',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'b',
      created_at: '2026-03-02T00:00:00.000Z',
    },
  ]

  const items = buildExploreProjectItems({
    projects: rows,
    creatorsById: {
      c1: { id: 'c1', username: 'old', email: null },
      c2: { id: 'c2', username: 'new', email: null },
    },
    supporterCountByProjectId: { 'p-supported-old': 20, 'p-trending': 1 },
    engagementCountByProjectId: { 'p-supported-old': 0, 'p-trending': 18 },
    recentUpdatesCountByProjectId: { 'p-supported-old': 0, 'p-trending': 5 },
    latestUpdateAtByProjectId: {
      'p-supported-old': '2025-01-03T00:00:00.000Z',
      'p-trending': '2026-03-06T00:00:00.000Z',
    },
    creatorReasonPenaltyById: {},
    sort: 'trending',
  })

  assert.deepEqual(items.map((item) => item.project_id), ['p-trending', 'p-supported-old'])
})

test('buildExploreProjectItems applies creator reason penalty in trending sort', () => {
  const rows: ExploreProjectRow[] = [
    {
      id: 'p-a',
      title: 'A',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'a',
      created_at: '2026-03-06T00:00:00.000Z',
    },
    {
      id: 'p-b',
      title: 'B',
      cover_image_url: null,
      creator_id: 'c2',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'b',
      created_at: '2026-03-06T00:00:00.000Z',
    },
  ]

  const items = buildExploreProjectItems({
    projects: rows,
    creatorsById: {
      c1: { id: 'c1', username: 'alpha', email: null },
      c2: { id: 'c2', username: 'beta', email: null },
    },
    supporterCountByProjectId: { 'p-a': 10, 'p-b': 10 },
    engagementCountByProjectId: { 'p-a': 5, 'p-b': 5 },
    recentUpdatesCountByProjectId: { 'p-a': 3, 'p-b': 3 },
    latestUpdateAtByProjectId: { 'p-a': '2026-03-06T00:00:00.000Z', 'p-b': '2026-03-06T00:00:00.000Z' },
    creatorReasonPenaltyById: { c1: 4 },
    sort: 'trending',
  })

  assert.deepEqual(items.map((item) => item.project_id), ['p-b', 'p-a'])
})

test('buildExploreProjectItems applies onboarding preference boost as lightweight rank signal', () => {
  const rows: ExploreProjectRow[] = [
    {
      id: 'p-a',
      title: 'A',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'a',
      created_at: '2026-03-06T00:00:00.000Z',
    },
    {
      id: 'p-b',
      title: 'B',
      cover_image_url: null,
      creator_id: 'c2',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'b',
      created_at: '2026-03-06T00:00:00.000Z',
    },
  ]

  const items = buildExploreProjectItems({
    projects: rows,
    creatorsById: {
      c1: { id: 'c1', username: 'alpha', email: null },
      c2: { id: 'c2', username: 'beta', email: null },
    },
    supporterCountByProjectId: { 'p-a': 2, 'p-b': 2 },
    engagementCountByProjectId: { 'p-a': 0, 'p-b': 0 },
    recentUpdatesCountByProjectId: { 'p-a': 0, 'p-b': 0 },
    latestUpdateAtByProjectId: { 'p-a': null, 'p-b': null },
    creatorReasonPenaltyById: {},
    projectPreferenceBoostById: { 'p-a': 1.5 },
    sort: 'newest',
  })

  assert.deepEqual(items.map((item) => item.project_id), ['p-a', 'p-b'])
})

test('guardrail: preference boost cannot override newest baseline ordering', () => {
  const rows: ExploreProjectRow[] = [
    {
      id: 'p-old',
      title: 'Older high boost',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'a',
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'p-new',
      title: 'Newer no boost',
      cover_image_url: null,
      creator_id: 'c2',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 'b',
      created_at: '2026-03-10T00:00:00.000Z',
    },
  ]

  const items = buildExploreProjectItems({
    projects: rows,
    creatorsById: {
      c1: { id: 'c1', username: 'alpha', email: null },
      c2: { id: 'c2', username: 'beta', email: null },
    },
    supporterCountByProjectId: { 'p-old': 0, 'p-new': 0 },
    engagementCountByProjectId: { 'p-old': 0, 'p-new': 0 },
    recentUpdatesCountByProjectId: { 'p-old': 0, 'p-new': 0 },
    latestUpdateAtByProjectId: { 'p-old': null, 'p-new': null },
    creatorReasonPenaltyById: {},
    projectPreferenceBoostById: { 'p-old': 999 },
    sort: 'newest',
  })

  assert.deepEqual(items.map((item) => item.project_id), ['p-new', 'p-old'])
  assert.equal((items.find((item) => item.project_id === 'p-old')?.preference_seed_boost || 0) <= 3, true)
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
    engagementCountByProjectId: {},
    recentUpdatesCountByProjectId: {},
    latestUpdateAtByProjectId: {},
    creatorReasonPenaltyById: {},
    sort: 'newest',
  })
  const pageRows = items.slice(2, 2 + 2 + 1)
  const page = buildPaginatedItems({ rows: pageRows, limit: 2, offset: 2 })
  assert.equal(page.items.length, 2)
  assert.equal(page.hasMore, true)
  assert.equal(page.nextOffset, 4)
})

test('stable ordering keeps pagination deterministic for same-score rows', () => {
  const rows: ExploreProjectRow[] = [
    {
      id: 'p-2',
      title: 'Project 2',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 't-2',
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'p-1',
      title: 'Project 1',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 't-1',
      created_at: '2026-03-01T00:00:00.000Z',
    },
  ]

  const items = buildExploreProjectItems({
    projects: rows,
    creatorsById: { c1: { id: 'c1', username: 'alpha', email: null } },
    supporterCountByProjectId: { 'p-1': 0, 'p-2': 0 },
    engagementCountByProjectId: { 'p-1': 0, 'p-2': 0 },
    recentUpdatesCountByProjectId: { 'p-1': 0, 'p-2': 0 },
    latestUpdateAtByProjectId: { 'p-1': null, 'p-2': null },
    creatorReasonPenaltyById: {},
    sort: 'trending',
  })

  assert.deepEqual(items.map((item) => item.project_id), ['p-2', 'p-1'])
})
