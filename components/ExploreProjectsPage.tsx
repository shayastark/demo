'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePrivy } from '@privy-io/react-auth'
import { Loader2, Search } from 'lucide-react'
import { type DiscoveryReasonCode } from '@/lib/discoveryPreferences'
import { buildDiscoveryImpactEventFields } from '@/lib/discoveryImpactMetrics'

type ExploreSort = 'trending' | 'newest' | 'most_supported'

interface ExploreItem {
  project_id: string
  title: string
  cover_image_url: string | null
  creator_id: string
  creator_name: string
  created_at: string
  supporter_count: number
  preference_seed_boost?: number
  target_path: string
}

interface ExploreResponse {
  items: ExploreItem[]
  limit: number
  offset: number
  hasMore: boolean
  nextOffset: number | null
}

interface HiddenSnapshot {
  item: ExploreItem
  targetType: 'project' | 'creator'
  targetId: string
  positionIndex: number
}

const REASON_CHIPS: Array<{ code: DiscoveryReasonCode; label: string }> = [
  { code: 'not_my_style', label: 'Style' },
  { code: 'already_seen', label: 'Seen' },
  { code: 'too_many_updates', label: 'Updates' },
]

const EXPLORE_INPUT_STYLE = {
  WebkitAppearance: 'none' as const,
  appearance: 'none' as const,
  WebkitTapHighlightColor: 'transparent',
  backgroundColor: '#111827',
  border: '1px solid #374151',
  color: '#f9fafb',
}

const EXPLORE_SELECT_STYLE = {
  WebkitAppearance: 'none' as const,
  appearance: 'none' as const,
  WebkitTapHighlightColor: 'transparent',
  backgroundColor: '#111827',
  border: '1px solid #374151',
  color: '#f9fafb',
}

const EXPLORE_ACTION_BUTTON_STYLE = {
  WebkitAppearance: 'none' as const,
  appearance: 'none' as const,
  WebkitTapHighlightColor: 'transparent',
  backgroundColor: '#000000',
  border: '1px solid #374151',
  color: '#e5e7eb',
}

const EXPLORE_REASON_CHIP_STYLE = {
  WebkitAppearance: 'none' as const,
  appearance: 'none' as const,
  WebkitTapHighlightColor: 'transparent',
  backgroundColor: 'rgba(17, 24, 39, 0.65)',
  border: '1px solid rgba(75, 85, 99, 0.8)',
  color: '#9ca3af',
  borderRadius: '9999px',
}

export default function ExploreProjectsPage() {
  const { ready, authenticated, login, getAccessToken } = usePrivy()
  const [items, setItems] = useState<ExploreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<ExploreSort>('trending')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [lastHidden, setLastHidden] = useState<HiddenSnapshot | null>(null)
  const [preferenceLoadingId, setPreferenceLoadingId] = useState<string | null>(null)
  const trackedImpressionKeysRef = useRef<Set<string>>(new Set())

  const queryLength = useMemo(() => debouncedQuery.trim().length, [debouncedQuery])

  const emitEvent = (
    action: 'view' | 'search' | 'sort_change' | 'project_click',
    detail?: Record<string, unknown>
  ) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('explore_event', {
        detail: {
          schema: 'explore.v1',
          action,
          source: 'explore_page',
          sort,
          query_length: queryLength,
          ...detail,
        },
      })
    )
  }

  const emitRankingEvent = (
    action: 'view_with_sort' | 'sort_change' | 'project_click',
    detail?: Record<string, unknown>
  ) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('explore_ranking_event', {
        detail: {
          schema: 'explore_ranking.v1',
          action,
          source: 'explore',
          sort,
          ...detail,
        },
      })
    )
  }

  const emitDiscoveryPreferenceEvent = (
    action: 'hide_project' | 'hide_creator' | 'undo_hide',
    detail: {
      target_type: 'project' | 'creator'
      target_id: string
      position_index: number
    }
  ) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('discovery_preference_event', {
        detail: {
          schema: 'discovery_preference.v1',
          action,
          source: 'explore',
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
          action,
          source: 'explore',
          ...detail,
        },
      })
    )
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (authenticated && !ready) return

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const headers: Record<string, string> = {}
        if (authenticated) {
          const token = await getAccessToken()
          if (token) headers.Authorization = `Bearer ${token}`
        }
        const params = new URLSearchParams({
          sort,
          limit: '20',
          offset: '0',
        })
        if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim())

        const response = await fetch(`/api/explore/projects?${params.toString()}`, { headers })
        const result = (await response.json()) as ExploreResponse & { error?: string }
        if (!response.ok) throw new Error(result.error || 'Failed to load explore projects')

        setItems(result.items || [])
        setHasMore(!!result.hasMore)
        setNextOffset(result.nextOffset)
      } catch (loadError) {
        console.error('Error loading explore projects:', loadError)
        setError(loadError instanceof Error ? loadError.message : 'Failed to load explore projects')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [authenticated, debouncedQuery, getAccessToken, ready, sort])

  useEffect(() => {
    if (!ready) return
    emitEvent('search')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  useEffect(() => {
    if (!authenticated || items.length === 0) return
    items.forEach((item, index) => {
      const key = `${sort}:${item.project_id}:${index}`
      if (trackedImpressionKeysRef.current.has(key)) return
      trackedImpressionKeysRef.current.add(key)
      const impact = buildDiscoveryImpactEventFields({
        preferenceSeedBoost: item.preference_seed_boost,
        sortMode: sort,
        positionIndex: index,
      })
      emitEvent('view', {
        project_id: item.project_id,
        ...impact,
      })
      emitRankingEvent('view_with_sort', {
        project_id: item.project_id,
        ...impact,
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, items, sort])

  const loadMore = async () => {
    if (loadingMore || !hasMore || nextOffset === null) return
    setLoadingMore(true)
    try {
      const headers: Record<string, string> = {}
      if (authenticated) {
        const token = await getAccessToken()
        if (token) headers.Authorization = `Bearer ${token}`
      }
      const params = new URLSearchParams({
        sort,
        limit: '20',
        offset: String(nextOffset),
      })
      if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim())

      const response = await fetch(`/api/explore/projects?${params.toString()}`, { headers })
      const result = (await response.json()) as ExploreResponse & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Failed to load more projects')

      setItems((prev) => [...prev, ...(result.items || [])])
      setHasMore(!!result.hasMore)
      setNextOffset(result.nextOffset)
    } catch (loadError) {
      console.error('Error loading more explore projects:', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load more projects')
    } finally {
      setLoadingMore(false)
    }
  }

  const hideTarget = async (args: {
    item: ExploreItem
    targetType: 'project' | 'creator'
    targetId: string
    positionIndex: number
    reasonCode?: DiscoveryReasonCode | null
  }) => {
    if (preferenceLoadingId) return
    setPreferenceLoadingId(args.targetId)
    const previousItems = items
    const nextItems =
      args.targetType === 'project'
        ? items.filter((row) => row.project_id !== args.item.project_id)
        : items.filter((row) => row.creator_id !== args.item.creator_id)
    setItems(nextItems)
    setLastHidden({
      item: args.item,
      targetType: args.targetType,
      targetId: args.targetId,
      positionIndex: args.positionIndex,
    })

    if (args.reasonCode) {
      emitDiscoveryFeedbackEvent('reason_selected', {
        target_type: args.targetType,
        target_id: args.targetId,
        reason_code: args.reasonCode,
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
          target_type: args.targetType,
          target_id: args.targetId,
          preference: 'hide',
          reason_code: args.reasonCode || null,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to save preference')

      emitDiscoveryPreferenceEvent(args.targetType === 'project' ? 'hide_project' : 'hide_creator', {
        target_type: args.targetType,
        target_id: args.targetId,
        position_index: args.positionIndex,
      })
      emitDiscoveryFeedbackEvent(args.reasonCode ? 'hide_with_reason' : 'hide_without_reason', {
        target_type: args.targetType,
        target_id: args.targetId,
        reason_code: args.reasonCode || null,
      })
    } catch (error) {
      console.error('Error hiding discovery target:', error)
      setItems(previousItems)
      setLastHidden(null)
      setError(error instanceof Error ? error.message : 'Failed to save preference')
    } finally {
      setPreferenceLoadingId(null)
    }
  }

  const undoHide = async () => {
    if (!lastHidden || preferenceLoadingId) return
    setPreferenceLoadingId(lastHidden.targetId)
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
          target_type: lastHidden.targetType,
          target_id: lastHidden.targetId,
          preference: 'hide',
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to undo preference')

      setItems((prev) => [lastHidden.item, ...prev])
      emitDiscoveryPreferenceEvent('undo_hide', {
        target_type: lastHidden.targetType,
        target_id: lastHidden.targetId,
        position_index: lastHidden.positionIndex,
      })
      setLastHidden(null)
    } catch (error) {
      console.error('Error undoing discovery preference:', error)
      setError(error instanceof Error ? error.message : 'Failed to undo preference')
    } finally {
      setPreferenceLoadingId(null)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-neon-green">Loading...</div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="mb-4 text-neon-green opacity-90">Sign in to explore public projects</p>
          <button onClick={login} className="bg-white text-black px-6 py-2 rounded-full font-semibold">
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <h1 className="text-3xl font-bold">Explore</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title or creator"
                className="min-h-10 w-64 max-w-[70vw] rounded-lg border border-gray-800 bg-gray-900 pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                style={EXPLORE_INPUT_STYLE}
              />
            </div>
            <select
              value={sort}
              onChange={(event) => {
                const next = event.target.value as ExploreSort
                setSort(next)
                emitEvent('sort_change', { sort: next })
                emitRankingEvent('sort_change', { sort: next })
              }}
              className="min-h-10 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
              style={EXPLORE_SELECT_STYLE}
            >
              <option value="trending">Trending</option>
              <option value="newest">Newest</option>
              <option value="most_supported">Most Supported</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading public projects...
          </div>
        ) : error ? (
          <div className="border border-gray-800 rounded-xl p-4 bg-gray-900 text-sm text-gray-400">{error}</div>
        ) : items.length === 0 ? (
          <div className="border border-gray-800 rounded-xl p-6 bg-gray-900 text-sm text-gray-400">
            No public projects found.
          </div>
        ) : (
          <>
            {lastHidden ? (
              <div className="ui-card mb-4 flex items-center justify-between gap-3 rounded-xl bg-gray-900 p-3 text-xs text-gray-200">
                <span>Hidden from Explore.</span>
                <button
                  type="button"
                  onClick={undoHide}
                  disabled={preferenceLoadingId === lastHidden.targetId}
                  className="ui-pressable min-h-8 rounded border border-gray-700 px-2 py-1 text-gray-100 hover:border-gray-500"
                >
                  Undo
                </button>
              </div>
            ) : null}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {items.map((item, index) => (
                <div
                  key={item.project_id}
                  className="ui-card rounded-xl border border-gray-800 bg-gray-900 p-3 transition hover:border-gray-700"
                >
                  <Link
                    href={item.target_path}
                    onClick={() => {
                      const impact = buildDiscoveryImpactEventFields({
                        preferenceSeedBoost: item.preference_seed_boost,
                        sortMode: sort,
                        positionIndex: index,
                      })
                      emitEvent('project_click', {
                        project_id: item.project_id,
                        ...impact,
                      })
                      emitRankingEvent('project_click', {
                        project_id: item.project_id,
                        ...impact,
                      })
                    }}
                    className="block space-y-1"
                  >
                    <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-800 mb-3">
                      {item.cover_image_url ? (
                        <Image
                          src={item.cover_image_url}
                          alt={item.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        />
                      ) : null}
                    </div>
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-white" style={{ color: '#ffffff' }}>
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-300" style={{ color: '#d1d5db' }}>
                      by {item.creator_name}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-500" style={{ color: '#9ca3af' }}>
                      {item.supporter_count > 0
                        ? `${item.supporter_count} ${item.supporter_count === 1 ? 'supporter' : 'supporters'}`
                        : 'New'}
                    </p>
                  </Link>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={preferenceLoadingId === item.project_id}
                      onClick={() =>
                        hideTarget({
                          item,
                          targetType: 'project',
                          targetId: item.project_id,
                          positionIndex: index,
                          reasonCode: null,
                        })
                      }
                      className="ui-pressable min-h-8 rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-200 hover:border-gray-500"
                      style={EXPLORE_ACTION_BUTTON_STYLE}
                    >
                      Not interested
                    </button>
                    <button
                      type="button"
                      disabled={preferenceLoadingId === item.creator_id}
                      onClick={() =>
                        hideTarget({
                          item,
                          targetType: 'creator',
                          targetId: item.creator_id,
                          positionIndex: index,
                          reasonCode: null,
                        })
                      }
                      className="ui-pressable min-h-8 px-1 py-1 text-[11px] text-gray-400 hover:text-gray-200"
                      style={{
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        background: 'transparent',
                        border: 'none',
                        color: '#9ca3af',
                      }}
                    >
                      Hide creator
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                    {REASON_CHIPS.map((reason) => (
                      <button
                        key={`${item.project_id}-${reason.code}`}
                        type="button"
                        disabled={preferenceLoadingId === item.project_id}
                        onClick={() =>
                          hideTarget({
                            item,
                            targetType: 'project',
                            targetId: item.project_id,
                            positionIndex: index,
                            reasonCode: reason.code,
                          })
                        }
                        className="ui-chip ui-pressable text-[10px] text-gray-300"
                        style={EXPLORE_REASON_CHIP_STYLE}
                      >
                        {reason.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {hasMore ? (
              <div className="mt-5">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="ui-pressable inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:border-gray-600 disabled:opacity-70"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}
