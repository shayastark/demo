import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import {
  buildCreatorRecommendations,
  parseCreatorRecommendationsLimit,
  type CreatorRecommendationActivityStats,
  type CreatorRecommendationUserRow,
} from '@/lib/creatorRecommendations'
import { buildHiddenTargetSets } from '@/lib/discoveryPreferences'

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

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getUserByPrivyId(authResult.privyId)
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseCreatorRecommendationsLimit(searchParams.get('limit'))
    if (limit === null) {
      return NextResponse.json({ error: 'limit must be an integer between 1 and 20' }, { status: 400 })
    }

    const followColumn = await resolveFollowColumn()
    const now = Date.now()
    const oneWeekAgoIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
    const twoWeeksAgoIso = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString()

    const { data: alreadyFollowingRows } = await supabaseAdmin
      .from('user_follows')
      .select(followColumn)
      .eq('follower_id', currentUser.id)

    const alreadyFollowingIds = new Set<string>(
      (alreadyFollowingRows || [])
        .map((row) => (row as Record<string, unknown>)[followColumn])
        .filter((value): value is string => typeof value === 'string')
    )

    const { data: publicProjects, error: publicProjectsError } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id, created_at')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(1200)

    if (publicProjectsError) {
      console.error('Error loading public projects for recommendations:', publicProjectsError)
      return NextResponse.json({ error: 'Failed to load recommendations' }, { status: 500 })
    }

    const publicProjectRows =
      (publicProjects || []) as Array<{ id: string; creator_id: string; created_at: string }>

    const { data: hiddenRows } = await supabaseAdmin
      .from('user_discovery_preferences')
      .select('target_type, target_id, preference')
      .eq('user_id', currentUser.id)
      .eq('preference', 'hide')
    const hiddenTargets = buildHiddenTargetSets(hiddenRows || [])
    const visibleProjectRows = publicProjectRows.filter(
      (row) => !hiddenTargets.hiddenProjectIds.has(row.id) && !hiddenTargets.hiddenCreatorIds.has(row.creator_id)
    )
    const publicProjectIds = visibleProjectRows.map((row) => row.id)

    const { data: updateRows } = publicProjectIds.length
      ? await supabaseAdmin
          .from('project_updates')
          .select('project_id, created_at')
          .in('project_id', publicProjectIds)
          .gte('created_at', twoWeeksAgoIso)
          .order('created_at', { ascending: false })
          .limit(1500)
      : { data: [] as Array<{ project_id: string; created_at: string }> }

    const creatorActivity: Record<string, CreatorRecommendationActivityStats> = {}
    const projectCreatorById = visibleProjectRows.reduce<Record<string, string>>((acc, row) => {
      acc[row.id] = row.creator_id
      return acc
    }, {})

    for (const project of visibleProjectRows) {
      const existing = creatorActivity[project.creator_id]
      const recentProject = new Date(project.created_at).getTime() >= new Date(oneWeekAgoIso).getTime() ? 1 : 0
      if (!existing) {
        creatorActivity[project.creator_id] = {
          creator_id: project.creator_id,
          recent_public_updates_count: 0,
          recent_public_projects_count: recentProject,
          latest_public_activity_at: project.created_at,
          follower_count: 0,
        }
      } else {
        existing.recent_public_projects_count += recentProject
        if (
          !existing.latest_public_activity_at ||
          new Date(project.created_at).getTime() > new Date(existing.latest_public_activity_at).getTime()
        ) {
          existing.latest_public_activity_at = project.created_at
        }
      }
    }

    for (const update of (updateRows || []) as Array<{ project_id: string; created_at: string }>) {
      const creatorId = projectCreatorById[update.project_id]
      if (!creatorId) continue
      const existing = creatorActivity[creatorId]
      if (!existing) continue
      if (new Date(update.created_at).getTime() >= new Date(oneWeekAgoIso).getTime()) {
        existing.recent_public_updates_count += 1
      }
      if (
        !existing.latest_public_activity_at ||
        new Date(update.created_at).getTime() > new Date(existing.latest_public_activity_at).getTime()
      ) {
        existing.latest_public_activity_at = update.created_at
      }
    }

    const candidateIds = Object.keys(creatorActivity)
    if (candidateIds.length === 0) {
      return NextResponse.json({ items: [] })
    }

    const { data: followerRows } = await supabaseAdmin
      .from('user_follows')
      .select(followColumn)
      .in(followColumn, candidateIds)

    for (const row of followerRows || []) {
      const creatorId = (row as Record<string, unknown>)[followColumn]
      if (typeof creatorId !== 'string') continue
      if (!creatorActivity[creatorId]) continue
      creatorActivity[creatorId].follower_count += 1
    }

    const { data: userRows } = await supabaseAdmin
      .from('users')
      .select('id, username, email, avatar_url')
      .in('id', candidateIds)

    const usersById = (userRows || []).reduce<Record<string, CreatorRecommendationUserRow>>((acc, user) => {
      acc[user.id] = user as CreatorRecommendationUserRow
      return acc
    }, {})

    const items = buildCreatorRecommendations({
      usersById,
      activityByCreatorId: creatorActivity,
      viewerUserId: currentUser.id,
      alreadyFollowingIds,
      hiddenCreatorIds: hiddenTargets.hiddenCreatorIds,
      limit,
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Error in creator recommendations API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
