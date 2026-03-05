'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePrivy } from '@privy-io/react-auth'
import { Loader2, Search } from 'lucide-react'

type ExploreSort = 'trending' | 'newest' | 'most_supported'

interface ExploreItem {
  project_id: string
  title: string
  cover_image_url: string | null
  creator_id: string
  creator_name: string
  created_at: string
  supporter_count: number
  target_path: string
}

interface ExploreResponse {
  items: ExploreItem[]
  limit: number
  offset: number
  hasMore: boolean
  nextOffset: number | null
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
  const [trackedView, setTrackedView] = useState(false)

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
        emitRankingEvent('view_with_sort')
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
    if (trackedView || !ready || !authenticated) return
    emitEvent('view')
    setTrackedView(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, trackedView])

  useEffect(() => {
    if (!ready) return
    emitEvent('search')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

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
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title or creator"
                className="bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white w-64 max-w-[70vw]"
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
              className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {items.map((item, index) => (
                <Link
                  key={item.project_id}
                  href={item.target_path}
                  onClick={() => {
                    emitEvent('project_click', { project_id: item.project_id })
                    emitRankingEvent('project_click', {
                      project_id: item.project_id,
                      position_index: index,
                    })
                  }}
                  className="bg-gray-900 rounded-xl p-3 border border-gray-800 hover:border-gray-700 transition"
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
                  <p className="text-sm font-semibold text-white line-clamp-2">{item.title}</p>
                  <p className="text-xs text-gray-400 mt-1">by {item.creator_name}</p>
                  <p className="text-xs text-neon-green mt-1">
                    {item.supporter_count} {item.supporter_count === 1 ? 'supporter' : 'supporters'}
                  </p>
                </Link>
              ))}
            </div>

            {hasMore ? (
              <div className="mt-5">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 border border-gray-700 rounded-lg text-sm text-gray-200 hover:border-gray-600 disabled:opacity-70 inline-flex items-center gap-2"
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
