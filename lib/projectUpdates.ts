export const MAX_PROJECT_UPDATE_CONTENT_LENGTH = 800
export const MAX_VERSION_LABEL_LENGTH = 40
export type ProjectUpdateStatus = 'draft' | 'published'

export type ProjectUpdateRow = {
  id: string
  project_id: string
  user_id: string
  content: string
  version_label: string | null
  is_important: boolean
  status: ProjectUpdateStatus
  published_at: string | null
  scheduled_publish_at: string | null
  created_at: string
  updated_at: string
}

export function sanitizeProjectUpdateContent(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const sanitized = value.trim().slice(0, MAX_PROJECT_UPDATE_CONTENT_LENGTH)
  return sanitized || null
}

export function sanitizeProjectUpdateVersionLabel(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return null
  const sanitized = value.trim().slice(0, MAX_VERSION_LABEL_LENGTH)
  return sanitized || null
}

export function sanitizeProjectUpdateImportantFlag(value: unknown): boolean | null {
  if (value === undefined) return false
  if (typeof value !== 'boolean') return null
  return value
}

export function sanitizeProjectUpdateStatus(
  value: unknown,
  defaultStatus: ProjectUpdateStatus = 'published'
): ProjectUpdateStatus | null {
  if (value === undefined || value === null) return defaultStatus
  if (value === 'draft' || value === 'published') return value
  return null
}

export function canViewerSeeProjectUpdate(
  status: ProjectUpdateStatus,
  canManage: boolean
): boolean {
  if (status === 'published') return true
  return canManage
}

export function shouldNotifyForProjectUpdateTransition(args: {
  previousStatus: ProjectUpdateStatus | null
  nextStatus: ProjectUpdateStatus
}): boolean {
  if (args.nextStatus !== 'published') return false
  if (args.previousStatus === 'published') return false
  return true
}

export function parseProjectUpdateScheduledPublishAt(
  value: unknown,
  nowMs: number = Date.now()
): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const parsedMs = new Date(value).getTime()
  if (!Number.isFinite(parsedMs)) return undefined
  if (parsedMs <= nowMs) return undefined
  return new Date(parsedMs).toISOString()
}

export function canScheduleProjectUpdate(status: ProjectUpdateStatus): boolean {
  return status === 'draft'
}

export function shouldAutoPublishScheduledUpdate(
  row: Pick<ProjectUpdateRow, 'status' | 'scheduled_publish_at'>,
  nowMs: number = Date.now()
): boolean {
  if (row.status !== 'draft') return false
  if (!row.scheduled_publish_at) return false
  const scheduledMs = new Date(row.scheduled_publish_at).getTime()
  if (!Number.isFinite(scheduledMs)) return false
  return scheduledMs <= nowMs
}

export function dedupeProjectUpdateRowsById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const deduped: T[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    deduped.push(row)
  }
  return deduped
}

export function canManageProjectUpdates(userId: string | null | undefined, projectCreatorId: string | null | undefined): boolean {
  return !!userId && !!projectCreatorId && userId === projectCreatorId
}

export function formatProjectUpdatesListResponse(
  updates: ProjectUpdateRow[],
  canManage: boolean
): { updates: Array<ProjectUpdateRow & { can_delete: boolean }>; can_manage: boolean } {
  return {
    updates: updates.map((update) => ({
      ...update,
      can_delete: canManage,
    })),
    can_manage: canManage,
  }
}

