import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canDeleteProjectUpdateComment,
  MAX_PROJECT_UPDATE_COMMENT_LENGTH,
  sanitizeProjectUpdateCommentContent,
} from './projectUpdateComments'

test('sanitizeProjectUpdateCommentContent trims and enforces max length', () => {
  const value = `   ${'x'.repeat(MAX_PROJECT_UPDATE_COMMENT_LENGTH + 25)}   `
  const sanitized = sanitizeProjectUpdateCommentContent(value)
  assert.equal(sanitized?.length, MAX_PROJECT_UPDATE_COMMENT_LENGTH)
})

test('sanitizeProjectUpdateCommentContent rejects empty/non-string', () => {
  assert.equal(sanitizeProjectUpdateCommentContent('   '), null)
  assert.equal(sanitizeProjectUpdateCommentContent(null), null)
  assert.equal(sanitizeProjectUpdateCommentContent(42), null)
})

test('canDeleteProjectUpdateComment allows owner or creator only', () => {
  assert.equal(
    canDeleteProjectUpdateComment({
      viewerUserId: 'u1',
      commentUserId: 'u1',
      projectCreatorId: 'u2',
    }),
    true
  )
  assert.equal(
    canDeleteProjectUpdateComment({
      viewerUserId: 'u2',
      commentUserId: 'u1',
      projectCreatorId: 'u2',
    }),
    true
  )
  assert.equal(
    canDeleteProjectUpdateComment({
      viewerUserId: 'u3',
      commentUserId: 'u1',
      projectCreatorId: 'u2',
    }),
    false
  )
})

