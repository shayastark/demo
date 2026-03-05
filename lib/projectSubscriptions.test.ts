import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyImportantBackfillRows,
  buildProjectUpdateRecipientIds,
  filterProjectUpdateSubscriberIdsByMode,
  isImportantProjectUpdate,
  normalizeProjectSubscriptionNotificationMode,
  parseProjectSubscriptionNotificationModeFromBody,
  resolveProjectUpdateImportanceForNotification,
  shouldBackfillImportantFromVersionLabel,
  parseProjectSubscriptionProjectIdFromBody,
  parseProjectSubscriptionProjectIdFromDelete,
  parseProjectSubscriptionsLimit,
} from './projectSubscriptions'

test('parseProjectSubscriptionProjectIdFromBody reads strict project_id', () => {
  assert.equal(parseProjectSubscriptionProjectIdFromBody({ project_id: 'abc' }), 'abc')
  assert.equal(parseProjectSubscriptionProjectIdFromBody({ project_id: 1 }), null)
  assert.equal(parseProjectSubscriptionProjectIdFromBody(null), null)
})

test('parseProjectSubscriptionProjectIdFromDelete handles body/query mismatch', () => {
  assert.equal(
    parseProjectSubscriptionProjectIdFromDelete({ bodyProjectId: 'p1', queryProjectId: 'p1' }),
    'p1'
  )
  assert.equal(
    parseProjectSubscriptionProjectIdFromDelete({ bodyProjectId: null, queryProjectId: 'p2' }),
    'p2'
  )
  assert.equal(
    parseProjectSubscriptionProjectIdFromDelete({ bodyProjectId: 'p1', queryProjectId: 'p2' }),
    null
  )
})

test('parseProjectSubscriptionsLimit validates strict numeric range', () => {
  assert.equal(parseProjectSubscriptionsLimit(null), 1000)
  assert.equal(parseProjectSubscriptionsLimit('20'), 20)
  assert.equal(parseProjectSubscriptionsLimit('0'), null)
  assert.equal(parseProjectSubscriptionsLimit('5001'), null)
  assert.equal(parseProjectSubscriptionsLimit('abc'), null)
})

test('buildProjectUpdateRecipientIds dedupes overlap and excludes creator', () => {
  const recipients = buildProjectUpdateRecipientIds({
    creatorId: 'u1',
    followerIds: ['u2', 'u3', 'u1'],
    subscriberIds: ['u3', 'u4'],
  })
  assert.deepEqual(recipients.sort(), ['u2', 'u3', 'u4'])
})

test('parseProjectSubscriptionNotificationModeFromBody validates strict modes', () => {
  assert.equal(parseProjectSubscriptionNotificationModeFromBody({ notification_mode: 'all' }), 'all')
  assert.equal(parseProjectSubscriptionNotificationModeFromBody({ notification_mode: 'important' }), 'important')
  assert.equal(parseProjectSubscriptionNotificationModeFromBody({ notification_mode: 'mute' }), 'mute')
  assert.equal(parseProjectSubscriptionNotificationModeFromBody({ notification_mode: 'other' }), null)
  assert.equal(parseProjectSubscriptionNotificationModeFromBody({}), null)
})

test('normalizeProjectSubscriptionNotificationMode defaults safely', () => {
  assert.equal(normalizeProjectSubscriptionNotificationMode('all'), 'all')
  assert.equal(normalizeProjectSubscriptionNotificationMode('important'), 'important')
  assert.equal(normalizeProjectSubscriptionNotificationMode('mute'), 'mute')
  assert.equal(normalizeProjectSubscriptionNotificationMode('unknown'), 'all')
})

test('isImportantProjectUpdate uses version label keywords', () => {
  assert.equal(isImportantProjectUpdate({ versionLabel: 'Final Mix' }), true)
  assert.equal(isImportantProjectUpdate({ versionLabel: 'release-candidate' }), false)
  assert.equal(isImportantProjectUpdate({ versionLabel: 'v2' }), false)
  assert.equal(isImportantProjectUpdate({ versionLabel: null }), false)
})

test('resolveProjectUpdateImportanceForNotification uses explicit flag first', () => {
  assert.equal(
    resolveProjectUpdateImportanceForNotification({
      isImportant: true,
      versionLabel: 'v1',
    }),
    true
  )
  assert.equal(
    resolveProjectUpdateImportanceForNotification({
      isImportant: false,
      versionLabel: 'final release',
    }),
    false
  )
  assert.equal(
    resolveProjectUpdateImportanceForNotification({
      isImportant: null,
      versionLabel: 'final release',
      allowFallback: false,
    }),
    false
  )
  assert.equal(
    resolveProjectUpdateImportanceForNotification({
      isImportant: null,
      versionLabel: 'final release',
      allowFallback: true,
    }),
    true
  )
})

test('shouldBackfillImportantFromVersionLabel is conservative', () => {
  assert.equal(shouldBackfillImportantFromVersionLabel('final'), true)
  assert.equal(shouldBackfillImportantFromVersionLabel('release v1'), true)
  assert.equal(shouldBackfillImportantFromVersionLabel('official release notes'), true)
  assert.equal(shouldBackfillImportantFromVersionLabel('release-candidate'), false)
  assert.equal(shouldBackfillImportantFromVersionLabel('beta release'), false)
})

test('applyImportantBackfillRows is idempotent', () => {
  const first = applyImportantBackfillRows([
    { is_important: false, version_label: 'final mix' },
    { is_important: false, version_label: 'release-candidate' },
  ])
  const second = applyImportantBackfillRows(first)
  assert.deepEqual(second, first)
  assert.equal(first[0].is_important, true)
  assert.equal(first[1].is_important, false)
})

test('filterProjectUpdateSubscriberIdsByMode enforces all/important/mute', () => {
  const nonImportant = filterProjectUpdateSubscriberIdsByMode({
    rows: [
      { user_id: 'u1', notification_mode: 'all' },
      { user_id: 'u2', notification_mode: 'important' },
      { user_id: 'u3', notification_mode: 'mute' },
      { user_id: 'u4' },
    ],
    isImportant: false,
  })
  assert.deepEqual(nonImportant.sort(), ['u1', 'u4'])

  const important = filterProjectUpdateSubscriberIdsByMode({
    rows: [
      { user_id: 'u1', notification_mode: 'all' },
      { user_id: 'u2', notification_mode: 'important' },
      { user_id: 'u3', notification_mode: 'mute' },
    ],
    isImportant: true,
  })
  assert.deepEqual(important.sort(), ['u1', 'u2'])
})

