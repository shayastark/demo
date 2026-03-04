import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSupporterAuthorSet, isSupporterForProject } from './supporterBadge'

test('buildSupporterAuthorSet keeps unique non-null tippers', () => {
  const supporters = buildSupporterAuthorSet([
    { tipper_user_id: 'u1' },
    { tipper_user_id: 'u1' },
    { tipper_user_id: 'u2' },
    { tipper_user_id: null },
  ])

  assert.equal(supporters.size, 2)
  assert.equal(supporters.has('u1'), true)
  assert.equal(supporters.has('u2'), true)
})

test('isSupporterForProject returns correct boolean by author', () => {
  const supporters = new Set(['u5'])
  assert.equal(isSupporterForProject('u5', supporters), true)
  assert.equal(isSupporterForProject('u1', supporters), false)
})

