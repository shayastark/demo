'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createPortal } from 'react-dom'
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
  creator_avatar_url?: string | null
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

const EXPLORE_ACTION_BUTTON_STYLE = {
  WebkitAppearance: 'none' as const,
  appearance: 'none' as const,
  WebkitTapHighlightColor: 'transparent',
  backgroundColor: '#000000',
  border: '1px solid #374151',
  color: '#e5e7eb',
}

const SORT_OPTIONS: Array<{ value: ExploreSort; label: string }> = [
  { value: 'trending', label: 'Trending' },
  { value: 'newest', label: 'Newest' },
  { value: 'most_supported', label: 'Most Supported' },
]

function getCreatorInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'D'
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
}

function isFreshProject(createdAt: string) {
  const createdMs = new Date(createdAt).getTime()
  if (!Number.isFinite(createdMs)) return false
  const ageMs = Date.now() - createdMs
  return ageMs <= 1000 * 60 * 60 * 24 * 7
}

function getProjectBadge(item: ExploreItem, sort: ExploreSort) {
  if ((item.preference_seed_boost || 0) > 0.2) return 'For You'
  if (isFreshProject(item.created_at)) return 'Fresh'
  if (item.supporter_count >= 5 || sort === 'most_supported') return 'Backed'
  if (sort === 'trending') return 'Trending'
  return 'New'
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
  const [isMounted, setIsMounted] = useState(false)
  const trackedImpressionKeysRef = useRef<Set<string>>(new Set())

  const queryLength = useMemo(() => debouncedQuery.trim().length, [debouncedQuery])
  const shelfSections = useMemo(() => {
    const featured = items.slice(0, 6)
    const freshest = [...items]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6)
    const mostSupported = [...items]
      .filter((item) => item.supporter_count > 0)
      .sort((a, b) => b.supporter_count - a.supporter_count)
      .slice(0, 6)

    return [
      {
        id: 'featured',
        title: sort === 'trending' ? 'Trending now' : 'Top picks',
        subtitle:
          sort === 'trending'
            ? 'Projects with momentum right now'
            : 'Highlights from this Explore feed',
        items: featured,
      },
      {
        id: 'fresh',
        title: 'Fresh drops',
        subtitle: 'Recently shared projects worth a look',
        items: freshest,
      },
      {
        id: 'supported',
        title: 'Fan-backed',
        subtitle: 'Projects already getting early support',
        items: mostSupported,
      },
    ].filter((section) => section.items.length > 0)
  }, [items, sort])

  const trackProjectClick = (item: ExploreItem, index: number) => {
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
  }

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
    setIsMounted(true)
  }, [])

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
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Discover</p>
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Explore</h1>
                <p className="mt-2 max-w-2xl text-sm text-gray-400 sm:text-base">
                  Find public projects, fresh uploads, and creators worth following.
                </p>
              </div>
              <div className="text-sm text-gray-500">
                {loading ? 'Loading projects...' : `${items.length} project${items.length === 1 ? '' : 's'} shown`}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800/80 bg-[#0b0b0d] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <div className="flex flex-col gap-3">
              <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title or creator"
                className="min-h-11 w-full rounded-xl border border-gray-800 bg-gray-950/90 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-neon-green"
                style={EXPLORE_INPUT_STYLE}
              />
              </div>
              <div className="overflow-x-auto pb-1">
                <div className="inline-flex min-w-full rounded-full border border-gray-800 bg-gray-950/90 p-1 md:min-w-0">
                  {SORT_OPTIONS.map((option) => {
                    const active = sort === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSort(option.value)
                          emitEvent('sort_change', { sort: option.value })
                          emitRankingEvent('sort_change', { sort: option.value })
                        }}
                        className={`min-h-10 flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                          active
                            ? 'bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.12)]'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
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
            {shelfSections.length > 0 ? (
              <div className="mb-10 space-y-8">
                {shelfSections.slice(0, 2).map((section) => (
                  <section key={section.id}>
                    <div className="mb-3 flex items-end justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold tracking-tight text-white">{section.title}</h2>
                        <p className="mt-1 text-sm text-gray-400">{section.subtitle}</p>
                      </div>
                    </div>
                    <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                      <div className="flex gap-4 pb-1">
                        {section.items.map((item, index) => (
                          <Link
                            key={`${section.id}-${item.project_id}`}
                            href={item.target_path}
                            onClick={() => trackProjectClick(item, index)}
                            className="group block w-[17.5rem] flex-shrink-0"
                          >
                            <div className="relative aspect-[1.25/1] overflow-hidden rounded-[24px] bg-gray-900 shadow-[0_20px_40px_rgba(0,0,0,0.35)] ring-1 ring-white/6">
                              {item.cover_image_url ? (
                                <Image
                                  src={item.cover_image_url}
                                  alt={item.title}
                                  fill
                                  className="object-cover transition duration-500 group-hover:scale-[1.03]"
                                  sizes="280px"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-xs uppercase tracking-[0.24em] text-gray-500">
                                  Demo
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/65 to-transparent p-4 pt-12">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-300">
                                  {getProjectBadge(item, sort)}
                                </p>
                                <h3 className="mt-1 line-clamp-2 text-lg font-semibold leading-tight text-white">
                                  {item.title}
                                </h3>
                                <p className="mt-1 text-sm text-gray-300">{item.creator_name}</p>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4 lg:gap-x-6 xl:grid-cols-5">
              {items.map((item, index) => (
                <div
                  key={item.project_id}
                  className="group"
                >
                  <Link
                    href={item.target_path}
                    onClick={() => trackProjectClick(item, index)}
                    className="block"
                  >
                    <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-[20px] bg-gray-900 shadow-[0_16px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/6 transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_22px_40px_rgba(0,0,0,0.4)]">
                      {item.cover_image_url ? (
                        <Image
                          src={item.cover_image_url}
                          alt={item.title}
                          fill
                          className="object-cover transition duration-500 group-hover:scale-[1.02]"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-xs uppercase tracking-[0.24em] text-gray-500">
                          Demo
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setMenuItem(item)
                          setMenuItemIndex(index)
                        }}
                        className="ui-pressable absolute right-2.5 top-2.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white backdrop-blur-sm transition hover:border-white/20 hover:bg-black/85"
                        style={{
                          ...EXPLORE_ACTION_BUTTON_STYLE,
                          backgroundColor: 'rgba(0, 0, 0, 0.72)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#ffffff',
                          touchAction: 'manipulation',
                          WebkitTouchCallout: 'none' as const,
                        }}
                        aria-label="Project actions"
                      >
                        <MoreVertical className="pointer-events-none h-4 w-4" />
                      </button>
                    </div>
                  </Link>
                  <div className="flex items-start gap-3">
                    <Link
                      href={item.target_path}
                      onClick={() => trackProjectClick(item, index)}
                      className="min-w-0 flex-1"
                    >
                      <p className="line-clamp-2 min-h-[2.75rem] text-[15px] font-semibold leading-[1.3] text-white" style={{ color: '#ffffff' }}>
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm leading-tight text-gray-300" style={{ color: '#d1d5db' }}>
                        by {item.creator_name}
                      </p>
                      <div className="mt-3 hidden items-center gap-2 lg:flex">
                        <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gray-800 ring-1 ring-white/8">
                          {item.creator_avatar_url ? (
                            <Image
                              src={item.creator_avatar_url}
                              alt={item.creator_name}
                              width={28}
                              height={28}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-300">
                              {getCreatorInitials(item.creator_name)}
                            </span>
                          )}
                        </div>
                        <span className="rounded-full border border-gray-800 bg-gray-950 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400">
                          {getProjectBadge(item, sort)}
                        </span>
                      </div>
                    </Link>
                  </div>
                  <Link
                    href={item.target_path}
                    onClick={() => trackProjectClick(item, index)}
                    className="mt-2 block"
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500" style={{ color: '#9ca3af' }}>
                      {item.supporter_count > 0
                        ? `${item.supporter_count} ${item.supporter_count === 1 ? 'supporter' : 'supporters'}`
                        : 'New'}
                    </p>
                  </Link>
                </div>
              ))}
            </div>

            {hasMore ? (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="ui-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-gray-700 px-5 py-2.5 text-sm text-gray-200 hover:border-gray-500 disabled:opacity-70"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>
      {isMounted && menuItem
        ? createPortal(
        <>
          <div
            className="fixed inset-0 z-[1000] bg-black/70"
            onClick={() => {
              setMenuItem(null)
              setMenuItemIndex(-1)
            }}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[1001] rounded-t-2xl border-t border-gray-700 bg-[#0b1733]"
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
        ,
        document.body
      )
        : null}
    </div>
  )
}
