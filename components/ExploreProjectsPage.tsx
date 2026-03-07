'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { usePrivy } from '@privy-io/react-auth'
import { BookmarkPlus, EyeOff, ListMusic, Loader2, MoreVertical, Pin, Search, User } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { addToQueue } from '@/components/BottomTabBar'
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
  targetType: 'project'
  targetId: string
  positionIndex: number
}

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

export default function ExploreProjectsPage() {
  const router = useRouter()
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
  const [menuItem, setMenuItem] = useState<ExploreItem | null>(null)
  const [menuItemIndex, setMenuItemIndex] = useState<number>(-1)
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
    action: 'hide_project' | 'undo_hide',
    detail: {
      target_type: 'project'
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
      target_type: 'project'
      target_id: string
      reason_code: string | null
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
    targetType: 'project'
    targetId: string
    positionIndex: number
  }) => {
    if (preferenceLoadingId) return
    setPreferenceLoadingId(args.targetId)
    const previousItems = items
    const nextItems = items.filter((row) => row.project_id !== args.item.project_id)
    setItems(nextItems)
    setLastHidden({
      item: args.item,
      targetType: args.targetType,
      targetId: args.targetId,
      positionIndex: args.positionIndex,
    })

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
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to save preference')

      emitDiscoveryPreferenceEvent('hide_project', {
        target_type: args.targetType,
        target_id: args.targetId,
        position_index: args.positionIndex,
      })
      emitDiscoveryFeedbackEvent('hide_without_reason', {
        target_type: args.targetType,
        target_id: args.targetId,
        reason_code: null,
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

  const withAuthHeaders = async (): Promise<Record<string, string>> => {
    const token = await getAccessToken()
    if (!token) throw new Error('Not authenticated')
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  const saveProjectToLibrary = async (projectId: string) => {
    try {
      const response = await fetch('/api/library', {
        method: 'POST',
        headers: await withAuthHeaders(),
        body: JSON.stringify({ project_id: projectId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to save project')
      showToast(result.message === 'Already in library' ? 'Project already in library' : 'Saved to library', 'success')
    } catch (actionError) {
      showToast(actionError instanceof Error ? actionError.message : 'Failed to save project', 'error')
    }
  }

  const pinProject = async (projectId: string) => {
    try {
      const saveResponse = await fetch('/api/library', {
        method: 'POST',
        headers: await withAuthHeaders(),
        body: JSON.stringify({ project_id: projectId }),
      })
      const saveResult = await saveResponse.json()
      if (!saveResponse.ok) throw new Error(saveResult.error || 'Failed to pin project')

      const pinResponse = await fetch('/api/library', {
        method: 'PATCH',
        headers: await withAuthHeaders(),
        body: JSON.stringify({ project_id: projectId, pinned: true }),
      })
      const pinResult = await pinResponse.json()
      if (!pinResponse.ok) throw new Error(pinResult.error || 'Failed to pin project')
      showToast('Project pinned to your dashboard', 'success')
    } catch (actionError) {
      showToast(actionError instanceof Error ? actionError.message : 'Failed to pin project', 'error')
    }
  }

  const addProjectTracksToQueue = async (item: ExploreItem) => {
    try {
      const response = await fetch(`/api/tracks?project_id=${encodeURIComponent(item.project_id)}`, {
        headers: await withAuthHeaders(),
      })
      const result = (await response.json()) as {
        tracks?: Array<{ id: string; title: string; audio_url: string }>
        error?: string
      }
      if (!response.ok) throw new Error(result.error || 'Failed to load tracks')
      const tracks = result.tracks || []
      if (tracks.length === 0) {
        showToast('No tracks available for queue yet', 'info')
        return
      }
      let addedCount = 0
      tracks.forEach((track) => {
        const added = addToQueue({
          id: track.id,
          title: track.title,
          projectTitle: item.title,
          audioUrl: track.audio_url,
          projectCoverUrl: item.cover_image_url,
        })
        if (added) addedCount += 1
      })
      if (addedCount > 0) {
        showToast(`Added ${addedCount} track${addedCount > 1 ? 's' : ''} to queue`, 'success')
      } else {
        showToast('Tracks are already in queue', 'info')
      }
    } catch (actionError) {
      showToast(actionError instanceof Error ? actionError.message : 'Failed to add to queue', 'error')
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
                    className="block"
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
                  </Link>
                  <div className="flex items-start gap-2">
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
                      className="min-w-0 flex-1"
                    >
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-white" style={{ color: '#ffffff' }}>
                        {item.title}
                      </p>
                    </Link>
                    <button
                      type="button"
                      onPointerDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setMenuItem(item)
                        setMenuItemIndex(index)
                      }}
                      onTouchStart={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setMenuItem(item)
                        setMenuItemIndex(index)
                      }}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setMenuItem(item)
                        setMenuItemIndex(index)
                      }}
                      className="ui-pressable relative z-10 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-950/90 text-gray-200 hover:border-gray-500 hover:bg-gray-900"
                      style={{
                        ...EXPLORE_ACTION_BUTTON_STYLE,
                        touchAction: 'manipulation',
                        WebkitTouchCallout: 'none',
                      }}
                      aria-label="Project actions"
                    >
                      <MoreVertical className="pointer-events-none h-4 w-4" />
                    </button>
                  </div>
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
                    className="mt-1 block"
                  >
                    <p className="text-xs leading-relaxed text-gray-300" style={{ color: '#d1d5db' }}>
                      by {item.creator_name}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-500" style={{ color: '#9ca3af' }}>
                      {item.supporter_count > 0
                        ? `${item.supporter_count} ${item.supporter_count === 1 ? 'supporter' : 'supporters'}`
                        : 'New'}
                    </p>
                  </Link>
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
      {menuItem ? (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/70"
            onClick={() => {
              setMenuItem(null)
              setMenuItemIndex(-1)
            }}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl border-t border-gray-700 bg-[#0b1733]"
            style={{
              maxHeight: '82vh',
              overflowY: 'auto',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #374151',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '4px',
                  backgroundColor: '#4B5563',
                  borderRadius: '2px',
                  marginBottom: '12px',
                }}
              />
              <h2
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#fff',
                  margin: 0,
                  textAlign: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {menuItem.title}
              </h2>
            </div>

            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  router.push(`/creator/${encodeURIComponent(menuItem.creator_id)}`)
                  setMenuItem(null)
                  setMenuItemIndex(-1)
                }}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: '#1f2937',
                  color: '#fff',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                }}
                className="hover:bg-gray-700 transition"
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#374151',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <User style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>View Creator</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    See creator profile and contact info
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  void saveProjectToLibrary(menuItem.project_id)
                  setMenuItem(null)
                  setMenuItemIndex(-1)
                }}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: '#1f2937',
                  color: '#fff',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                }}
                className="hover:bg-gray-700 transition"
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#39FF14',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <BookmarkPlus style={{ width: '22px', height: '22px', color: '#000' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Save to Library</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    Add to your saved projects
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  void addProjectTracksToQueue(menuItem)
                  setMenuItem(null)
                  setMenuItemIndex(-1)
                }}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: '#1f2937',
                  color: '#fff',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                }}
                className="hover:bg-gray-700 transition"
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#374151',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ListMusic style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Add to Queue</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    Add all tracks to play queue
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  void pinProject(menuItem.project_id)
                  setMenuItem(null)
                  setMenuItemIndex(-1)
                }}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: '#1f2937',
                  color: '#fff',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                }}
                className="hover:bg-gray-700 transition"
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#374151',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Pin style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Pin Project</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    Pin to top of your dashboard
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={preferenceLoadingId === menuItem.project_id}
                onClick={() => {
                  const selectedItem = menuItem
                  const selectedIndex = menuItemIndex >= 0 ? menuItemIndex : 0
                  setMenuItem(null)
                  setMenuItemIndex(-1)
                  void hideTarget({
                    item: selectedItem,
                    targetType: 'project',
                    targetId: selectedItem.project_id,
                    positionIndex: selectedIndex,
                  })
                }}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: '#1f2937',
                  color: '#fff',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                  opacity: preferenceLoadingId === menuItem.project_id ? 0.65 : 1,
                }}
                className="hover:bg-gray-700 transition"
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#374151',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <EyeOff style={{ width: '22px', height: '22px', color: '#ef4444' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Not Interested</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    Hide this project from Explore
                  </div>
                </div>
              </button>
            </div>

            <div style={{ padding: '12px 20px 20px' }}>
              <button
                type="button"
                onClick={() => {
                  setMenuItem(null)
                  setMenuItemIndex(-1)
                }}
                style={{
                  width: '100%',
                  padding: '16px',
                  backgroundColor: '#374151',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                className="hover:bg-gray-600 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
