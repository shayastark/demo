import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import {
  canScheduleProjectUpdate,
  canViewerSeeProjectUpdate,
  dedupeProjectUpdateRowsById,
  parseProjectUpdateScheduledPublishAt,
  sanitizeProjectUpdateContent,
  sanitizeProjectUpdateImportantFlag,
  sanitizeProjectUpdateStatus,
  shouldAutoPublishScheduledUpdate,
  shouldNotifyForProjectUpdateTransition,
  sanitizeProjectUpdateVersionLabel,
  type ProjectUpdateRow,
} from '@/lib/projectUpdates'
import { notifyFollowersProjectUpdate } from '@/lib/notifications'
import { canPostProjectUpdate, canViewProject } from '@/lib/projectAccessPolicyServer'

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

async function getProject(projectId: string) {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, title, creator_id, share_token, sharing_enabled, visibility')
    .eq('id', projectId)
    .single()
  return project
}

async function autoPublishScheduledUpdates(args: {
  projectId: string
  projectTitle: string
}): Promise<void> {
  const nowIso = new Date().toISOString()
  const { data: dueRows, error: dueError } = await supabaseAdmin
    .from('project_updates')
    .select('id, project_id, user_id, content, version_label, is_important, status, scheduled_publish_at')
    .eq('project_id', args.projectId)
    .eq('status', 'draft')
    .lte('scheduled_publish_at', nowIso)

  if (dueError) {
    console.error('Error fetching scheduled updates for autopublish:', dueError)
    return
  }

  const due = ((dueRows || []) as ProjectUpdateRow[]).filter((row) =>
    shouldAutoPublishScheduledUpdate(
      {
        status: row.status,
        scheduled_publish_at: row.scheduled_publish_at,
      },
      Date.parse(nowIso)
    )
  )
  if (due.length === 0) return

  const dueIds = due.map((row) => row.id)
  const scheduledById = due.reduce<Record<string, string | null>>((acc, row) => {
    acc[row.id] = row.scheduled_publish_at
    return acc
  }, {})

  const { data: transitionedRows, error } = await supabaseAdmin
    .from('project_updates')
    .update({
      status: 'published',
      published_at: nowIso,
      scheduled_publish_at: null,
    })
    .eq('project_id', args.projectId)
    .eq('status', 'draft')
    .in('id', dueIds)
    .lte('scheduled_publish_at', nowIso)
    .select('id, project_id, user_id, content, version_label, is_important')

  if (error) {
    console.error('Error auto-publishing scheduled updates:', error)
    return
  }

  const uniqueRows = dedupeProjectUpdateRowsById(transitionedRows || [])
  for (const row of uniqueRows) {
    console.info('project_update_schedule_event', {
      schema: 'project_update_schedule.v1',
      action: 'schedule_autopublish',
      project_id: row.project_id,
      update_id: row.id,
      scheduled_publish_at: scheduledById[row.id] || null,
      source: 'project_updates_get',
    })
    notifyFollowersProjectUpdate({
      creatorId: row.user_id,
      projectId: row.project_id,
      updateId: row.id,
      projectTitle: args.projectTitle,
      content: row.content,
      versionLabel: row.version_label,
      isImportant: row.is_important,
    }).catch((notifyError) => {
      console.error('Failed notifying for scheduled autopublish:', notifyError)
    })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    const currentUser = await getOptionalCurrentUser(request)
    const project = await getProject(projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const canAccess = await canViewProject({
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
      userId: currentUser?.id,
      isDirectAccess: true,
    })
    if (!canAccess) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    await autoPublishScheduledUpdates({
      projectId: project.id,
      projectTitle: project.title,
    })

    const canManage = await canPostProjectUpdate({
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
      userId: currentUser?.id,
    })

    const includeDrafts = searchParams.get('include_drafts') === 'true'

    let updatesQuery = supabaseAdmin
      .from('project_updates')
      .select('*')
      .eq('project_id', projectId)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (!(canManage && includeDrafts)) {
      updatesQuery = updatesQuery.eq('status', 'published')
    }

    const { data: updates, error } = await updatesQuery
    if (error) throw error

    const rows = (updates || []) as ProjectUpdateRow[]
    const visibleRows = rows.filter((row) => canViewerSeeProjectUpdate(row.status, canManage))
    const userIds = Array.from(new Set(visibleRows.map((row) => row.user_id)))
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

    const response = {
      can_manage: canManage,
      updates: visibleRows.map((update) => ({
        ...update,
        can_delete: !!currentUser?.id && (currentUser.id === project.creator_id || (canManage && update.user_id === currentUser.id)),
        can_edit: !!currentUser?.id && (currentUser.id === project.creator_id || (canManage && update.user_id === currentUser.id)),
        author_name: usersById[update.user_id]?.username || usersById[update.user_id]?.email || 'Unknown',
      })),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error getting project updates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const projectId = typeof body.project_id === 'string' ? body.project_id : ''
    const content = sanitizeProjectUpdateContent(body.content)
    const versionLabel = sanitizeProjectUpdateVersionLabel(body.version_label)
    const isImportant = sanitizeProjectUpdateImportantFlag(body.is_important)
    const status = sanitizeProjectUpdateStatus(body.status, 'published')
    const hasScheduledPublishAtField = Object.prototype.hasOwnProperty.call(body, 'scheduled_publish_at')
    const scheduledPublishAt = hasScheduledPublishAtField
      ? parseProjectUpdateScheduledPublishAt(body.scheduled_publish_at)
      : undefined

    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    if (!content) {
      return NextResponse.json({ error: 'Update content is required' }, { status: 400 })
    }
    if (isImportant === null) {
      return NextResponse.json({ error: 'is_important must be boolean when provided' }, { status: 400 })
    }
    if (!status) {
      return NextResponse.json({ error: 'status must be draft or published' }, { status: 400 })
    }
    if (hasScheduledPublishAtField && scheduledPublishAt === undefined) {
      return NextResponse.json(
        { error: 'scheduled_publish_at must be a future ISO timestamp or null' },
        { status: 400 }
      )
    }
    if (scheduledPublishAt && !canScheduleProjectUpdate(status)) {
      return NextResponse.json(
        { error: 'scheduled_publish_at is only allowed for draft updates' },
        { status: 400 }
      )
    }

    const project = await getProject(projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const canCreate = await canPostProjectUpdate({
      userId: currentUser.id,
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
    })
    if (!canCreate) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data: update, error } = await supabaseAdmin
      .from('project_updates')
      .insert({
        project_id: projectId,
        user_id: currentUser.id,
        content,
        version_label: versionLabel,
        is_important: isImportant,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
        scheduled_publish_at: status === 'draft' ? (scheduledPublishAt ?? null) : null,
      })
      .select('*')
      .single()

    if (error) throw error

    if (shouldNotifyForProjectUpdateTransition({ previousStatus: null, nextStatus: status })) {
      notifyFollowersProjectUpdate({
        creatorId: currentUser.id,
        projectId,
        updateId: update.id,
        projectTitle: project.title,
        content,
        versionLabel,
        isImportant,
      }).catch((notifyError) => {
        console.error('Failed to notify followers for project update:', notifyError)
      })
    }

    return NextResponse.json({ update }, { status: 201 })
  } catch (error) {
    console.error('Error creating project update:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id : ''
    const hasContentField = Object.prototype.hasOwnProperty.call(body, 'content')
    const hasVersionLabelField = Object.prototype.hasOwnProperty.call(body, 'version_label')
    const hasImportantField = Object.prototype.hasOwnProperty.call(body, 'is_important')
    const hasStatusField = Object.prototype.hasOwnProperty.call(body, 'status')
    const hasScheduledPublishAtField = Object.prototype.hasOwnProperty.call(body, 'scheduled_publish_at')

    const content = hasContentField ? sanitizeProjectUpdateContent(body.content) : undefined
    const versionLabel = hasVersionLabelField ? sanitizeProjectUpdateVersionLabel(body.version_label) : undefined
    const isImportant = hasImportantField ? sanitizeProjectUpdateImportantFlag(body.is_important) : undefined
    const status = hasStatusField ? sanitizeProjectUpdateStatus(body.status, 'published') : undefined
    const scheduledPublishAt = hasScheduledPublishAtField
      ? parseProjectUpdateScheduledPublishAt(body.scheduled_publish_at)
      : undefined

    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: 'Valid id is required' }, { status: 400 })
    }
    if (
      !hasContentField &&
      !hasVersionLabelField &&
      !hasImportantField &&
      !hasStatusField &&
      !hasScheduledPublishAtField
    ) {
      return NextResponse.json({ error: 'At least one field is required' }, { status: 400 })
    }
    if (hasContentField && !content) {
      return NextResponse.json({ error: 'content must be a non-empty string' }, { status: 400 })
    }
    if (hasImportantField && isImportant === null) {
      return NextResponse.json({ error: 'is_important must be boolean when provided' }, { status: 400 })
    }
    if (hasStatusField && !status) {
      return NextResponse.json({ error: 'status must be draft or published' }, { status: 400 })
    }
    if (hasScheduledPublishAtField && scheduledPublishAt === undefined) {
      return NextResponse.json(
        { error: 'scheduled_publish_at must be a future ISO timestamp or null' },
        { status: 400 }
      )
    }

    const { data: existingUpdate } = await supabaseAdmin
      .from('project_updates')
      .select(
        'id, project_id, user_id, content, version_label, is_important, status, published_at, scheduled_publish_at'
      )
      .eq('id', id)
      .single()
    if (!existingUpdate) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 })
    }

    const project = await getProject(existingUpdate.project_id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const canEditByPolicy = await canPostProjectUpdate({
      userId: currentUser.id,
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
    })
    const canEdit = currentUser.id === project.creator_id || (canEditByPolicy && existingUpdate.user_id === currentUser.id)
    if (!canEdit) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const nextStatus = status || existingUpdate.status
    if (hasScheduledPublishAtField && scheduledPublishAt && !canScheduleProjectUpdate(nextStatus)) {
      return NextResponse.json(
        { error: 'scheduled_publish_at is only allowed for draft updates' },
        { status: 400 }
      )
    }
    const updatePayload: Record<string, unknown> = {}
    if (hasContentField) updatePayload.content = content
    if (hasVersionLabelField) updatePayload.version_label = versionLabel || null
    if (hasImportantField) updatePayload.is_important = isImportant
    if (hasStatusField) updatePayload.status = nextStatus
    if (hasScheduledPublishAtField) {
      updatePayload.scheduled_publish_at = nextStatus === 'draft' ? scheduledPublishAt : null
    }
    if (
      shouldNotifyForProjectUpdateTransition({
        previousStatus: existingUpdate.status === 'draft' ? 'draft' : 'published',
        nextStatus: nextStatus === 'draft' ? 'draft' : 'published',
      })
    ) {
      updatePayload.published_at = new Date().toISOString()
      updatePayload.scheduled_publish_at = null
    }

    const { data: updated, error } = await supabaseAdmin
      .from('project_updates')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error

    if (
      shouldNotifyForProjectUpdateTransition({
        previousStatus: existingUpdate.status === 'draft' ? 'draft' : 'published',
        nextStatus: (updated.status || 'published') === 'draft' ? 'draft' : 'published',
      })
    ) {
      notifyFollowersProjectUpdate({
        creatorId: currentUser.id,
        projectId: updated.project_id,
        updateId: updated.id,
        projectTitle: project.title,
        content: updated.content,
        versionLabel: updated.version_label,
        isImportant: updated.is_important,
      }).catch((notifyError) => {
        console.error('Failed to notify followers for published draft update:', notifyError)
      })
    }

    return NextResponse.json({ update: updated })
  } catch (error) {
    console.error('Error updating project update:', error)
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

    const { data: existingUpdate } = await supabaseAdmin
      .from('project_updates')
      .select('id, project_id, user_id')
      .eq('id', id)
      .single()

    if (!existingUpdate) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 })
    }

    const project = await getProject(existingUpdate.project_id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const canDeleteByPolicy = await canPostProjectUpdate({
      userId: currentUser.id,
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
    })
    const canDelete = currentUser.id === project.creator_id || (canDeleteByPolicy && existingUpdate.user_id === currentUser.id)
    if (!canDelete) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('project_updates')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error('Error deleting project update:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

