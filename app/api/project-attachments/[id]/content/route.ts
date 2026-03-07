import { NextRequest, NextResponse } from 'next/server'
import { isValidUUID } from '@/lib/validation'
import { resolveProjectAttachmentAccess } from '../../helpers'

function buildDownloadName(title: string | null, fallbackType: string, mimeType: string | null) {
  const normalizedTitle = title?.trim()
  if (normalizedTitle) return normalizedTitle.replace(/[\\/:*?"<>|]+/g, '_')
  const extension = mimeType?.split('/')[1]?.split(';')[0] || fallbackType
  return `attachment.${extension}`
}

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

  if (access.attachment.type === 'link') {
    return NextResponse.json({ error: 'Links do not have proxied file content' }, { status: 400 })
  }

  const upstream = await fetch(access.attachment.url, { cache: 'no-store' })
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Failed to load attachment content' }, { status: 502 })
  }

  const contentType =
    access.attachment.mime_type ||
    upstream.headers.get('content-type') ||
    'application/octet-stream'
  const headers = new Headers()
  headers.set('Content-Type', contentType)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('X-Robots-Tag', 'noindex')
  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers.set('Content-Length', contentLength)
  headers.set(
    'Content-Disposition',
    `${access.attachment.type === 'image' ? 'inline' : 'attachment'}; filename="${buildDownloadName(
      access.attachment.title,
      access.attachment.type,
      contentType
    )}"`
  )

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  })
}
