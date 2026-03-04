import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFollowerCountDelta, buildFollowerNotificationTitle, getFollowerDisplayName } from './follows'

test('getFollowerDisplayName normalizes empty names', () => {
  assert.equal(getFollowerDisplayName('  alice  '), 'alice')
  assert.equal(getFollowerDisplayName(''), 'Someone')
  assert.equal(getFollowerDisplayName(undefined), 'Someone')
})

test('buildFollowerNotificationTitle uses normalized name', () => {
  assert.equal(buildFollowerNotificationTitle('  demoFan '), 'demoFan started following you')
  assert.equal(buildFollowerNotificationTitle(null), 'Someone started following you')
})

test('applyFollowerCountDelta never goes below zero', () => {
  assert.equal(applyFollowerCountDelta(5, true), 6)
  assert.equal(applyFollowerCountDelta(5, false), 4)
  assert.equal(applyFollowerCountDelta(0, false), 0)
})
