'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeft, ExternalLink, Image as ImageIcon } from 'lucide-react'

type AttachmentMeta = {
  id: string
  project_id: string
  type: 'image' | 'file' | 'link'
  title: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
  viewer_path: string
  content_path: string
  href: string
}

function formatBytes(size: number | null): string {
  if (!size || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default function AttachmentViewerPage({ attachmentId }: { attachmentId: string }) {
  const searchParams = useSearchParams()
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [attachment, setAttachment] = useState<AttachmentMeta | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const returnTo = searchParams.get('from') || '/dashboard'

  useEffect(() => {
    let isCancelled = false
    let objectUrl: string | null = null

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = authenticated ? await getAccessToken() : null
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined

        const metaResponse = await fetch(`/api/project-attachments/${attachmentId}`, { headers })
        const metaResult = await metaResponse.json()
        if (!metaResponse.ok) throw new Error(metaResult.error || 'Failed to load attachment')
        const nextAttachment = metaResult.attachment as AttachmentMeta
        if (isCancelled) return
        setAttachment(nextAttachment)

        if (nextAttachment.type !== 'image') return

        const contentResponse = await fetch(nextAttachment.content_path, { headers })
        if (!contentResponse.ok) {
          const contentResult = await contentResponse.json().catch(() => ({}))
          throw new Error(contentResult.error || 'Failed to load image')
        }

        const blob = await contentResponse.blob()
        objectUrl = URL.createObjectURL(blob)
        if (isCancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setImageUrl(objectUrl)
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load attachment')
        }
      } finally {
        if (!isCancelled) setLoading(false)
      }
    }

    if (ready) {
      void load()
    }

    return () => {
      isCancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachmentId, authenticated, getAccessToken, ready])

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={returnTo}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-gray-200 transition hover:border-white/20 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          {attachment ? (
            <a
              href={imageUrl || attachment.content_path}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-neon-green/25 bg-neon-green/10 px-4 py-2 text-sm text-neon-green transition hover:border-neon-green/45"
            >
              Open full size
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-[28px] border border-white/8 bg-[#08090c] p-8 text-sm text-gray-400">
            Loading attachment...
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-white/8 bg-[#08090c] p-8 text-sm text-gray-400">
            {error}
          </div>
        ) : attachment?.type !== 'image' ? (
          <div className="rounded-[28px] border border-white/8 bg-[#08090c] p-8 text-sm text-gray-400">
            This attachment is not an image preview.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-white/8 bg-[#08090c] shadow-[0_30px_70px_rgba(0,0,0,0.32)]">
            <div className="border-b border-white/8 px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-neon-green/20 bg-neon-green/10">
                  <ImageIcon className="h-5 w-5 text-neon-green" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-white">
                    {attachment.title || 'Image attachment'}
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatBytes(attachment.size_bytes)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-center bg-black p-4 sm:p-6">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={attachment.title || 'Image attachment'}
                  className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain"
                />
              ) : (
                <div className="text-sm text-gray-500">Unable to render image.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
