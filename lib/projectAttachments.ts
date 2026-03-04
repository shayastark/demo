export const PROJECT_ATTACHMENT_TYPES = ['image', 'file', 'link'] as const
export type ProjectAttachmentType = (typeof PROJECT_ATTACHMENT_TYPES)[number]
export const PROJECT_ATTACHMENT_SIZE_LIMITS = {
  image: 10 * 1024 * 1024,
  file: 20 * 1024 * 1024,
} as const

export interface ProjectAttachmentInput {
  project_id: string
  type: ProjectAttachmentType
  title: string | null
  url: string
  mime_type: string | null
  size_bytes: number | null
}

export function isProjectAttachmentType(value: unknown): value is ProjectAttachmentType {
  return typeof value === 'string' && (PROJECT_ATTACHMENT_TYPES as readonly string[]).includes(value)
}

export function sanitizeAttachmentTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, 120)
  return trimmed || null
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function parseAttachmentSizeBytes(value: unknown): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value < 0) return null
  return value
}

export function parseProjectAttachmentsLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return 20
  if (!/^\d+$/.test(raw)) return null
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) return null
  return parsed
}

export function validateProjectAttachmentInput(body: unknown): {
  valid: boolean
  error?: string
  parsed?: ProjectAttachmentInput
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Invalid request body' }
  }

  const record = body as Record<string, unknown>
  const projectId = typeof record.project_id === 'string' ? record.project_id : ''
  const type = record.type
  const url = record.url
  const title = sanitizeAttachmentTitle(record.title)
  const mimeType = typeof record.mime_type === 'string' ? record.mime_type.trim().slice(0, 120) || null : null
  const sizeBytes = parseAttachmentSizeBytes(record.size_bytes)

  if (!projectId) {
    return { valid: false, error: 'project_id is required' }
  }
  if (!isProjectAttachmentType(type)) {
    return { valid: false, error: 'type must be one of: image, file, link' }
  }
  if (!isHttpUrl(url)) {
    return { valid: false, error: 'url must be a valid http/https URL' }
  }
  if (record.size_bytes !== undefined && record.size_bytes !== null && sizeBytes === null) {
    return { valid: false, error: 'size_bytes must be a non-negative integer' }
  }
  if (type === 'image') {
    if (mimeType && !mimeType.startsWith('image/')) {
      return { valid: false, error: 'image attachments require image mime_type' }
    }
    if (sizeBytes !== null && sizeBytes > PROJECT_ATTACHMENT_SIZE_LIMITS.image) {
      return { valid: false, error: 'image attachment exceeds size limit' }
    }
  }
  if (type === 'file') {
    if (mimeType && mimeType.startsWith('audio/')) {
      return { valid: false, error: 'audio files are not supported' }
    }
    if (sizeBytes !== null && sizeBytes > PROJECT_ATTACHMENT_SIZE_LIMITS.file) {
      return { valid: false, error: 'file attachment exceeds size limit' }
    }
  }

  return {
    valid: true,
    parsed: {
      project_id: projectId,
      type,
      title,
      url,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    },
  }
}

