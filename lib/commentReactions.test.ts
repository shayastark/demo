import test from 'node:test'
import assert from 'node:assert/strict'
import {
  summarizeCommentReactions,
  isReactionType,
  getReactionToggleAction,
} from './commentReactions'

test('summarizeCommentReactions groups reaction counts by comment', () => {
  const summary = summarizeCommentReactions([
    { comment_id: 'c1', user_id: 'u1', reaction_type: 'helpful' },
    { comment_id: 'c1', user_id: 'u2', reaction_type: 'helpful' },
    { comment_id: 'c1', user_id: 'u3', reaction_type: 'fire' },
    { comment_id: 'c2', user_id: 'u4', reaction_type: 'agree' },
  ])

  assert.equal(summary['c1'].helpful, 2)
  assert.equal(summary['c1'].fire, 1)
  assert.equal(summary['c1'].agree, 0)
  assert.equal(summary['c1'].like, 0)
  assert.equal(summary['c2'].agree, 1)
})

test('summarizeCommentReactions tracks viewer reaction', () => {
  const summary = summarizeCommentReactions(
    [
      { comment_id: 'c1', user_id: 'viewer', reaction_type: 'fire' },
      { comment_id: 'c1', user_id: 'viewer', reaction_type: 'agree' },
      { comment_id: 'c1', user_id: 'u2', reaction_type: 'helpful' },
    ],
    'viewer'
  )

  assert.equal(summary['c1'].viewerReaction, 'fire')
  assert.equal(summary['c1'].viewerReactions.fire, true)
  assert.equal(summary['c1'].viewerReactions.agree, true)
})

test('isReactionType validates supported values strictly', () => {
  assert.equal(isReactionType('helpful'), true)
  assert.equal(isReactionType('fire'), true)
  assert.equal(isReactionType('agree'), true)
  assert.equal(isReactionType('like'), false)
  assert.equal(isReactionType(''), false)
  assert.equal(isReactionType(null), false)
})

test('getReactionToggleAction returns add/remove deterministically', () => {
  assert.equal(getReactionToggleAction(false), 'add')
  assert.equal(getReactionToggleAction(true), 'remove')
})
