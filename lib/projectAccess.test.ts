import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canManageProjectAccess,
  getProjectAccessIdentifierType,
  isRedundantProjectAccessGrant,
  parseProjectAccessGrantInput,
  resolveProjectAccessIdentifier,
} from './projectAccess'

test('parseProjectAccessGrantInput validates project_id + identifier payload', () => {
  const valid = parseProjectAccessGrantInput({
    project_id: '11111111-1111-1111-1111-111111111111',
    identifier: '  creator@example.com ',
  })
  assert.deepEqual(valid, {
    project_id: '11111111-1111-1111-1111-111111111111',
    identifier: 'creator@example.com',
    identifier_type: 'email',
  })

  // Backward-compatible user_id payload still parses.
  const legacy = parseProjectAccessGrantInput({
    project_id: '11111111-1111-1111-1111-111111111111',
    user_id: '22222222-2222-2222-2222-222222222222',
  })
  assert.deepEqual(legacy, {
    project_id: '11111111-1111-1111-1111-111111111111',
    identifier: '22222222-2222-2222-2222-222222222222',
    identifier_type: 'user_id',
  })

  assert.equal(parseProjectAccessGrantInput({ project_id: 'bad', identifier: 'bad' }), null)
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

test('getProjectAccessIdentifierType detects identifier classes', () => {
  assert.equal(
    getProjectAccessIdentifierType('22222222-2222-2222-2222-222222222222'),
    'user_id'
  )
  assert.equal(getProjectAccessIdentifierType('user@example.com'), 'email')
  assert.equal(getProjectAccessIdentifierType('DemoCreator'), 'username')
})

test('resolveProjectAccessIdentifier handles not found/ambiguous/success', () => {
  const byUsername = resolveProjectAccessIdentifier({
    identifier: 'demo',
    identifierType: 'username',
    candidates: [
      { id: 'u1', username: 'Demo' },
      { id: 'u2', username: 'other' },
    ],
  })
  assert.deepEqual(byUsername, { status: 'ok', userId: 'u1' })

  const byEmailAmbiguous = resolveProjectAccessIdentifier({
    identifier: 'demo@example.com',
    identifierType: 'email',
    candidates: [
      { id: 'u1', email: 'demo@example.com' },
      { id: 'u2', email: 'Demo@Example.com' },
    ],
  })
  assert.deepEqual(byEmailAmbiguous, { status: 'ambiguous' })

  const notFound = resolveProjectAccessIdentifier({
    identifier: 'missing',
    identifierType: 'username',
    candidates: [{ id: 'u1', username: 'demo' }],
  })
  assert.deepEqual(notFound, { status: 'not_found' })
})

