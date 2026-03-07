import { NextRequest, NextResponse } from 'next/server'
import { isValidUUID } from '@/lib/validation'
import { buildProjectAttachmentPaths, resolveProjectAttachmentAccess } from '../../helpers'

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
  if (access.attachment.type === 'image') {
    return NextResponse.redirect(new URL(paths.viewerPath, request.url))
  }
  if (access.attachment.type === 'file') {
    return NextResponse.redirect(new URL(paths.contentPath, request.url))
  }
  return NextResponse.redirect(access.attachment.url)
}
