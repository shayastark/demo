import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeCommentReactions } from './commentReactions'

test('summarizeCommentReactions groups likes by comment', () => {
  const summary = summarizeCommentReactions([
    { comment_id: 'c1', user_id: 'u1', reaction_type: 'like' },
    { comment_id: 'c1', user_id: 'u2', reaction_type: 'like' },
    { comment_id: 'c2', user_id: 'u3', reaction_type: 'like' },
  ])

  assert.deepEqual(summary['c1'], { like: 2, viewerReaction: null })
  assert.deepEqual(summary['c2'], { like: 1, viewerReaction: null })
})

test('summarizeCommentReactions tracks viewer reaction', () => {
  const summary = summarizeCommentReactions(
    [
      { comment_id: 'c1', user_id: 'viewer', reaction_type: 'like' },
      { comment_id: 'c1', user_id: 'u2', reaction_type: 'like' },
    ],
    'viewer'
  )

  assert.deepEqual(summary['c1'], { like: 2, viewerReaction: 'like' })
})
