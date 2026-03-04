import test from 'node:test'
import assert from 'node:assert/strict'
import { parseUpdateDeeplink, resolveUpdateIdInList } from './updateDeeplink'

test('parseUpdateDeeplink handles no update param', () => {
  assert.deepEqual(parseUpdateDeeplink(''), {
    state: 'none',
    updateId: null,
    fromNotification: false,
  })
})

test('parseUpdateDeeplink validates update id format', () => {
  const valid = parseUpdateDeeplink('?update_id=123e4567-e89b-12d3-a456-426614174000&from_notification=true')
  assert.equal(valid.state, 'valid')
  assert.equal(valid.fromNotification, true)

  const invalid = parseUpdateDeeplink('?update_id=not-a-uuid')
  assert.equal(invalid.state, 'invalid')
})

test('resolveUpdateIdInList returns resolved/not_found', () => {
  assert.equal(
    resolveUpdateIdInList('u1', [{ id: 'u1' }, { id: 'u2' }]),
    'resolved'
  )
  assert.equal(
    resolveUpdateIdInList('u3', [{ id: 'u1' }, { id: 'u2' }]),
    'not_found'
  )
})

