import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import {
  sanitizeProjectUpdateContent,
  sanitizeProjectUpdateVersionLabel,
  canManageProjectUpdates,
  type ProjectUpdateRow,
} from '@/lib/projectUpdates'
import { notifyFollowersProjectUpdate } from '@/lib/notifications'
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

async function getProject(projectId: string) {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, title, creator_id, share_token, sharing_enabled, visibility')
    .eq('id', projectId)
    .single()
  return project
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

    const canAccess = await canUserAccessProjectRow({
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

    const { data: updates, error } = await supabaseAdmin
      .from('project_updates')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = (updates || []) as ProjectUpdateRow[]
    const userIds = Array.from(new Set(rows.map((row) => row.user_id)))
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

    const canManageAsCreator = canManageProjectUpdates(currentUser?.id, project.creator_id)
    const canManageAsContributor = await hasProjectRole({
      projectId: project.id,
      projectCreatorId: project.creator_id,
      userId: currentUser?.id,
      minRole: 'contributor',
    })
    const canManage = canManageAsCreator || canManageAsContributor
    const response = {
      can_manage: canManage,
      updates: rows.map((update) => ({
        ...update,
        can_delete: canManageAsCreator || (canManageAsContributor && update.user_id === currentUser?.id),
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

    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    if (!content) {
      return NextResponse.json({ error: 'Update content is required' }, { status: 400 })
    }

    const project = await getProject(projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const canCreateAsCreator = canManageProjectUpdates(currentUser.id, project.creator_id)
    const canCreateAsContributor = await hasProjectRole({
      projectId: project.id,
      projectCreatorId: project.creator_id,
      userId: currentUser.id,
      minRole: 'contributor',
    })
    if (!canCreateAsCreator && !canCreateAsContributor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data: update, error } = await supabaseAdmin
      .from('project_updates')
      .insert({
        project_id: projectId,
        user_id: currentUser.id,
        content,
        version_label: versionLabel,
      })
      .select('*')
      .single()

    if (error) throw error

    notifyFollowersProjectUpdate({
      creatorId: currentUser.id,
      projectId,
      updateId: update.id,
      projectTitle: project.title,
      content,
      versionLabel,
    }).catch((notifyError) => {
      console.error('Failed to notify followers for project update:', notifyError)
    })

    return NextResponse.json({ update }, { status: 201 })
  } catch (error) {
    console.error('Error creating project update:', error)
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

    const canDeleteAsCreator = canManageProjectUpdates(currentUser.id, project.creator_id)
    const canDeleteAsContributor = await hasProjectRole({
      projectId: project.id,
      projectCreatorId: project.creator_id,
      userId: currentUser.id,
      minRole: 'contributor',
    })
    const canDelete = canDeleteAsCreator || (canDeleteAsContributor && existingUpdate.user_id === currentUser.id)
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

