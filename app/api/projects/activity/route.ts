import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import { canViewProject } from '@/lib/projectAccessPolicyServer'
import { getProjectAccessGrant } from '@/lib/projectAccessServer'
import {
  buildProjectActivityItems,
  canAccessProjectActivity,
  paginateProjectActivity,
  parseProjectActivityQuery,
} from '@/lib/projectActivity'

const SOURCE_SCAN_MULTIPLIER = 4
const SOURCE_SCAN_MAX = 250

async function getCurrentUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

async function safeSelect<T>(
  query: PromiseLike<{ data: T[] | null; error: unknown }>,
  sourceName: string
): Promise<T[]> {
  try {
    const result = await query
    if (result.error) {
      console.error(`Project activity source failed (${sourceName}):`, result.error)
      return []
    }
    return result.data || []
  } catch (error) {
    console.error(`Project activity source crashed (${sourceName}):`, error)
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    const parsedPagination = parseProjectActivityQuery({
      rawLimit: searchParams.get('limit'),
      rawOffset: searchParams.get('offset'),
    })
    if (!parsedPagination.ok) {
      return NextResponse.json({ error: parsedPagination.error }, { status: 400 })
    }
    const { limit, offset } = parsedPagination

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id, visibility, sharing_enabled')
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const canView = await canViewProject({
      userId: currentUser.id,
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
      isDirectAccess: true,
    })
    const isCreator = currentUser.id === project.creator_id
    const grant = isCreator ? null : await getProjectAccessGrant(project.id, currentUser.id)
    const canReadActivity = canAccessProjectActivity({
      isCreator,
      hasProjectAccessGrant: !!grant,
      canViewProject: canView,
    })

    if (!canReadActivity) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const sourceScanLimit = Math.min(limit * SOURCE_SCAN_MULTIPLIER + offset, SOURCE_SCAN_MAX)

    const comments = await safeSelect(
      supabaseAdmin
        .from('comments')
        .select('id, user_id, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(sourceScanLimit),
      'comments'
    )
    const commentIds = comments.map((row) => row.id).filter((id): id is string => typeof id === 'string')

    const updates = await safeSelect(
      supabaseAdmin
        .from('project_updates')
        .select('id, user_id, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(sourceScanLimit),
      'project_updates'
    )
    const updateIds = updates.map((row) => row.id).filter((id): id is string => typeof id === 'string')

    const [commentReactions, updateReactions, updateComments, attachments, accessGrants] = await Promise.all([
      commentIds.length
        ? safeSelect(
            supabaseAdmin
              .from('comment_reactions')
              .select('id, comment_id, user_id, reaction_type, created_at')
              .in('comment_id', commentIds)
              .order('created_at', { ascending: false })
              .limit(sourceScanLimit),
            'comment_reactions'
          )
        : Promise.resolve([]),
      updateIds.length
        ? safeSelect(
            supabaseAdmin
              .from('project_update_reactions')
              .select('id, update_id, user_id, reaction_type, created_at')
              .in('update_id', updateIds)
              .order('created_at', { ascending: false })
              .limit(sourceScanLimit),
            'project_update_reactions'
          )
        : Promise.resolve([]),
      updateIds.length
        ? safeSelect(
            supabaseAdmin
              .from('project_update_comments')
              .select('id, update_id, user_id, created_at')
              .in('update_id', updateIds)
              .order('created_at', { ascending: false })
              .limit(sourceScanLimit),
            'project_update_comments'
          )
        : Promise.resolve([]),
      safeSelect(
        supabaseAdmin
          .from('project_attachments')
          .select('id, user_id, type, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(sourceScanLimit),
        'project_attachments'
      ),
      safeSelect(
        supabaseAdmin
          .from('project_access_grants')
          .select('id, user_id, granted_by_user_id, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(sourceScanLimit),
        'project_access_grants'
      ),
    ])

    const actorUserIds = Array.from(
      new Set(
        [
          ...comments.map((row) => row.user_id),
          ...commentReactions.map((row) => row.user_id),
          ...updates.map((row) => row.user_id),
          ...updateReactions.map((row) => row.user_id),
          ...updateComments.map((row) => row.user_id),
          ...attachments.map((row) => row.user_id),
          ...accessGrants.map((row) => row.granted_by_user_id),
        ].filter((id): id is string => typeof id === 'string')
      )
    )

    const users = actorUserIds.length
      ? await safeSelect(
          supabaseAdmin
            .from('users')
            .select('id, username, email')
            .in('id', actorUserIds),
          'users'
        )
      : []

    const actorsById = users.reduce<Record<string, { username: string | null; email: string | null }>>(
      (acc, row) => {
        acc[row.id] = { username: row.username, email: row.email }
        return acc
      },
      {}
    )

    const mergedItems = buildProjectActivityItems({
      comments,
      commentReactions,
      updates,
      updateReactions,
      updateComments,
      attachments,
      accessGrants,
      actorsById,
    })

    const paged = paginateProjectActivity({
      items: mergedItems,
      limit,
      offset,
    })

    return NextResponse.json(paged)
  } catch (error) {
    console.error('Error in project activity GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
