export const MAX_PROJECT_UPDATE_CONTENT_LENGTH = 800
export const MAX_VERSION_LABEL_LENGTH = 40

export type ProjectUpdateRow = {
  id: string
  project_id: string
  user_id: string
  content: string
  version_label: string | null
  is_important: boolean
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

