const DB_NOTIFICATION_TYPES = [
  'tip_received',
  'project_saved',
  'new_follower',
  'project_shared',
  'new_track',
  'unknown',
] as const

export type NotificationType = (typeof DB_NOTIFICATION_TYPES)[number]
export type CreatableNotificationType = Exclude<NotificationType, 'unknown'>

export function normalizeNotificationType(rawType: string | null | undefined): NotificationType {
  if (!rawType) return 'unknown'
  if ((DB_NOTIFICATION_TYPES as readonly string[]).includes(rawType)) {
    return rawType as NotificationType
  }
  return 'unknown'
}
