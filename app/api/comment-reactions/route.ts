import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'

const SUPPORTED_REACTION = 'like'

async function getAuthenticatedUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const commentId = body.comment_id as string
    const reactionType = body.reaction_type as string

    if (!commentId || !isValidUUID(commentId)) {
      return NextResponse.json({ error: 'Valid comment_id is required' }, { status: 400 })
    }

    if (reactionType !== SUPPORTED_REACTION) {
      return NextResponse.json({ error: 'Only like reactions are supported right now' }, { status: 400 })
    }

    const { data: comment } = await supabaseAdmin
      .from('comments')
      .select('id')
      .eq('id', commentId)
      .single()

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    const { error } = await supabaseAdmin
      .from('comment_reactions')
      .upsert(
        {
          comment_id: commentId,
          user_id: user.id,
          reaction_type: SUPPORTED_REACTION,
        },
        { onConflict: 'comment_id,user_id' }
      )

    if (error) throw error

    return NextResponse.json({ success: true, reaction: SUPPORTED_REACTION }, { status: 201 })
  } catch (error) {
    console.error('Error creating comment reaction:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const commentId = searchParams.get('comment_id')

    if (!commentId || !isValidUUID(commentId)) {
      return NextResponse.json({ error: 'Valid comment_id is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('comment_reactions')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting comment reaction:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
