import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canReviewProjectAccessRequest,
  parseProjectAccessRequestCreateInput,
  parseProjectAccessRequestReviewInput,
  shouldUpsertAccessGrantOnReview,
  shouldNotifyCreatorOnAccessRequest,
} from './projectAccessRequests'

test('parseProjectAccessRequestCreateInput validates payload and sanitizes note', () => {
  const parsed = parseProjectAccessRequestCreateInput({
    project_id: '11111111-1111-1111-1111-111111111111',
    note: '  please let me listen  ',
  })
  assert.deepEqual(parsed, {
    project_id: '11111111-1111-1111-1111-111111111111',
    note: 'please let me listen',
  })

  assert.equal(parseProjectAccessRequestCreateInput({ project_id: 'bad' }), null)
})

test('parseProjectAccessRequestReviewInput validates review action', () => {
  assert.deepEqual(
    parseProjectAccessRequestReviewInput({
      id: '11111111-1111-1111-1111-111111111111',
      action: 'approve',
    }),
    { id: '11111111-1111-1111-1111-111111111111', action: 'approve' }
  )
  assert.equal(
    parseProjectAccessRequestReviewInput({
      id: '11111111-1111-1111-1111-111111111111',
      action: 'nope',
    }),
    null
  )
})

test('canReviewProjectAccessRequest enforces creator-only review', () => {
  assert.equal(canReviewProjectAccessRequest({ creatorUserId: 'u1', viewerUserId: 'u1' }), true)
  assert.equal(canReviewProjectAccessRequest({ creatorUserId: 'u1', viewerUserId: 'u2' }), false)
  assert.equal(canReviewProjectAccessRequest({ creatorUserId: 'u1', viewerUserId: null }), false)
})

test('shouldNotifyCreatorOnAccessRequest skips pending refresh and existing access', () => {
  assert.equal(
    shouldNotifyCreatorOnAccessRequest({ existingStatus: null, requesterAlreadyHasAccess: false }),
    true
  )
  assert.equal(
    shouldNotifyCreatorOnAccessRequest({ existingStatus: 'pending', requesterAlreadyHasAccess: false }),
    false
  )
  assert.equal(
    shouldNotifyCreatorOnAccessRequest({ existingStatus: 'denied', requesterAlreadyHasAccess: false }),
    true
  )
  assert.equal(
    shouldNotifyCreatorOnAccessRequest({ existingStatus: null, requesterAlreadyHasAccess: true }),
    false
  )
})

test('shouldUpsertAccessGrantOnReview only approves create grant updates', () => {
  assert.equal(shouldUpsertAccessGrantOnReview('approve'), true)
  assert.equal(shouldUpsertAccessGrantOnReview('deny'), false)
})

