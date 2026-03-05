'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2, UserPlus } from 'lucide-react'
import { showToast } from '@/components/Toast'

interface CreatorRecommendationItem {
  creator_id: string
  username: string | null
  display_name: string
  avatar_url: string | null
  short_reason: string
  reason_code: 'active_week' | 'popular_week' | 'new_public_project'
  follower_count: number
  profile_path: string
}

interface WhoToFollowSectionProps {
  authenticated: boolean
  getAccessToken?: () => Promise<string | null>
}

export default function WhoToFollowSection({ authenticated, getAccessToken }: WhoToFollowSectionProps) {
  const [items, setItems] = useState<CreatorRecommendationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [followLoadingId, setFollowLoadingId] = useState<string | null>(null)

  const emitEvent = (
    action: 'view' | 'follow_click' | 'follow_success' | 'dismiss',
    detail?: Record<string, unknown>
  ) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('creator_recommendation_event', {
        detail: {
          schema: 'creator_recommendation.v1',
          source: 'dashboard',
          action,
          ...detail,
        },
      })
    )
  }

  useEffect(() => {
    const load = async () => {
      if (!authenticated || !getAccessToken) return
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Not authenticated')

        const response = await fetch('/api/recommendations/creators?limit=5', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load recommendations')

        const nextItems = (result.items || []) as CreatorRecommendationItem[]
        setItems(nextItems)
        emitEvent('view')
      } catch (loadError) {
        console.error('Error loading creator recommendations:', loadError)
        setError(loadError instanceof Error ? loadError.message : 'Failed to load recommendations')
      } finally {
        setLoading(false)
      }
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const handleFollow = async (item: CreatorRecommendationItem, index: number) => {
    if (!authenticated || !getAccessToken || followLoadingId) return
    setFollowLoadingId(item.creator_id)
    emitEvent('follow_click', {
      creator_id: item.creator_id,
      reason_code: item.reason_code,
      position_index: index,
    })

    const previousItems = items
    setItems((prev) => prev.filter((row) => row.creator_id !== item.creator_id))

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch('/api/follows', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ following_id: item.creator_id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to follow creator')

      emitEvent('follow_success', {
        creator_id: item.creator_id,
        reason_code: item.reason_code,
        position_index: index,
      })
    } catch (followError) {
      console.error('Error following recommended creator:', followError)
      setItems(previousItems)
      showToast(followError instanceof Error ? followError.message : 'Failed to follow creator', 'error')
    } finally {
      setFollowLoadingId(null)
    }
  }

  return (
    <section className="mb-8 border border-gray-800/80 rounded-lg bg-gray-950/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-900">
        <h2 className="text-sm font-medium text-white tracking-wide">Who to follow</h2>
      </div>

      {loading ? (
        <p className="px-4 py-4 text-sm text-gray-500">Loading recommendations...</p>
      ) : error ? (
        <p className="px-4 py-4 text-sm text-gray-500">Couldn&apos;t load recommendations right now.</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500">No recommendations right now.</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={item.creator_id} className="px-4 py-3 border-t border-gray-900 first:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <Link href={item.profile_path} className="min-w-0 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-800 flex items-center justify-center text-neon-green font-semibold">
                    {item.avatar_url ? (
                      <Image
                        src={item.avatar_url}
                        alt={item.display_name}
                        width={36}
                        height={36}
                        className="object-cover w-9 h-9"
                      />
                    ) : (
                      item.display_name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{item.display_name}</p>
                    <p className="text-xs text-gray-500">
                      {item.short_reason}
                      {item.follower_count > 0 ? ` • ${item.follower_count} followers` : ''}
                    </p>
                  </div>
                </Link>

                <button
                  type="button"
                  disabled={followLoadingId === item.creator_id}
                  onClick={() => handleFollow(item, index)}
                  className="text-xs px-2.5 py-1.5 rounded-md border border-neon-green text-neon-green inline-flex items-center gap-1 disabled:opacity-70"
                >
                  {followLoadingId === item.creator_id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <UserPlus className="w-3 h-3" />
                  )}
                  Follow
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
