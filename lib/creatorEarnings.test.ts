import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSupporterDisplayName,
  aggregateProjectTotals,
  buildPerProjectTotals,
} from './creatorEarnings'

test('getSupporterDisplayName falls back safely', () => {
  assert.equal(getSupporterDisplayName('  demoFan  '), 'demoFan')
  assert.equal(getSupporterDisplayName(''), 'Anonymous supporter')
  assert.equal(getSupporterDisplayName(null), 'Anonymous supporter')
})

test('aggregateProjectTotals counts and sums by project', () => {
  const totals = aggregateProjectTotals([
    { project_id: 'p1', amount: 100 },
    { project_id: 'p1', amount: 300 },
    { project_id: 'p2', amount: 200 },
    { project_id: null, amount: 900 },
  ])

  assert.deepEqual(totals, {
    p1: { tips_count: 2, amount_cents: 400 },
    p2: { tips_count: 1, amount_cents: 200 },
  })
})

test('buildPerProjectTotals sorts and limits top projects', () => {
  const rows = buildPerProjectTotals(
    {
      p1: { tips_count: 2, amount_cents: 400 },
      p2: { tips_count: 1, amount_cents: 1000 },
      p3: { tips_count: 4, amount_cents: 300 },
    },
    {
      p1: 'Project One',
      p2: 'Project Two',
    },
    2
  )

  assert.equal(rows.length, 2)
  assert.equal(rows[0].project_id, 'p2')
  assert.equal(rows[0].project_title, 'Project Two')
  assert.equal(rows[1].project_id, 'p1')
})

