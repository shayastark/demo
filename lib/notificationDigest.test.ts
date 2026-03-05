import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNotificationDigestGroups,
  getNotificationDigestWindowSinceIso,
  paginateNotificationDigestGroups,
  parseNotificationDigestQuery,
} from './notificationDigest'

test('parseNotificationDigestQuery validates window and pagination', () => {
  const parsed = parseNotificationDigestQuery({
    rawWindow: 'weekly',
    rawLimit: '10',
    rawOffset: '5',
    defaultWindow: 'daily',
  })
  assert.equal(parsed.ok, true)
  if (parsed.ok) {
    assert.equal(parsed.window, 'weekly')
    assert.equal(parsed.limit, 10)
    assert.equal(parsed.offset, 5)
  }

  const fallback = parseNotificationDigestQuery({
    rawWindow: 'unknown',
    rawLimit: null,
    rawOffset: null,
    defaultWindow: 'daily',
  })
  assert.equal(fallback.ok, true)
  if (fallback.ok) {
    assert.equal(fallback.window, 'daily')
  }
})

test('buildNotificationDigestGroups groups by type and target', () => {
  const groups = buildNotificationDigestGroups({
    notifications: [
      {
        id: 'n1',
        type: 'new_follower',
        title: 'A followed you',
        message: null,
        data: { follower_id: 'u1' },
        is_read: false,
        created_at: '2026-03-11T10:00:00.000Z',
      },
      {
        id: 'n2',
        type: 'new_follower',
        title: 'A followed you',
        message: null,
        data: { follower_id: 'u1' },
        is_read: false,
        created_at: '2026-03-11T11:00:00.000Z',
      },
      {
        id: 'n3',
        type: 'tip_received',
        title: 'New tip',
        message: null,
        data: { project_id: 'p1' },
        is_read: false,
        created_at: '2026-03-11T09:00:00.000Z',
      },
    ],
  })

  assert.equal(groups.length, 2)
  assert.equal(groups[0].grouped_count, 2)
  assert.equal(groups[0].group_type, 'new_follower')
})

test('paginateNotificationDigestGroups returns contract with hasMore', () => {
  const page = paginateNotificationDigestGroups({
    groups: [
      {
        id: 'g1',
        group_type: 'new_follower',
        grouped_count: 2,
        latest_created_at: '2026-03-11T11:00:00.000Z',
        target_path: '/dashboard',
        title: '2 new followers',
      },
      {
        id: 'g2',
        group_type: 'tip_received',
        grouped_count: 1,
        latest_created_at: '2026-03-11T10:00:00.000Z',
        target_path: '/account',
        title: '1 new tip',
      },
    ],
    limit: 1,
    offset: 0,
  })

  assert.equal(page.items.length, 1)
  assert.equal(page.hasMore, true)
  assert.equal(page.nextOffset, 1)
})

test('getNotificationDigestWindowSinceIso returns parseable ISO', () => {
  const iso = getNotificationDigestWindowSinceIso('daily')
  assert.equal(Number.isFinite(new Date(iso).getTime()), true)
})
