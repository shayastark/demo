import { supabaseAdmin } from './supabaseAdmin'

export type NotificationType = 
  | 'tip_received'
  | 'project_saved'
  | 'new_follower'
  | 'project_shared'

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
