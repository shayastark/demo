import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Get tips for a creator
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const creatorId = searchParams.get('creatorId')
    const limit = parseInt(searchParams.get('limit') || '20')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    if (!creatorId) {
      return NextResponse.json({ error: 'Creator ID is required' }, { status: 400 })
    }

    let query = supabase
      .from('tips')
      .select('*')
      .eq('creator_id', creatorId)
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
    const { count: unreadCount } = await supabase
      .from('tips')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId)
      .eq('is_read', false)

    // Get total earnings
    const { data: totalData } = await supabase
      .from('tips')
      .select('amount')
      .eq('creator_id', creatorId)
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

// Mark tips as read
export async function PATCH(request: NextRequest) {
  try {
    const { tipIds, creatorId } = await request.json()

    if (!creatorId) {
      return NextResponse.json({ error: 'Creator ID is required' }, { status: 400 })
    }

    if (tipIds && tipIds.length > 0) {
      // Mark specific tips as read
      const { error } = await supabase
        .from('tips')
        .update({ is_read: true })
        .in('id', tipIds)
        .eq('creator_id', creatorId)

      if (error) throw error
    } else {
      // Mark all tips as read
      const { error } = await supabase
        .from('tips')
        .update({ is_read: true })
        .eq('creator_id', creatorId)
        .eq('is_read', false)

      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking tips as read:', error)
    return NextResponse.json({ error: 'Failed to update tips' }, { status: 500 })
  }
}

