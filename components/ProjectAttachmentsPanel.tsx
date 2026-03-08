'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { File, Image as ImageIcon, Link as LinkIcon, Paperclip, Trash2, Upload } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import type { ProjectAttachmentType } from '@/lib/projectAttachments'
import {
  PROJECT_ATTACHMENT_ACCEPT,
  PROJECT_ATTACHMENT_ALLOWED_FORMATS,
  PROJECT_ATTACHMENT_SIZE_LIMITS,
  getProjectAttachmentUploadContentType,
  getProjectAttachmentValidationError,
} from '@/lib/projectAttachments'

interface ProjectAttachment {
  id: string
  project_id: string
  user_id: string
  type: ProjectAttachmentType
  title: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
  host_label?: string | null
  href: string
  viewer_path?: string | null
  content_path?: string | null
  can_delete?: boolean
}

interface ProjectAttachmentsPanelProps {
  projectId: string
  authenticated: boolean
  getAccessToken: () => Promise<string | null>
  onRequireAuth?: () => void
  source: 'project_detail' | 'shared_project'
}

function formatBytes(size: number | null): string {
  if (!size || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[:,/\\?*|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function ProjectAttachmentsPanel({
  projectId,
  authenticated,
  getAccessToken,
  onRequireAuth,
  source,
}: ProjectAttachmentsPanelProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [type, setType] = useState<ProjectAttachmentType>('link')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [imagePreviewUrls, setImagePreviewUrls] = useState<Record<string, string>>({})
  const previewObjectUrlsRef = useRef<string[]>([])

  const emitEvent = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('project_attachment_event', {
        detail: {
          schema: 'project_attachment.v1',
          source,
          project_id: projectId,
          ...detail,
        },
      })
    )
  }

  const currentPath =
    pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '')

  const loadAttachments = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = authenticated ? await getAccessToken() : null
      const response = await fetch(
        `/api/project-attachments?project_id=${encodeURIComponent(projectId)}&limit=20`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to load attachments')
      setAttachments((result.attachments || []) as ProjectAttachment[])
      setCanManage(!!result.can_manage)
    } catch (loadError) {
      console.error('Error loading project attachments:', loadError)
      setError('Unable to load attachments right now.')
      setAttachments([])
      setCanManage(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAttachments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, authenticated])

  useEffect(() => {
    let isCancelled = false

    const revokeExistingPreviews = () => {
      previewObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      previewObjectUrlsRef.current = []
    }

    const loadPreviews = async () => {
      const imageAttachments = attachments.filter((attachment) => attachment.type === 'image')
      if (imageAttachments.length === 0) {
        revokeExistingPreviews()
        setImagePreviewUrls({})
        return
      }

      revokeExistingPreviews()
      const nextPreviewUrls: Record<string, string> = {}
      try {
        const token = authenticated ? await getAccessToken() : null
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined

        for (const attachment of imageAttachments) {
          if (!attachment.content_path) continue
          const response = await fetch(attachment.content_path, { headers })
          if (!response.ok) continue
          const blob = await response.blob()
          const objectUrl = URL.createObjectURL(blob)
          previewObjectUrlsRef.current.push(objectUrl)
          nextPreviewUrls[attachment.id] = objectUrl
        }
      } catch (error) {
        console.error('Error loading attachment previews:', error)
      }

      if (!isCancelled) {
        setImagePreviewUrls(nextPreviewUrls)
      }
    }

    void loadPreviews()

    return () => {
      isCancelled = true
      revokeExistingPreviews()
    }
  // Intentionally exclude getAccessToken identity to avoid revoking
  // object URLs on unrelated rerenders from provider hook churn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments, authenticated])

  const selectedFileType = useMemo<ProjectAttachmentType>(() => {
    if (type === 'image') return 'image'
    if (type === 'file') return 'file'
    return 'link'
  }, [type])

  const uploadToStorage = async (uploadFile: File): Promise<string> => {
    const sanitizedName = sanitizeFileName(uploadFile.name)
    const storagePath = `attachments/${projectId}/${Date.now()}-${sanitizedName}`
    const { data, error: uploadError } = await supabase.storage
      .from('hubba-files')
      .upload(storagePath, uploadFile, {
        contentType: getProjectAttachmentUploadContentType(uploadFile),
        upsert: false,
      })

    if (uploadError || !data) {
      throw new Error(uploadError?.message || 'Failed to upload file')
    }

    const { data: publicData } = supabase.storage.from('hubba-files').getPublicUrl(data.path)
    return publicData.publicUrl
  }

  const createAttachment = async () => {
    if (!authenticated) {
      onRequireAuth?.()
      return
    }
    if (!canManage) {
      showToast('You need contributor access to add attachments', 'error')
      return
    }

    setSubmitting(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      let payloadUrl = url.trim()
      let payloadMimeType: string | null = null
      let payloadSize: number | null = null
      let attachmentType = selectedFileType

      if (attachmentType !== 'link') {
        if (!file) throw new Error('Select a file to upload')
        const validationError = getProjectAttachmentValidationError(attachmentType, file)
        if (validationError) {
          throw new Error(validationError)
        }

        payloadUrl = await uploadToStorage(file)
        payloadMimeType = file.type || null
        payloadSize = file.size || null
      }

      const response = await fetch('/api/project-attachments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          type: attachmentType,
          title: title.trim() || null,
          url: payloadUrl,
          mime_type: payloadMimeType,
          size_bytes: payloadSize,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to create attachment')

      emitEvent({
        action: 'upload',
        attachment_id: result.attachment?.id || null,
        attachment_type: attachmentType,
      })
      setTitle('')
      setUrl('')
      setFile(null)
      await loadAttachments()
      showToast('Attachment added', 'success')
    } catch (createError) {
      console.error('Error creating attachment:', createError)
      showToast(createError instanceof Error ? createError.message : 'Failed to add attachment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const deleteAttachment = async (attachment: ProjectAttachment) => {
    if (!authenticated) {
      onRequireAuth?.()
      return
    }
    if (!attachment.can_delete) return
    setDeletingId(attachment.id)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch(`/api/project-attachments?id=${attachment.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to delete attachment')

      emitEvent({
        action: 'delete',
        attachment_id: attachment.id,
        attachment_type: attachment.type,
      })
      await loadAttachments()
      showToast('Attachment deleted', 'success')
    } catch (deleteError) {
      console.error('Error deleting attachment:', deleteError)
      showToast(deleteError instanceof Error ? deleteError.message : 'Failed to delete attachment', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="ui-card mt-6 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-900 px-3 py-3 sm:px-4">
        <Paperclip className="w-4 h-4 text-neon-green" />
        <h3 className="text-sm font-semibold text-white tracking-wide">Attachments</h3>
        <span className="text-xs text-gray-400">{attachments.length}</span>
      </div>

      {canManage && (
        <div className="border-b border-gray-900 px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={type}
                onChange={(event) => {
                  setType(event.target.value as ProjectAttachmentType)
                  setFile(null)
                }}
                aria-label="Attachment type"
                className="rounded-lg border border-gray-800 bg-black px-2 py-2 text-xs text-white"
              >
                <option value="link">Link</option>
                <option value="image">Image</option>
                <option value="file">File</option>
              </select>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder="Title (optional)"
                className="flex-1 rounded-lg border border-gray-800 bg-black px-2.5 py-2 text-xs text-white placeholder:text-gray-500"
              />
            </div>

            {type === 'link' ? (
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-gray-800 bg-black px-2.5 py-2 text-xs text-white placeholder:text-gray-500"
              />
            ) : (
              <>
                <input
                  type="file"
                  accept={type === 'image' ? PROJECT_ATTACHMENT_ACCEPT.image : PROJECT_ATTACHMENT_ACCEPT.file}
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-300"
                />
                <p className="text-[11px] text-gray-500">
                  {type === 'image' ? PROJECT_ATTACHMENT_ALLOWED_FORMATS.image : PROJECT_ATTACHMENT_ALLOWED_FORMATS.file}
                  {' '}up to {Math.round((type === 'image' ? PROJECT_ATTACHMENT_SIZE_LIMITS.image : PROJECT_ATTACHMENT_SIZE_LIMITS.file) / 1024 / 1024)}MB.
                </p>
              </>
            )}

            <button
              type="button"
              onClick={createAttachment}
              disabled={submitting || (type === 'link' ? !url.trim() : !file)}
              className="ui-pressable inline-flex self-end items-center gap-1.5 rounded-lg bg-neon-green px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              {submitting ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto">
        {loading ? (
          <p className="px-3 sm:px-4 py-3 text-sm text-gray-500">Loading attachments...</p>
        ) : error ? (
          <p className="px-3 sm:px-4 py-3 text-sm text-gray-500">{error}</p>
        ) : attachments.length === 0 ? (
          <p className="px-3 sm:px-4 py-3 text-sm text-gray-500">No attachments yet.</p>
        ) : (
          <ul>
            {attachments.map((attachment) => (
              <li key={attachment.id} className="border-t border-gray-900 px-3 py-3.5 sm:px-4">
                <div className="flex items-center justify-between gap-3">
                  <a
                    href={
                      attachment.type === 'image' && attachment.viewer_path
                        ? `${attachment.viewer_path}?from=${encodeURIComponent(currentPath)}`
                        : attachment.href
                    }
                    target={attachment.type === 'image' || attachment.type === 'file' ? '_blank' : undefined}
                    rel={attachment.type === 'image' || attachment.type === 'file' ? 'noopener noreferrer' : undefined}
                    onClick={() =>
                      emitEvent({
                        action: 'open',
                        attachment_id: attachment.id,
                        attachment_type: attachment.type,
                      })
                    }
                    className="min-w-0 flex items-center gap-3 hover:opacity-90"
                  >
                    {attachment.type === 'image' ? (
                      <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-white/8 bg-gray-950 shadow-[0_8px_20px_rgba(0,0,0,0.25)]">
                        {imagePreviewUrls[attachment.id] ? (
                          <img
                            src={imagePreviewUrls[attachment.id]}
                            alt={attachment.title || 'Image attachment'}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageIcon className="h-5 w-5 text-neon-green" />
                          </div>
                        )}
                      </div>
                    ) : attachment.type === 'file' ? (
                      <File className="w-4 h-4 text-neon-green" />
                    ) : (
                      <LinkIcon className="w-4 h-4 text-neon-green" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {attachment.title ||
                          (attachment.type === 'image'
                            ? 'Image attachment'
                            : attachment.type === 'file'
                              ? 'File attachment'
                              : 'Link attachment')}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {attachment.type === 'link'
                          ? 'External link'
                          : attachment.type === 'image'
                            ? 'View larger image'
                            : 'Open attachment'}
                        {attachment.size_bytes ? ` • ${formatBytes(attachment.size_bytes)}` : ''}
                      </p>
                      {attachment.type === 'link' ? (
                        <p className="text-[11px] text-gray-600">{attachment.host_label || 'External link'}</p>
                      ) : null}
                    </div>
                  </a>

                  {attachment.can_delete ? (
                    <button
                      type="button"
                      onClick={() => deleteAttachment(attachment)}
                      disabled={deletingId === attachment.id}
                      className="ui-pressable rounded-md p-1 text-gray-500 hover:bg-gray-800 hover:text-red-400 disabled:opacity-50"
                      aria-label="Delete attachment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

