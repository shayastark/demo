import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canUserPinComment,
  applySinglePinnedComment,
  sortCommentsPinnedFirst,
  normalizePinnedFlag,
  withPinnedFlag,
} from './commentPinning'

test('canUserPinComment only allows project creator', () => {
  assert.equal(canUserPinComment('u1', 'u1'), true)
  assert.equal(canUserPinComment('u1', 'u2'), false)
  assert.equal(canUserPinComment(null, 'u2'), false)
})

test('applySinglePinnedComment enforces one pinned comment when pinning', () => {
  const updated = applySinglePinnedComment(
    [
      { id: 'c1', is_pinned: true },
      { id: 'c2', is_pinned: false },
      { id: 'c3', is_pinned: false },
    ],
    'c2',
    true
  )

  assert.deepEqual(updated, [
    { id: 'c1', is_pinned: false },
    { id: 'c2', is_pinned: true },
    { id: 'c3', is_pinned: false },
  ])
})

test('sortCommentsPinnedFirst keeps pinned first then newest', () => {
  const sorted = sortCommentsPinnedFirst([
    { id: 'c1', is_pinned: false, created_at: '2024-01-01T00:00:00.000Z' },
    { id: 'c2', is_pinned: true, created_at: '2024-01-01T00:00:01.000Z' },
    { id: 'c3', is_pinned: false, created_at: '2024-01-01T00:00:02.000Z' },
  ])

  assert.deepEqual(sorted.map((comment) => comment.id), ['c2', 'c3', 'c1'])
})

test('normalizePinnedFlag always returns explicit boolean', () => {
  assert.equal(normalizePinnedFlag(true), true)
  assert.equal(normalizePinnedFlag(false), false)
  assert.equal(normalizePinnedFlag(null), false)
  assert.equal(normalizePinnedFlag(undefined), false)
})

test('withPinnedFlag includes normalized is_pinned in response shape', () => {
  const responseComment = withPinnedFlag({
    id: 'c1',
    content: 'useful feedback',
    is_pinned: null,
  })

  assert.equal(Object.prototype.hasOwnProperty.call(responseComment, 'is_pinned'), true)
  assert.equal(responseComment.is_pinned, false)
})

