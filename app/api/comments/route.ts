import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID, sanitizeText } from '@/lib/validation'
import { summarizeCommentReactions, type ReactionType, isReactionType } from '@/lib/commentReactions'
import { buildSupporterAuthorSet, isSupporterForProject } from '@/lib/supporterBadge'
import { notifyCreatorUpdateEngagement } from '@/lib/notifications'
import {
  canUserPinComment,
  sortCommentsPinnedFirst,
  withPinnedFlag,
} from '@/lib/commentPinning'
import { canUserAccessProjectRow, hasProjectRole } from '@/lib/projectAccessServer'

type CommentRecord = {
  id: string
  user_id: string
  project_id: string | null
  track_id: string | null
  is_pinned: boolean | null
  content: string
  timestamp_seconds: number | null
  created_at: string
  updated_at: string
}

let cachedHasTipSupportColumns: boolean | null = null

async function hasTipSupportColumns(): Promise<boolean> {
  if (cachedHasTipSupportColumns !== null) return cachedHasTipSupportColumns

  const { data: columns, error } = await supabaseAdmin
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'tips')
    .in('column_name', ['project_id', 'tipper_user_id'])

  if (error) {
    cachedHasTipSupportColumns = false
    return cachedHasTipSupportColumns
  }

  const names = new Set((columns || []).map((column) => column.column_name))
  cachedHasTipSupportColumns = names.has('project_id') && names.has('tipper_user_id')
  return cachedHasTipSupportColumns
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

async function getTrackProject(trackId: string): Promise<{ id: string; creator_id: string; sharing_enabled: boolean | null; visibility: string | null } | null> {
  const { data: track } = await supabaseAdmin
    .from('tracks')
    .select(`
      id,
      project:projects(
        id,
        creator_id,
        sharing_enabled,
        visibility
      )
    `)
    .eq('id', trackId)
    .single()

  const project = track?.project as { id: string; creator_id: string; sharing_enabled: boolean | null; visibility: string | null } | undefined
  return project || null
}

async function getCurrentUserFromRequest(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const trackId = searchParams.get('track_id')

    if (!projectId) {
      if (trackId) {
        return NextResponse.json({ error: 'Track comments are no longer supported' }, { status: 400 })
      }
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const currentUser = await getCurrentUserFromRequest(request)

    if (!isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Invalid project_id' }, { status: 400 })
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id, sharing_enabled, visibility')
      .eq('id', projectId)
      .single()

    const canAccessProjectComments = !!project && await canUserAccessProjectRow({
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
      userId: currentUser?.id,
      isDirectAccess: true,
    })

    if (!canAccessProjectComments) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const targetCreatorId = project.creator_id

    const { data, error } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error
    const comments: CommentRecord[] = sortCommentsPinnedFirst((data as CommentRecord[]) || [])
    const commentIds = comments.map((comment) => comment.id)

    let reactionSummaryByComment: Record<
      string,
      {
        helpful: number
        fire: number
        agree: number
        like: number
        viewerReactions: Partial<Record<ReactionType, boolean>>
        viewerReaction: ReactionType | null
      }
    > = {}
    if (commentIds.length > 0) {
      const { data: reactions } = await supabaseAdmin
        .from('comment_reactions')
        .select('comment_id, user_id, reaction_type')
        .in('comment_id', commentIds)

      const safeReactions = (reactions || []).filter((row) => isReactionType(row.reaction_type))
      reactionSummaryByComment = summarizeCommentReactions(
        safeReactions as Array<{ comment_id: string; user_id: string; reaction_type: ReactionType }>,
        currentUser?.id
      )
    }

    const userIds = Array.from(new Set(comments.map((comment) => comment.user_id)))
    let supporterAuthorIds = new Set<string>()
    if (projectId && userIds.length > 0 && (await hasTipSupportColumns())) {
      try {
        const { data: supporterTips } = await supabaseAdmin
          .from('tips')
          .select('tipper_user_id')
          .eq('project_id', projectId)
          .eq('status', 'completed')
          .in('tipper_user_id', userIds)

        supporterAuthorIds = buildSupporterAuthorSet((supporterTips || []) as Array<{ tipper_user_id: string | null }>)
      } catch (supporterError) {
        console.error('Supporter badge lookup failed, continuing without badges:', supporterError)
        supporterAuthorIds = new Set<string>()
      }
    }

    let usersById: Record<string, { username: string | null; email: string | null }> = {}

    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, username, email')
        .in('id', userIds)

      usersById = (users || []).reduce<Record<string, { username: string | null; email: string | null }>>((acc, user) => {
        acc[user.id] = { username: user.username, email: user.email }
        return acc
      }, {})
    }

    const enhancedComments = comments.map((comment) => {
      const author = usersById[comment.user_id]
      const isOwner = !!currentUser && currentUser.id === comment.user_id
      const isCreator = !!currentUser && !!targetCreatorId && currentUser.id === targetCreatorId

      return {
        ...comment,
        ...withPinnedFlag(comment),
        author_name: author?.username || author?.email || 'Unknown',
        can_edit: isOwner,
        can_delete: isOwner || isCreator,
        can_pin: isCreator,
        is_supporter_for_project: isSupporterForProject(comment.user_id, supporterAuthorIds),
        reactions: {
          helpful: reactionSummaryByComment[comment.id]?.helpful || 0,
          fire: reactionSummaryByComment[comment.id]?.fire || 0,
          agree: reactionSummaryByComment[comment.id]?.agree || 0,
          like: reactionSummaryByComment[comment.id]?.like || 0,
        },
        viewer_reactions: reactionSummaryByComment[comment.id]?.viewerReactions || {},
        viewer_reaction: reactionSummaryByComment[comment.id]?.viewerReaction || null,
      }
    })

    return NextResponse.json({ comments: enhancedComments })
  } catch (error) {
    console.error('Error getting comments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getOrCreateUserByPrivyId(authResult.privyId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { project_id, track_id } = body
    const content = sanitizeText(body.content, 2000)

    if (track_id) {
      return NextResponse.json({ error: 'Track comments are no longer supported' }, { status: 400 })
    }

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    if (!content) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
    }

    if (!isValidUUID(project_id)) {
      return NextResponse.json({ error: 'Invalid project_id' }, { status: 400 })
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id, sharing_enabled, visibility')
      .eq('id', project_id)
      .single()

    const canCreateComment = !!project && await canUserAccessProjectRow({
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
      userId: user.id,
      isDirectAccess: true,
    })

    if (!canCreateComment) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (project.visibility === 'private' && user.id !== project.creator_id) {
      const canCommentAsCollaborator = await hasProjectRole({
        projectId: project.id,
        projectCreatorId: project.creator_id,
        userId: user.id,
        minRole: 'commenter',
      })
      if (!canCommentAsCollaborator) {
        return NextResponse.json({ error: 'Insufficient project role' }, { status: 403 })
      }
    }

    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      project_id,
      track_id: null,
      timestamp_seconds: null,
      content,
    }

    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) throw error

    let updateEngagementNotification: Record<string, unknown> | null = null
    try {
      const { data: latestUpdate } = await supabaseAdmin
        .from('project_updates')
        .select('id')
        .eq('project_id', project_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestUpdate?.id && typeof project?.creator_id === 'string') {
        updateEngagementNotification = await notifyCreatorUpdateEngagement({
          recipientUserId: project.creator_id,
          actorUserId: user.id,
          actorName: user.username || user.email || null,
          projectId: project_id,
          updateId: latestUpdate.id,
        })
      }
    } catch (notificationError) {
      console.error('Update engagement notification failed, continuing:', notificationError)
    }

    return NextResponse.json({ comment, update_engagement_notification: updateEngagementNotification }, { status: 201 })
  } catch (error) {
    console.error('Error creating comment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getOrCreateUserByPrivyId(authResult.privyId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const id = body.id as string
    const contentRaw = typeof body.content === 'string' ? body.content : null
    const content = contentRaw ? sanitizeText(contentRaw, 2000) : ''
    const hasPinUpdate = typeof body.is_pinned === 'boolean'
    const nextPinnedState = body.is_pinned as boolean

    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: 'Valid comment id is required' }, { status: 400 })
    }

    const { data: existing } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    if (hasPinUpdate) {
      if (!existing.project_id) {
        return NextResponse.json({ error: 'Only project comments can be pinned' }, { status: 400 })
      }

      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('id, creator_id')
        .eq('id', existing.project_id)
        .single()

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      if (!canUserPinComment(user.id, project.creator_id)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      if (nextPinnedState) {
        const { error: clearError } = await supabaseAdmin
          .from('comments')
          .update({ is_pinned: false })
          .eq('project_id', existing.project_id)
          .eq('is_pinned', true)
          .neq('id', id)

        if (clearError) throw clearError
      }

      const { data: comment, error } = await supabaseAdmin
        .from('comments')
        .update({ is_pinned: nextPinnedState })
        .eq('id', id)
        .eq('project_id', existing.project_id)
        .select('*')
        .single()

      if (error) throw error

      return NextResponse.json({ comment })
    }

    if (!content) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .update({ content })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ comment })
  } catch (error) {
    console.error('Error updating comment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getOrCreateUserByPrivyId(authResult.privyId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: 'Valid comment id is required' }, { status: 400 })
    }

    const { data: existing } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    let creatorId: string | null = null
    if (existing.project_id) {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('creator_id')
        .eq('id', existing.project_id)
        .single()
      creatorId = project?.creator_id || null
    } else if (existing.track_id) {
      const trackProject = await getTrackProject(existing.track_id)
      creatorId = trackProject?.creator_id || null
    }

    const canDelete = existing.user_id === user.id || creatorId === user.id
    if (!canDelete) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('comments')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting comment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
