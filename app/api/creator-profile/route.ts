import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import {
  buildCreatorDisplayName,
  getCreatorPublicPath,
  parseCreatorIdentifier,
  resolveViewerIsFollowing,
  selectPublicCreatorProjects,
  type PublicCreatorUserRow,
} from '@/lib/publicCreatorProfile'
import { parseLimit } from '@/lib/validation'

type FollowColumnName = 'following_id' | 'followed_id'
let cachedFollowColumn: FollowColumnName | null = null

async function resolveFollowColumn(): Promise<FollowColumnName> {
  if (cachedFollowColumn) return cachedFollowColumn

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const parsedIdentifier = parseCreatorIdentifier(searchParams.get('identifier'))
    if (!parsedIdentifier) {
      return NextResponse.json({ error: 'Valid creator identifier is required' }, { status: 400 })
    }

    const followColumn = await resolveFollowColumn()
    const projectLimit = parseLimit(searchParams.get('project_limit'), 24, 50)
    const viewer = await getOptionalViewer(request)

    let creatorQuery = supabaseAdmin
      .from('users')
      .select(
        'id, username, email, avatar_url, bio, contact_email, website, instagram, twitter, farcaster'
      )
      .limit(1)

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsedIdentifier)) {
      creatorQuery = creatorQuery.eq('id', parsedIdentifier)
    } else {
      creatorQuery = creatorQuery.ilike('username', parsedIdentifier)
    }

    const { data: creators, error: creatorError } = await creatorQuery
    if (creatorError) {
      return NextResponse.json({ error: 'Failed to load creator profile' }, { status: 500 })
    }

    const creator = (creators?.[0] || null) as PublicCreatorUserRow | null
    if (!creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
    }

    const [followersResult, followingResult, projectsResult] = await Promise.all([
      supabaseAdmin
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq(followColumn, creator.id),
      supabaseAdmin
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', creator.id),
      supabaseAdmin
        .from('projects')
        .select('id, title, share_token, cover_image_url, visibility, sharing_enabled, created_at')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false })
        .limit(projectLimit),
    ])

    if (projectsResult.error) {
      return NextResponse.json({ error: 'Failed to load creator projects' }, { status: 500 })
    }

    let hasFollowRow = false
    if (viewer?.id && viewer.id !== creator.id) {
      const { data: followRow } = await supabaseAdmin
        .from('user_follows')
        .select('id')
        .eq('follower_id', viewer.id)
        .eq(followColumn, creator.id)
        .maybeSingle()
      hasFollowRow = !!followRow
    }

    const canonicalIdentifier = creator.username?.trim() || creator.id

    return NextResponse.json({
      creator: {
        id: creator.id,
        username: creator.username,
        display_name: buildCreatorDisplayName(creator),
        avatar_url: creator.avatar_url || null,
        bio: creator.bio || null,
        contact_email: creator.contact_email || null,
        website: creator.website || null,
        instagram: creator.instagram || null,
        twitter: creator.twitter || null,
        farcaster: creator.farcaster || null,
        canonical_identifier: canonicalIdentifier,
        canonical_path: getCreatorPublicPath({ id: creator.id, username: creator.username }),
      },
      social: {
        followers_count: followersResult.count || 0,
        following_count: followingResult.count || 0,
        is_following: resolveViewerIsFollowing({
          viewerUserId: viewer?.id || null,
          creatorId: creator.id,
          hasFollowRow,
        }),
      },
      public_projects: selectPublicCreatorProjects(projectsResult.data || []),
      viewer: {
        is_authenticated: !!viewer?.id,
        is_owner_view: viewer?.id === creator.id,
      },
    })
  } catch (error) {
    console.error('Error loading public creator profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
