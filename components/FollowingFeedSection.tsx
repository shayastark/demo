'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Radio } from 'lucide-react'
import type { FollowingFeedItem } from '@/lib/followingFeed'

interface FollowingFeedSectionProps {
  authenticated: boolean
  getAccessToken?: () => Promise<string | null>
}

function formatRelativeTime(isoDate: string): string {
  const ts = new Date(isoDate).getTime()
  if (!Number.isFinite(ts)) return ''
  const diff = Date.now() - ts
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return 'just now'
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  return `${Math.floor(diff / day)}d ago`
}

export default function FollowingFeedSection({ authenticated, getAccessToken }: FollowingFeedSectionProps) {
  const [items, setItems] = useState<FollowingFeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emitEvent = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('following_feed_event', {
        detail: {
          schema: 'following_feed.v1',
          source: 'dashboard',
          ...detail,
        },
      })
    )
  }

  useEffect(() => {
    const loadFeed = async () => {
      if (!authenticated || !getAccessToken) return
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Not authenticated')

        const response = await fetch('/api/feed?limit=20', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load following feed')
        const nextItems = (result.items || []) as FollowingFeedItem[]
        setItems(nextItems)

        emitEvent({ action: 'view' })
        if (nextItems.length === 0) {
          emitEvent({ action: 'empty_state' })
        }
      } catch (loadError) {
        console.error('Error loading following feed:', loadError)
        setError(loadError instanceof Error ? loadError.message : 'Failed to load following feed')
      } finally {
        setLoading(false)
      }
    }

    loadFeed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  return (
    <section className="mb-8 border border-gray-800/80 rounded-lg bg-gray-950/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-900 flex items-center gap-2">
        <Radio className="w-4 h-4 text-neon-green" />
        <h2 className="text-sm font-medium text-white tracking-wide">Following Feed</h2>
      </div>

      {loading ? (
        <p className="px-4 py-4 text-sm text-gray-500">Loading feed...</p>
      ) : error ? (
        <p className="px-4 py-4 text-sm text-gray-500">Couldn&apos;t load feed right now.</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500">Follow creators to see updates here.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.update_id} className="px-4 py-3 border-t border-gray-900 first:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">
                    <span className="text-gray-200">{item.creator_name}</span> on{' '}
                    <span className="text-gray-200">{item.project_title}</span>
                    {item.version_label ? (
                      <span className="ml-2 inline-flex rounded-full border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400">
                        {item.version_label}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-gray-100 mt-1 line-clamp-2">{item.content}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{formatRelativeTime(item.created_at)}</p>
                </div>
                <Link
                  href={item.target_path}
                  onClick={() =>
                    emitEvent({
                      action: 'click',
                      project_id: item.project_id,
                      creator_id: item.creator_id,
                      update_id: item.update_id,
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

