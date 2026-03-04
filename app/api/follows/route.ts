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

async function getOrCreateUserByPrivyId(privyId: string) {
  const existingUser = await getUserByPrivyId(privyId)
  if (existingUser) return existingUser

  const { data: createdUser, error: createError } = await supabaseAdmin
    .from('users')
    .insert({ privy_id: privyId })
    .select('*')
    .single()

  if (!createError && createdUser) return createdUser

  const { data: retryUser } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('privy_id', privyId)
    .single()

  return retryUser || null
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
      .eq('following_id', creatorId)

    const { count: followingCount } = await supabaseAdmin
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', creatorId)

    let isFollowing = false
    if (currentUser) {
      const { data: existingFollow } = await supabaseAdmin
        .from('user_follows')
        .select('id')
        .eq('follower_id', currentUser.id)
        .eq('following_id', creatorId)
        .maybeSingle()

      isFollowing = !!existingFollow
    }

    return NextResponse.json({
      creatorId,
      followerCount: followerCount || 0,
      followingCount: followingCount || 0,
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

    const currentUser = await getOrCreateUserByPrivyId(authResult.privyId)
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const followingId = (body.following_id || body.creator_id) as string

    if (!followingId || !isValidUUID(followingId)) {
      return NextResponse.json({ error: 'Valid following_id is required' }, { status: 400 })
    }

    if (followingId === currentUser.id) {
      return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 })
    }

    const { data: creator } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', followingId)
      .single()

    if (!creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
    }

    const { data: existingFollow } = await supabaseAdmin
      .from('user_follows')
      .select('id')
      .eq('follower_id', currentUser.id)
      .eq('following_id', followingId)
      .maybeSingle()

    if (existingFollow) {
      return NextResponse.json({ following: true })
    }

    const { error } = await supabaseAdmin
      .from('user_follows')
      .insert({
        follower_id: currentUser.id,
        following_id: followingId,
      })

    if (error) throw error

    createFollowerNotification({
      creatorId: followingId,
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

    const currentUser = await getOrCreateUserByPrivyId(authResult.privyId)
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const contentType = request.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 400 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsedBody = body as Record<string, unknown>
    const followingId = parsedBody.following_id

    if (typeof followingId !== 'string' || !isValidUUID(followingId)) {
      return NextResponse.json({ error: 'Valid following_id is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('user_follows')
      .delete()
      .eq('follower_id', currentUser.id)
      .eq('following_id', followingId)

    if (error) throw error

    return NextResponse.json({ following: false })
  } catch (error) {
    console.error('Error deleting follow:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
