import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canViewerSeeProjectUpdate,
  sanitizeProjectUpdateContent,
  sanitizeProjectUpdateImportantFlag,
  sanitizeProjectUpdateStatus,
  sanitizeProjectUpdateVersionLabel,
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
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    true
  )

  assert.equal(response.can_manage, true)
  assert.equal(response.updates[0].can_delete, true)
})

