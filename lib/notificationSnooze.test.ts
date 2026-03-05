import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getNotificationSnoozeScopeKey,
  isSnoozeActiveUntil,
  parseSnoozeDeleteBody,
  parseSnoozePostBody,
  splitNotificationsBySnooze,
  type NotificationSnoozeRow,
} from './notificationSnooze'
import type { InboxNotification } from './notificationInbox'

const baseNotification: InboxNotification = {
  id: 'n1',
  type: 'new_track',
  title: 'Title',
  message: null,
  data: {},
  is_read: false,
  created_at: '2026-03-05T00:00:00.000Z',
}

test('parseSnoozePostBody validates duration and scope key', () => {
  const ok = parseSnoozePostBody({ scope_key: 'type:new_track', duration: '24h' })
  assert.equal(ok.ok, true)
  const bad = parseSnoozePostBody({ scope_key: '', duration: '24h' })
  assert.equal(bad.ok, false)
  const badDuration = parseSnoozePostBody({ scope_key: 'type:new_track', duration: '2h' })
  assert.equal(badDuration.ok, false)
})

test('parseSnoozeDeleteBody validates compact scope key', () => {
  const ok = parseSnoozeDeleteBody({ scope_key: 'project:abc:type:new_track' })
  assert.equal(ok.ok, true)
  const bad = parseSnoozeDeleteBody({ scope_key: ' ' })
  assert.equal(bad.ok, false)
})

test('getNotificationSnoozeScopeKey derives project/type scope', () => {
  const withProject: InboxNotification = {
    ...baseNotification,
    data: { project_id: '123e4567-e89b-12d3-a456-426614174000' },
  }
  assert.equal(
    getNotificationSnoozeScopeKey(withProject),
    'project:123e4567-e89b-12d3-a456-426614174000:type:new_track'
  )
  assert.equal(getNotificationSnoozeScopeKey(baseNotification), 'type:new_track')
})

test('splitNotificationsBySnooze hides active snoozed items and restores expired', () => {
  const nowMs = Date.parse('2026-03-05T12:00:00.000Z')
  const notifications: InboxNotification[] = [
    { ...baseNotification, id: 'a', type: 'new_track' },
    { ...baseNotification, id: 'b', type: 'tip_received' },
  ]
  const snoozes: NotificationSnoozeRow[] = [
    { scope_key: 'type:new_track', snoozed_until: '2026-03-06T12:00:00.000Z' },
    { scope_key: 'type:tip_received', snoozed_until: '2026-03-04T12:00:00.000Z' },
  ]
  const split = splitNotificationsBySnooze({ notifications, snoozes, nowMs })
  assert.deepEqual(split.snoozed.map((n) => n.id), ['a'])
  assert.deepEqual(split.active.map((n) => n.id), ['b'])
})

test('isSnoozeActiveUntil checks future windows', () => {
  const now = Date.parse('2026-03-05T00:00:00.000Z')
  assert.equal(isSnoozeActiveUntil('2026-03-06T00:00:00.000Z', now), true)
  assert.equal(isSnoozeActiveUntil('2026-03-04T00:00:00.000Z', now), false)
})
