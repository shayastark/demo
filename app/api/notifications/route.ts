import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'

// Get notifications for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserByPrivyId(authResult.privyId)
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data: notifications, error } = await query

    if (error) {
      console.error('Error fetching notifications:', error)
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
    }

    // Get unread count
    const { count: unreadCount } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    return NextResponse.json({
      notifications,
      unreadCount: unreadCount || 0,
    })
  } catch (error) {
    console.error('Error in notifications API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Mark notifications as read
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserByPrivyId(authResult.privyId)
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { notificationIds } = await request.json()

    if (notificationIds && notificationIds.length > 0) {
      // Mark specific notifications as read
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', notificationIds)
        .eq('user_id', user.id)

      if (error) throw error
    } else {
      // Mark all notifications as read
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false)

      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking notifications as read:', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}

// Delete notifications
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserByPrivyId(authResult.privyId)
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { notificationIds, deleteAll } = await request.json()

    if (deleteAll) {
      // Delete all notifications for the user
      const { error } = await supabaseAdmin
        .from('notifications')
        .delete()
        .eq('user_id', user.id)

      if (error) throw error
    } else if (notificationIds && notificationIds.length > 0) {
      // Delete specific notifications
      const { error } = await supabaseAdmin
        .from('notifications')
        .delete()
        .in('id', notificationIds)
        .eq('user_id', user.id)

      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting notifications:', error)
    return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 })
  }
}
