import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeNotificationType } from './notificationTypes'

test('normalizeNotificationType returns known values unchanged', () => {
  assert.equal(normalizeNotificationType('tip_received'), 'tip_received')
  assert.equal(normalizeNotificationType('new_follower'), 'new_follower')
})

test('normalizeNotificationType maps unknown values to fallback', () => {
  assert.equal(normalizeNotificationType('legacy_event'), 'unknown')
  assert.equal(normalizeNotificationType(null), 'unknown')
  assert.equal(normalizeNotificationType(undefined), 'unknown')
})
