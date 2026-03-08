import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import {
  isReactionType,
  summarizeCommentReactions,
  getReactionToggleAction,
  type ReactionType,
} from '@/lib/commentReactions'
import { canReactProject, canViewProject } from '@/lib/projectAccessPolicyServer'

let cachedHasCommentReactionsTable: boolean | null = null

async function getAuthenticatedUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

async function hasCommentReactionsTable(): Promise<boolean> {
  if (cachedHasCommentReactionsTable === true) return true

  try {
    const { error } = await supabaseAdmin.from('comment_reactions').select('id').limit(1)
    cachedHasCommentReactionsTable = !error
    if (error) {
      console.error('Comment reactions table unavailable, disabling reaction support:', error)
    }
  } catch (error) {
    console.error('Comment reactions table probe crashed, disabling reaction support:', error)
    cachedHasCommentReactionsTable = false
  }

  return cachedHasCommentReactionsTable
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const commentIdsParam = searchParams.get('comment_ids')
    if (!commentIdsParam) {
      return NextResponse.json({ error: 'comment_ids is required' }, { status: 400 })
    }

    const commentIds = commentIdsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (commentIds.length === 0 || !commentIds.every((id) => isValidUUID(id))) {
      return NextResponse.json({ error: 'comment_ids must be a comma-separated list of UUIDs' }, { status: 400 })
    }

    const user = await getAuthenticatedUser(request)

    if (!(await hasCommentReactionsTable())) {
      return NextResponse.json({ reactionsByComment: {}, supported: false })
    }

    const { data: reactions, error } = await supabaseAdmin
      .from('comment_reactions')
      .select('comment_id, user_id, reaction_type')
      .in('comment_id', commentIds)

    if (error) throw error

    const safeRows = (reactions || []).filter((row) => isReactionType(row.reaction_type))
    const summary = summarizeCommentReactions(safeRows, user?.id)

    return NextResponse.json({ reactionsByComment: summary })
  } catch (error) {
    console.error('Error getting comment reactions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const commentId = body.comment_id as string
    const reactionType = body.reaction_type as unknown

    if (!commentId || !isValidUUID(commentId)) {
      return NextResponse.json({ error: 'Valid comment_id is required' }, { status: 400 })
    }

    if (!isReactionType(reactionType)) {
      return NextResponse.json({ error: 'reaction_type must be one of: hype, naw' }, { status: 400 })
    }

    const { data: comment } = await supabaseAdmin
      .from('comments')
      .select('id, project_id')
      .eq('id', commentId)
      .single()

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }
    if (!comment.project_id || !isValidUUID(comment.project_id)) {
      return NextResponse.json({ error: 'Comment project not found' }, { status: 404 })
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id, sharing_enabled, visibility')
      .eq('id', comment.project_id)
      .single()
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const canView = await canViewProject({
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
      userId: user.id,
      isDirectAccess: true,
    })
    if (!canView) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const canReact = await canReactProject({
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
      userId: user.id,
      isDirectAccess: true,
    })
    if (!canReact) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!(await hasCommentReactionsTable())) {
      return NextResponse.json({
        success: false,
        supported: false,
        action: 'unsupported',
        reaction_type: reactionType,
      })
    }

    const { data: existingReaction } = await supabaseAdmin
      .from('comment_reactions')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', user.id)
      .eq('reaction_type', reactionType)
      .maybeSingle()

    const action = getReactionToggleAction(!!existingReaction)

    if (action === 'remove') {
      const { error: deleteError } = await supabaseAdmin
        .from('comment_reactions')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id)
        .eq('reaction_type', reactionType)
      if (deleteError) throw deleteError
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('comment_reactions')
        .insert({
          comment_id: commentId,
          user_id: user.id,
          reaction_type: reactionType,
        })
      if (insertError) throw insertError
    }

    const { data: reactions, error: summaryError } = await supabaseAdmin
      .from('comment_reactions')
      .select('comment_id, user_id, reaction_type')
      .eq('comment_id', commentId)

    if (summaryError) throw summaryError

    const safeRows = (reactions || []).filter((row) => isReactionType(row.reaction_type))
    const reactionSummary = summarizeCommentReactions(
      safeRows as Array<{ comment_id: string; user_id: string; reaction_type: ReactionType }>,
      user.id
    )[commentId] || {
      hype: 0,
      naw: 0,
      like: 0,
      viewerReactions: {},
      viewerReaction: null,
    }

    return NextResponse.json(
      {
        success: true,
        action,
        reaction_type: reactionType,
        comment_id: commentId,
        summary: {
          reactions: {
            hype: reactionSummary.hype,
            naw: reactionSummary.naw,
            like: reactionSummary.like,
          },
          viewer_reactions: reactionSummary.viewerReactions,
          viewer_reaction: reactionSummary.viewerReaction,
        },
      },
      { status: action === 'add' ? 201 : 200 }
    )
  } catch (error) {
    console.error('Error toggling comment reaction:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
