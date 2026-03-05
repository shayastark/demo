import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import {
  getProjectUpdateReactionToggleAction,
  isProjectUpdateReactionType,
  summarizeProjectUpdateReactions,
} from '@/lib/projectUpdateReactions'
import { notifyCreatorUpdateEngagement } from '@/lib/notifications'
import { canUserAccessProjectRow, hasProjectRole } from '@/lib/projectAccessServer'

async function getAuthenticatedUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const updateIdsParam = searchParams.get('update_ids')
    if (!updateIdsParam) {
      return NextResponse.json({ error: 'update_ids is required' }, { status: 400 })
    }

    const updateIds = updateIdsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (
      updateIds.length === 0 ||
      updateIds.length > 100 ||
      !updateIds.every((id) => isValidUUID(id))
    ) {
      return NextResponse.json(
        { error: 'update_ids must be a comma-separated list of UUIDs (max 100)' },
        { status: 400 }
      )
    }

    const user = await getAuthenticatedUser(request)
    const { data: updateRows } = await supabaseAdmin
      .from('project_updates')
      .select('id, project_id')
      .in('id', updateIds)

    const updateToProjectId = new Map<string, string>()
    ;(updateRows || []).forEach((row) => updateToProjectId.set(row.id, row.project_id))
    const projectIds = Array.from(new Set((updateRows || []).map((row) => row.project_id)))
    if (projectIds.length === 0) {
      return NextResponse.json({ reactionsByUpdate: {} })
    }

    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id, visibility, sharing_enabled')
      .in('id', projectIds)

    const allowedProjectIds = new Set<string>()
    for (const project of projects || []) {
      const canAccess = await canUserAccessProjectRow({
        project: {
          id: project.id,
          creator_id: project.creator_id,
          visibility: project.visibility,
          sharing_enabled: project.sharing_enabled,
        },
        userId: user?.id,
        isDirectAccess: true,
      })
      if (canAccess) allowedProjectIds.add(project.id)
    }

    const allowedUpdateIds = updateIds.filter((id) => {
      const projectId = updateToProjectId.get(id)
      return !!projectId && allowedProjectIds.has(projectId)
    })
    if (allowedUpdateIds.length === 0) {
      return NextResponse.json({ reactionsByUpdate: {} })
    }

    const { data: reactions, error } = await supabaseAdmin
      .from('project_update_reactions')
      .select('update_id, user_id, reaction_type')
      .in('update_id', allowedUpdateIds)

    if (error) throw error

    const safeRows = (reactions || []).filter((row) => isProjectUpdateReactionType(row.reaction_type))
    const summary = summarizeProjectUpdateReactions(safeRows, user?.id)

    return NextResponse.json({ reactionsByUpdate: summary })
  } catch (error) {
    console.error('Error getting project update reactions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const updateId = (body as Record<string, unknown>)?.update_id
    const reactionType = (body as Record<string, unknown>)?.reaction_type

    if (typeof updateId !== 'string' || !isValidUUID(updateId)) {
      return NextResponse.json({ error: 'Valid update_id is required' }, { status: 400 })
    }
    if (!isProjectUpdateReactionType(reactionType)) {
      return NextResponse.json({ error: 'reaction_type must be one of: helpful, fire, agree' }, { status: 400 })
    }

    const { data: updateRow } = await supabaseAdmin
      .from('project_updates')
      .select('id, project_id')
      .eq('id', updateId)
      .single()

    if (!updateRow) {
      return NextResponse.json({ error: 'Project update not found' }, { status: 404 })
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id, visibility, sharing_enabled')
      .eq('id', updateRow.project_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const canAccess = await canUserAccessProjectRow({
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
      userId: user.id,
      isDirectAccess: true,
    })
    if (!canAccess) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (project.visibility === 'private' && user.id !== project.creator_id) {
      const canReactAsCollaborator = await hasProjectRole({
        projectId: project.id,
        projectCreatorId: project.creator_id,
        userId: user.id,
        minRole: 'commenter',
      })
      if (!canReactAsCollaborator) {
        return NextResponse.json({ error: 'Insufficient project role' }, { status: 403 })
      }
    }

    const { data: existingReaction } = await supabaseAdmin
      .from('project_update_reactions')
      .select('id')
      .eq('update_id', updateId)
      .eq('user_id', user.id)
      .eq('reaction_type', reactionType)
      .maybeSingle()

    const action = getProjectUpdateReactionToggleAction(!!existingReaction)

    if (action === 'remove') {
      const { error: deleteError } = await supabaseAdmin
        .from('project_update_reactions')
        .delete()
        .eq('update_id', updateId)
        .eq('user_id', user.id)
        .eq('reaction_type', reactionType)
      if (deleteError) throw deleteError
      return NextResponse.json({ success: true, action, reaction_type: reactionType }, { status: 200 })
    }

    const { error: insertError } = await supabaseAdmin
      .from('project_update_reactions')
      .insert({
        update_id: updateId,
        user_id: user.id,
        reaction_type: reactionType,
      })
    if (insertError) throw insertError

    // Notify creator on add only; helper handles self + preference skips.
    const notification = await notifyCreatorUpdateEngagement({
      recipientUserId: project.creator_id,
      actorUserId: user.id,
      actorName: user.username || user.email || null,
      projectId: project.id,
      updateId,
    })

    return NextResponse.json(
      {
        success: true,
        action,
        reaction_type: reactionType,
        update_engagement_notification: notification,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error toggling project update reaction:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

