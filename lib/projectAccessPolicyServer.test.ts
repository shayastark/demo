import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProjectPolicySnapshot } from './projectAccessPolicy'
import { shouldUpsertAccessGrantOnReview } from './projectAccessRequests'

const privateProject = {
  id: 'p1',
  creator_id: 'creator',
  visibility: 'private',
  sharing_enabled: false,
} as const

const unlistedProject = {
  id: 'p2',
  creator_id: 'creator',
  visibility: 'unlisted',
  sharing_enabled: true,
} as const

const publicProject = {
  id: 'p3',
  creator_id: 'creator',
  visibility: 'public',
  sharing_enabled: true,
} as const

test('private project access matrix: creator, granted, expired, non-granted', () => {
  const creator = buildProjectPolicySnapshot({
    userId: 'creator',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: false,
    grantRole: null,
  })
  assert.equal(creator.canView, true)

  const grantedViewer = buildProjectPolicySnapshot({
    userId: 'viewer',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: true,
    grantRole: 'viewer',
  })
  assert.equal(grantedViewer.canView, true)

  const expiredViewer = buildProjectPolicySnapshot({
    userId: 'viewer',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: false,
    grantRole: null,
  })
  assert.equal(expiredViewer.canView, false)

  const nonGranted = buildProjectPolicySnapshot({
    userId: 'other',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: false,
    grantRole: null,
  })
  assert.equal(nonGranted.canView, false)
})

test('role gating matrix for private collaboration actions', () => {
  const viewer = buildProjectPolicySnapshot({
    userId: 'viewer',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: true,
    grantRole: 'viewer',
  })
  assert.equal(viewer.canComment, false)
  assert.equal(viewer.canReact, false)
  assert.equal(viewer.canPostUpdate, false)

  const commenter = buildProjectPolicySnapshot({
    userId: 'commenter',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: true,
    grantRole: 'commenter',
  })
  assert.equal(commenter.canComment, true)
  assert.equal(commenter.canReact, true)
  assert.equal(commenter.canPostUpdate, false)

  const contributor = buildProjectPolicySnapshot({
    userId: 'contrib',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: true,
    grantRole: 'contributor',
  })
  assert.equal(contributor.canComment, true)
  assert.equal(contributor.canReact, true)
  assert.equal(contributor.canPostUpdate, true)
})

test('visibility semantics: public visible, unlisted direct-only, private grant-only', () => {
  const publicViewer = buildProjectPolicySnapshot({
    userId: 'user',
    project: publicProject,
    isDirectAccess: false,
    hasActiveGrant: false,
    grantRole: null,
  })
  assert.equal(publicViewer.canView, true)

  const unlistedDirect = buildProjectPolicySnapshot({
    userId: 'user',
    project: unlistedProject,
    isDirectAccess: true,
    hasActiveGrant: false,
    grantRole: null,
  })
  assert.equal(unlistedDirect.canView, true)

  const unlistedDiscovery = buildProjectPolicySnapshot({
    userId: 'user',
    project: unlistedProject,
    isDirectAccess: false,
    hasActiveGrant: false,
    grantRole: null,
  })
  assert.equal(unlistedDiscovery.canView, false)

  const privateBlocked = buildProjectPolicySnapshot({
    userId: 'user',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: false,
    grantRole: null,
  })
  assert.equal(privateBlocked.canView, false)
})

test('request review path semantics: approve grants view, deny remains blocked', () => {
  const approveShouldUpsert = shouldUpsertAccessGrantOnReview('approve')
  assert.equal(approveShouldUpsert, true)
  const approved = buildProjectPolicySnapshot({
    userId: 'requester',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: true,
    grantRole: 'viewer',
  })
  assert.equal(approved.canView, true)

  const denyShouldUpsert = shouldUpsertAccessGrantOnReview('deny')
  assert.equal(denyShouldUpsert, false)
  const denied = buildProjectPolicySnapshot({
    userId: 'requester',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: false,
    grantRole: null,
  })
  assert.equal(denied.canView, false)
})
