import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canManageProjectAccess,
  isRedundantProjectAccessGrant,
  parseProjectAccessGrantInput,
} from './projectAccess'

test('parseProjectAccessGrantInput validates strict UUID payload', () => {
  const valid = parseProjectAccessGrantInput({
    project_id: '11111111-1111-1111-1111-111111111111',
    user_id: '22222222-2222-2222-2222-222222222222',
  })
  assert.deepEqual(valid, {
    project_id: '11111111-1111-1111-1111-111111111111',
    user_id: '22222222-2222-2222-2222-222222222222',
  })

  assert.equal(parseProjectAccessGrantInput({ project_id: 'bad', user_id: 'bad' }), null)
})

test('canManageProjectAccess enforces creator-only operations', () => {
  assert.equal(canManageProjectAccess('u1', 'u1'), true)
  assert.equal(canManageProjectAccess('u2', 'u1'), false)
  assert.equal(canManageProjectAccess(null, 'u1'), false)
})

test('isRedundantProjectAccessGrant blocks granting creator themself', () => {
  assert.equal(
    isRedundantProjectAccessGrant({ creatorUserId: 'u1', targetUserId: 'u1' }),
    true
  )
  assert.equal(
    isRedundantProjectAccessGrant({ creatorUserId: 'u1', targetUserId: 'u2' }),
    false
  )
})

