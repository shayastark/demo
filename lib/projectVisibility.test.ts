import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canViewerAccessProject,
  isProjectVisibility,
  parseProjectVisibility,
  resolveProjectVisibility,
  shouldShowProjectOnCreatorProfile,
} from './projectVisibility'

test('visibility validation only accepts allowed values', () => {
  assert.equal(isProjectVisibility('public'), true)
  assert.equal(isProjectVisibility('unlisted'), true)
  assert.equal(isProjectVisibility('private'), true)
  assert.equal(isProjectVisibility('friends'), false)
  assert.equal(parseProjectVisibility('private'), 'private')
  assert.equal(parseProjectVisibility('friends'), null)
})

test('resolveProjectVisibility falls back to sharing_enabled', () => {
  assert.equal(resolveProjectVisibility(null, true), 'unlisted')
  assert.equal(resolveProjectVisibility(undefined, false), 'private')
  assert.equal(resolveProjectVisibility('public', false), 'public')
})

test('canViewerAccessProject enforces public/unlisted/private semantics', () => {
  assert.equal(
    canViewerAccessProject({ visibility: 'public', isCreator: false, isDirectAccess: false }),
    true
  )
  assert.equal(
    canViewerAccessProject({ visibility: 'unlisted', isCreator: false, isDirectAccess: false }),
    false
  )
  assert.equal(
    canViewerAccessProject({ visibility: 'unlisted', isCreator: false, isDirectAccess: true }),
    true
  )
  assert.equal(
    canViewerAccessProject({ visibility: 'private', isCreator: false, isDirectAccess: true }),
    false
  )
  assert.equal(
    canViewerAccessProject({ visibility: 'private', isCreator: true, isDirectAccess: false }),
    true
  )
})

test('shouldShowProjectOnCreatorProfile shows only public for non-creator', () => {
  assert.equal(
    shouldShowProjectOnCreatorProfile({ visibility: 'public', isCreator: false }),
    true
  )
  assert.equal(
    shouldShowProjectOnCreatorProfile({ visibility: 'unlisted', isCreator: false }),
    false
  )
  assert.equal(
    shouldShowProjectOnCreatorProfile({ visibility: 'private', isCreator: true }),
    true
  )
})

