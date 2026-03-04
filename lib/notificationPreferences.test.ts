import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getPreferenceFieldForNotificationType,
  parseNotificationPreferencesPatch,
  toNotificationPreferences,
} from './notificationPreferences'

test('toNotificationPreferences applies defaults when row is missing', () => {
  assert.deepEqual(toNotificationPreferences(null), DEFAULT_NOTIFICATION_PREFERENCES)
  assert.deepEqual(
    toNotificationPreferences({ notify_tips: false }),
    {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      notify_tips: false,
    }
  )
})

test('parseNotificationPreferencesPatch validates allowed fields and booleans', () => {
  const valid = parseNotificationPreferencesPatch({ notify_tips: false, notify_new_follower: true })
  assert.equal(valid.success, true)
  assert.deepEqual(valid.updates, { notify_tips: false, notify_new_follower: true })

  const unknown = parseNotificationPreferencesPatch({ invalid_field: true })
  assert.equal(unknown.success, false)

  const invalidType = parseNotificationPreferencesPatch({ notify_tips: 'nope' })
  assert.equal(invalidType.success, false)

  const empty = parseNotificationPreferencesPatch({})
  assert.equal(empty.success, false)
})

test('notification type mapping targets correct preference fields', () => {
  assert.equal(getPreferenceFieldForNotificationType('new_follower'), 'notify_new_follower')
  assert.equal(getPreferenceFieldForNotificationType('new_track'), 'notify_project_updates')
  assert.equal(getPreferenceFieldForNotificationType('tip_received'), 'notify_tips')
  assert.equal(getPreferenceFieldForNotificationType('project_saved'), 'notify_project_saved')
  assert.equal(getPreferenceFieldForNotificationType('unknown'), null)
})

