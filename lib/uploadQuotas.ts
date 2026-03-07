import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { ProjectAttachmentType } from '@/lib/projectAttachments'

export const TRACKS_PER_PROJECT_LIMIT = 50
export const ATTACHMENT_COUNT_PER_PROJECT_LIMIT = 25
export const LINKS_PER_PROJECT_LIMIT = 10
export const PROJECT_AUDIO_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024
export const PROJECT_ATTACHMENT_STORAGE_LIMIT_BYTES = 150 * 1024 * 1024
export const USER_DAILY_UPLOAD_BUDGET_BYTES = 2 * 1024 * 1024 * 1024
export const MAX_UPLOAD_ATTEMPTS_PER_WINDOW = 20
export const UPLOAD_ATTEMPTS_WINDOW_MS = 10 * 60 * 1000

export type UploadAssetClass = 'audio' | 'attachment'

interface UploadQuotaEventInput {
  userId: string
  projectId: string
  assetClass: UploadAssetClass
  byteSize: number
  success: boolean
  attachmentType?: ProjectAttachmentType | null
  reason?: string | null
}

export function parseUploadSizeBytes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value < 0) return null
  return value
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function getUploadAttemptsErrorMessage(): string {
  return `Upload attempt limit reached. Please wait 10 minutes and try again.`
}

export function getUserDailyUploadBudgetErrorMessage(): string {
  return `Daily upload limit reached. You can upload up to ${formatBytes(USER_DAILY_UPLOAD_BUDGET_BYTES)} every 24 hours.`
}

export function getTracksPerProjectErrorMessage(): string {
  return `Projects can have up to ${TRACKS_PER_PROJECT_LIMIT} tracks.`
}

export function getProjectAudioStorageErrorMessage(): string {
  return `Projects can store up to ${formatBytes(PROJECT_AUDIO_STORAGE_LIMIT_BYTES)} of audio.`
}

export function getAttachmentsPerProjectErrorMessage(): string {
  return `Projects can have up to ${ATTACHMENT_COUNT_PER_PROJECT_LIMIT} attachments.`
}

export function getProjectAttachmentStorageErrorMessage(): string {
  return `Projects can store up to ${formatBytes(PROJECT_ATTACHMENT_STORAGE_LIMIT_BYTES)} of attachments.`
}

export function getLinksPerProjectErrorMessage(): string {
  return `Projects can have up to ${LINKS_PER_PROJECT_LIMIT} links.`
}

export async function getRecentUploadAttemptCount(userId: string): Promise<number> {
  const windowStart = new Date(Date.now() - UPLOAD_ATTEMPTS_WINDOW_MS).toISOString()
  const { count, error } = await supabaseAdmin
    .from('upload_quota_events')
    .select('id', { head: true, count: 'exact' })
    .eq('user_id', userId)
    .gte('created_at', windowStart)

  if (error) throw error
  return count || 0
}

export async function getUserDailyUploadedBytes(userId: string): Promise<number> {
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('upload_quota_events')
    .select('byte_size')
    .eq('user_id', userId)
    .eq('success', true)
    .gte('created_at', windowStart)

  if (error) throw error
  return (data || []).reduce((total, row) => total + (typeof row.byte_size === 'number' ? row.byte_size : 0), 0)
}

export async function getProjectTrackQuotaUsage(projectId: string): Promise<{
  count: number
  totalBytes: number
}> {
  const { data, error } = await supabaseAdmin
    .from('tracks')
    .select('size_bytes')
    .eq('project_id', projectId)

  if (error) throw error

  const rows = data || []
  return {
    count: rows.length,
    totalBytes: rows.reduce((total, row) => total + (typeof row.size_bytes === 'number' ? row.size_bytes : 0), 0),
  }
}

export async function getProjectAttachmentQuotaUsage(projectId: string): Promise<{
  count: number
  linkCount: number
  totalBytes: number
}> {
  const { data, error } = await supabaseAdmin
    .from('project_attachments')
    .select('type, size_bytes')
    .eq('project_id', projectId)

  if (error) throw error

  const rows = data || []
  return {
    count: rows.length,
    linkCount: rows.filter((row) => row.type === 'link').length,
    totalBytes: rows.reduce((total, row) => total + (typeof row.size_bytes === 'number' ? row.size_bytes : 0), 0),
  }
}

export async function recordUploadQuotaEvent(input: UploadQuotaEventInput): Promise<void> {
  const { error } = await supabaseAdmin
    .from('upload_quota_events')
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      asset_class: input.assetClass,
      byte_size: input.byteSize,
      success: input.success,
      attachment_type: input.attachmentType || null,
      reason: input.reason || null,
    })

  if (error) throw error
}
