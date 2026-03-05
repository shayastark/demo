export type ProjectAccessNotificationAction = 'created' | 'skipped_self' | 'skipped_preference'

export function getProjectAccessGrantorName(value?: string | null): string {
  const trimmed = value?.trim()
  return trimmed || 'A creator'
}

export function buildProjectAccessInviteTargetPath(projectId: string): string {
  return `/dashboard/projects/${projectId}`
}

export function buildProjectAccessInviteTitle(args: {
  grantedByName: string
  projectTitle?: string | null
}): string {
  const normalizedProjectTitle = args.projectTitle?.trim()
  if (normalizedProjectTitle) {
    return `${args.grantedByName} granted you access to "${normalizedProjectTitle}"`
  }
  return `${args.grantedByName} granted you private project access`
}

export function decideProjectAccessNotificationAction(args: {
  recipientUserId: string
  grantedByUserId: string
  skippedPreference: boolean
}): ProjectAccessNotificationAction {
  if (args.recipientUserId === args.grantedByUserId) return 'skipped_self'
  if (args.skippedPreference) return 'skipped_preference'
  return 'created'
}
