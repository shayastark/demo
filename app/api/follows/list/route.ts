import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import {
  getSocialGraphDisplayName,
  validateSocialGraphListRequest,
  type SocialGraphListItem,
} from '@/lib/socialGraph'

type FollowColumnName = 'following_id' | 'followed_id'
let cachedFollowColumn: FollowColumnName | null = null

async function resolveFollowColumn(): Promise<FollowColumnName> {
  if (cachedFollowColumn) return cachedFollowColumn

  // Probe real queryability first; information_schema access can vary by env.
  const { error: followingProbeError } = await supabaseAdmin
    .from('user_follows')
    .select('following_id')
    .limit(1)

  if (!followingProbeError) {
    cachedFollowColumn = 'following_id'
    return cachedFollowColumn
  }

  const { error: followedProbeError } = await supabaseAdmin
    .from('user_follows')
    .select('followed_id')
    .limit(1)

  if (!followedProbeError) {
    cachedFollowColumn = 'followed_id'
    return cachedFollowColumn
  }

  // Default to canonical column to keep behavior predictable on unexpected probe errors.
  cachedFollowColumn = 'following_id'
  return cachedFollowColumn
}

async function getOptionalViewer(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return null
    const authResult = await verifyPrivyToken(authHeader)
    if (!authResult.success || !authResult.privyId) return null
    return await getUserByPrivyId(authResult.privyId)
  } catch {
    return null
  }
}

function readFollowTargetId(row: unknown, column: FollowColumnName): string | null {
  if (!row || typeof row !== 'object') return null
  const value = (row as Record<string, unknown>)[column]
  return typeof value === 'string' ? value : null
}

export async function GET(request: NextRequest) {
  try {
    const followColumn = await resolveFollowColumn()
    const { searchParams } = new URL(request.url)

    const validation = validateSocialGraphListRequest({
      userId: searchParams.get('user_id'),
      type: searchParams.get('type'),
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
    })

    if (!validation.valid || !validation.parsed) {
      return NextResponse.json({ error: validation.error || 'Invalid request' }, { status: 400 })
    }

    const { userId, type, limit, offset } = validation.parsed
    const viewer = await getOptionalViewer(request)

    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .single()

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let relationshipRows: Array<{ listed_user_id: string; followed_at: string }> = []

    if (type === 'followers') {
      const { data, error } = await supabaseAdmin
        .from('user_follows')
        .select(`follower_id, created_at`)
        .eq(followColumn, userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('Error fetching followers list:', error)
        return NextResponse.json({ error: 'Failed to load followers' }, { status: 500 })
      }

      relationshipRows = (data || [])
        .filter((row) => typeof row.follower_id === 'string' && typeof row.created_at === 'string')
        .map((row) => ({
          listed_user_id: row.follower_id,
          followed_at: row.created_at,
        }))
    } else {
      const { data, error } = await supabaseAdmin
        .from('user_follows')
        .select(`${followColumn}, created_at`)
        .eq('follower_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('Error fetching following list:', error)
        return NextResponse.json({ error: 'Failed to load following' }, { status: 500 })
      }

      relationshipRows = (data || [])
        .map((row) => {
          const listedId = readFollowTargetId(row, followColumn)
          if (typeof listedId !== 'string' || typeof row.created_at !== 'string') return null
          return {
            listed_user_id: listedId,
            followed_at: row.created_at,
          }
        })
        .filter((row): row is { listed_user_id: string; followed_at: string } => !!row)
    }

    const listedUserIds = relationshipRows.map((row) => row.listed_user_id)
    if (listedUserIds.length === 0) {
      return NextResponse.json({
        user_id: userId,
        type,
        limit,
        offset,
        items: [],
        has_more: false,
      })
    }

    const { data: listedUsers, error: listedUsersError } = await supabaseAdmin
      .from('users')
      .select('id, username, email, avatar_url')
      .in('id', listedUserIds)

    if (listedUsersError) {
      console.error('Error fetching listed users:', listedUsersError)
      return NextResponse.json({ error: 'Failed to load follows list' }, { status: 500 })
    }

    const usersById = (listedUsers || []).reduce<
      Record<string, { username: string | null; email: string | null; avatar_url: string | null }>
    >((acc, user) => {
      acc[user.id] = {
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
      }
      return acc
    }, {})

    const viewerFollowingSet = new Set<string>()
    if (viewer?.id) {
      const { data: viewerFollowRows } = await supabaseAdmin
        .from('user_follows')
        .select(followColumn)
        .eq('follower_id', viewer.id)
        .in(followColumn, listedUserIds)

      for (const row of viewerFollowRows || []) {
        const followingId = readFollowTargetId(row, followColumn)
        if (typeof followingId === 'string') {
          viewerFollowingSet.add(followingId)
        }
      }
    }

    const items: SocialGraphListItem[] = relationshipRows.map((row) => {
      const listedUser = usersById[row.listed_user_id]
      return {
        user_id: row.listed_user_id,
        username: getSocialGraphDisplayName(listedUser?.username, listedUser?.email),
        avatar_url: listedUser?.avatar_url || null,
        is_following: viewer?.id ? viewerFollowingSet.has(row.listed_user_id) : false,
        followed_at: row.followed_at,
      }
    })

    return NextResponse.json({
      user_id: userId,
      type,
      limit,
      offset,
      items,
      has_more: items.length === limit,
    })
  } catch (error) {
    console.error('Error in follows list API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

