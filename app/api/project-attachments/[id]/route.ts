import { NextRequest, NextResponse } from 'next/server'
import { isValidUUID } from '@/lib/validation'
import { buildProjectAttachmentPaths, resolveProjectAttachmentAccess } from '../helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Valid id is required' }, { status: 400 })
  }

  const access = await resolveProjectAttachmentAccess({
    attachmentId: id,
    authHeader: request.headers.get('authorization'),
  })
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const paths = buildProjectAttachmentPaths(id)
  return NextResponse.json({
    attachment: {
      id: access.attachment.id,
      project_id: access.attachment.project_id,
      type: access.attachment.type,
      title: access.attachment.title,
      mime_type: access.attachment.mime_type,
      size_bytes: access.attachment.size_bytes,
      created_at: access.attachment.created_at,
      viewer_path: paths.viewerPath,
      content_path: paths.contentPath,
      href: access.attachment.type === 'image' ? paths.viewerPath : paths.openPath,
    },
  })
}
