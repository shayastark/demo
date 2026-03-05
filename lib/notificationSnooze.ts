import { normalizeNotificationType } from './notificationTypes'
import { isProjectAccessInviteNotification, type InboxNotification } from './notificationInbox'

export interface NotificationSnoozeRow {
  scope_key: string
  snoozed_until: string
}

export function isValidSnoozeScopeKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.length > 180) return false
  return /^[a-z0-9:_-]+$/i.test(trimmed)
}

export function parseSnoozePostBody(body: unknown):
  | { ok: true; scopeKey: string; untilIso: string; durationLabel: string }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body' }
  }
  const record = body as Record<string, unknown>
  if (!isValidSnoozeScopeKey(record.scope_key)) {
    return { ok: false, error: 'scope_key is required and must be a compact key' }
  }

  const scopeKey = record.scope_key.trim()
  const now = Date.now()
  if (record.until && typeof record.until === 'string') {
    const untilMs = new Date(record.until).getTime()
    if (!Number.isFinite(untilMs) || untilMs <= now) {
      return { ok: false, error: 'until must be a valid future timestamp' }
    }
    return {
      ok: true,
      scopeKey,
      untilIso: new Date(untilMs).toISOString(),
      durationLabel: 'custom',
    }
  }

  const duration = record.duration
  if (duration !== '24h' && duration !== '7d') {
    return { ok: false, error: 'duration must be 24h or 7d when until is not provided' }
  }
  const ms = duration === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  return {
    ok: true,
    scopeKey,
    untilIso: new Date(now + ms).toISOString(),
    durationLabel: duration,
  }
}

export function parseSnoozeDeleteBody(body: unknown): { ok: true; scopeKey: string } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body' }
  }
  const record = body as Record<string, unknown>
  if (!isValidSnoozeScopeKey(record.scope_key)) {
    return { ok: false, error: 'scope_key is required and must be a compact key' }
  }
  return { ok: true, scopeKey: record.scope_key.trim() }
}

export function getNotificationSnoozeScopeKey(notification: InboxNotification): string {
  const normalizedType = isProjectAccessInviteNotification(notification)
    ? 'project_access_invite'
    : normalizeNotificationType(notification.type)
  const projectId =
    (notification.data?.project_id as string | undefined) ||
    (notification.data?.projectId as string | undefined)
  if (typeof projectId === 'string' && projectId.trim()) {
    return `project:${projectId}:type:${normalizedType}`
  }
  return `type:${normalizedType}`
}

export function isSnoozeActiveUntil(iso: string, nowMs: number): boolean {
  const value = new Date(iso).getTime()
  return Number.isFinite(value) && value > nowMs
}

export function splitNotificationsBySnooze<T extends InboxNotification>(args: {
  notifications: T[]
  snoozes: NotificationSnoozeRow[]
  nowMs?: number
}): {
  active: T[]
  snoozed: T[]
  activeScopeKeys: Set<string>
} {
  const nowMs = args.nowMs ?? Date.now()
  const activeScopeKeys = new Set<string>()

  for (const row of args.snoozes) {
    if (!isValidSnoozeScopeKey(row.scope_key)) continue
    if (!isSnoozeActiveUntil(row.snoozed_until, nowMs)) continue
    activeScopeKeys.add(row.scope_key.trim())
  }

  const active: T[] = []
  const snoozed: T[] = []

  for (const notification of args.notifications) {
    const scopeKey = getNotificationSnoozeScopeKey(notification)
    if (activeScopeKeys.has(scopeKey)) {
      snoozed.push(notification)
    } else {
      active.push(notification)
    }
  }

  return { active, snoozed, activeScopeKeys }
}
