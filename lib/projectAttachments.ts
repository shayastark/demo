export const PROJECT_ATTACHMENT_TYPES = ['image', 'file', 'link'] as const
export type ProjectAttachmentType = (typeof PROJECT_ATTACHMENT_TYPES)[number]
export const PROJECT_ATTACHMENT_BUCKET = 'hubba-files'
export const PROJECT_ATTACHMENT_SIZE_LIMITS = {
  image: 10 * 1024 * 1024,
  file: 20 * 1024 * 1024,
} as const

export const PROJECT_ATTACHMENT_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const
export const PROJECT_ATTACHMENT_FILE_EXTENSIONS = ['pdf', 'txt', 'docx', 'csv'] as const

const PROJECT_ATTACHMENT_MIME_TYPES = {
  image: {
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    webp: ['image/webp'],
    gif: ['image/gif'],
  },
  file: {
    pdf: ['application/pdf'],
    txt: ['text/plain'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    csv: ['text/csv', 'application/csv', 'text/comma-separated-values'],
  },
} as const

const PROJECT_ATTACHMENT_ALLOWED_MIME_TYPES = {
  image: new Set(Object.values(PROJECT_ATTACHMENT_MIME_TYPES.image).flat().map((mimeType) => mimeType.toLowerCase())),
  file: new Set(Object.values(PROJECT_ATTACHMENT_MIME_TYPES.file).flat().map((mimeType) => mimeType.toLowerCase())),
} as const

export const PROJECT_ATTACHMENT_ACCEPT = {
  image: [
    ...PROJECT_ATTACHMENT_ALLOWED_MIME_TYPES.image,
    ...PROJECT_ATTACHMENT_IMAGE_EXTENSIONS.map((extension) => `.${extension}`),
  ].join(','),
  file: [
    ...PROJECT_ATTACHMENT_ALLOWED_MIME_TYPES.file,
    ...PROJECT_ATTACHMENT_FILE_EXTENSIONS.map((extension) => `.${extension}`),
  ].join(','),
} as const

export const PROJECT_ATTACHMENT_ALLOWED_FORMATS = {
  image: 'JPG, JPEG, PNG, WEBP, GIF',
  file: 'PDF, TXT, DOCX, CSV',
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

function getNormalizedMimeType(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function getProjectAttachmentFileExtension(fileName: string): string | null {
  const baseName = fileName.split(/[?#]/, 1)[0] || ''
  const extension = baseName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return extension || null
}

export function isSupportedProjectAttachmentExtension(
  type: Extract<ProjectAttachmentType, 'image' | 'file'>,
  extension: string | null | undefined
): boolean {
  if (!extension) return false
  const normalized = extension.toLowerCase()
  const allowedExtensions =
    type === 'image' ? PROJECT_ATTACHMENT_IMAGE_EXTENSIONS : PROJECT_ATTACHMENT_FILE_EXTENSIONS
  return (allowedExtensions as readonly string[]).includes(normalized)
}

export function isSupportedProjectAttachmentMimeType(
  type: Extract<ProjectAttachmentType, 'image' | 'file'>,
  mimeType: string | null | undefined
): boolean {
  const normalized = getNormalizedMimeType(mimeType)
  if (!normalized || normalized === 'application/octet-stream') {
    return true
  }
  return PROJECT_ATTACHMENT_ALLOWED_MIME_TYPES[type].has(normalized)
}

export function getProjectAttachmentUploadContentType(file: {
  name: string
  type?: string | null
}): string | undefined {
  const extension = getProjectAttachmentFileExtension(file.name)
  if (isSupportedProjectAttachmentExtension('image', extension)) {
    return PROJECT_ATTACHMENT_MIME_TYPES.image[extension as keyof typeof PROJECT_ATTACHMENT_MIME_TYPES.image][0]
  }
  if (isSupportedProjectAttachmentExtension('file', extension)) {
    return PROJECT_ATTACHMENT_MIME_TYPES.file[extension as keyof typeof PROJECT_ATTACHMENT_MIME_TYPES.file][0]
  }
  const mimeType = getNormalizedMimeType(file.type)
  return mimeType || undefined
}

export function getProjectAttachmentValidationError(
  type: Extract<ProjectAttachmentType, 'image' | 'file'>,
  file: { name: string; type?: string | null; size?: number } | null | undefined
): string | null {
  if (!file) {
    return `Select a ${type} file to upload`
  }

  const extension = getProjectAttachmentFileExtension(file.name)
  if (!isSupportedProjectAttachmentExtension(type, extension) || !isSupportedProjectAttachmentMimeType(type, file.type)) {
    return type === 'image'
      ? `Image attachments must use one of these formats: ${PROJECT_ATTACHMENT_ALLOWED_FORMATS.image}.`
      : `File attachments must use one of these formats: ${PROJECT_ATTACHMENT_ALLOWED_FORMATS.file}.`
  }

  const maxSize = PROJECT_ATTACHMENT_SIZE_LIMITS[type]
  if (typeof file.size === 'number' && file.size > maxSize) {
    return `${type === 'image' ? 'Image' : 'File'} attachment exceeds the ${Math.round(maxSize / 1024 / 1024)}MB size limit`
  }

  return null
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

function validateStoredProjectAttachmentUrl(
  type: Extract<ProjectAttachmentType, 'image' | 'file'>,
  urlValue: string
): string | null {
  let parsed: URL
  try {
    parsed = new URL(urlValue)
  } catch {
    return 'url must be a valid http/https URL'
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'url must be a valid http/https URL'
  }

  const pathName = decodeURIComponent(parsed.pathname).toLowerCase()
  const isHubbaStorageUrl =
    pathName.includes(`/storage/v1/object/public/${PROJECT_ATTACHMENT_BUCKET}/`) ||
    pathName.includes(`/storage/v1/object/sign/${PROJECT_ATTACHMENT_BUCKET}/`)

  if (!isHubbaStorageUrl) {
    return `${type} attachments must be uploaded to Hubba storage`
  }

  const extension = getProjectAttachmentFileExtension(pathName)
  if (!isSupportedProjectAttachmentExtension(type, extension)) {
    return type === 'image'
      ? `Image attachments must use one of these formats: ${PROJECT_ATTACHMENT_ALLOWED_FORMATS.image}.`
      : `File attachments must use one of these formats: ${PROJECT_ATTACHMENT_ALLOWED_FORMATS.file}.`
  }

  return null
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
    if (sizeBytes === null) {
      return { valid: false, error: 'image attachments require size_bytes' }
    }
    if (!isSupportedProjectAttachmentMimeType('image', mimeType)) {
      return { valid: false, error: `image attachments must use one of these formats: ${PROJECT_ATTACHMENT_ALLOWED_FORMATS.image}` }
    }
    if (sizeBytes > PROJECT_ATTACHMENT_SIZE_LIMITS.image) {
      return { valid: false, error: 'image attachment exceeds size limit' }
    }
    const urlError = validateStoredProjectAttachmentUrl('image', url)
    if (urlError) {
      return { valid: false, error: urlError }
    }
  }
  if (type === 'file') {
    if (sizeBytes === null) {
      return { valid: false, error: 'file attachments require size_bytes' }
    }
    if (!isSupportedProjectAttachmentMimeType('file', mimeType)) {
      return { valid: false, error: `file attachments must use one of these formats: ${PROJECT_ATTACHMENT_ALLOWED_FORMATS.file}` }
    }
    if (sizeBytes > PROJECT_ATTACHMENT_SIZE_LIMITS.file) {
      return { valid: false, error: 'file attachment exceeds size limit' }
    }
    const urlError = validateStoredProjectAttachmentUrl('file', url)
    if (urlError) {
      return { valid: false, error: urlError }
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

