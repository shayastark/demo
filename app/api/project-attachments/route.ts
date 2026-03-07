import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import { parseProjectAttachmentsLimit, validateProjectAttachmentInput } from '@/lib/projectAttachments'
import { canPostProjectUpdate, canViewProject } from '@/lib/projectAccessPolicyServer'
import {
  ATTACHMENT_COUNT_PER_PROJECT_LIMIT,
  LINKS_PER_PROJECT_LIMIT,
  MAX_UPLOAD_ATTEMPTS_PER_WINDOW,
  PROJECT_ATTACHMENT_STORAGE_LIMIT_BYTES,
  USER_DAILY_UPLOAD_BUDGET_BYTES,
  getAttachmentsPerProjectErrorMessage,
  getLinksPerProjectErrorMessage,
  getProjectAttachmentQuotaUsage,
  getProjectAttachmentStorageErrorMessage,
  getRecentUploadAttemptCount,
  getUploadAttemptsErrorMessage,
  getUserDailyUploadBudgetErrorMessage,
  getUserDailyUploadedBytes,
  recordUploadQuotaEvent,
} from '@/lib/uploadQuotas'

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

    const canManage = await canPostProjectUpdate({
      userId: currentUser?.id,
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
    })

    return NextResponse.json({
      attachments: (attachments || []).map((attachment) => ({
        ...attachment,
        can_delete:
          !!currentUser?.id &&
          (currentUser.id === project.creator_id || (canManage && attachment.user_id === currentUser.id)),
      })),
      can_manage: canManage,
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
    const canManage = await canPostProjectUpdate({
      userId: currentUser.id,
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: null,
        sharing_enabled: null,
      },
    })
    if (!canManage) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const projectUsage = await getProjectAttachmentQuotaUsage(project_id)
    if (projectUsage.count >= ATTACHMENT_COUNT_PER_PROJECT_LIMIT) {
      return NextResponse.json({ error: getAttachmentsPerProjectErrorMessage() }, { status: 429 })
    }
    if (type === 'link' && projectUsage.linkCount >= LINKS_PER_PROJECT_LIMIT) {
      return NextResponse.json({ error: getLinksPerProjectErrorMessage() }, { status: 429 })
    }

    if (type !== 'link') {
      const uploadSizeBytes = size_bytes || 0
      const attemptCount = await getRecentUploadAttemptCount(currentUser.id)
      if (attemptCount >= MAX_UPLOAD_ATTEMPTS_PER_WINDOW) {
        await recordUploadQuotaEvent({
          userId: currentUser.id,
          projectId: project_id,
          assetClass: 'attachment',
          byteSize: uploadSizeBytes,
          attachmentType: type,
          success: false,
          reason: 'attempt_window_exceeded',
        })
        return NextResponse.json({ error: getUploadAttemptsErrorMessage() }, { status: 429 })
      }

      const dailyUploadedBytes = await getUserDailyUploadedBytes(currentUser.id)
      if (dailyUploadedBytes + uploadSizeBytes > USER_DAILY_UPLOAD_BUDGET_BYTES) {
        await recordUploadQuotaEvent({
          userId: currentUser.id,
          projectId: project_id,
          assetClass: 'attachment',
          byteSize: uploadSizeBytes,
          attachmentType: type,
          success: false,
          reason: 'daily_budget_exceeded',
        })
        return NextResponse.json({ error: getUserDailyUploadBudgetErrorMessage() }, { status: 429 })
      }

      if (projectUsage.totalBytes + uploadSizeBytes > PROJECT_ATTACHMENT_STORAGE_LIMIT_BYTES) {
        await recordUploadQuotaEvent({
          userId: currentUser.id,
          projectId: project_id,
          assetClass: 'attachment',
          byteSize: uploadSizeBytes,
          attachmentType: type,
          success: false,
          reason: 'project_attachment_storage_exceeded',
        })
        return NextResponse.json({ error: getProjectAttachmentStorageErrorMessage() }, { status: 429 })
      }
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

    if (type !== 'link') {
      await recordUploadQuotaEvent({
        userId: currentUser.id,
        projectId: project_id,
        assetClass: 'attachment',
        byteSize: size_bytes || 0,
        attachmentType: type,
        success: true,
        reason: 'attachment_created',
      })
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
    const canDeleteByPolicy = await canPostProjectUpdate({
      userId: currentUser.id,
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: null,
        sharing_enabled: null,
      },
    })
    const canDelete =
      currentUser.id === project.creator_id ||
      (canDeleteByPolicy && attachment.user_id === currentUser.id)
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

