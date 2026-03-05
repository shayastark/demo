import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCreatorPublicPath,
  parseCreatorIdentifier,
  resolveViewerIsFollowing,
  selectPublicCreatorProjects,
  type PublicCreatorProjectRow,
} from './publicCreatorProfile'

test('parseCreatorIdentifier accepts uuid and valid usernames only', () => {
  assert.equal(parseCreatorIdentifier('123e4567-e89b-12d3-a456-426614174000'), '123e4567-e89b-12d3-a456-426614174000')
  assert.equal(parseCreatorIdentifier('demo_creator-1'), 'demo_creator-1')
  assert.equal(parseCreatorIdentifier(' bad slug '), null)
  assert.equal(parseCreatorIdentifier(''), null)
  assert.equal(parseCreatorIdentifier(null), null)
})

test('selectPublicCreatorProjects returns public-only rows in stable order', () => {
  const rows: PublicCreatorProjectRow[] = [
    {
      id: 'p-private',
      title: 'Private',
      share_token: 'a',
      cover_image_url: null,
      visibility: 'private',
      sharing_enabled: false,
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'p-public-older',
      title: 'Public Older',
      share_token: 'b',
      cover_image_url: null,
      visibility: 'public',
      sharing_enabled: true,
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'p-unlisted',
      title: 'Unlisted',
      share_token: 'c',
      cover_image_url: null,
      visibility: 'unlisted',
      sharing_enabled: true,
      created_at: '2026-03-03T00:00:00.000Z',
    },
    {
      id: 'p-public-newer',
      title: 'Public Newer',
      share_token: 'd',
      cover_image_url: null,
      visibility: 'public',
      sharing_enabled: true,
      created_at: '2026-03-02T00:00:00.000Z',
    },
  ]

  const items = selectPublicCreatorProjects(rows)
  assert.deepEqual(items.map((item) => item.id), ['p-public-newer', 'p-public-older'])
  assert.equal(items[0].target_path, '/share/d')
})

test('resolveViewerIsFollowing maps follow-state safely', () => {
  assert.equal(
    resolveViewerIsFollowing({
      viewerUserId: null,
      creatorId: 'creator-1',
      hasFollowRow: true,
    }),
    false
  )

  assert.equal(
    resolveViewerIsFollowing({
      viewerUserId: 'creator-1',
      creatorId: 'creator-1',
      hasFollowRow: true,
    }),
    false
  )

  assert.equal(
    resolveViewerIsFollowing({
      viewerUserId: 'viewer-1',
      creatorId: 'creator-1',
      hasFollowRow: true,
    }),
    true
  )
})

test('getCreatorPublicPath prefers username and falls back to id', () => {
  assert.equal(getCreatorPublicPath({ id: 'u1', username: 'demo_user' }), '/creator/demo_user')
  assert.equal(getCreatorPublicPath({ id: 'u1', username: 'not valid slug' }), '/creator/u1')
})
