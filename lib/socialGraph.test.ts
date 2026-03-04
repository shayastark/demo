import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSocialGraphDisplayName,
  parseSocialGraphListType,
  validateSocialGraphListRequest,
} from './socialGraph'

test('getSocialGraphDisplayName uses username then email fallback', () => {
  assert.equal(getSocialGraphDisplayName(' demoFan ', 'fan@example.com'), 'demoFan')
  assert.equal(getSocialGraphDisplayName('', 'fan@example.com'), 'fan@example.com')
  assert.equal(getSocialGraphDisplayName(null, null), 'Unknown user')
})

test('parseSocialGraphListType accepts only followers/following', () => {
  assert.equal(parseSocialGraphListType('followers'), 'followers')
  assert.equal(parseSocialGraphListType('following'), 'following')
  assert.equal(parseSocialGraphListType('other'), null)
})

test('validateSocialGraphListRequest validates strict params', () => {
  const valid = validateSocialGraphListRequest({
    userId: '123e4567-e89b-12d3-a456-426614174000',
    type: 'followers',
    limit: '20',
    offset: '0',
  })
  assert.equal(valid.valid, true)
  assert.equal(valid.parsed?.limit, 20)

  const invalidType = validateSocialGraphListRequest({
    userId: '123e4567-e89b-12d3-a456-426614174000',
    type: 'x',
    limit: '20',
    offset: '0',
  })
  assert.equal(invalidType.valid, false)

  const invalidLimit = validateSocialGraphListRequest({
    userId: '123e4567-e89b-12d3-a456-426614174000',
    type: 'followers',
    limit: '-1',
    offset: '0',
  })
  assert.equal(invalidLimit.valid, false)
})

