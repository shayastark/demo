import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateTopSupporters,
  getSupporterName,
  parseTopSupportersLimit,
} from './topSupporters'

test('parseTopSupportersLimit validates strict bounds', () => {
  assert.equal(parseTopSupportersLimit(null), 5)
  assert.equal(parseTopSupportersLimit('10'), 10)
  assert.equal(parseTopSupportersLimit('0'), null)
  assert.equal(parseTopSupportersLimit('21'), null)
  assert.equal(parseTopSupportersLimit('abc'), null)
})

test('aggregateTopSupporters ranks by total then recency', () => {
  const rows = aggregateTopSupporters([
    { tipper_user_id: 'u1', amount: 200, created_at: '2026-03-01T00:00:00.000Z' },
    { tipper_user_id: 'u2', amount: 300, created_at: '2026-03-01T01:00:00.000Z' },
    { tipper_user_id: 'u1', amount: 200, created_at: '2026-03-02T00:00:00.000Z' },
    { tipper_user_id: 'u3', amount: 400, created_at: '2026-03-01T03:00:00.000Z' },
    { tipper_user_id: null, amount: 900, created_at: '2026-03-01T03:00:00.000Z' },
  ])

  assert.equal(rows.length, 3)
  assert.equal(rows[0].supporter_user_id, 'u1')
  assert.equal(rows[0].total_tip_amount_cents, 400)
  assert.equal(rows[0].tip_count, 2)
  assert.equal(rows[1].supporter_user_id, 'u3')
})

test('getSupporterName falls back safely', () => {
  assert.equal(getSupporterName('fanUser', 'fan@example.com'), 'fanUser')
  assert.equal(getSupporterName('', 'fan@example.com'), 'fan@example.com')
  assert.equal(getSupporterName(null, null), 'Anonymous supporter')
})

