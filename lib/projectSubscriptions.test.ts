import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProjectUpdateRecipientIds,
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

