export type UpdateEngagementNotificationAction =
  | 'created'
  | 'skipped_self'
  | 'skipped_preference'

export function getUpdateEngagementActorName(value?: string | null): string {
  const trimmed = value?.trim()
  return trimmed || 'Someone'
}

export function buildUpdateEngagementTargetPath(projectId: string, updateId: string): string {
  return `/dashboard/projects/${projectId}?update_id=${encodeURIComponent(updateId)}`
}

export function decideUpdateEngagementNotificationAction(params: {
  recipientUserId: string
  actorUserId: string
  skippedPreference: boolean
}): UpdateEngagementNotificationAction {
  if (params.recipientUserId === params.actorUserId) return 'skipped_self'
  if (params.skippedPreference) return 'skipped_preference'
  return 'created'
}

