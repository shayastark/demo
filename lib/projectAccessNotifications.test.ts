import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProjectAccessInviteTargetPath,
  buildProjectAccessInviteTitle,
  decideProjectAccessNotificationAction,
  getProjectAccessGrantorName,
} from './projectAccessNotifications'

test('getProjectAccessGrantorName falls back safely', () => {
  assert.equal(getProjectAccessGrantorName(' DemoCreator '), 'DemoCreator')
  assert.equal(getProjectAccessGrantorName(''), 'A creator')
  assert.equal(getProjectAccessGrantorName(null), 'A creator')
})

test('buildProjectAccessInviteTargetPath links to dashboard project detail', () => {
  assert.equal(
    buildProjectAccessInviteTargetPath('11111111-1111-1111-1111-111111111111'),
    '/dashboard/projects/11111111-1111-1111-1111-111111111111'
  )
})

test('buildProjectAccessInviteTitle includes project title when available', () => {
  assert.equal(
    buildProjectAccessInviteTitle({ grantedByName: 'DemoCreator', projectTitle: 'Night Demo' }),
    'DemoCreator granted you access to "Night Demo"'
  )
  assert.equal(
    buildProjectAccessInviteTitle({ grantedByName: 'DemoCreator', projectTitle: '' }),
    'DemoCreator granted you private project access'
  )
})

test('decideProjectAccessNotificationAction maps expected outcomes', () => {
  assert.equal(
    decideProjectAccessNotificationAction({
      recipientUserId: 'u1',
      grantedByUserId: 'u1',
      skippedPreference: false,
    }),
    'skipped_self'
  )
  assert.equal(
    decideProjectAccessNotificationAction({
      recipientUserId: 'u2',
      grantedByUserId: 'u1',
      skippedPreference: true,
    }),
    'skipped_preference'
  )
  assert.equal(
    decideProjectAccessNotificationAction({
      recipientUserId: 'u2',
      grantedByUserId: 'u1',
      skippedPreference: false,
    }),
    'created'
  )
})
