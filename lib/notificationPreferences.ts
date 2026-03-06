import type { NotificationType } from './notificationTypes'

export interface NotificationPreferences {
  notify_new_follower: boolean
  notify_project_updates: boolean
  notify_tips: boolean
  notify_project_saved: boolean
  delivery_mode: NotificationDeliveryMode
  digest_window: NotificationDigestWindow
}

export type NotificationPreferenceField = keyof NotificationPreferences
export type NotificationDeliveryMode = 'instant' | 'digest'
export type NotificationDigestWindow = 'daily' | 'weekly'

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  notify_new_follower: true,
  notify_project_updates: true,
  notify_tips: true,
  notify_project_saved: true,
  delivery_mode: 'instant',
  digest_window: 'daily',
}

const PREFERENCE_FIELDS: NotificationPreferenceField[] = [
  'notify_new_follower',
  'notify_project_updates',
  'notify_tips',
  'notify_project_saved',
  'delivery_mode',
  'digest_window',
]
const BOOLEAN_PREFERENCE_FIELDS = new Set<NotificationPreferenceField>([
  'notify_new_follower',
  'notify_project_updates',
  'notify_tips',
  'notify_project_saved',
])

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
    delivery_mode:
      row?.delivery_mode === 'digest' || row?.delivery_mode === 'instant'
        ? row.delivery_mode
        : DEFAULT_NOTIFICATION_PREFERENCES.delivery_mode,
    digest_window:
      row?.digest_window === 'weekly' || row?.digest_window === 'daily'
        ? row.digest_window
        : DEFAULT_NOTIFICATION_PREFERENCES.digest_window,
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
    if (key === 'delivery_mode') {
      if (value !== 'instant' && value !== 'digest') {
        return { success: false, error: 'delivery_mode must be instant or digest' }
      }
      updates[key] = value
      continue
    }
    if (key === 'digest_window') {
      if (value !== 'daily' && value !== 'weekly') {
        return { success: false, error: 'digest_window must be daily or weekly' }
      }
      updates[key] = value
      continue
    }
    if (!BOOLEAN_PREFERENCE_FIELDS.has(key as NotificationPreferenceField)) {
      return { success: false, error: `Unknown preference field: ${key}` }
    }
    if (typeof value !== 'boolean') {
      return { success: false, error: `Preference field ${key} must be boolean` }
    }
    updates[key as 'notify_new_follower' | 'notify_project_updates' | 'notify_tips' | 'notify_project_saved'] =
      value
  }

  return { success: true, updates }
}

export function isNotificationPreferences(value: unknown): value is NotificationPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.notify_new_follower === 'boolean' &&
    typeof record.notify_project_updates === 'boolean' &&
    typeof record.notify_tips === 'boolean' &&
    typeof record.notify_project_saved === 'boolean' &&
    (record.delivery_mode === 'instant' || record.delivery_mode === 'digest') &&
    (record.digest_window === 'daily' || record.digest_window === 'weekly')
  )
}

export function parseNotificationPreferencesResponse(body: unknown): {
  success: boolean
  preferences?: NotificationPreferences
  updated_at?: string | null
  error?: string
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { success: false, error: 'Invalid response payload' }
  }

  const record = body as Record<string, unknown>
  if (record.error && typeof record.error === 'string') {
    return { success: false, error: record.error }
  }

  const rawPreferences =
    record.preferences && typeof record.preferences === 'object' && !Array.isArray(record.preferences)
      ? (record.preferences as Partial<NotificationPreferences>)
      : null

  const hasTopLevelPreferenceFields = [
    'notify_new_follower',
    'notify_project_updates',
    'notify_tips',
    'notify_project_saved',
    'delivery_mode',
    'digest_window',
  ].some((key) => key in record)

  const normalized = rawPreferences
    ? toNotificationPreferences(rawPreferences)
    : hasTopLevelPreferenceFields
      ? toNotificationPreferences(record as Partial<NotificationPreferences>)
      : null

  if (!normalized) {
    return { success: false, error: 'Response missing valid preferences payload' }
  }

  const updatedAt =
    typeof record.updated_at === 'string' || record.updated_at === null
      ? (record.updated_at as string | null)
      : null

  return {
    success: true,
    preferences: normalized,
    updated_at: updatedAt,
  }
}

