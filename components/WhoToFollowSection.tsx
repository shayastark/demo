'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2, UserPlus } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { type DiscoveryReasonCode } from '@/lib/discoveryPreferences'
import { buildDiscoveryImpactEventFields } from '@/lib/discoveryImpactMetrics'

interface CreatorRecommendationItem {
  creator_id: string
  username: string | null
  display_name: string
  avatar_url: string | null
  short_reason: string
  reason_code: 'active_week' | 'popular_week' | 'new_public_project'
  follower_count: number
  preference_seed_boost?: number
  profile_path: string
}

interface WhoToFollowSectionProps {
  authenticated: boolean
  getAccessToken?: () => Promise<string | null>
}

const REASON_CHIPS: Array<{ code: DiscoveryReasonCode; label: string }> = [
  { code: 'not_my_style', label: 'Style' },
  { code: 'already_seen', label: 'Seen' },
  { code: 'other', label: 'Other' },
]

export default function WhoToFollowSection({ authenticated, getAccessToken }: WhoToFollowSectionProps) {
  const [items, setItems] = useState<CreatorRecommendationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [followLoadingId, setFollowLoadingId] = useState<string | null>(null)
  const [preferenceLoadingId, setPreferenceLoadingId] = useState<string | null>(null)
  const [lastHidden, setLastHidden] = useState<{ item: CreatorRecommendationItem; positionIndex: number } | null>(null)
  const trackedImpressionKeysRef = useRef<Set<string>>(new Set())

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

  const emitDiscoveryPreferenceEvent = (
    action: 'hide_project' | 'hide_creator' | 'undo_hide',
    detail: { target_type: 'project' | 'creator'; target_id: string; position_index: number }
  ) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('discovery_preference_event', {
        detail: {
          schema: 'discovery_preference.v1',
          source: 'who_to_follow',
          action,
          ...detail,
        },
      })
    )
  }

  const emitDiscoveryFeedbackEvent = (
    action: 'hide_with_reason' | 'hide_without_reason' | 'reason_selected',
    detail: {
      target_type: 'project' | 'creator'
      target_id: string
      reason_code: DiscoveryReasonCode | null
    }
  ) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('discovery_feedback_event', {
        detail: {
          schema: 'discovery_feedback.v1',
          source: 'who_to_follow',
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

  useEffect(() => {
    items.forEach((item, index) => {
      const key = `${item.creator_id}:${index}`
      if (trackedImpressionKeysRef.current.has(key)) return
      trackedImpressionKeysRef.current.add(key)
      const impact = buildDiscoveryImpactEventFields({
        preferenceSeedBoost: item.preference_seed_boost,
        sortMode: 'recommendation_default',
        positionIndex: index,
      })
      emitEvent('view', {
        creator_id: item.creator_id,
        ...impact,
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const handleFollow = async (item: CreatorRecommendationItem, index: number) => {
    if (!authenticated || !getAccessToken || followLoadingId) return
    setFollowLoadingId(item.creator_id)
    const impact = buildDiscoveryImpactEventFields({
      preferenceSeedBoost: item.preference_seed_boost,
      sortMode: 'recommendation_default',
      positionIndex: index,
    })
    emitEvent('follow_click', {
      creator_id: item.creator_id,
      reason_code: item.reason_code,
      ...impact,
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
        ...impact,
      })
    } catch (followError) {
      console.error('Error following recommended creator:', followError)
      setItems(previousItems)
      showToast(followError instanceof Error ? followError.message : 'Failed to follow creator', 'error')
    } finally {
      setFollowLoadingId(null)
    }
  }

  const hideCreator = async (
    item: CreatorRecommendationItem,
    positionIndex: number,
    reasonCode: DiscoveryReasonCode | null
  ) => {
    if (!authenticated || !getAccessToken || preferenceLoadingId) return
    setPreferenceLoadingId(item.creator_id)
    const previousItems = items
    setItems((prev) => prev.filter((row) => row.creator_id !== item.creator_id))
    setLastHidden({ item, positionIndex })
    if (reasonCode) {
      emitDiscoveryFeedbackEvent('reason_selected', {
        target_type: 'creator',
        target_id: item.creator_id,
        reason_code: reasonCode,
      })
    }
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/discovery/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_type: 'creator',
          target_id: item.creator_id,
          preference: 'hide',
          reason_code: reasonCode,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to save preference')
      emitDiscoveryPreferenceEvent('hide_creator', {
        target_type: 'creator',
        target_id: item.creator_id,
        position_index: positionIndex,
      })
      emitDiscoveryFeedbackEvent(reasonCode ? 'hide_with_reason' : 'hide_without_reason', {
        target_type: 'creator',
        target_id: item.creator_id,
        reason_code: reasonCode,
      })
      emitEvent('dismiss', {
        creator_id: item.creator_id,
        reason_code: item.reason_code,
        position_index: positionIndex,
      })
    } catch (error) {
      console.error('Error hiding creator recommendation:', error)
      setItems(previousItems)
      setLastHidden(null)
      showToast(error instanceof Error ? error.message : 'Failed to hide creator', 'error')
    } finally {
      setPreferenceLoadingId(null)
    }
  }

  const undoHide = async () => {
    if (!lastHidden || !getAccessToken || preferenceLoadingId) return
    setPreferenceLoadingId(lastHidden.item.creator_id)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/discovery/preferences', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_type: 'creator',
          target_id: lastHidden.item.creator_id,
          preference: 'hide',
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to undo preference')
      setItems((prev) => [lastHidden.item, ...prev])
      emitDiscoveryPreferenceEvent('undo_hide', {
        target_type: 'creator',
        target_id: lastHidden.item.creator_id,
        position_index: lastHidden.positionIndex,
      })
      setLastHidden(null)
    } catch (error) {
      console.error('Error undoing hidden creator preference:', error)
      showToast(error instanceof Error ? error.message : 'Failed to undo hide', 'error')
    } finally {
      setPreferenceLoadingId(null)
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
        <>
          {lastHidden ? (
            <div className="px-4 py-2 border-b border-gray-900 text-xs text-gray-400 flex items-center justify-between gap-2">
              <span>Recommendation hidden.</span>
              <button type="button" onClick={undoHide} className="px-2 py-1 rounded border border-gray-700 text-gray-200">
                Undo
              </button>
            </div>
          ) : null}
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

                <div className="flex flex-col items-end gap-1">
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
                  <button
                    type="button"
                    disabled={preferenceLoadingId === item.creator_id}
                    onClick={() => hideCreator(item, index, null)}
                    className="text-[11px] px-2 py-1 rounded border border-gray-700 text-gray-300"
                  >
                    Not interested
                  </button>
                  <div className="flex items-center gap-1">
                    {REASON_CHIPS.map((reason) => (
                      <button
                        key={`${item.creator_id}-${reason.code}`}
                        type="button"
                        disabled={preferenceLoadingId === item.creator_id}
                        onClick={() => hideCreator(item, index, reason.code)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-gray-800 text-gray-400"
                      >
                        {reason.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </li>
          ))}
          </ul>
        </>
      )}
    </section>
  )
}
