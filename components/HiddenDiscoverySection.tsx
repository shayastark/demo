'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { removeHiddenDiscoveryItem, type DiscoveryTargetType } from '@/lib/discoveryPreferences'

type HiddenFilter = 'all' | DiscoveryTargetType

interface HiddenDiscoveryItem {
  target_type: DiscoveryTargetType
  target_id: string
  label: string
  image_url: string | null
  created_at: string
}

interface HiddenDiscoveryResponse {
  items: HiddenDiscoveryItem[]
  limit: number
  offset: number
  hasMore: boolean
  nextOffset: number | null
}

interface HiddenDiscoverySectionProps {
  authenticated: boolean
  getAccessToken?: () => Promise<string | null>
}

const HIDDEN_ACTION_BUTTON_CLASS =
  'inline-flex min-h-9 items-center rounded-md border border-gray-700 bg-black px-3 py-1.5 text-sm font-medium text-gray-200 transition hover:border-gray-600 hover:text-white'
const HIDDEN_FILTER_BUTTON_CLASS =
  'inline-flex min-h-9 items-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition'

export default function HiddenDiscoverySection({ authenticated, getAccessToken }: HiddenDiscoverySectionProps) {
  const collapseStorageKey = 'demo.hidden-discovery.expanded.account'
  const [filter, setFilter] = useState<HiddenFilter>('all')
  const [expanded, setExpanded] = useState(false)
  const [items, setItems] = useState<HiddenDiscoveryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const emitManageEvent = (
    action: 'view' | 'unhide' | 'filter_change',
    detail?: Record<string, unknown>
  ) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('discovery_manage_event', {
        detail: {
          schema: 'discovery_manage.v1',
          source: 'account_settings',
          action,
          target_type: filter === 'all' ? null : filter,
          ...detail,
        },
      })
    )
  }

  const emitSectionEvent = (state: 'expanded' | 'collapsed') => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('hidden_discovery_section_event', {
        detail: {
          schema: 'hidden_discovery_section.v1',
          source: 'account_settings',
          action: state,
        },
      })
    )
  }

  const load = async (reset: boolean) => {
    if (!authenticated || !getAccessToken) return
    if (reset) {
      setLoading(true)
      setError(null)
    } else {
      setLoadingMore(true)
    }
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const effectiveOffset = reset ? 0 : nextOffset || 0
      const params = new URLSearchParams({
        preference: 'hide',
        limit: '20',
        offset: String(effectiveOffset),
      })
      if (filter !== 'all') params.set('target_type', filter)

      const response = await fetch(`/api/discovery/preferences?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = (await response.json()) as HiddenDiscoveryResponse & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Failed to load hidden preferences')

      const next = result.items || []
      setItems((prev) => (reset ? next : [...prev, ...next]))
      setHasMore(!!result.hasMore)
      setNextOffset(result.nextOffset)

      if (reset) {
        emitManageEvent('view', { target_type: filter === 'all' ? null : filter })
      }
    } catch (loadError) {
      console.error('Error loading hidden discovery preferences:', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load hidden preferences')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(collapseStorageKey)
    if (stored === 'true' || stored === 'false') {
      setExpanded(stored === 'true')
    }
  }, [])

  useEffect(() => {
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, filter])

  const setExpandedState = (next: boolean) => {
    setExpanded(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(collapseStorageKey, String(next))
    }
    emitSectionEvent(next ? 'expanded' : 'collapsed')
  }

  const handleUnhide = async (item: HiddenDiscoveryItem) => {
    if (!authenticated || !getAccessToken || actionLoadingId) return
    setActionLoadingId(item.target_id)
    const previousItems = items
    setItems((prev) =>
      removeHiddenDiscoveryItem({
        items: prev,
        target_type: item.target_type,
        target_id: item.target_id,
      })
    )
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
          target_type: item.target_type,
          target_id: item.target_id,
          preference: 'hide',
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to unhide')
      emitManageEvent('unhide', {
        target_type: item.target_type,
        target_id: item.target_id,
      })
    } catch (unhideError) {
      console.error('Error unhiding discovery target:', unhideError)
      setItems(previousItems)
      showToast(unhideError instanceof Error ? unhideError.message : 'Failed to unhide', 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl mb-6 border border-gray-800" style={{ padding: '20px 24px 24px 24px' }}>
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: '12px' }}>
        <h2 className="font-semibold text-neon-green text-lg">
          Hidden from discovery ({items.length})
        </h2>
        <button
          type="button"
          onClick={() => setExpandedState(!expanded)}
          aria-expanded={expanded}
          aria-controls="hidden-discovery-content"
          className={HIDDEN_ACTION_BUTTON_CLASS}
          style={{ WebkitAppearance: 'none', appearance: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {expanded ? 'Collapse' : 'Manage'}
        </button>
      </div>

      {!expanded ? (
        <p className="text-sm text-gray-500">
          Hidden creators and projects are kept out of Explore and recommendations.
        </p>
      ) : (
        <div id="hidden-discovery-content">
          <div className="flex items-center gap-2 mb-3">
            {(['all', 'creator', 'project'] as HiddenFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFilter(value)
                  emitManageEvent('filter_change', { target_type: value === 'all' ? null : value })
                }}
                className={`${HIDDEN_FILTER_BUTTON_CLASS} ${
                  filter === value
                    ? 'border-neon-green bg-neon-green/10 text-neon-green'
                    : 'border-gray-700 bg-black text-gray-300'
                }`}
                style={{ WebkitAppearance: 'none', appearance: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {value === 'all' ? 'All' : value === 'creator' ? 'Creators' : 'Projects'}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Loading hidden items...</p>
          ) : error ? (
            <p className="text-sm text-gray-400">Couldn&apos;t load hidden items right now.</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-500">You haven&apos;t hidden anything.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={`${item.target_type}-${item.target_id}-${item.created_at}`}
                  className="flex items-center justify-between gap-3 border border-gray-800 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{item.label}</p>
                    <p className="text-xs text-gray-500 capitalize">{item.target_type}</p>
                  </div>
                  <button
                    type="button"
                    disabled={actionLoadingId === item.target_id}
                    onClick={() => handleUnhide(item)}
                    className={`${HIDDEN_ACTION_BUTTON_CLASS} text-xs`}
                    style={{ WebkitAppearance: 'none', appearance: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {actionLoadingId === item.target_id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Unhide
                  </button>
                </div>
              ))}
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => load(false)}
                  disabled={loadingMore}
                  className={`${HIDDEN_ACTION_BUTTON_CLASS} text-xs`}
                  style={{ WebkitAppearance: 'none', appearance: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {loadingMore ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
