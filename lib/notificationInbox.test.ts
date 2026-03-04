import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getFollowerIdFromQueryParam,
  getNotificationPrimaryText,
  getNotificationTargetPath,
  isUuidLike,
  sortNotificationsForInbox,
  type InboxNotification,
} from './notificationInbox'

const baseNotification: InboxNotification = {
  id: 'n1',
  type: 'unknown',
  title: 'Title',
  message: null,
  data: {},
  is_read: false,
  created_at: '2026-03-04T00:00:00.000Z',
}

test('sortNotificationsForInbox keeps unread first then created_at desc', () => {
  const notifications: InboxNotification[] = [
    { ...baseNotification, id: 'read-newer', is_read: true, created_at: '2026-03-04T12:00:00.000Z' },
    { ...baseNotification, id: 'unread-older', is_read: false, created_at: '2026-03-03T12:00:00.000Z' },
    { ...baseNotification, id: 'unread-newer', is_read: false, created_at: '2026-03-05T12:00:00.000Z' },
  ]

  const sorted = sortNotificationsForInbox(notifications)
  assert.deepEqual(sorted.map((item) => item.id), ['unread-newer', 'unread-older', 'read-newer'])
})

test('getNotificationPrimaryText formats new follower copy', () => {
  const notification: InboxNotification = {
    ...baseNotification,
    type: 'new_follower',
    title: 'Legacy title',
    data: { follower_name: 'DemoFan' },
  }

  assert.equal(getNotificationPrimaryText(notification), 'DemoFan followed you')
})

test('getNotificationTargetPath honors targetPath then fallbacks', () => {
  const direct: InboxNotification = {
    ...baseNotification,
    type: 'new_follower',
    data: { targetPath: '/creator/demo-fan' },
  }
  assert.equal(getNotificationTargetPath(direct), '/creator/demo-fan')

  const followerFallback: InboxNotification = {
    ...baseNotification,
    type: 'new_follower',
    data: { follower_id: '123e4567-e89b-12d3-a456-426614174000' },
  }
  assert.equal(getNotificationTargetPath(followerFallback), '/account?follower_id=123e4567-e89b-12d3-a456-426614174000')

  const emptyFollower: InboxNotification = {
    ...baseNotification,
    type: 'new_follower',
    data: {},
  }
  assert.equal(getNotificationTargetPath(emptyFollower), '/account')

  const invalidFollower: InboxNotification = {
    ...baseNotification,
    type: 'new_follower',
    data: { follower_id: 'not-a-uuid' },
  }
  assert.equal(getNotificationTargetPath(invalidFollower), '/account')
})

test('follower deep-link parsing validates uuid format', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'
  assert.equal(isUuidLike(validUuid), true)
  assert.equal(getFollowerIdFromQueryParam(validUuid), validUuid)

  assert.equal(isUuidLike('not-a-uuid'), false)
  assert.equal(getFollowerIdFromQueryParam('not-a-uuid'), null)
  assert.equal(getFollowerIdFromQueryParam(undefined), null)
})
