import test from 'node:test'
import assert from 'node:assert/strict'
import {
  summarizeCommentReactions,
  isReactionType,
  getReactionToggleAction,
} from './commentReactions'

test('summarizeCommentReactions groups reaction counts by comment', () => {
  const summary = summarizeCommentReactions([
    { comment_id: 'c1', user_id: 'u1', reaction_type: 'hype' },
    { comment_id: 'c1', user_id: 'u2', reaction_type: 'hype' },
    { comment_id: 'c1', user_id: 'u3', reaction_type: 'naw' },
    { comment_id: 'c2', user_id: 'u4', reaction_type: 'naw' },
  ])

  assert.equal(summary['c1'].hype, 2)
  assert.equal(summary['c1'].naw, 1)
  assert.equal(summary['c1'].like, 0)
  assert.equal(summary['c2'].naw, 1)
})

test('summarizeCommentReactions tracks viewer reaction', () => {
  const summary = summarizeCommentReactions(
    [
      { comment_id: 'c1', user_id: 'viewer', reaction_type: 'hype' },
      { comment_id: 'c1', user_id: 'viewer', reaction_type: 'naw' },
      { comment_id: 'c1', user_id: 'u2', reaction_type: 'hype' },
    ],
    'viewer'
  )

  assert.equal(summary['c1'].viewerReaction, 'hype')
  assert.equal(summary['c1'].viewerReactions.hype, true)
  assert.equal(summary['c1'].viewerReactions.naw, true)
})

test('isReactionType validates supported values strictly', () => {
  assert.equal(isReactionType('hype'), true)
  assert.equal(isReactionType('naw'), true)
  assert.equal(isReactionType('like'), false)
  assert.equal(isReactionType('fire'), false)
  assert.equal(isReactionType(''), false)
  assert.equal(isReactionType(null), false)
})

test('getReactionToggleAction returns add/remove deterministically', () => {
  assert.equal(getReactionToggleAction(false), 'add')
  assert.equal(getReactionToggleAction(true), 'remove')
})
