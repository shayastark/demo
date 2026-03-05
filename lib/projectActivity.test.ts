import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProjectActivityItems,
  canAccessProjectActivity,
  paginateProjectActivity,
  parseProjectActivityQuery,
} from './projectActivity'

test('parseProjectActivityQuery validates limit/offset', () => {
  const ok = parseProjectActivityQuery({ rawLimit: '10', rawOffset: '5' })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.limit, 10)
    assert.equal(ok.offset, 5)
  }
  const badLimit = parseProjectActivityQuery({ rawLimit: 'x', rawOffset: '0' })
  assert.equal(badLimit.ok, false)
})

test('canAccessProjectActivity enforces creator/collaborator access', () => {
  assert.equal(
    canAccessProjectActivity({
      isCreator: true,
      hasProjectAccessGrant: false,
      canViewProject: true,
    }),
    true
  )
  assert.equal(
    canAccessProjectActivity({
      isCreator: false,
      hasProjectAccessGrant: true,
      canViewProject: true,
    }),
    true
  )
  assert.equal(
    canAccessProjectActivity({
      isCreator: false,
      hasProjectAccessGrant: false,
      canViewProject: true,
    }),
    false
  )
})

test('buildProjectActivityItems maps and sorts normalized items', () => {
  const items = buildProjectActivityItems({
    comments: [{ id: 'c1', user_id: 'u1', created_at: '2026-03-10T12:00:00.000Z' }],
    commentReactions: [],
    updates: [{ id: 'u9', user_id: 'u2', created_at: '2026-03-11T12:00:00.000Z' }],
    updateReactions: [],
    updateComments: [],
    attachments: [],
    accessGrants: [],
    actorsById: {
      u1: { username: 'alpha', email: null },
      u2: { username: null, email: 'beta@example.com' },
    },
  })

  assert.equal(items.length, 2)
  assert.equal(items[0].type, 'update_created')
  assert.equal(items[0].actor_name, 'beta@example.com')
  assert.equal(items[1].type, 'comment_created')
  assert.equal(items[1].summary_text.includes('alpha'), true)
})

test('paginateProjectActivity returns stable hasMore contract', () => {
  const items = Array.from({ length: 4 }, (_, index) => ({
    id: `comment_created:${index}`,
    type: 'comment_created' as const,
    actor_user_id: 'u1',
    actor_name: 'alpha',
    created_at: `2026-03-1${index}T12:00:00.000Z`,
    target_id: `c${index}`,
    summary_text: 'alpha added a comment',
  }))

  const page = paginateProjectActivity({
    items,
    limit: 2,
    offset: 0,
  })

  assert.equal(page.items.length, 2)
  assert.equal(page.hasMore, true)
  assert.equal(page.nextOffset, 2)
})
