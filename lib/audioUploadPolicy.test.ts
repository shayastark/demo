import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUDIO_FILE_ACCEPT,
  getAudioFileExtension,
  getAudioFileValidationError,
  getAudioUploadContentType,
  isSupportedAudioFile,
  validateStoredAudioUrl,
} from './audioUploadPolicy'

test('audio accept list excludes flac and ogg', () => {
  assert.equal(AUDIO_FILE_ACCEPT.includes('.mp3'), true)
  assert.equal(AUDIO_FILE_ACCEPT.includes('.aac'), true)
  assert.equal(AUDIO_FILE_ACCEPT.includes('.flac'), false)
  assert.equal(AUDIO_FILE_ACCEPT.includes('.ogg'), false)
})

test('supported audio files require allowed extension and mime', () => {
  assert.equal(isSupportedAudioFile({ name: 'demo.mp3', type: 'audio/mpeg' }), true)
  assert.equal(isSupportedAudioFile({ name: 'memo.m4a', type: 'audio/mp4' }), true)
  assert.equal(isSupportedAudioFile({ name: 'mix.wav', type: '' }), true)
  assert.equal(isSupportedAudioFile({ name: 'lossless.flac', type: 'audio/flac' }), false)
  assert.equal(isSupportedAudioFile({ name: 'voice.ogg', type: 'audio/ogg' }), false)
  assert.equal(isSupportedAudioFile({ name: 'track.mp3', type: 'audio/ogg' }), false)
})

test('audio file validation enforces size and format', () => {
  const valid = getAudioFileValidationError({
    name: 'track.aac',
    type: 'audio/aac',
    size: 1024,
  })
  assert.equal(valid, null)

  const invalidFormat = getAudioFileValidationError({
    name: 'track.flac',
    type: 'audio/flac',
    size: 1024,
  })
  assert.match(invalidFormat || '', /MP3, WAV, M4A, AAC/)

  const invalidSize = getAudioFileValidationError({
    name: 'track.mp3',
    type: 'audio/mpeg',
    size: 101 * 1024 * 1024,
  })
  assert.match(invalidSize || '', /Maximum size is 100MB/)
})

test('audio content type is derived from extension', () => {
  assert.equal(getAudioUploadContentType({ name: 'song.mp3', type: '' }), 'audio/mpeg')
  assert.equal(getAudioUploadContentType({ name: 'song.wav', type: 'audio/wave' }), 'audio/wav')
})

test('stored audio urls must point to supported files in Hubba storage', () => {
  assert.equal(
    validateStoredAudioUrl('https://example.supabase.co/storage/v1/object/public/hubba-files/projects/1/song.mp3'),
    null
  )
  assert.match(
    validateStoredAudioUrl('https://example.supabase.co/storage/v1/object/public/hubba-files/projects/1/song.flac') || '',
    /MP3, WAV, M4A, AAC/
  )
  assert.match(
    validateStoredAudioUrl('https://cdn.example.com/song.mp3') || '',
    /Hubba storage/
  )
})

test('audio file extension ignores query strings', () => {
  assert.equal(getAudioFileExtension('song.m4a?download=1'), 'm4a')
})
