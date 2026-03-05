import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canScheduleProjectUpdate,
  dedupeProjectUpdateRowsById,
  canViewerSeeProjectUpdate,
  parseProjectUpdateScheduledPublishAt,
  sanitizeProjectUpdateContent,
  sanitizeProjectUpdateImportantFlag,
  sanitizeProjectUpdateStatus,
  sanitizeProjectUpdateVersionLabel,
  shouldAutoPublishScheduledUpdate,
  shouldNotifyForProjectUpdateTransition,
  canManageProjectUpdates,
  formatProjectUpdatesListResponse,
  MAX_PROJECT_UPDATE_CONTENT_LENGTH,
} from './projectUpdates'

test('sanitizeProjectUpdateContent enforces max length and trims', () => {
  const long = `   ${'a'.repeat(MAX_PROJECT_UPDATE_CONTENT_LENGTH + 50)}   `
  const sanitized = sanitizeProjectUpdateContent(long)
  assert.equal(sanitized?.length, MAX_PROJECT_UPDATE_CONTENT_LENGTH)
})

test('sanitizeProjectUpdateVersionLabel handles nullability safely', () => {
  assert.equal(sanitizeProjectUpdateVersionLabel(undefined), null)
  assert.equal(sanitizeProjectUpdateVersionLabel(null), null)
  assert.equal(sanitizeProjectUpdateVersionLabel('  v2  '), 'v2')
})

test('sanitizeProjectUpdateImportantFlag validates booleans strictly', () => {
  assert.equal(sanitizeProjectUpdateImportantFlag(true), true)
  assert.equal(sanitizeProjectUpdateImportantFlag(false), false)
  assert.equal(sanitizeProjectUpdateImportantFlag(undefined), false)
  assert.equal(sanitizeProjectUpdateImportantFlag('yes'), null)
})

test('sanitizeProjectUpdateStatus validates and defaults', () => {
  assert.equal(sanitizeProjectUpdateStatus(undefined), 'published')
  assert.equal(sanitizeProjectUpdateStatus('draft'), 'draft')
  assert.equal(sanitizeProjectUpdateStatus('published'), 'published')
  assert.equal(sanitizeProjectUpdateStatus('other'), null)
})

test('canViewerSeeProjectUpdate hides drafts for non-managers', () => {
  assert.equal(canViewerSeeProjectUpdate('published', false), true)
  assert.equal(canViewerSeeProjectUpdate('draft', false), false)
  assert.equal(canViewerSeeProjectUpdate('draft', true), true)
})

test('shouldNotifyForProjectUpdateTransition notifies only on publish transition', () => {
  assert.equal(
    shouldNotifyForProjectUpdateTransition({ previousStatus: null, nextStatus: 'published' }),
    true
  )
  assert.equal(
    shouldNotifyForProjectUpdateTransition({ previousStatus: 'draft', nextStatus: 'published' }),
    true
  )
  assert.equal(
    shouldNotifyForProjectUpdateTransition({ previousStatus: 'published', nextStatus: 'published' }),
    false
  )
  assert.equal(
    shouldNotifyForProjectUpdateTransition({ previousStatus: null, nextStatus: 'draft' }),
    false
  )
})

test('parseProjectUpdateScheduledPublishAt validates future timestamps', () => {
  const now = Date.parse('2026-03-01T00:00:00.000Z')
  assert.equal(parseProjectUpdateScheduledPublishAt(undefined, now), undefined)
  assert.equal(parseProjectUpdateScheduledPublishAt(null, now), null)
  assert.equal(parseProjectUpdateScheduledPublishAt('not-a-date', now), undefined)
  assert.equal(parseProjectUpdateScheduledPublishAt('2026-02-28T00:00:00.000Z', now), undefined)
  assert.equal(
    parseProjectUpdateScheduledPublishAt('2026-03-02T00:00:00.000Z', now),
    '2026-03-02T00:00:00.000Z'
  )
})

test('scheduled autopublish transition and idempotent dedupe helpers', () => {
  const now = Date.parse('2026-03-01T00:00:00.000Z')
  assert.equal(canScheduleProjectUpdate('draft'), true)
  assert.equal(canScheduleProjectUpdate('published'), false)
  assert.equal(
    shouldAutoPublishScheduledUpdate(
      { status: 'draft', scheduled_publish_at: '2026-03-01T00:00:00.000Z' },
      now
    ),
    true
  )
  assert.equal(
    shouldAutoPublishScheduledUpdate(
      { status: 'draft', scheduled_publish_at: '2026-03-02T00:00:00.000Z' },
      now
    ),
    false
  )
  const deduped = dedupeProjectUpdateRowsById([
    { id: 'u1' },
    { id: 'u1' },
    { id: 'u2' },
  ])
  assert.deepEqual(deduped.map((row) => row.id), ['u1', 'u2'])
})

test('canManageProjectUpdates enforces creator-only permissions', () => {
  assert.equal(canManageProjectUpdates('u1', 'u1'), true)
  assert.equal(canManageProjectUpdates('u1', 'u2'), false)
  assert.equal(canManageProjectUpdates(null, 'u2'), false)
})

test('formatProjectUpdatesListResponse includes can_delete and can_manage', () => {
  const response = formatProjectUpdatesListResponse(
    [
      {
        id: 'up1',
        project_id: 'p1',
        user_id: 'u1',
        content: 'mix v2 uploaded',
        version_label: 'v2',
        is_important: false,
        status: 'published',
        published_at: '2026-01-01T00:00:00.000Z',
        scheduled_publish_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    true
  )

  assert.equal(response.can_manage, true)
  assert.equal(response.updates[0].can_delete, true)
})

