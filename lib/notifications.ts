import { supabaseAdmin } from './supabaseAdmin'
import { buildFollowerNotificationTitle, getFollowerDisplayName } from './follows'
import { CreatableNotificationType } from './notificationTypes'
import {
  getPreferenceFieldForNotificationType,
  type NotificationPreferenceField,
} from './notificationPreferences'
import {
  buildUpdateEngagementTargetPath,
  decideUpdateEngagementNotificationAction,
  getUpdateEngagementActorName,
  type UpdateEngagementNotificationAction,
} from './updateEngagementNotifications'
import { buildProjectUpdateRecipientIds } from './projectSubscriptions'
import {
  buildProjectAccessInviteTargetPath,
  buildProjectAccessInviteTitle,
  decideProjectAccessNotificationAction,
  getProjectAccessGrantorName,
  type ProjectAccessNotificationAction,
} from './projectAccessNotifications'
import { getCreatorPublicPath } from './publicCreatorProfile'

export type NotificationType = CreatableNotificationType

interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message?: string
  data?: Record<string, unknown>
}

async function isUserNotificationEnabled(
  userId: string,
  type: NotificationType
): Promise<boolean> {
  const preferenceField = getPreferenceFieldForNotificationType(type)
  if (!preferenceField) return true

  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select(preferenceField)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Error reading notification preference:', error)
    // Fail open to avoid breaking existing notification behavior.
    return true
  }

  const value = (data as Record<string, unknown> | null)?.[preferenceField]
  if (typeof value === 'boolean') return value
  return true
}

async function filterUsersByNotificationPreference(
  userIds: string[],
  preferenceField: NotificationPreferenceField
): Promise<string[]> {
  if (userIds.length === 0) return []

  const { data: rows, error } = await supabaseAdmin
    .from('notification_preferences')
    .select(`user_id, ${preferenceField}`)
    .in('user_id', userIds)

  if (error) {
    console.error('Error filtering notification preferences:', error)
    // Fail open to avoid suppressing notifications due to transient read failures.
    return userIds
  }

  const disabledUserIds = new Set(
    (rows || [])
      .filter((row) => (row as Record<string, unknown>)[preferenceField] === false)
      .map((row) => row.user_id)
      .filter((id): id is string => typeof id === 'string')
  )

  return userIds.filter((id) => !disabledUserIds.has(id))
}

/**
 * Create a notification for a user
 * This should only be called from server-side code (API routes)
 */
export async function createNotification({
  userId,
  type,
  title,
  message,
  data = {},
}: CreateNotificationParams): Promise<{
  success: boolean
  notificationId?: string
  error?: string
  skippedPreference?: boolean
}> {
  try {
    const isEnabled = await isUserNotificationEnabled(userId, type)
    if (!isEnabled) {
      return { success: true, skippedPreference: true }
    }

    const { data: notification, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        data,
        is_read: false,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error creating notification:', error)
      return { success: false, error: error.message }
    }

    return { success: true, notificationId: notification?.id }
  } catch (error) {
    console.error('Error creating notification:', error)
    return { success: false, error: 'Failed to create notification' }
  }
}

/**
 * Create a tip notification
 */
export async function createTipNotification({
  creatorId,
  amount,
  tipperUsername,
  message,
  currency = 'usd',
}: {
  creatorId: string
  amount: number // in cents
  tipperUsername?: string | null
  message?: string | null
  currency?: string
}): Promise<{ success: boolean; error?: string }> {
  const formattedAmount = currency === 'usdc' 
    ? `$${(amount / 100).toFixed(2)} USDC`
    : `$${(amount / 100).toFixed(2)}`
  
  const tipperName = tipperUsername || 'Anonymous'
  
  const title = `${tipperName} sent you ${formattedAmount}`
  
  return createNotification({
    userId: creatorId,
    type: 'tip_received',
    title,
    message: message || undefined,
    data: {
      amount,
      currency,
      tipperUsername: tipperUsername || null,
    },
  })
}

/**
 * Notify all users who have saved a project that a new track was added
 * Excludes the creator themselves
 */
export async function notifyNewTrackAdded({
  projectId,
  creatorId,
  projectTitle,
  trackTitle,
}: {
  projectId: string
  creatorId: string
  projectTitle: string
  trackTitle: string
}): Promise<{ success: boolean; notifiedCount: number; error?: string }> {
  try {
    // Find all users who have saved this project (excluding the creator)
    const { data: savedByUsers, error: fetchError } = await supabaseAdmin
      .from('user_projects')
      .select('user_id')
      .eq('project_id', projectId)
      .neq('user_id', creatorId)

    if (fetchError) {
      console.error('Error fetching users who saved project:', fetchError)
      return { success: false, notifiedCount: 0, error: fetchError.message }
    }

    if (!savedByUsers || savedByUsers.length === 0) {
      return { success: true, notifiedCount: 0 }
    }

    const recipientIds = savedByUsers
      .map((row) => row.user_id)
      .filter((id): id is string => typeof id === 'string')
    const enabledRecipientIds = await filterUsersByNotificationPreference(
      recipientIds,
      'notify_project_updates'
    )

    if (enabledRecipientIds.length === 0) {
      return { success: true, notifiedCount: 0 }
    }

    // Create notifications for each opted-in user.
    const notifications = enabledRecipientIds.map((userId) => ({
      user_id: userId,
      type: 'new_track' as const,
      title: `New track added to "${projectTitle}"`,
      message: `"${trackTitle}" was just added`,
      data: {
        projectId,
        projectTitle,
        trackTitle,
      },
      is_read: false,
    }))

    const { error: insertError } = await supabaseAdmin
      .from('notifications')
      .insert(notifications)

    if (insertError) {
      console.error('Error creating new track notifications:', insertError)
      return { success: false, notifiedCount: 0, error: insertError.message }
    }

    return { success: true, notifiedCount: enabledRecipientIds.length }
  } catch (error) {
    console.error('Error in notifyNewTrackAdded:', error)
    return { success: false, notifiedCount: 0, error: 'Failed to create notifications' }
  }
}

/**
 * Create a notification when a creator gets a new follower.
 */
export async function createFollowerNotification({
  creatorId,
  followerName,
  followerId,
}: {
  creatorId: string
  followerName?: string | null
  followerId: string
}): Promise<{ success: boolean; error?: string }> {
  const displayName = getFollowerDisplayName(followerName)

  return createNotification({
    userId: creatorId,
    type: 'new_follower',
    title: buildFollowerNotificationTitle(displayName),
    data: {
      // New canonical payload keys.
      follower_id: followerId,
      follower_name: displayName,
      targetPath: getCreatorPublicPath({ id: followerId, username: displayName }),
      // Backward-compat keys kept for existing client expectations.
      followerId,
      followerName: displayName,
    },
  })
}

type FollowColumnName = 'following_id' | 'followed_id'
let cachedFollowColumn: FollowColumnName | null = null

async function resolveFollowColumn(): Promise<FollowColumnName> {
  if (cachedFollowColumn) return cachedFollowColumn

  const { data: newColumn } = await supabaseAdmin
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'user_follows')
    .eq('column_name', 'following_id')
    .maybeSingle()

  if (newColumn?.column_name === 'following_id') {
    cachedFollowColumn = 'following_id'
    return cachedFollowColumn
  }

  cachedFollowColumn = 'followed_id'
  return cachedFollowColumn
}

export async function notifyFollowersProjectUpdate({
  creatorId,
  projectId,
  updateId,
  projectTitle,
  content,
  versionLabel,
}: {
  creatorId: string
  projectId: string
  updateId: string
  projectTitle: string
  content: string
  versionLabel?: string | null
}): Promise<{ success: boolean; notifiedCount: number; error?: string }> {
  try {
    const followColumn = await resolveFollowColumn()

    const { data: followers, error: followersError } = await supabaseAdmin
      .from('user_follows')
      .select('follower_id')
      .eq(followColumn, creatorId)

    if (followersError) {
      return { success: false, notifiedCount: 0, error: followersError.message }
    }

    const { data: subscribers, error: subscribersError } = await supabaseAdmin
      .from('project_subscriptions')
      .select('user_id')
      .eq('project_id', projectId)

    if (subscribersError) {
      return { success: false, notifiedCount: 0, error: subscribersError.message }
    }

    const followerIds = (followers || [])
      .map((row) => row.follower_id)
      .filter((id): id is string => typeof id === 'string')
    const subscriberIds = (subscribers || [])
      .map((row) => row.user_id)
      .filter((id): id is string => typeof id === 'string')

    const recipientIds = buildProjectUpdateRecipientIds({
      creatorId,
      followerIds,
      subscriberIds,
    })

    if (recipientIds.length === 0) {
      return { success: true, notifiedCount: 0 }
    }

    const enabledRecipientIds = await filterUsersByNotificationPreference(
      recipientIds,
      'notify_project_updates'
    )
    if (enabledRecipientIds.length === 0) {
      return { success: true, notifiedCount: 0 }
    }

    const trimmedContent = content.trim().slice(0, 140)
    const titlePrefix = versionLabel ? `${versionLabel}: ` : ''

    const notifications = enabledRecipientIds.map((userId) => ({
      user_id: userId,
      type: 'new_track' as const,
      title: `Project update: "${projectTitle}"`,
      message: `${titlePrefix}${trimmedContent}`,
      data: {
        projectId,
        updateId,
        projectTitle,
        updatePreview: trimmedContent,
        versionLabel: versionLabel || null,
        targetPath: buildUpdateEngagementTargetPath(projectId, updateId) + '&from_notification=true',
      },
      is_read: false,
    }))

    const { error: insertError } = await supabaseAdmin
      .from('notifications')
      .insert(notifications)

    if (insertError) {
      return { success: false, notifiedCount: 0, error: insertError.message }
    }

    return { success: true, notifiedCount: enabledRecipientIds.length }
  } catch (error) {
    console.error('Error notifying followers of project update:', error)
    return { success: false, notifiedCount: 0, error: 'Failed to create notifications' }
  }
}

export async function notifyCreatorUpdateEngagement({
  recipientUserId,
  actorUserId,
  actorName,
  projectId,
  updateId,
}: {
  recipientUserId: string
  actorUserId: string
  actorName?: string | null
  projectId: string
  updateId: string
}): Promise<{
  success: boolean
  action: UpdateEngagementNotificationAction
  recipient_user_id: string
  actor_user_id: string
  project_id: string
  update_id: string
  notification_type: NotificationType
}> {
  const notificationType: NotificationType = 'new_track'

  if (recipientUserId === actorUserId) {
    return {
      success: true,
      action: 'skipped_self',
      recipient_user_id: recipientUserId,
      actor_user_id: actorUserId,
      project_id: projectId,
      update_id: updateId,
      notification_type: notificationType,
    }
  }

  const actorDisplayName = getUpdateEngagementActorName(actorName)
  const result = await createNotification({
    userId: recipientUserId,
    type: notificationType,
    title: `${actorDisplayName} engaged with your update`,
    message: 'New discussion activity on your project update',
    data: {
      project_id: projectId,
      update_id: updateId,
      actor_user_id: actorUserId,
      actor_name: actorDisplayName,
      targetPath: buildUpdateEngagementTargetPath(projectId, updateId) + '&from_notification=true',
      projectId,
      updateId,
      actorUserId,
      actorName: actorDisplayName,
    },
  })

  const action = decideUpdateEngagementNotificationAction({
    recipientUserId,
    actorUserId,
    skippedPreference: !!result.skippedPreference,
  })

  return {
    success: result.success,
    action,
    recipient_user_id: recipientUserId,
    actor_user_id: actorUserId,
    project_id: projectId,
    update_id: updateId,
    notification_type: notificationType,
  }
}

export async function notifyPrivateProjectAccessGranted({
  recipientUserId,
  grantedByUserId,
  grantedByName,
  projectId,
  projectTitle,
}: {
  recipientUserId: string
  grantedByUserId: string
  grantedByName?: string | null
  projectId: string
  projectTitle?: string | null
}): Promise<{
  success: boolean
  action: ProjectAccessNotificationAction
  recipient_user_id: string
  granted_by_user_id: string
  project_id: string
  notification_type: NotificationType
}> {
  const notificationType: NotificationType = 'new_track'
  if (recipientUserId === grantedByUserId) {
    return {
      success: true,
      action: 'skipped_self',
      recipient_user_id: recipientUserId,
      granted_by_user_id: grantedByUserId,
      project_id: projectId,
      notification_type: notificationType,
    }
  }

  const grantorDisplayName = getProjectAccessGrantorName(grantedByName)
  const result = await createNotification({
    userId: recipientUserId,
    type: notificationType,
    title: buildProjectAccessInviteTitle({
      grantedByName: grantorDisplayName,
      projectTitle: projectTitle || null,
    }),
    message: 'Open the project to view private updates and attachments.',
    data: {
      context: 'project_access_invite',
      project_id: projectId,
      project_title: projectTitle || null,
      granted_by_user_id: grantedByUserId,
      granted_by_name: grantorDisplayName,
      targetPath: buildProjectAccessInviteTargetPath(projectId),
      projectId,
      projectTitle: projectTitle || null,
      grantedByUserId,
      grantedByName: grantorDisplayName,
    },
  })

  const action = decideProjectAccessNotificationAction({
    recipientUserId,
    grantedByUserId,
    skippedPreference: !!result.skippedPreference,
  })

  return {
    success: result.success,
    action,
    recipient_user_id: recipientUserId,
    granted_by_user_id: grantedByUserId,
    project_id: projectId,
    notification_type: notificationType,
  }
}

export async function notifyPrivateProjectAccessRequestCreated({
  creatorUserId,
  requesterUserId,
  requesterName,
  projectId,
  projectTitle,
  note,
}: {
  creatorUserId: string
  requesterUserId: string
  requesterName?: string | null
  projectId: string
  projectTitle?: string | null
  note?: string | null
}): Promise<{ success: boolean; skippedPreference?: boolean }> {
  const requesterDisplayName = getProjectAccessGrantorName(requesterName)
  const result = await createNotification({
    userId: creatorUserId,
    type: 'new_track',
    title: `${requesterDisplayName} requested access to "${projectTitle || 'your private project'}"`,
    message: note?.trim() ? note.trim().slice(0, 160) : 'Review this request in your project settings.',
    data: {
      context: 'project_access_request',
      project_id: projectId,
      project_title: projectTitle || null,
      requester_user_id: requesterUserId,
      requester_name: requesterDisplayName,
      targetPath: `${buildProjectAccessInviteTargetPath(projectId)}?access_requests=1`,
      projectId,
      projectTitle: projectTitle || null,
      requesterUserId,
      requesterName: requesterDisplayName,
    },
  })

  return { success: result.success, skippedPreference: result.skippedPreference }
}

export async function notifyPrivateProjectAccessRequestReviewed({
  requesterUserId,
  reviewerUserId,
  reviewerName,
  projectId,
  projectTitle,
  decision,
}: {
  requesterUserId: string
  reviewerUserId: string
  reviewerName?: string | null
  projectId: string
  projectTitle?: string | null
  decision: 'approved' | 'denied'
}): Promise<{ success: boolean; skippedPreference?: boolean }> {
  const reviewerDisplayName = getProjectAccessGrantorName(reviewerName)
  const isApproved = decision === 'approved'
  const result = await createNotification({
    userId: requesterUserId,
    type: 'new_track',
    title: isApproved
      ? `${reviewerDisplayName} approved your access request`
      : `${reviewerDisplayName} denied your access request`,
    message: projectTitle ? `Project: "${projectTitle}"` : 'Project access request update',
    data: {
      context: 'project_access_request_reviewed',
      decision,
      project_id: projectId,
      project_title: projectTitle || null,
      reviewer_user_id: reviewerUserId,
      reviewer_name: reviewerDisplayName,
      targetPath: buildProjectAccessInviteTargetPath(projectId),
      projectId,
      projectTitle: projectTitle || null,
      reviewerUserId,
      reviewerName: reviewerDisplayName,
    },
  })

  return { success: result.success, skippedPreference: result.skippedPreference }
}
