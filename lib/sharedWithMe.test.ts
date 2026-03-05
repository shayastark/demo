import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSharedWithMeItems, parseSharedWithMeQuery } from './sharedWithMe'

test('parseSharedWithMeQuery validates and parses pagination flags', () => {
  assert.deepEqual(
    parseSharedWithMeQuery({ rawLimit: null, rawOffset: null, rawIncludeExpired: null }),
    { ok: true, limit: 20, offset: 0, includeExpired: false }
  )
  assert.deepEqual(
    parseSharedWithMeQuery({ rawLimit: '10', rawOffset: '2', rawIncludeExpired: 'true' }),
    { ok: true, limit: 10, offset: 2, includeExpired: true }
  )
  assert.equal(parseSharedWithMeQuery({ rawLimit: '0', rawOffset: '0', rawIncludeExpired: null }).ok, false)
  assert.equal(parseSharedWithMeQuery({ rawLimit: '10', rawOffset: '-1', rawIncludeExpired: null }).ok, false)
  assert.equal(parseSharedWithMeQuery({ rawLimit: '10', rawOffset: '0', rawIncludeExpired: 'yes' }).ok, false)
})

test('buildSharedWithMeItems filters creator projects and expired by default', () => {
  const items = buildSharedWithMeItems({
    currentUserId: 'u-viewer',
    includeExpired: false,
    grants: [
      {
        project_id: 'p-active',
        created_at: '2026-03-05T00:00:00.000Z',
        expires_at: null,
        role: 'commenter',
      },
      {
        project_id: 'p-expired',
        created_at: '2026-03-06T00:00:00.000Z',
        expires_at: '2020-01-01T00:00:00.000Z',
        role: 'contributor',
      },
      {
        project_id: 'p-owned',
        created_at: '2026-03-07T00:00:00.000Z',
        expires_at: null,
        role: 'viewer',
      },
    ],
    projectsById: {
      'p-active': {
        id: 'p-active',
        title: 'Active project',
        cover_image_url: null,
        creator_id: 'u-creator',
        visibility: 'private',
        sharing_enabled: false,
      },
      'p-expired': {
        id: 'p-expired',
        title: 'Expired project',
        cover_image_url: null,
        creator_id: 'u-creator',
        visibility: 'private',
        sharing_enabled: false,
      },
      'p-owned': {
        id: 'p-owned',
        title: 'Owned project',
        cover_image_url: null,
        creator_id: 'u-viewer',
        visibility: 'private',
        sharing_enabled: false,
      },
    },
    creatorsById: {
      'u-creator': {
        id: 'u-creator',
        username: 'creatorA',
        email: null,
      },
    },
  })

  assert.equal(items.length, 1)
  assert.equal(items[0].project_id, 'p-active')
  assert.equal(items[0].creator_name, 'creatorA')
  assert.equal(items[0].role, 'commenter')
  assert.equal(items[0].target_path, '/dashboard/projects/p-active')
})

test('buildSharedWithMeItems includes expired when requested and sorts active first', () => {
  const items = buildSharedWithMeItems({
    currentUserId: 'u-viewer',
    includeExpired: true,
    grants: [
      {
        project_id: 'p-expired',
        created_at: '2026-03-09T00:00:00.000Z',
        expires_at: '2020-01-01T00:00:00.000Z',
        role: 'viewer',
      },
      {
        project_id: 'p-active',
        created_at: '2026-03-08T00:00:00.000Z',
        expires_at: null,
        role: 'viewer',
      },
    ],
    projectsById: {
      'p-active': {
        id: 'p-active',
        title: 'A',
        cover_image_url: null,
        creator_id: 'u-creator',
        visibility: 'private',
        sharing_enabled: false,
      },
      'p-expired': {
        id: 'p-expired',
        title: 'B',
        cover_image_url: null,
        creator_id: 'u-creator',
        visibility: 'private',
        sharing_enabled: false,
      },
    },
    creatorsById: {
      'u-creator': {
        id: 'u-creator',
        username: 'creatorA',
        email: null,
      },
    },
  })

  assert.equal(items.length, 2)
  assert.equal(items[0].project_id, 'p-active')
  assert.equal(items[1].project_id, 'p-expired')
  assert.equal(items[1].is_expired, true)
})
