import { normalizeNotificationType } from './notificationTypes'
import { getFollowerDisplayName } from './follows'

export interface InboxNotification {
  id: string
  type: string
  title: string
  message: string | null
  data?: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

export function isUuidLike(value: string | null | undefined): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function getFollowerIdFromQueryParam(value: string | null | undefined): string | null {
  if (!isUuidLike(value)) return null
  return value
}

function toTimestamp(iso: string): number {
  const value = new Date(iso).getTime()
  return Number.isFinite(value) ? value : 0
}

export function sortNotificationsForInbox<T extends InboxNotification>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.is_read !== b.is_read) return a.is_read ? 1 : -1
    return toTimestamp(b.created_at) - toTimestamp(a.created_at)
  })
}

export function getFollowerNotificationName(notification: InboxNotification): string {
  const rawName =
    (notification.data?.follower_name as string | undefined) ||
    (notification.data?.followerName as string | undefined) ||
    null

  return getFollowerDisplayName(rawName)
}

export function getNotificationPrimaryText(notification: InboxNotification): string {
  const normalizedType = normalizeNotificationType(notification.type)

  if (normalizedType === 'new_follower') {
    return `${getFollowerNotificationName(notification)} followed you`
  }

  return notification.title || 'Notification'
}

export function getNotificationTargetPath(notification: InboxNotification): string | null {
  const directTarget = typeof notification.data?.targetPath === 'string' ? notification.data.targetPath : null
  if (directTarget) return directTarget

  const normalizedType = normalizeNotificationType(notification.type)
  if (normalizedType === 'new_follower') {
    const rawFollowerId =
      (notification.data?.follower_id as string | undefined) ||
      (notification.data?.followerId as string | undefined)
    const followerId = getFollowerIdFromQueryParam(rawFollowerId)
    return followerId ? `/account?follower_id=${encodeURIComponent(followerId)}` : '/account'
  }

  if (normalizedType === 'tip_received') return '/account'
  if (normalizedType === 'new_track') return '/dashboard'
  if (normalizedType === 'project_saved' || normalizedType === 'project_shared') return '/dashboard'

  return null
}
