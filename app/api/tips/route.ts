import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'

// Get tips for the authenticated creator
export async function GET(request: NextRequest) {
  try {
    // Verify the user's identity
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user from the token (not from query params!)
    const user = await getUserByPrivyId(authResult.privyId)
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    let query = supabaseAdmin
      .from('tips')
      .select('*')
      .eq('creator_id', user.id) // Use authenticated user's ID
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data: tips, error } = await query

    if (error) {
      console.error('Error fetching tips:', error)
      return NextResponse.json({ error: 'Failed to fetch tips' }, { status: 500 })
    }

    // Get unread count
    const { count: unreadCount } = await supabaseAdmin
      .from('tips')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', user.id)
      .eq('is_read', false)

    // Get total earnings
    const { data: totalData } = await supabaseAdmin
      .from('tips')
      .select('amount')
      .eq('creator_id', user.id)
      .eq('status', 'completed')

    const totalEarnings = totalData?.reduce((sum, tip) => sum + tip.amount, 0) || 0

    return NextResponse.json({
      tips,
      unreadCount: unreadCount || 0,
      totalEarnings,
    })
  } catch (error) {
    console.error('Error in tips API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Mark tips as read for the authenticated creator
export async function PATCH(request: NextRequest) {
  try {
    // Verify the user's identity
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user from the token
    const user = await getUserByPrivyId(authResult.privyId)
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { tipIds } = await request.json()

    if (tipIds && tipIds.length > 0) {
      // Mark specific tips as read (only the user's own tips)
      const { error } = await supabaseAdmin
        .from('tips')
        .update({ is_read: true })
        .in('id', tipIds)
        .eq('creator_id', user.id)

      if (error) throw error
    } else {
      // Mark all tips as read
      const { error } = await supabaseAdmin
        .from('tips')
        .update({ is_read: true })
        .eq('creator_id', user.id)
        .eq('is_read', false)

      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking tips as read:', error)
    return NextResponse.json({ error: 'Failed to update tips' }, { status: 500 })
  }
}
