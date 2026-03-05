import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import { parseProjectAttachmentsLimit, validateProjectAttachmentInput } from '@/lib/projectAttachments'
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const limit = parseProjectAttachmentsLimit(searchParams.get('limit'))

    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }
    if (limit === null) {
      return NextResponse.json({ error: 'limit must be an integer between 1 and 20' }, { status: 400 })
    }

    const currentUser = await getOptionalCurrentUser(request)
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id, sharing_enabled, visibility')
      .eq('id', projectId)
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
      userId: currentUser?.id,
      isDirectAccess: true,
    })
    if (!canAccess) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: attachments, error } = await supabaseAdmin
      .from('project_attachments')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error loading project attachments:', error)
      return NextResponse.json({ error: 'Failed to load attachments' }, { status: 500 })
    }

    const canManageAsCreator = currentUser?.id === project.creator_id
    const canManageAsContributor = await hasProjectRole({
      projectId: project.id,
      projectCreatorId: project.creator_id,
      userId: currentUser?.id,
      minRole: 'contributor',
    })

    return NextResponse.json({
      attachments: (attachments || []).map((attachment) => ({
        ...attachment,
        can_delete:
          canManageAsCreator ||
          (canManageAsContributor && !!currentUser?.id && attachment.user_id === currentUser.id),
      })),
      can_manage: canManageAsCreator || canManageAsContributor,
    })
  } catch (error) {
    console.error('Error in project attachments GET:', error)
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

    const validation = validateProjectAttachmentInput(body)
    if (!validation.valid || !validation.parsed) {
      return NextResponse.json({ error: validation.error || 'Invalid attachment payload' }, { status: 400 })
    }

    const { project_id, type, title, url, mime_type, size_bytes } = validation.parsed
    if (!isValidUUID(project_id)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id')
      .eq('id', project_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const canManageAsCreator = project.creator_id === currentUser.id
    const canManageAsContributor = await hasProjectRole({
      projectId: project.id,
      projectCreatorId: project.creator_id,
      userId: currentUser.id,
      minRole: 'contributor',
    })
    if (!canManageAsCreator && !canManageAsContributor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data: attachment, error } = await supabaseAdmin
      .from('project_attachments')
      .insert({
        project_id,
        user_id: currentUser.id,
        type,
        title,
        url,
        mime_type,
        size_bytes,
      })
      .select('*')
      .single()

    if (error) {
      console.error('Error creating project attachment:', error)
      return NextResponse.json({ error: 'Failed to create attachment' }, { status: 500 })
    }

    return NextResponse.json({ attachment }, { status: 201 })
  } catch (error) {
    console.error('Error in project attachments POST:', error)
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

    const { data: attachment } = await supabaseAdmin
      .from('project_attachments')
      .select('id, project_id, user_id')
      .eq('id', id)
      .single()

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id')
      .eq('id', attachment.project_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const canDeleteAsCreator = project.creator_id === currentUser.id
    const canDeleteAsContributor = await hasProjectRole({
      projectId: project.id,
      projectCreatorId: project.creator_id,
      userId: currentUser.id,
      minRole: 'contributor',
    })
    const canDelete =
      canDeleteAsCreator ||
      (canDeleteAsContributor && attachment.user_id === currentUser.id)
    if (!canDelete) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('project_attachments')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting project attachment:', error)
      return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error('Error in project attachments DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

