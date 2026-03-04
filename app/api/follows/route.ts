import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import { createFollowerNotification } from '@/lib/notifications'

async function getCurrentUserFromRequest(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const creatorId = searchParams.get('creator_id')

    if (!creatorId || !isValidUUID(creatorId)) {
      return NextResponse.json({ error: 'Valid creator_id is required' }, { status: 400 })
    }

    const { data: creatorExists } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', creatorId)
      .single()

    if (!creatorExists) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
    }

    const currentUser = await getCurrentUserFromRequest(request)

    const { count: followerCount } = await supabaseAdmin
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('followed_id', creatorId)

    let isFollowing = false
    if (currentUser) {
      const { data: existingFollow } = await supabaseAdmin
        .from('user_follows')
        .select('id')
        .eq('follower_id', currentUser.id)
        .eq('followed_id', creatorId)
        .maybeSingle()

      isFollowing = !!existingFollow
    }

    return NextResponse.json({
      creatorId,
      followerCount: followerCount || 0,
      isFollowing,
    })
  } catch (error) {
    console.error('Error getting follow status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getUserByPrivyId(authResult.privyId)
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const creatorId = body.creator_id as string

    if (!creatorId || !isValidUUID(creatorId)) {
      return NextResponse.json({ error: 'Valid creator_id is required' }, { status: 400 })
    }

    if (creatorId === currentUser.id) {
      return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 })
    }

    const { data: creator } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', creatorId)
      .single()

    if (!creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
    }

    const { data: existingFollow } = await supabaseAdmin
      .from('user_follows')
      .select('id')
      .eq('follower_id', currentUser.id)
      .eq('followed_id', creatorId)
      .maybeSingle()

    if (existingFollow) {
      return NextResponse.json({ following: true })
    }

    const { error } = await supabaseAdmin
      .from('user_follows')
      .insert({
        follower_id: currentUser.id,
        followed_id: creatorId,
      })

    if (error) throw error

    createFollowerNotification({
      creatorId,
      followerName: currentUser.username || currentUser.email || null,
      followerId: currentUser.id,
    }).catch((notificationError) => {
      console.error('Failed to create new follower notification:', notificationError)
    })

    return NextResponse.json({ following: true }, { status: 201 })
  } catch (error) {
    console.error('Error creating follow:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getUserByPrivyId(authResult.privyId)
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const creatorId = searchParams.get('creator_id')

    if (!creatorId || !isValidUUID(creatorId)) {
      return NextResponse.json({ error: 'Valid creator_id is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('user_follows')
      .delete()
      .eq('follower_id', currentUser.id)
      .eq('followed_id', creatorId)

    if (error) throw error

    return NextResponse.json({ following: false })
  } catch (error) {
    console.error('Error deleting follow:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
