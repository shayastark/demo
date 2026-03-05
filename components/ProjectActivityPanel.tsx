'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  Loader2,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Sparkles,
  ThumbsUp,
  UserPlus,
} from 'lucide-react'
import type { ProjectActivityItem, ProjectActivityType } from '@/lib/projectActivity'

interface ProjectActivityResponse {
  items: ProjectActivityItem[]
  limit: number
  offset: number
  hasMore: boolean
  nextOffset: number | null
}

interface ProjectActivityPanelProps {
  projectId: string
  source: 'project_detail'
  authenticated: boolean
  getAccessToken?: () => Promise<string | null>
  onRequireAuth?: () => void
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

function getActivityIcon(type: ProjectActivityType) {
  switch (type) {
    case 'comment_created':
      return MessageCircle
    case 'comment_reacted':
      return ThumbsUp
    case 'update_created':
      return Sparkles
    case 'update_reacted':
      return ThumbsUp
    case 'update_commented':
      return MessageSquare
    case 'attachment_added':
      return Paperclip
    case 'access_granted':
      return UserPlus
    default:
      return Activity
  }
}

export default function ProjectActivityPanel({
  projectId,
  source,
  authenticated,
  getAccessToken,
  onRequireAuth,
}: ProjectActivityPanelProps) {
  const [items, setItems] = useState<ProjectActivityItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState<number | null>(null)

  const emitEvent = (
    action: 'view' | 'load_more' | 'click_item',
    detail?: Record<string, unknown>
  ) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('project_activity_event', {
        detail: {
          schema: 'project_activity.v1',
          action,
          source,
          project_id: projectId,
          ...detail,
        },
      })
    )
  }

  const load = async (isLoadMore: boolean) => {
    if (!authenticated || !getAccessToken) {
      onRequireAuth?.()
      return
    }
    if (isLoadMore) {
      if (!hasMore || nextOffset === null) return
      setLoadingMore(true)
      emitEvent('load_more')
    } else {
      setLoading(true)
      setError(null)
    }

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const params = new URLSearchParams({
        project_id: projectId,
        limit: '20',
        offset: String(isLoadMore ? nextOffset || 0 : 0),
      })
      const response = await fetch(`/api/projects/activity?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = (await response.json()) as ProjectActivityResponse & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Failed to load project activity')

      const nextItems = result.items || []
      setItems((prev) => (isLoadMore ? [...prev, ...nextItems] : nextItems))
      setHasMore(!!result.hasMore)
      setNextOffset(result.nextOffset)
      if (!isLoadMore) emitEvent('view')
    } catch (loadError) {
      console.error('Error loading project activity:', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load project activity')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, authenticated])

  const getTargetPath = (item: ProjectActivityItem): string | null => {
    if (item.type === 'update_created' || item.type === 'update_reacted' || item.type === 'update_commented') {
      return `/dashboard/projects/${projectId}?update_id=${encodeURIComponent(item.target_id)}`
    }
    return null
  }

  return (
    <section className="mb-8 border border-gray-800/80 rounded-lg bg-gray-950/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-900 flex items-center gap-2">
        <Activity className="w-4 h-4 text-neon-green" />
        <h2 className="text-sm font-medium text-white tracking-wide">Activity</h2>
      </div>

      {loading ? (
        <p className="px-4 py-4 text-sm text-gray-500">Loading activity...</p>
      ) : error ? (
        <p className="px-4 py-4 text-sm text-gray-500">Couldn&apos;t load activity right now.</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500">No recent activity yet.</p>
      ) : (
        <>
          <ul>
            {items.map((item) => {
              const Icon = getActivityIcon(item.type)
              const targetPath = getTargetPath(item)
              return (
                <li key={item.id} className="px-4 py-3 border-t border-gray-900 first:border-t-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-2">
                      <Icon className="w-3.5 h-3.5 mt-0.5 text-gray-500" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-100 line-clamp-2">{item.summary_text}</p>
                        <p className="text-[11px] text-gray-500 mt-1">{formatRelativeTime(item.created_at)}</p>
                      </div>
                    </div>
                    {targetPath ? (
                      <Link
                        href={targetPath}
                        className="text-xs px-2.5 py-1 rounded-md border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600"
                        onClick={() =>
                          emitEvent('click_item', {
                            activity_type: item.type,
                          })
                        }
                      >
                        Open
                      </Link>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          {hasMore ? (
            <div className="px-4 py-3 border-t border-gray-900">
              <button
                type="button"
                onClick={() => load(true)}
                disabled={loadingMore}
                className="text-xs px-2.5 py-1.5 rounded border border-gray-700 text-gray-200 inline-flex items-center gap-1"
              >
                {loadingMore ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
