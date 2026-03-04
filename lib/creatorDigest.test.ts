import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCreatorDigestHighlights,
  buildCreatorDigestTopProject,
  parseCreatorDigestWindowDays,
} from './creatorDigest'

test('parseCreatorDigestWindowDays enforces bounds and defaults', () => {
  assert.equal(parseCreatorDigestWindowDays(null), 7)
  assert.equal(parseCreatorDigestWindowDays('7'), 7)
  assert.equal(parseCreatorDigestWindowDays('30'), 30)
  assert.equal(parseCreatorDigestWindowDays('0'), null)
  assert.equal(parseCreatorDigestWindowDays('31'), null)
  assert.equal(parseCreatorDigestWindowDays('abc'), null)
})

test('buildCreatorDigestTopProject picks top project with meaningful metric', () => {
  const topProject = buildCreatorDigestTopProject({
    projectTitlesById: {
      p1: 'First',
      p2: 'Second',
    },
    commentProjectIds: ['p1', 'p1', 'p2'],
    updateProjectIds: ['p2'],
    tipRows: [
      { project_id: 'p2', amount: 200 },
      { project_id: 'p2', amount: 300 },
    ],
  })

  assert.equal(topProject?.id, 'p2')
  assert.equal(topProject?.metric_label, 'new tips')
  assert.equal(topProject?.metric_value, 2)
})

test('buildCreatorDigestTopProject returns null for no activity', () => {
  const topProject = buildCreatorDigestTopProject({
    projectTitlesById: {},
    commentProjectIds: [],
    updateProjectIds: [],
    tipRows: [],
  })
  assert.equal(topProject, null)
})

test('buildCreatorDigestHighlights returns up to 3 short strings', () => {
  const highlights = buildCreatorDigestHighlights({
    new_followers_count: 2,
    new_comments_count: 4,
    updates_posted_count: 1,
    tips_count: 2,
    tips_amount_cents: 950,
    top_project: null,
  })
  assert.equal(highlights.length, 3)
  assert.match(highlights[0], /new followers/)
})

