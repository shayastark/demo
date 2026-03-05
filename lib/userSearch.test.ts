import test from 'node:test'
import assert from 'node:assert/strict'
import { mapUserSearchRows, parseUserSearchQuery } from './userSearch'

test('parseUserSearchQuery validates query length and default limit', () => {
  assert.deepEqual(
    parseUserSearchQuery({ rawQuery: '  creator ', rawLimit: null }),
    { ok: true, query: 'creator', limit: 6 }
  )
  assert.equal(parseUserSearchQuery({ rawQuery: 'a', rawLimit: null }).ok, false)
})

test('parseUserSearchQuery validates limit bounds', () => {
  assert.equal(parseUserSearchQuery({ rawQuery: 'abc', rawLimit: '0' }).ok, false)
  assert.equal(parseUserSearchQuery({ rawQuery: 'abc', rawLimit: '11' }).ok, false)
  assert.equal(parseUserSearchQuery({ rawQuery: 'abc', rawLimit: 'x' }).ok, false)
  assert.deepEqual(
    parseUserSearchQuery({ rawQuery: 'abc', rawLimit: '10' }),
    { ok: true, query: 'abc', limit: 10 }
  )
})

test('mapUserSearchRows normalizes nullable username/avatar fields', () => {
  assert.deepEqual(
    mapUserSearchRows([
      { id: 'u1', username: 'demo', avatar_url: 'https://example.com/a.png' },
      { id: 'u2', username: '   ', avatar_url: '   ' },
    ]),
    [
      { id: 'u1', username: 'demo', avatar_url: 'https://example.com/a.png' },
      { id: 'u2', username: null, avatar_url: null },
    ]
  )
})
