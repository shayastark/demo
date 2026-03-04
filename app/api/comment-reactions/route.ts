import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import { isReactionType, summarizeCommentReactions, getReactionToggleAction } from '@/lib/commentReactions'

async function getAuthenticatedUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
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
      return NextResponse.json({ error: 'reaction_type must be one of: helpful, fire, agree' }, { status: 400 })
    }

    const { data: comment } = await supabaseAdmin
      .from('comments')
      .select('id')
      .eq('id', commentId)
      .single()

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
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

    return NextResponse.json(
      { success: true, action, reaction_type: reactionType },
      { status: action === 'add' ? 201 : 200 }
    )
  } catch (error) {
    console.error('Error toggling comment reaction:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
