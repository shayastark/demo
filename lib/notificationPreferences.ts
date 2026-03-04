import type { NotificationType } from './notificationTypes'

export interface NotificationPreferences {
  notify_new_follower: boolean
  notify_project_updates: boolean
  notify_tips: boolean
  notify_project_saved: boolean
}

export type NotificationPreferenceField = keyof NotificationPreferences

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  notify_new_follower: true,
  notify_project_updates: true,
  notify_tips: true,
  notify_project_saved: true,
}

const PREFERENCE_FIELDS: NotificationPreferenceField[] = [
  'notify_new_follower',
  'notify_project_updates',
  'notify_tips',
  'notify_project_saved',
]

const NOTIFICATION_TYPE_TO_PREFERENCE: Record<NotificationType, NotificationPreferenceField | null> = {
  new_follower: 'notify_new_follower',
  new_track: 'notify_project_updates',
  tip_received: 'notify_tips',
  project_saved: 'notify_project_saved',
  project_shared: 'notify_project_saved',
  unknown: null,
}

export function getPreferenceFieldForNotificationType(
  type: NotificationType
): NotificationPreferenceField | null {
  return NOTIFICATION_TYPE_TO_PREFERENCE[type] || null
}

export function toNotificationPreferences(
  row: Partial<NotificationPreferences> | null | undefined
): NotificationPreferences {
  return {
    notify_new_follower:
      typeof row?.notify_new_follower === 'boolean'
        ? row.notify_new_follower
        : DEFAULT_NOTIFICATION_PREFERENCES.notify_new_follower,
    notify_project_updates:
      typeof row?.notify_project_updates === 'boolean'
        ? row.notify_project_updates
        : DEFAULT_NOTIFICATION_PREFERENCES.notify_project_updates,
    notify_tips:
      typeof row?.notify_tips === 'boolean'
        ? row.notify_tips
        : DEFAULT_NOTIFICATION_PREFERENCES.notify_tips,
    notify_project_saved:
      typeof row?.notify_project_saved === 'boolean'
        ? row.notify_project_saved
        : DEFAULT_NOTIFICATION_PREFERENCES.notify_project_saved,
  }
}

export function parseNotificationPreferencesPatch(body: unknown): {
  success: boolean
  updates?: Partial<NotificationPreferences>
  error?: string
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { success: false, error: 'Invalid request body' }
  }

  const record = body as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0) {
    return { success: false, error: 'At least one preference field is required' }
  }

  const updates: Partial<NotificationPreferences> = {}
  for (const key of keys) {
    if (!PREFERENCE_FIELDS.includes(key as NotificationPreferenceField)) {
      return { success: false, error: `Unknown preference field: ${key}` }
    }
    const value = record[key]
    if (typeof value !== 'boolean') {
      return { success: false, error: `Preference field ${key} must be boolean` }
    }
    updates[key as NotificationPreferenceField] = value
  }

  return { success: true, updates }
}

