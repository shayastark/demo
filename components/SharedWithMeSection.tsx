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
    <section className="ui-card mb-8 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-gray-800/90 px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-neon-green" />
          <h2 className="text-sm font-semibold text-white tracking-wide">Shared with Me</h2>
        </div>
        <button
          type="button"
          onClick={() => setIncludeExpired((value) => !value)}
          className={`ui-pressable rounded-md border px-2.5 py-1.5 text-[11px] font-medium ${
            includeExpired ? 'border-neon-green text-neon-green' : 'border-gray-700 text-gray-300'
          }`}
        >
          {includeExpired ? 'Hide expired' : 'Show expired'}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2 px-4 py-4 sm:px-5">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="animate-pulse rounded-lg border border-gray-800/80 bg-black/20 p-3">
              <div className="mb-2 h-3 w-1/2 rounded bg-gray-800/90" />
              <div className="h-3 w-3/4 rounded bg-gray-800/75" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="px-4 py-4 text-sm text-gray-500">Couldn&apos;t load shared projects right now.</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500">No shared projects yet.</p>
      ) : (
        <ul className="divide-y divide-gray-900/90">
          {items.map((item) => (
            <li key={`${item.project_id}-${item.granted_at}`} className="px-4 py-3.5 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-100">{item.title}</p>
                  <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">
                    by <span className="text-gray-200">{item.creator_name}</span>
                    <span className="ui-chip ml-2 border-gray-700 text-gray-300">
                      {item.role}
                    </span>
                    <span className="ui-chip ml-2 border-gray-700 text-gray-300">
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
                  aria-label={`Open ${item.title}`}
                  className="ui-pressable mt-0.5 shrink-0 rounded-md border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:border-gray-500 hover:text-white focus-visible:border-neon-green"
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
