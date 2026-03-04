import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFollowingFeedItems,
  getCreatorName,
  getProjectTitle,
  sortFeedUpdatesNewestFirst,
} from './followingFeed'

test('getCreatorName falls back safely', () => {
  assert.equal(getCreatorName({ id: 'u1', username: 'shay', email: 'shay@test.dev' }), 'shay')
  assert.equal(getCreatorName({ id: 'u1', username: null, email: 'shay@test.dev' }), 'shay@test.dev')
  assert.equal(getCreatorName({ id: 'u1', username: null, email: null }), 'Unknown creator')
})

test('getProjectTitle falls back safely', () => {
  assert.equal(getProjectTitle({ id: 'p1', title: 'Mix v2', creator_id: 'u1' }), 'Mix v2')
  assert.equal(getProjectTitle({ id: 'p1', title: null, creator_id: 'u1' }), 'Untitled project')
})

test('buildFollowingFeedItems returns target path and mapped fields', () => {
  const items = buildFollowingFeedItems(
    [
      {
        id: 'up1',
        project_id: 'p1',
        user_id: 'u1',
        content: 'Hook revised',
        version_label: 'v2',
        created_at: '2026-03-01T00:00:00.000Z',
      },
    ],
    {
      p1: { id: 'p1', title: 'Night Sketch', creator_id: 'u1' },
    },
    {
      u1: { id: 'u1', username: 'creatorA', email: null },
    }
  )

  assert.equal(items.length, 1)
  assert.equal(items[0].update_id, 'up1')
  assert.equal(items[0].creator_name, 'creatorA')
  assert.equal(items[0].project_title, 'Night Sketch')
  assert.equal(items[0].target_path, '/dashboard/projects/p1?update_id=up1')
})

test('sortFeedUpdatesNewestFirst returns newest-first order', () => {
  const sorted = sortFeedUpdatesNewestFirst([
    {
      id: 'older',
      project_id: 'p1',
      user_id: 'u1',
      content: 'Older update',
      version_label: null,
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'newer',
      project_id: 'p1',
      user_id: 'u1',
      content: 'Newer update',
      version_label: null,
      created_at: '2026-03-03T00:00:00.000Z',
    },
  ])

  assert.equal(sorted[0].id, 'newer')
  assert.equal(sorted[1].id, 'older')
})

