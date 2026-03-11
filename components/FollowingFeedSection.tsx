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
    <section className="ui-card mb-8 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-800/90 px-4 py-3.5 sm:px-5">
        <Radio className="w-4 h-4 text-neon-green" />
        <h2 className="text-sm font-semibold text-white tracking-wide">Following Feed</h2>
      </div>

      {loading ? (
        <div className="space-y-2 px-4 py-4 sm:px-5">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="animate-pulse rounded-lg border border-gray-800/80 bg-black/20 p-3">
              <div className="mb-2 h-3 w-1/2 rounded bg-gray-800/90" />
              <div className="mb-1.5 h-3 w-full rounded bg-gray-800/80" />
              <div className="h-3 w-2/3 rounded bg-gray-800/70" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="px-4 py-4 text-sm text-gray-500">Your feed is taking a moment — check back shortly!</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500">Follow creators you love and their latest updates will appear here.</p>
      ) : (
        <ul className="divide-y divide-gray-900/90">
          {items.map((item) => (
            <li key={item.update_id} className="px-4 py-3.5 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    <span className="font-medium text-gray-100">{item.creator_name}</span> on{' '}
                    <span className="font-medium text-gray-200">{item.project_title}</span>
                    {item.version_label ? (
                      <span className="ml-2 inline-flex rounded-full border border-gray-700 px-2 py-0.5 text-[10px] text-gray-300">
                        {item.version_label}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1.5 text-sm text-gray-100 line-clamp-2">{item.content}</p>
                  <p className="mt-1.5 text-[11px] text-gray-500">{formatRelativeTime(item.created_at)}</p>
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
                  aria-label={`Open ${item.project_title} update`}
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

