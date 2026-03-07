export const AUDIO_UPLOAD_BUCKET = 'hubba-files'
export const SUPPORTED_AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac'] as const
export const SUPPORTED_AUDIO_LABEL = 'MP3, WAV, M4A, AAC'
export const MAX_AUDIO_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024

const AUDIO_MIME_TYPES_BY_EXTENSION: Record<(typeof SUPPORTED_AUDIO_EXTENSIONS)[number], string[]> = {
  mp3: ['audio/mpeg', 'audio/mp3'],
  wav: ['audio/wav', 'audio/wave', 'audio/x-wav'],
  m4a: ['audio/mp4', 'audio/x-m4a'],
  aac: ['audio/aac'],
}

const SUPPORTED_AUDIO_MIME_TYPES = new Set(
  Object.values(AUDIO_MIME_TYPES_BY_EXTENSION).flat().map((mimeType) => mimeType.toLowerCase())
)

export const AUDIO_FILE_ACCEPT = [
  ...SUPPORTED_AUDIO_MIME_TYPES,
  ...SUPPORTED_AUDIO_EXTENSIONS.map((extension) => `.${extension}`),
].join(',')

function getNormalizedMimeType(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function getAudioFileExtension(fileName: string): string | null {
  const baseName = fileName.split(/[?#]/, 1)[0] || ''
  const extension = baseName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return extension || null
}

export function isSupportedAudioExtension(extension: string | null | undefined): boolean {
  return !!extension && (SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(extension.toLowerCase())
}

export function isSupportedAudioMimeType(value: string | null | undefined): boolean {
  const mimeType = getNormalizedMimeType(value)
  if (!mimeType || mimeType === 'application/octet-stream') {
    return true
  }
  return SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)
}

export function isSupportedAudioFile(file: { name: string; type?: string | null }): boolean {
  const extension = getAudioFileExtension(file.name)
  return isSupportedAudioExtension(extension) && isSupportedAudioMimeType(file.type)
}

export function getAudioUploadContentType(file: { name: string; type?: string | null }): string | undefined {
  const extension = getAudioFileExtension(file.name)
  if (isSupportedAudioExtension(extension)) {
    return AUDIO_MIME_TYPES_BY_EXTENSION[extension as keyof typeof AUDIO_MIME_TYPES_BY_EXTENSION][0]
  }

  const mimeType = getNormalizedMimeType(file.type)
  return mimeType || undefined
}

export function getAudioFileValidationError(file: { name: string; type?: string | null; size?: number } | null | undefined): string | null {
  if (!file) return 'Select an audio file to upload.'
  if (!isSupportedAudioFile(file)) {
    return `Please upload an audio file in one of these formats: ${SUPPORTED_AUDIO_LABEL}.`
  }
  if (typeof file.size === 'number' && file.size > MAX_AUDIO_UPLOAD_SIZE_BYTES) {
    const maxSizeMb = Math.round(MAX_AUDIO_UPLOAD_SIZE_BYTES / 1024 / 1024)
    return `"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${maxSizeMb}MB.`
  }
  return null
}

export function validateStoredAudioUrl(urlValue: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(urlValue)
  } catch {
    return 'Audio URL must be a valid URL'
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Audio URL must use http or https'
  }

  const pathName = decodeURIComponent(parsed.pathname).toLowerCase()
  const isHubbaStorageUrl =
    pathName.includes(`/storage/v1/object/public/${AUDIO_UPLOAD_BUCKET}/`) ||
    pathName.includes(`/storage/v1/object/sign/${AUDIO_UPLOAD_BUCKET}/`)

  if (!isHubbaStorageUrl) {
    return 'Audio files must be uploaded to Hubba storage'
  }

  const extension = getAudioFileExtension(pathName)
  if (!isSupportedAudioExtension(extension)) {
    return `Audio files must use one of these formats: ${SUPPORTED_AUDIO_LABEL}.`
  }

  return null
}
