import { dedupeProjectUpdateRowsById, shouldAutoPublishScheduledUpdate, type ProjectUpdateRow } from './projectUpdates'

export type ProjectUpdateAutoPublishOutcome = 'won_transition' | 'lost_race' | 'skipped_not_due'

export type AutoPublishDueRow = Pick<
  ProjectUpdateRow,
  'id' | 'project_id' | 'user_id' | 'content' | 'version_label' | 'is_important' | 'status' | 'scheduled_publish_at'
>

export type AutoPublishTransitionedRow = Pick<
  ProjectUpdateRow,
  'id' | 'project_id' | 'user_id' | 'content' | 'version_label' | 'is_important'
>

export type AutoPublishSummary = {
  outcome: ProjectUpdateAutoPublishOutcome
  transitionedCount: number
  notifiedCount: number
}

type Logger = (event: string, payload: Record<string, unknown>) => void

export async function autoPublishScheduledProjectUpdates(args: {
  projectId: string
  projectTitle: string
  nowIso?: string
  debug?: boolean
  fetchDueDrafts: (projectId: string, nowIso: string) => Promise<AutoPublishDueRow[]>
  transitionDueDrafts: (
    projectId: string,
    dueIds: string[],
    nowIso: string
  ) => Promise<AutoPublishTransitionedRow[]>
  notifyFollowers: (row: AutoPublishTransitionedRow, projectTitle: string) => Promise<void>
  logInfo?: Logger
  logError?: Logger
}): Promise<AutoPublishSummary> {
  const nowIso = args.nowIso || new Date().toISOString()
  const nowMs = Date.parse(nowIso)
  const logInfo = args.logInfo || ((event, payload) => console.info(event, payload))
  const logError = args.logError || ((event, payload) => console.error(event, payload))
  const shouldLogVerbose = !!args.debug

  const dueRows = await args.fetchDueDrafts(args.projectId, nowIso)
  const due = dueRows.filter((row) =>
    shouldAutoPublishScheduledUpdate(
      {
        status: row.status,
        scheduled_publish_at: row.scheduled_publish_at,
      },
      nowMs
    )
  )

  if (due.length === 0) {
    if (shouldLogVerbose) {
      logInfo('project_update_schedule_transition', {
        action: 'skipped_not_due',
        project_id: args.projectId,
        due_count: 0,
      })
    }
    return { outcome: 'skipped_not_due', transitionedCount: 0, notifiedCount: 0 }
  }

  const dueIds = due.map((row) => row.id)
  const scheduledById = due.reduce<Record<string, string | null>>((acc, row) => {
    acc[row.id] = row.scheduled_publish_at
    return acc
  }, {})

  const transitionedRows = await args.transitionDueDrafts(args.projectId, dueIds, nowIso)
  const uniqueRows = dedupeProjectUpdateRowsById(transitionedRows)
  if (uniqueRows.length === 0) {
    if (shouldLogVerbose) {
      logInfo('project_update_schedule_transition', {
        action: 'lost_race',
        project_id: args.projectId,
        due_count: due.length,
      })
    }
    return { outcome: 'lost_race', transitionedCount: 0, notifiedCount: 0 }
  }

  logInfo('project_update_schedule_transition', {
    action: 'won_transition',
    project_id: args.projectId,
    transitioned_count: uniqueRows.length,
  })

  let notifiedCount = 0
  for (const row of uniqueRows) {
    logInfo('project_update_schedule_event', {
      schema: 'project_update_schedule.v1',
      action: 'schedule_autopublish',
      project_id: row.project_id,
      update_id: row.id,
      scheduled_publish_at: scheduledById[row.id] || null,
      source: 'project_updates_get',
    })
    try {
      await args.notifyFollowers(row, args.projectTitle)
      notifiedCount += 1
    } catch (error) {
      logError('project_update_schedule_notify_error', {
        project_id: row.project_id,
        update_id: row.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return {
    outcome: 'won_transition',
    transitionedCount: uniqueRows.length,
    notifiedCount,
  }
}
