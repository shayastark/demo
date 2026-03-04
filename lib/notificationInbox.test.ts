import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getNotificationPrimaryText,
  getNotificationTargetPath,
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
    data: { follower_id: 'abc-123' },
  }
  assert.equal(getNotificationTargetPath(followerFallback), '/account?follower_id=abc-123')

  const emptyFollower: InboxNotification = {
    ...baseNotification,
    type: 'new_follower',
    data: {},
  }
  assert.equal(getNotificationTargetPath(emptyFollower), '/account')
})
