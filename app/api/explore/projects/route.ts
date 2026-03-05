import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildPaginatedItems } from '@/lib/pagination'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { buildHiddenTargetSets } from '@/lib/discoveryPreferences'
import {
  buildProjectPreferenceBoostById,
  toOnboardingPreferences,
} from '@/lib/onboardingPreferences'
import {
  buildExploreProjectItems,
  filterExploreRowsByHiddenTargets,
  parseExploreProjectsQuery,
  type ExploreCreatorRow,
  type ExploreProjectRow,
} from '@/lib/explore'

const SEARCH_SCAN_LIMIT = 1000
const RECENT_WINDOW_DAYS = 14

type TipSupportRow = {
  project_id: string | null
  tipper_user_id: string | null
}

async function getOptionalCurrentUser(request: NextRequest) {
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
    const parsed = parseExploreProjectsQuery({
      rawSort: searchParams.get('sort'),
      rawLimit: searchParams.get('limit'),
      rawOffset: searchParams.get('offset'),
      rawQ: searchParams.get('q'),
    })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const currentUser = await getOptionalCurrentUser(request)

    const projectQuery = supabaseAdmin
      .from('projects')
      .select(
        'id, title, description, cover_image_url, creator_id, visibility, sharing_enabled, share_token, created_at'
      )
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(0, SEARCH_SCAN_LIMIT - 1)

    const { data: publicProjectRows, error: projectError } = await projectQuery
    if (projectError) {
      console.error('Error loading explore projects:', projectError)
      return NextResponse.json({ error: 'Failed to load explore projects' }, { status: 500 })
    }

    const rawProjects = (publicProjectRows || []) as ExploreProjectRow[]
    if (rawProjects.length === 0) {
      return NextResponse.json(buildPaginatedItems({ rows: [], limit: parsed.limit, offset: parsed.offset }))
    }

    let hiddenProjectIds = new Set<string>()
    let hiddenCreatorIds = new Set<string>()
    let creatorReasonPenaltyById: Record<string, number> = {}
    let projectPreferenceBoostById: Record<string, number> = {}
    if (currentUser?.id) {
      const { data: onboardingRow } = await supabaseAdmin
        .from('user_onboarding_preferences')
        .select('preferred_genres, preferred_vibes, onboarding_completed_at')
        .eq('user_id', currentUser.id)
        .maybeSingle()
      const onboardingPreferences = toOnboardingPreferences(onboardingRow)
      projectPreferenceBoostById = buildProjectPreferenceBoostById({
        projects: rawProjects,
        preferences: onboardingPreferences,
      })

      const { data: hiddenRows } = await supabaseAdmin
        .from('user_discovery_preferences')
        .select('target_type, target_id, preference, reason_code')
        .eq('user_id', currentUser.id)
        .eq('preference', 'hide')
      const hiddenTargets = buildHiddenTargetSets(hiddenRows || [])
      hiddenProjectIds = hiddenTargets.hiddenProjectIds
      hiddenCreatorIds = hiddenTargets.hiddenCreatorIds

      const projectCreatorById = rawProjects.reduce<Record<string, string>>((acc, row) => {
        acc[row.id] = row.creator_id
        return acc
      }, {})
      for (const row of hiddenRows || []) {
        if (row.reason_code !== 'not_my_style') continue
        if (row.target_type === 'creator' && typeof row.target_id === 'string') {
          creatorReasonPenaltyById[row.target_id] = (creatorReasonPenaltyById[row.target_id] || 0) + 2
        }
        if (row.target_type === 'project' && typeof row.target_id === 'string') {
          const creatorId = projectCreatorById[row.target_id]
          if (creatorId) {
            creatorReasonPenaltyById[creatorId] = (creatorReasonPenaltyById[creatorId] || 0) + 1
          }
        }
      }
    }

    const creatorIds = Array.from(new Set(rawProjects.map((row) => row.creator_id)))
    const { data: creatorRows, error: creatorError } = await supabaseAdmin
      .from('users')
      .select('id, username, email')
      .in('id', creatorIds)

    if (creatorError) {
      console.error('Error loading explore creators:', creatorError)
      return NextResponse.json({ error: 'Failed to load explore creators' }, { status: 500 })
    }

    const creatorsById = (creatorRows || []).reduce<Record<string, ExploreCreatorRow>>((acc, row) => {
      acc[row.id] = row as ExploreCreatorRow
      return acc
    }, {})

    const qLower = parsed.q?.toLowerCase() || null
    const hiddenFilteredProjects = filterExploreRowsByHiddenTargets({
      rows: rawProjects,
      hiddenProjectIds,
      hiddenCreatorIds,
    })
    const qFilteredProjects = qLower
      ? hiddenFilteredProjects.filter((project) => {
          const title = project.title?.toLowerCase() || ''
          const creatorName = creatorsById[project.creator_id]?.username?.toLowerCase() || ''
          return title.includes(qLower) || creatorName.includes(qLower)
        })
      : hiddenFilteredProjects

    const projectIds = qFilteredProjects.map((project) => project.id)
    let supporterCountByProjectId: Record<string, number> = {}
    let engagementCountByProjectId: Record<string, number> = {}
    let recentUpdatesCountByProjectId: Record<string, number> = {}
    let latestUpdateAtByProjectId: Record<string, string | null> = {}
    if (projectIds.length > 0) {
      const recentIso = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

      const { data: tipRows } = await supabaseAdmin
        .from('tips')
        .select('project_id, tipper_user_id')
        .in('project_id', projectIds)
        .eq('status', 'completed')
        .not('tipper_user_id', 'is', null)

      const supporterSets: Record<string, Set<string>> = {}
      for (const row of (tipRows || []) as TipSupportRow[]) {
        if (!row.project_id || !row.tipper_user_id) continue
        if (!supporterSets[row.project_id]) supporterSets[row.project_id] = new Set<string>()
        supporterSets[row.project_id].add(row.tipper_user_id)
      }

      supporterCountByProjectId = Object.keys(supporterSets).reduce<Record<string, number>>((acc, projectId) => {
        acc[projectId] = supporterSets[projectId].size
        return acc
      }, {})

      const { data: updateRows } = await supabaseAdmin
        .from('project_updates')
        .select('id, project_id, created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .limit(3000)

      const updateIds: string[] = []
      for (const row of updateRows || []) {
        const projectId = typeof row.project_id === 'string' ? row.project_id : null
        const updateId = typeof row.id === 'string' ? row.id : null
        const createdAt = typeof row.created_at === 'string' ? row.created_at : null
        if (!projectId || !updateId || !createdAt) continue
        updateIds.push(updateId)

        const latestForProject = latestUpdateAtByProjectId[projectId]
        if (
          !latestForProject ||
          new Date(createdAt).getTime() > new Date(latestForProject).getTime()
        ) {
          latestUpdateAtByProjectId[projectId] = createdAt
        }
        if (new Date(createdAt).getTime() >= new Date(recentIso).getTime()) {
          recentUpdatesCountByProjectId[projectId] = (recentUpdatesCountByProjectId[projectId] || 0) + 1
        }
      }

      const { data: projectCommentRows } = await supabaseAdmin
        .from('comments')
        .select('project_id')
        .in('project_id', projectIds)
        .gte('created_at', recentIso)
        .limit(3000)

      for (const row of projectCommentRows || []) {
        const projectId = typeof row.project_id === 'string' ? row.project_id : null
        if (!projectId) continue
        engagementCountByProjectId[projectId] = (engagementCountByProjectId[projectId] || 0) + 1
      }

      if (updateIds.length > 0) {
        const [updateCommentResult, updateReactionResult] = await Promise.all([
          supabaseAdmin
            .from('project_update_comments')
            .select('update_id')
            .in('update_id', updateIds)
            .gte('created_at', recentIso)
            .limit(3000),
          supabaseAdmin
            .from('project_update_reactions')
            .select('update_id')
            .in('update_id', updateIds)
            .gte('created_at', recentIso)
            .limit(3000),
        ])

        const updateToProject = (updateRows || []).reduce<Record<string, string>>((acc, row) => {
          if (typeof row.id === 'string' && typeof row.project_id === 'string') {
            acc[row.id] = row.project_id
          }
          return acc
        }, {})

        for (const row of updateCommentResult.data || []) {
          const updateId = typeof row.update_id === 'string' ? row.update_id : null
          const projectId = updateId ? updateToProject[updateId] : null
          if (!projectId) continue
          engagementCountByProjectId[projectId] = (engagementCountByProjectId[projectId] || 0) + 1
        }

        for (const row of updateReactionResult.data || []) {
          const updateId = typeof row.update_id === 'string' ? row.update_id : null
          const projectId = updateId ? updateToProject[updateId] : null
          if (!projectId) continue
          engagementCountByProjectId[projectId] = (engagementCountByProjectId[projectId] || 0) + 1
        }
      }
    }

    const items = buildExploreProjectItems({
      projects: qFilteredProjects,
      creatorsById,
      supporterCountByProjectId,
      engagementCountByProjectId,
      recentUpdatesCountByProjectId,
      latestUpdateAtByProjectId,
      creatorReasonPenaltyById,
      projectPreferenceBoostById,
      sort: parsed.sort,
    })

    const pageRows = items.slice(parsed.offset, parsed.offset + parsed.limit + 1)
    return NextResponse.json(buildPaginatedItems({ rows: pageRows, limit: parsed.limit, offset: parsed.offset }))
  } catch (error) {
    console.error('Error in explore projects API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
