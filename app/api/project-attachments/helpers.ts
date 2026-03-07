import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { canViewProject } from '@/lib/projectAccessPolicyServer'

export type ProjectAttachmentRecord = {
  id: string
  project_id: string
  user_id: string
  type: 'image' | 'file' | 'link'
  title: string | null
  url: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

type ProjectAccessRecord = {
  id: string
  creator_id: string
  sharing_enabled: boolean | null
  visibility: string | null
}

export async function getOptionalCurrentUserFromAuthHeader(authHeader: string | null) {
  if (!authHeader) return null
  const authResult = await verifyPrivyToken(authHeader)
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function resolveProjectAttachmentAccess(args: {
  attachmentId: string
  authHeader: string | null
}):
  Promise<
    | { ok: true; attachment: ProjectAttachmentRecord; project: ProjectAccessRecord }
    | { ok: false; status: number; error: string }
  > {
  const currentUser = await getOptionalCurrentUserFromAuthHeader(args.authHeader)
  const { data: attachment } = await supabaseAdmin
    .from('project_attachments')
    .select('*')
    .eq('id', args.attachmentId)
    .single()

  if (!attachment) {
    return { ok: false, status: 404, error: 'Attachment not found' }
  }

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, creator_id, sharing_enabled, visibility')
    .eq('id', attachment.project_id)
    .single()

  if (!project) {
    return { ok: false, status: 404, error: 'Project not found' }
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
    return { ok: false, status: 404, error: 'Attachment not found' }
  }

  return {
    ok: true,
    attachment: attachment as ProjectAttachmentRecord,
    project: project as ProjectAccessRecord,
  }
}

export function buildProjectAttachmentPaths(attachmentId: string) {
  return {
    viewerPath: `/attachments/${attachmentId}`,
    contentPath: `/api/project-attachments/${attachmentId}/content`,
    openPath: `/api/project-attachments/${attachmentId}/open`,
  }
}
