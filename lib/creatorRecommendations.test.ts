import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCreatorRecommendations,
  collectSuppressedCreatorIdsFromReasonSignals,
  filterCreatorsByVisiblePublicProjects,
  parseCreatorRecommendationsLimit,
  type CreatorRecommendationActivityStats,
} from './creatorRecommendations'

test('parseCreatorRecommendationsLimit validates caps and defaults', () => {
  assert.equal(parseCreatorRecommendationsLimit(null), 5)
  assert.equal(parseCreatorRecommendationsLimit('8'), 8)
  assert.equal(parseCreatorRecommendationsLimit('0'), null)
  assert.equal(parseCreatorRecommendationsLimit('21'), null)
  assert.equal(parseCreatorRecommendationsLimit('abc'), null)
})

test('buildCreatorRecommendations excludes self and already-followed creators', () => {
  const activity: Record<string, CreatorRecommendationActivityStats> = {
    self: {
      creator_id: 'self',
      recent_public_projects_count: 1,
      recent_public_updates_count: 2,
      latest_public_activity_at: '2026-03-05T00:00:00.000Z',
      follower_count: 1,
    },
    followed: {
      creator_id: 'followed',
      recent_public_projects_count: 1,
      recent_public_updates_count: 2,
      latest_public_activity_at: '2026-03-05T00:00:00.000Z',
      follower_count: 10,
    },
    candidate: {
      creator_id: 'candidate',
      recent_public_projects_count: 1,
      recent_public_updates_count: 0,
      latest_public_activity_at: '2026-03-04T00:00:00.000Z',
      follower_count: 2,
    },
  }

  const results = buildCreatorRecommendations({
    usersById: {
      self: { id: 'self', username: 'me', email: null, avatar_url: null },
      followed: { id: 'followed', username: 'already', email: null, avatar_url: null },
      candidate: { id: 'candidate', username: 'next', email: null, avatar_url: null },
    },
    activityByCreatorId: activity,
    viewerUserId: 'self',
    alreadyFollowingIds: new Set(['followed']),
    hiddenCreatorIds: new Set(),
    limit: 10,
  })

  assert.deepEqual(results.map((row) => row.creator_id), ['candidate'])
})

test('buildCreatorRecommendations ranks deterministically and returns shape', () => {
  const activity: Record<string, CreatorRecommendationActivityStats> = {
    a: {
      creator_id: 'a',
      recent_public_projects_count: 1,
      recent_public_updates_count: 1,
      latest_public_activity_at: '2026-03-04T00:00:00.000Z',
      follower_count: 5,
    },
    b: {
      creator_id: 'b',
      recent_public_projects_count: 0,
      recent_public_updates_count: 2,
      latest_public_activity_at: '2026-03-05T00:00:00.000Z',
      follower_count: 50,
    },
    c: {
      creator_id: 'c',
      recent_public_projects_count: 1,
      recent_public_updates_count: 0,
      latest_public_activity_at: '2026-03-06T00:00:00.000Z',
      follower_count: 0,
    },
  }

  const results = buildCreatorRecommendations({
    usersById: {
      a: { id: 'a', username: 'alpha', email: null, avatar_url: null },
      b: { id: 'b', username: 'beta', email: null, avatar_url: null },
      c: { id: 'c', username: null, email: 'c@example.com', avatar_url: null },
    },
    activityByCreatorId: activity,
    viewerUserId: 'viewer',
    alreadyFollowingIds: new Set(),
    hiddenCreatorIds: new Set(),
    limit: 3,
  })

  assert.deepEqual(results.map((row) => row.creator_id), ['b', 'a', 'c'])
  assert.equal(results[0].reason_code, 'popular_week')
  assert.equal(typeof results[0].profile_path, 'string')
  assert.equal(typeof results[0].display_name, 'string')
})

test('buildCreatorRecommendations excludes hidden creators', () => {
  const activity: Record<string, CreatorRecommendationActivityStats> = {
    a: {
      creator_id: 'a',
      recent_public_projects_count: 1,
      recent_public_updates_count: 0,
      latest_public_activity_at: '2026-03-05T00:00:00.000Z',
      follower_count: 10,
    },
    b: {
      creator_id: 'b',
      recent_public_projects_count: 1,
      recent_public_updates_count: 0,
      latest_public_activity_at: '2026-03-05T00:00:00.000Z',
      follower_count: 10,
    },
  }

  const results = buildCreatorRecommendations({
    usersById: {
      a: { id: 'a', username: 'alpha', email: null, avatar_url: null },
      b: { id: 'b', username: 'beta', email: null, avatar_url: null },
    },
    activityByCreatorId: activity,
    viewerUserId: 'viewer',
    alreadyFollowingIds: new Set(),
    hiddenCreatorIds: new Set(['b']),
    limit: 5,
  })

  assert.deepEqual(results.map((item) => item.creator_id), ['a'])
})

test('buildCreatorRecommendations applies lightweight onboarding preference boost', () => {
  const activity: Record<string, CreatorRecommendationActivityStats> = {
    a: {
      creator_id: 'a',
      recent_public_projects_count: 1,
      recent_public_updates_count: 1,
      latest_public_activity_at: '2026-03-05T00:00:00.000Z',
      follower_count: 0,
    },
    b: {
      creator_id: 'b',
      recent_public_projects_count: 1,
      recent_public_updates_count: 1,
      latest_public_activity_at: '2026-03-05T00:00:00.000Z',
      follower_count: 0,
    },
  }

  const results = buildCreatorRecommendations({
    usersById: {
      a: { id: 'a', username: 'alpha', email: null, avatar_url: null },
      b: { id: 'b', username: 'beta', email: null, avatar_url: null },
    },
    activityByCreatorId: activity,
    viewerUserId: 'viewer',
    alreadyFollowingIds: new Set(),
    hiddenCreatorIds: new Set(),
    creatorPreferenceBoostById: { b: 2 },
    limit: 5,
  })

  assert.deepEqual(results.map((item) => item.creator_id), ['b', 'a'])
})

test('guardrail: creator preference boost cap cannot dominate large baseline gap', () => {
  const activity: Record<string, CreatorRecommendationActivityStats> = {
    strong: {
      creator_id: 'strong',
      recent_public_projects_count: 2,
      recent_public_updates_count: 3,
      latest_public_activity_at: '2026-03-05T00:00:00.000Z',
      follower_count: 40,
    },
    weak: {
      creator_id: 'weak',
      recent_public_projects_count: 1,
      recent_public_updates_count: 0,
      latest_public_activity_at: '2026-03-05T00:00:00.000Z',
      follower_count: 0,
    },
  }

  const results = buildCreatorRecommendations({
    usersById: {
      strong: { id: 'strong', username: 'strong', email: null, avatar_url: null },
      weak: { id: 'weak', username: 'weak', email: null, avatar_url: null },
    },
    activityByCreatorId: activity,
    viewerUserId: 'viewer',
    alreadyFollowingIds: new Set(),
    hiddenCreatorIds: new Set(),
    creatorPreferenceBoostById: { weak: 999 },
    limit: 5,
  })

  assert.deepEqual(results.map((item) => item.creator_id), ['strong', 'weak'])
  assert.equal((results.find((item) => item.creator_id === 'weak')?.preference_seed_boost || 0) <= 3, true)
})

test('filterCreatorsByVisiblePublicProjects excludes creators with only hidden projects', () => {
  const creatorIds = filterCreatorsByVisiblePublicProjects({
    projects: [
      { id: 'p1', creator_id: 'a' },
      { id: 'p2', creator_id: 'b' },
      { id: 'p3', creator_id: 'b' },
    ],
    hiddenProjectIds: new Set(['p1', 'p2']),
  })

  assert.equal(creatorIds.has('a'), false)
  assert.equal(creatorIds.has('b'), true)
})

test('collectSuppressedCreatorIdsFromReasonSignals includes not_my_style creator/project signals', () => {
  const suppressed = collectSuppressedCreatorIdsFromReasonSignals({
    hiddenRows: [
      {
        target_type: 'creator',
        target_id: 'c2',
        reason_code: 'not_my_style',
      },
      {
        target_type: 'project',
        target_id: 'p3',
        reason_code: 'not_my_style',
      },
      {
        target_type: 'project',
        target_id: 'p4',
        reason_code: 'already_seen',
      },
    ],
    hiddenCreatorIds: new Set(['c1']),
    projectCreatorById: {
      p3: 'c3',
      p4: 'c4',
    },
  })

  assert.equal(suppressed.has('c1'), true)
  assert.equal(suppressed.has('c2'), true)
  assert.equal(suppressed.has('c3'), true)
  assert.equal(suppressed.has('c4'), false)
})
