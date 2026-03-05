'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Inbox } from 'lucide-react'
import type { ProjectAccessRole } from '@/lib/projectAccess'

interface SharedWithMeItem {
  project_id: string
  title: string
  cover_image_url: string | null
  creator_id: string
  creator_name: string
  visibility: 'public' | 'unlisted' | 'private'
  granted_at: string
  expires_at: string | null
  is_expired: boolean
  role: ProjectAccessRole
  target_path: string
}

interface SharedWithMeSectionProps {
  authenticated: boolean
  getAccessToken?: () => Promise<string | null>
}

function formatExpiryLabel(item: SharedWithMeItem): string {
  if (!item.expires_at) return 'No expiry'
  if (item.is_expired) return 'Expired'

  const expiresAtMs = new Date(item.expires_at).getTime()
  if (!Number.isFinite(expiresAtMs)) return 'No expiry'
  const remainingMs = expiresAtMs - Date.now()
  if (remainingMs <= 0) return 'Expired'
  const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000))
  if (remainingHours < 24) return `Expires in ${remainingHours}h`
  const remainingDays = Math.ceil(remainingHours / 24)
  return `Expires in ${remainingDays}d`
}

export default function SharedWithMeSection({ authenticated, getAccessToken }: SharedWithMeSectionProps) {
  const [items, setItems] = useState<SharedWithMeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [includeExpired, setIncludeExpired] = useState(false)

  const emitEvent = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('shared_with_me_event', {
        detail: {
          schema: 'shared_with_me.v1',
          source: 'dashboard',
          ...detail,
        },
      })
    )
  }

  useEffect(() => {
    const loadSharedProjects = async () => {
      if (!authenticated || !getAccessToken) return
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Not authenticated')

        const response = await fetch(
          `/api/shared-with-me?limit=20&offset=0${includeExpired ? '&include_expired=true' : ''}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load shared projects')
        const nextItems = (result.items || []) as SharedWithMeItem[]
        setItems(nextItems)

        emitEvent({ action: 'view' })
        if (nextItems.length === 0) {
          emitEvent({ action: 'empty_state' })
        }
      } catch (loadError) {
        console.error('Error loading shared-with-me list:', loadError)
        setError(loadError instanceof Error ? loadError.message : 'Failed to load shared projects')
      } finally {
        setLoading(false)
      }
    }

    loadSharedProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, includeExpired])

  return (
    <section className="mb-8 border border-gray-800/80 rounded-lg bg-gray-950/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-900 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-neon-green" />
          <h2 className="text-sm font-medium text-white tracking-wide">Shared with Me</h2>
        </div>
        <button
          type="button"
          onClick={() => setIncludeExpired((value) => !value)}
          className={`text-[11px] px-2 py-1 rounded border ${
            includeExpired ? 'border-neon-green text-neon-green' : 'border-gray-700 text-gray-400'
          }`}
        >
          {includeExpired ? 'Hide expired' : 'Show expired'}
        </button>
      </div>

      {loading ? (
        <p className="px-4 py-4 text-sm text-gray-500">Loading shared projects...</p>
      ) : error ? (
        <p className="px-4 py-4 text-sm text-gray-500">Couldn&apos;t load shared projects right now.</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500">No shared projects yet.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={`${item.project_id}-${item.granted_at}`} className="px-4 py-3 border-t border-gray-900 first:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-100 truncate">{item.title}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    by <span className="text-gray-300">{item.creator_name}</span>
                    <span className="ml-2 inline-flex rounded-full border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400">
                      {item.role}
                    </span>
                    <span className="ml-2 inline-flex rounded-full border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400">
                      {formatExpiryLabel(item)}
                    </span>
                  </p>
                </div>
                <Link
                  href={item.target_path}
                  onClick={() =>
                    emitEvent({
                      action: 'open_project',
                      project_id: item.project_id,
                      role: item.role,
                      is_expired: item.is_expired,
                    })
                  }
                  className="text-xs px-2.5 py-1 rounded-md border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600"
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
