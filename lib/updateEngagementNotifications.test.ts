import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildUpdateEngagementTargetPath,
  decideUpdateEngagementNotificationAction,
  getUpdateEngagementActorName,
} from './updateEngagementNotifications'

test('getUpdateEngagementActorName falls back safely', () => {
  assert.equal(getUpdateEngagementActorName(' demoFan '), 'demoFan')
  assert.equal(getUpdateEngagementActorName(''), 'Someone')
  assert.equal(getUpdateEngagementActorName(null), 'Someone')
})

test('buildUpdateEngagementTargetPath includes encoded update id', () => {
  assert.equal(
    buildUpdateEngagementTargetPath('project-1', 'update 2'),
    '/dashboard/projects/project-1?update_id=update%202'
  )
})

test('decideUpdateEngagementNotificationAction maps expected outcomes', () => {
  assert.equal(
    decideUpdateEngagementNotificationAction({
      recipientUserId: 'u1',
      actorUserId: 'u1',
      skippedPreference: false,
    }),
    'skipped_self'
  )
  assert.equal(
    decideUpdateEngagementNotificationAction({
      recipientUserId: 'u2',
      actorUserId: 'u1',
      skippedPreference: true,
    }),
    'skipped_preference'
  )
  assert.equal(
    decideUpdateEngagementNotificationAction({
      recipientUserId: 'u2',
      actorUserId: 'u1',
      skippedPreference: false,
    }),
    'created'
  )
})

