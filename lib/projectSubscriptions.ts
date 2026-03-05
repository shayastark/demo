export interface ProjectSubscriptionStatusResponse {
  isSubscribed: boolean
  subscriberCount: number
  notification_mode: ProjectSubscriptionNotificationMode
}

export type ProjectSubscriptionNotificationMode = 'all' | 'important' | 'mute'

export const PROJECT_SUBSCRIPTION_NOTIFICATION_MODES: ProjectSubscriptionNotificationMode[] = [
  'all',
  'important',
  'mute',
]

export function parseProjectSubscriptionsLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return 1000
  if (!/^\d+$/.test(raw)) return null
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5000) return null
  return parsed
}

export function parseProjectSubscriptionProjectIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const projectId = (body as Record<string, unknown>).project_id
  return typeof projectId === 'string' ? projectId : null
}

export function parseProjectSubscriptionNotificationModeFromBody(
  body: unknown
): ProjectSubscriptionNotificationMode | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const mode = (body as Record<string, unknown>).notification_mode
  if (mode !== 'all' && mode !== 'important' && mode !== 'mute') return null
  return mode
}

export function normalizeProjectSubscriptionNotificationMode(
  value: unknown
): ProjectSubscriptionNotificationMode {
  if (value === 'all' || value === 'important' || value === 'mute') return value
  return 'all'
}

export function parseProjectSubscriptionProjectIdFromDelete(args: {
  bodyProjectId: string | null
  queryProjectId: string | null
}): string | null {
  if (args.bodyProjectId && args.queryProjectId && args.bodyProjectId !== args.queryProjectId) return null
  return args.bodyProjectId || args.queryProjectId || null
}

export function buildProjectUpdateRecipientIds(args: {
  creatorId: string
  followerIds: string[]
  subscriberIds: string[]
}): string[] {
  const deduped = new Set<string>()
  for (const id of [...args.followerIds, ...args.subscriberIds]) {
    if (!id || id === args.creatorId) continue
    deduped.add(id)
  }
  return Array.from(deduped)
}

export function isImportantProjectUpdate(args: {
  versionLabel?: string | null
}): boolean {
  return shouldBackfillImportantFromVersionLabel(args.versionLabel)
}

export function resolveProjectUpdateImportanceForNotification(args: {
  isImportant?: boolean | null
  versionLabel?: string | null
  allowFallback?: boolean
}): boolean {
  if (typeof args.isImportant === 'boolean') return args.isImportant
  if (!args.allowFallback) return false
  return shouldBackfillImportantFromVersionLabel(args.versionLabel)
}

export function shouldBackfillImportantFromVersionLabel(
  versionLabel: string | null | undefined
): boolean {
  const label = (versionLabel || '').trim().toLowerCase()
  if (!label) return false
  if (/(candidate|rc|beta|alpha|draft|wip|preview)/.test(label)) return false
  if (label === 'final' || label === 'release') return true
  if (label.startsWith('final ') || label.startsWith('release ')) return true
  if (label.includes('official release')) return true
  return false
}

export function applyImportantBackfillRows<T extends { is_important: boolean; version_label: string | null }>(
  rows: T[]
): T[] {
  return rows.map((row) =>
    row.is_important
      ? row
      : shouldBackfillImportantFromVersionLabel(row.version_label)
        ? { ...row, is_important: true }
        : row
  )
}

export function filterProjectUpdateSubscriberIdsByMode(args: {
  rows: Array<{ user_id: string | null; notification_mode?: unknown }>
  isImportant: boolean
}): string[] {
  const ids = new Set<string>()
  for (const row of args.rows) {
    if (!row.user_id) continue
    const mode = normalizeProjectSubscriptionNotificationMode(row.notification_mode)
    if (mode === 'mute') continue
    if (mode === 'important' && !args.isImportant) continue
    ids.add(row.user_id)
  }
  return Array.from(ids)
}

