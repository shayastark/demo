import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getProjectUpdateReactionToggleAction,
  isProjectUpdateReactionType,
  summarizeProjectUpdateReactions,
} from './projectUpdateReactions'

test('isProjectUpdateReactionType validates supported values', () => {
  assert.equal(isProjectUpdateReactionType('helpful'), true)
  assert.equal(isProjectUpdateReactionType('fire'), true)
  assert.equal(isProjectUpdateReactionType('agree'), true)
  assert.equal(isProjectUpdateReactionType('like'), false)
})

test('getProjectUpdateReactionToggleAction returns deterministic add/remove', () => {
  assert.equal(getProjectUpdateReactionToggleAction(false), 'add')
  assert.equal(getProjectUpdateReactionToggleAction(true), 'remove')
})

test('summarizeProjectUpdateReactions shapes counts and viewer reactions', () => {
  const summary = summarizeProjectUpdateReactions(
    [
      { update_id: 'u1', user_id: 'a', reaction_type: 'helpful' },
      { update_id: 'u1', user_id: 'b', reaction_type: 'helpful' },
      { update_id: 'u1', user_id: 'a', reaction_type: 'fire' },
      { update_id: 'u2', user_id: 'a', reaction_type: 'agree' },
    ],
    'a'
  )

  assert.equal(summary.u1.helpful, 2)
  assert.equal(summary.u1.fire, 1)
  assert.equal(summary.u1.agree, 0)
  assert.equal(summary.u1.viewerReactions.helpful, true)
  assert.equal(summary.u1.viewerReactions.fire, true)
  assert.equal(summary.u2.agree, 1)
})

