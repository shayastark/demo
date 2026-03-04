import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeProjectUpdateContent,
  sanitizeProjectUpdateVersionLabel,
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
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    true
  )

  assert.equal(response.can_manage, true)
  assert.equal(response.updates[0].can_delete, true)
})

