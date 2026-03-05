import { normalizeNotificationType, type NotificationType } from '@/lib/notificationTypes'
import {
  getNotificationTargetPath,
  isProjectAccessInviteNotification,
  type InboxNotification,
} from '@/lib/notificationInbox'
import type { NotificationDigestWindow } from '@/lib/notificationPreferences'
import { parseOffsetLimitQuery, buildPaginatedItems } from '@/lib/pagination'

export interface NotificationDigestGroup {
  id: string
  group_type: string
  grouped_count: number
  latest_created_at: string
  target_path: string | null
  title: string
}

export function parseNotificationDigestQuery(args: {
  rawWindow: string | null
  rawLimit: string | null
  rawOffset: string | null
  defaultWindow: NotificationDigestWindow
}):
  | { ok: true; window: NotificationDigestWindow; limit: number; offset: number }
  | { ok: false; error: string } {
  const parsedPagination = parseOffsetLimitQuery({
    rawLimit: args.rawLimit,
    rawOffset: args.rawOffset,
    defaultLimit: 20,
    maxLimit: 50,
  })
  if (!parsedPagination.ok) return parsedPagination
  const window =
    args.rawWindow === 'daily' || args.rawWindow === 'weekly' ? args.rawWindow : args.defaultWindow
  return {
    ok: true,
    window,
    limit: parsedPagination.limit,
    offset: parsedPagination.offset,
  }
}

export function getNotificationDigestWindowSinceIso(
  window: NotificationDigestWindow,
  nowMs: number = Date.now()
): string {
  const durationMs = window === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  return new Date(nowMs - durationMs).toISOString()
}

export function buildNotificationDigestGroups(args: {
  notifications: InboxNotification[]
}): NotificationDigestGroup[] {
  const groups = new Map<
    string,
    {
      id: string
      group_type: string
      grouped_count: number
      latest_created_at: string
      target_path: string | null
      sample_type: NotificationType
    }
  >()

  for (const notification of args.notifications) {
    const normalizedType = normalizeNotificationType(notification.type)
    const groupType = isProjectAccessInviteNotification(notification)
      ? 'project_access_invite'
      : normalizedType
    const groupTargetId = getGroupTargetId(notification)
    const groupKey = `${groupType}:${groupTargetId}`
    const createdAtMs = new Date(notification.created_at).getTime()
    const targetPath = getNotificationTargetPath(notification)

    const existing = groups.get(groupKey)
    if (!existing) {
      groups.set(groupKey, {
        id: groupKey,
        group_type: groupType,
        grouped_count: 1,
        latest_created_at: notification.created_at,
        target_path: targetPath,
        sample_type: normalizedType,
      })
      continue
    }
    existing.grouped_count += 1
    const existingMs = new Date(existing.latest_created_at).getTime()
    if (createdAtMs > existingMs) {
      existing.latest_created_at = notification.created_at
      existing.target_path = targetPath
      existing.sample_type = normalizedType
    }
  }

  return Array.from(groups.values())
    .map((row) => ({
      id: row.id,
      group_type: row.group_type,
      grouped_count: row.grouped_count,
      latest_created_at: row.latest_created_at,
      target_path: row.target_path,
      title: buildDigestTitle(row.group_type, row.grouped_count),
    }))
    .sort((a, b) => {
      const timeDiff = new Date(b.latest_created_at).getTime() - new Date(a.latest_created_at).getTime()
      if (timeDiff !== 0) return timeDiff
      return b.id.localeCompare(a.id)
    })
}

export function paginateNotificationDigestGroups(args: {
  groups: NotificationDigestGroup[]
  limit: number
  offset: number
}) {
  const rows = args.groups.slice(args.offset, args.offset + args.limit + 1)
  return buildPaginatedItems({
    rows,
    limit: args.limit,
    offset: args.offset,
  })
}

function getGroupTargetId(notification: InboxNotification): string {
  if (isProjectAccessInviteNotification(notification)) {
    const projectId =
      (notification.data?.project_id as string | undefined) ||
      (notification.data?.projectId as string | undefined)
    if (typeof projectId === 'string' && projectId.trim()) return projectId
  }

  const projectId =
    (notification.data?.project_id as string | undefined) ||
    (notification.data?.projectId as string | undefined)
  if (typeof projectId === 'string' && projectId.trim()) return projectId

  const creatorId =
    (notification.data?.creator_id as string | undefined) ||
    (notification.data?.creatorId as string | undefined) ||
    (notification.data?.follower_id as string | undefined) ||
    (notification.data?.followerId as string | undefined)
  if (typeof creatorId === 'string' && creatorId.trim()) return creatorId

  return 'global'
}

function buildDigestTitle(groupType: string, count: number): string {
  if (groupType === 'new_follower') return `${count} new follower${count === 1 ? '' : 's'}`
  if (groupType === 'tip_received') return `${count} new tip${count === 1 ? '' : 's'}`
  if (groupType === 'new_track') return `${count} project update${count === 1 ? '' : 's'}`
  if (groupType === 'project_saved') return `${count} save activity item${count === 1 ? '' : 's'}`
  if (groupType === 'project_shared') return `${count} share activity item${count === 1 ? '' : 's'}`
  if (groupType === 'project_access_invite') return `${count} private access invite${count === 1 ? '' : 's'}`
  return `${count} notification${count === 1 ? '' : 's'}`
}
