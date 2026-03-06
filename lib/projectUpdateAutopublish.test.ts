import test from 'node:test'
import assert from 'node:assert/strict'
import {
  autoPublishScheduledProjectUpdates,
  type AutoPublishDueRow,
  type AutoPublishTransitionedRow,
} from './projectUpdateAutopublish'

function buildDueRow(overrides?: Partial<AutoPublishDueRow>): AutoPublishDueRow {
  return {
    id: 'u1',
    project_id: 'p1',
    user_id: 'creator-1',
    content: 'scheduled update',
    version_label: 'v2',
    is_important: false,
    status: 'draft',
    scheduled_publish_at: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

test('concurrent autopublish attempts result in a single winner and single notification send', async () => {
  let status: 'draft' | 'published' = 'draft'
  const notifiedUpdateIds: string[] = []
  const nowIso = '2026-03-01T00:00:00.000Z'
  const dueRow = buildDueRow()

  const fetchDueDrafts = async (): Promise<AutoPublishDueRow[]> => {
    return status === 'draft' ? [dueRow] : []
  }
  const transitionDueDrafts = async (): Promise<AutoPublishTransitionedRow[]> => {
    if (status !== 'draft') return []
    status = 'published'
    return [
      {
        id: dueRow.id,
        project_id: dueRow.project_id,
        user_id: dueRow.user_id,
        content: dueRow.content,
        version_label: dueRow.version_label,
        is_important: dueRow.is_important,
      },
    ]
  }

  const [a, b] = await Promise.all([
    autoPublishScheduledProjectUpdates({
      projectId: 'p1',
      projectTitle: 'My Project',
      nowIso,
      fetchDueDrafts,
      transitionDueDrafts,
      notifyFollowers: async (row) => {
        notifiedUpdateIds.push(row.id)
      },
      logInfo: () => {},
      logError: () => {},
    }),
    autoPublishScheduledProjectUpdates({
      projectId: 'p1',
      projectTitle: 'My Project',
      nowIso,
      fetchDueDrafts,
      transitionDueDrafts,
      notifyFollowers: async (row) => {
        notifiedUpdateIds.push(row.id)
      },
      logInfo: () => {},
      logError: () => {},
    }),
  ])

  const outcomes = [a.outcome, b.outcome].sort()
  assert.deepEqual(outcomes, ['lost_race', 'won_transition'])
  assert.equal(notifiedUpdateIds.length, 1)
  assert.equal(notifiedUpdateIds[0], 'u1')
})

test('autopublish is no-op when update is already published', async () => {
  const logs: Array<{ event: string; action: string }> = []
  const result = await autoPublishScheduledProjectUpdates({
    projectId: 'p1',
    projectTitle: 'My Project',
    nowIso: '2026-03-01T00:00:00.000Z',
    debug: true,
    fetchDueDrafts: async () => [],
    transitionDueDrafts: async () => [],
    notifyFollowers: async () => {
      throw new Error('should not notify')
    },
    logInfo: (event, payload) => {
      logs.push({ event, action: String(payload.action || '') })
    },
    logError: () => {},
  })

  assert.equal(result.outcome, 'skipped_not_due')
  assert.equal(result.transitionedCount, 0)
  assert.equal(result.notifiedCount, 0)
  assert.equal(logs.some((row) => row.event === 'project_update_schedule_transition' && row.action === 'skipped_not_due'), true)
})

test('autopublish is no-op when schedule is not yet due', async () => {
  const result = await autoPublishScheduledProjectUpdates({
    projectId: 'p1',
    projectTitle: 'My Project',
    nowIso: '2026-03-01T00:00:00.000Z',
    fetchDueDrafts: async () => [
      buildDueRow({
        scheduled_publish_at: '2026-03-03T00:00:00.000Z',
      }),
    ],
    transitionDueDrafts: async () => {
      throw new Error('should not transition')
    },
    notifyFollowers: async () => {
      throw new Error('should not notify')
    },
    logInfo: () => {},
    logError: () => {},
  })

  assert.equal(result.outcome, 'skipped_not_due')
  assert.equal(result.transitionedCount, 0)
  assert.equal(result.notifiedCount, 0)
})
