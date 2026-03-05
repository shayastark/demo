import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canManageProjectAccess,
  getProjectAccessGrantMutationAction,
  getProjectAccessIdentifierType,
  hasProjectAccessRole,
  isProjectAccessRole,
  isProjectAccessGrantActive,
  isRedundantProjectAccessGrant,
  parseProjectAccessExpiryInput,
  parseProjectAccessGrantInput,
  resolveProjectAccessRole,
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

test('canManageProjectAccess enforces creator-only operations (including role updates)', () => {
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

test('parseProjectAccessExpiryInput supports none, hours, and future expires_at', () => {
  const now = new Date('2026-03-05T00:00:00.000Z')

  assert.deepEqual(
    parseProjectAccessExpiryInput({ body: {}, now }),
    { ok: true, expiresAt: null, provided: false }
  )

  const byHours = parseProjectAccessExpiryInput({
    body: { expires_in_hours: 24 },
    now,
  })
  assert.equal(byHours.ok, true)
  if (byHours.ok) {
    assert.equal(byHours.provided, true)
    assert.equal(byHours.expiresAt, '2026-03-06T00:00:00.000Z')
  }

  const byDate = parseProjectAccessExpiryInput({
    body: { expires_at: '2026-03-07T00:00:00.000Z' },
    now,
  })
  assert.deepEqual(byDate, {
    ok: true,
    expiresAt: '2026-03-07T00:00:00.000Z',
    provided: true,
  })
})

test('parseProjectAccessExpiryInput rejects invalid expiry payloads', () => {
  const now = new Date('2026-03-05T00:00:00.000Z')

  assert.equal(
    parseProjectAccessExpiryInput({
      body: {},
      now,
      requireProvided: true,
    }).ok,
    false
  )
  assert.equal(
    parseProjectAccessExpiryInput({
      body: { expires_in_hours: 0 },
      now,
    }).ok,
    false
  )
  assert.equal(
    parseProjectAccessExpiryInput({
      body: { expires_at: '2026-03-04T00:00:00.000Z' },
      now,
    }).ok,
    false
  )
})

test('isProjectAccessGrantActive treats null as never-expiring and blocks past grants', () => {
  const nowMs = new Date('2026-03-05T00:00:00.000Z').getTime()
  assert.equal(isProjectAccessGrantActive(null, nowMs), true)
  assert.equal(isProjectAccessGrantActive('2026-03-06T00:00:00.000Z', nowMs), true)
  assert.equal(isProjectAccessGrantActive('2026-03-04T00:00:00.000Z', nowMs), false)
})

test('getProjectAccessGrantMutationAction distinguishes create renew unchanged', () => {
  assert.equal(
    getProjectAccessGrantMutationAction({
      hasExistingGrant: false,
      existingExpiresAt: null,
      nextExpiresAt: null,
    }),
    'create'
  )
  assert.equal(
    getProjectAccessGrantMutationAction({
      hasExistingGrant: true,
      existingExpiresAt: null,
      nextExpiresAt: null,
    }),
    'unchanged'
  )
  assert.equal(
    getProjectAccessGrantMutationAction({
      hasExistingGrant: true,
      existingExpiresAt: null,
      nextExpiresAt: '2026-03-06T00:00:00.000Z',
    }),
    'renew'
  )
})

test('project access role validation and defaults', () => {
  assert.equal(isProjectAccessRole('viewer'), true)
  assert.equal(isProjectAccessRole('commenter'), true)
  assert.equal(isProjectAccessRole('contributor'), true)
  assert.equal(isProjectAccessRole('owner'), false)
  assert.equal(resolveProjectAccessRole('bad'), 'viewer')
})

test('hasProjectAccessRole enforces permission matrix with creator override', () => {
  assert.equal(hasProjectAccessRole({ role: 'viewer', minRole: 'viewer' }), true)
  assert.equal(hasProjectAccessRole({ role: 'viewer', minRole: 'commenter' }), false)
  assert.equal(hasProjectAccessRole({ role: 'commenter', minRole: 'commenter' }), true)
  assert.equal(hasProjectAccessRole({ role: 'commenter', minRole: 'contributor' }), false)
  assert.equal(hasProjectAccessRole({ role: 'contributor', minRole: 'commenter' }), true)
  assert.equal(hasProjectAccessRole({ role: 'viewer', minRole: 'contributor', isCreator: true }), true)
})

