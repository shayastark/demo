import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import {
  canDeleteProjectUpdateComment,
  sanitizeProjectUpdateCommentContent,
  type ProjectUpdateCommentRow,
} from '@/lib/projectUpdateComments'
import { notifyCreatorUpdateEngagement } from '@/lib/notifications'
import { canUserAccessProjectRow, hasProjectRole } from '@/lib/projectAccessServer'

async function getOptionalCurrentUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null
  const authResult = await verifyPrivyToken(authHeader)
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

async function getRequiredCurrentUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

async function getUpdateWithProject(updateId: string) {
  const { data: updateRow } = await supabaseAdmin
    .from('project_updates')
    .select('id, project_id, user_id')
    .eq('id', updateId)
    .single()
  if (!updateRow) return null

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, creator_id, sharing_enabled, visibility')
    .eq('id', updateRow.project_id)
    .single()
  if (!project) return null

  return { update: updateRow, project }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const updateId = searchParams.get('update_id')
    if (!updateId || !isValidUUID(updateId)) {
      return NextResponse.json({ error: 'Valid update_id is required' }, { status: 400 })
    }

    const currentUser = await getOptionalCurrentUser(request)
    const resolved = await getUpdateWithProject(updateId)
    if (!resolved) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 })
    }

    const canAccess = await canUserAccessProjectRow({
      project: {
        id: resolved.project.id,
        creator_id: resolved.project.creator_id,
        visibility: resolved.project.visibility,
        sharing_enabled: resolved.project.sharing_enabled,
      },
      userId: currentUser?.id,
      isDirectAccess: true,
    })
    if (!canAccess) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 })
    }
    if (resolved.project.visibility === 'private' && currentUser.id !== resolved.project.creator_id) {
      const canCommentAsCollaborator = await hasProjectRole({
        projectId: resolved.project.id,
        projectCreatorId: resolved.project.creator_id,
        userId: currentUser.id,
        minRole: 'commenter',
      })
      if (!canCommentAsCollaborator) {
        return NextResponse.json({ error: 'Insufficient project role' }, { status: 403 })
      }
    }

    const { data: comments, error } = await supabaseAdmin
      .from('project_update_comments')
      .select('*')
      .eq('update_id', updateId)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'Failed to load update comments' }, { status: 500 })
    }

    const rows = (comments || []) as ProjectUpdateCommentRow[]
    const userIds = Array.from(new Set(rows.map((row) => row.user_id)))
    let usersById: Record<string, { username: string | null; email: string | null }> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, username, email')
        .in('id', userIds)
      usersById = (users || []).reduce<Record<string, { username: string | null; email: string | null }>>(
        (acc, user) => {
          acc[user.id] = { username: user.username, email: user.email }
          return acc
        },
        {}
      )
    }

    const responseComments = rows.map((row) => ({
      ...row,
      author_name: usersById[row.user_id]?.username || usersById[row.user_id]?.email || 'Unknown',
      can_delete: canDeleteProjectUpdateComment({
        viewerUserId: currentUser?.id,
        commentUserId: row.user_id,
        projectCreatorId: resolved.project.creator_id,
      }),
    }))

    return NextResponse.json({
      comments: responseComments,
      count: responseComments.length,
    })
  } catch (error) {
    console.error('Error in project update comments GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const updateId = (body as Record<string, unknown>)?.update_id
    const content = sanitizeProjectUpdateCommentContent((body as Record<string, unknown>)?.content)

    if (typeof updateId !== 'string' || !isValidUUID(updateId)) {
      return NextResponse.json({ error: 'Valid update_id is required' }, { status: 400 })
    }
    if (!content) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
    }

    const resolved = await getUpdateWithProject(updateId)
    if (!resolved) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 })
    }
    const canAccess = await canUserAccessProjectRow({
      project: {
        id: resolved.project.id,
        creator_id: resolved.project.creator_id,
        visibility: resolved.project.visibility,
        sharing_enabled: resolved.project.sharing_enabled,
      },
      userId: currentUser.id,
      isDirectAccess: true,
    })
    if (!canAccess) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 })
    }

    const { data: comment, error } = await supabaseAdmin
      .from('project_update_comments')
      .insert({
        update_id: updateId,
        user_id: currentUser.id,
        content,
      })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to create update comment' }, { status: 500 })
    }

    // Notify update owner and project creator (deduped, self skipped by helper).
    const recipientIds = Array.from(
      new Set([resolved.update.user_id, resolved.project.creator_id].filter((id): id is string => !!id))
    )
    let notifications: Array<Record<string, unknown>> = []
    for (const recipientUserId of recipientIds) {
      try {
        const outcome = await notifyCreatorUpdateEngagement({
          recipientUserId,
          actorUserId: currentUser.id,
          actorName: currentUser.username || currentUser.email || null,
          projectId: resolved.project.id,
          updateId: resolved.update.id,
        })
        notifications.push(outcome)
      } catch (notifyError) {
        console.error('Failed to notify update comment engagement:', notifyError)
      }
    }

    return NextResponse.json(
      {
        comment,
        update_engagement_notifications: notifications,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error in project update comments POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: 'Valid id is required' }, { status: 400 })
    }

    const { data: existingComment } = await supabaseAdmin
      .from('project_update_comments')
      .select('id, user_id, update_id')
      .eq('id', id)
      .single()

    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    const resolved = await getUpdateWithProject(existingComment.update_id)
    if (!resolved) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 })
    }

    const canDelete = canDeleteProjectUpdateComment({
      viewerUserId: currentUser.id,
      commentUserId: existingComment.user_id,
      projectCreatorId: resolved.project.creator_id,
    })
    if (!canDelete) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('project_update_comments')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete update comment' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error('Error in project update comments DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

