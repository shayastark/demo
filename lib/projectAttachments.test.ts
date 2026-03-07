import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROJECT_ATTACHMENT_ACCEPT,
  isHttpUrl,
  isProjectAttachmentType,
  parseProjectAttachmentsLimit,
  parseAttachmentSizeBytes,
  sanitizeAttachmentTitle,
  getProjectAttachmentFileExtension,
  getProjectAttachmentUploadContentType,
  getProjectAttachmentValidationError,
  validateProjectAttachmentInput,
} from './projectAttachments'

test('isProjectAttachmentType validates supported types', () => {
  assert.equal(isProjectAttachmentType('image'), true)
  assert.equal(isProjectAttachmentType('file'), true)
  assert.equal(isProjectAttachmentType('link'), true)
  assert.equal(isProjectAttachmentType('video'), false)
})

test('sanitizeAttachmentTitle trims and bounds values', () => {
  assert.equal(sanitizeAttachmentTitle('  Lyrics v2  '), 'Lyrics v2')
  assert.equal(sanitizeAttachmentTitle(''), null)
  assert.equal(sanitizeAttachmentTitle(null), null)
})

test('isHttpUrl accepts only http/https protocols', () => {
  assert.equal(isHttpUrl('https://demo.supply'), true)
  assert.equal(isHttpUrl('http://example.com'), true)
  assert.equal(isHttpUrl('ftp://example.com'), false)
  assert.equal(isHttpUrl('not a url'), false)
})

test('parseAttachmentSizeBytes handles optional non-negative integers', () => {
  assert.equal(parseAttachmentSizeBytes(null), null)
  assert.equal(parseAttachmentSizeBytes(123), 123)
  assert.equal(parseAttachmentSizeBytes(-1), null)
  assert.equal(parseAttachmentSizeBytes(1.2), null)
})

test('parseProjectAttachmentsLimit validates strict bounds', () => {
  assert.equal(parseProjectAttachmentsLimit(null), 20)
  assert.equal(parseProjectAttachmentsLimit('5'), 5)
  assert.equal(parseProjectAttachmentsLimit('0'), null)
  assert.equal(parseProjectAttachmentsLimit('21'), null)
  assert.equal(parseProjectAttachmentsLimit('abc'), null)
})

test('validateProjectAttachmentInput returns parsed payload', () => {
  const result = validateProjectAttachmentInput({
    project_id: 'project-1',
    type: 'link',
    title: '  Reference ',
    url: 'https://example.com',
    mime_type: null,
    size_bytes: null,
  })
  assert.equal(result.valid, true)
  assert.equal(result.parsed?.title, 'Reference')
  assert.equal(result.parsed?.type, 'link')

  const invalid = validateProjectAttachmentInput({
    project_id: 'project-1',
    type: 'invalid',
    url: 'https://example.com',
  })
  assert.equal(invalid.valid, false)
})

test('validateProjectAttachmentInput enforces image/file constraints', () => {
  const invalidImage = validateProjectAttachmentInput({
    project_id: 'project-1',
    type: 'image',
    url: 'https://example.supabase.co/storage/v1/object/public/hubba-files/attachments/project-1/asset.png',
    mime_type: 'application/pdf',
    size_bytes: 10,
  })
  assert.equal(invalidImage.valid, false)

  const invalidFile = validateProjectAttachmentInput({
    project_id: 'project-1',
    type: 'file',
    url: 'https://example.supabase.co/storage/v1/object/public/hubba-files/attachments/project-1/audio.mp3',
    mime_type: 'audio/mpeg',
    size_bytes: 10,
  })
  assert.equal(invalidFile.valid, false)
})

test('attachment accept lists use strict image and file allowlists', () => {
  assert.equal(PROJECT_ATTACHMENT_ACCEPT.image.includes('.png'), true)
  assert.equal(PROJECT_ATTACHMENT_ACCEPT.image.includes('.svg'), false)
  assert.equal(PROJECT_ATTACHMENT_ACCEPT.file.includes('.pdf'), true)
  assert.equal(PROJECT_ATTACHMENT_ACCEPT.file.includes('.zip'), false)
})

test('attachment validation enforces supported formats and size', () => {
  assert.equal(
    getProjectAttachmentValidationError('image', { name: 'cover.webp', type: 'image/webp', size: 10 }),
    null
  )
  assert.match(
    getProjectAttachmentValidationError('image', { name: 'cover.svg', type: 'image/svg+xml', size: 10 }) || '',
    /JPG, JPEG, PNG, WEBP, GIF/
  )
  assert.equal(
    getProjectAttachmentValidationError('file', { name: 'brief.pdf', type: 'application/pdf', size: 10 }),
    null
  )
  assert.match(
    getProjectAttachmentValidationError('file', { name: 'archive.zip', type: 'application/zip', size: 10 }) || '',
    /PDF, TXT, DOCX, CSV/
  )
  assert.match(
    getProjectAttachmentValidationError('file', { name: 'brief.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 }) || '',
    /20MB size limit/
  )
})

test('file and image attachments require size_bytes in API payloads', () => {
  const missingImageSize = validateProjectAttachmentInput({
    project_id: 'project-1',
    type: 'image',
    url: 'https://example.supabase.co/storage/v1/object/public/hubba-files/attachments/project-1/asset.png',
    mime_type: 'image/png',
  })
  assert.equal(missingImageSize.valid, false)

  const missingFileSize = validateProjectAttachmentInput({
    project_id: 'project-1',
    type: 'file',
    url: 'https://example.supabase.co/storage/v1/object/public/hubba-files/attachments/project-1/brief.pdf',
    mime_type: 'application/pdf',
  })
  assert.equal(missingFileSize.valid, false)
})

test('attachment validation requires uploaded files to stay in Hubba storage', () => {
  const validImage = validateProjectAttachmentInput({
    project_id: 'project-1',
    type: 'image',
    url: 'https://example.supabase.co/storage/v1/object/public/hubba-files/attachments/project-1/asset.png',
    mime_type: 'image/png',
    size_bytes: 10,
  })
  assert.equal(validImage.valid, true)

  const invalidExternalFile = validateProjectAttachmentInput({
    project_id: 'project-1',
    type: 'file',
    url: 'https://cdn.example.com/brief.pdf',
    mime_type: 'application/pdf',
    size_bytes: 10,
  })
  assert.equal(invalidExternalFile.valid, false)
})

test('attachment helpers derive extension and upload content type', () => {
  assert.equal(getProjectAttachmentFileExtension('brief.docx?download=1'), 'docx')
  assert.equal(getProjectAttachmentUploadContentType({ name: 'cover.jpeg', type: '' }), 'image/jpeg')
  assert.equal(
    getProjectAttachmentUploadContentType({ name: 'brief.pdf', type: 'application/octet-stream' }),
    'application/pdf'
  )
})

