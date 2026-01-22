import { supabaseAdmin } from './supabaseAdmin'

export type NotificationType = 
  | 'tip_received'
  | 'project_saved'
  | 'new_follower'
  | 'project_shared'
  | 'new_track'

interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message?: string
  data?: Record<string, any>
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
}: CreateNotificationParams): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  try {
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

    // Create notifications for each user
    const notifications = savedByUsers.map((row) => ({
      user_id: row.user_id,
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

    return { success: true, notifiedCount: savedByUsers.length }
  } catch (error) {
    console.error('Error in notifyNewTrackAdded:', error)
    return { success: false, notifiedCount: 0, error: 'Failed to create notifications' }
  }
}
