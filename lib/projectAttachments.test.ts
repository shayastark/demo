import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isHttpUrl,
  isProjectAttachmentType,
  parseProjectAttachmentsLimit,
  parseAttachmentSizeBytes,
  sanitizeAttachmentTitle,
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
    url: 'https://example.com/asset.png',
    mime_type: 'application/pdf',
    size_bytes: 10,
  })
  assert.equal(invalidImage.valid, false)

  const invalidFile = validateProjectAttachmentInput({
    project_id: 'project-1',
    type: 'file',
    url: 'https://example.com/audio.mp3',
    mime_type: 'audio/mpeg',
    size_bytes: 10,
  })
  assert.equal(invalidFile.valid, false)
})

