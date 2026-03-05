'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Loader2, UserPlus, UserCheck, X } from 'lucide-react'
import { usePrivy } from '@privy-io/react-auth'
import { showToast } from '@/components/Toast'
import type { SocialGraphListType, SocialGraphListItem } from '@/lib/socialGraph'

interface SocialGraphListModalProps {
  isOpen: boolean
  onClose: () => void
  profileUserId: string
  listType: SocialGraphListType
  source: 'account' | 'creator_profile'
  currentDbUserId: string | null
  onOpenUser: (userId: string) => void
}

function formatRelativeTime(isoDate: string): string {
  const ts = new Date(isoDate).getTime()
  if (!Number.isFinite(ts)) return ''
  const diff = Date.now() - ts
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  if (diff < hour) return 'just now'
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  return `${Math.floor(diff / day)}d ago`
}

export default function SocialGraphListModal({
  isOpen,
  onClose,
  profileUserId,
  listType,
  source,
  currentDbUserId,
  onOpenUser,
}: SocialGraphListModalProps) {
  const { authenticated, getAccessToken, login } = usePrivy()
  const [items, setItems] = useState<SocialGraphListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [actionLoadingUserId, setActionLoadingUserId] = useState<string | null>(null)

  const title = useMemo(
    () => (listType === 'followers' ? 'Followers' : 'Following'),
    [listType]
  )

  const emitEvent = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('social_graph_event', {
        detail: {
          schema: 'social_graph.v1',
          source,
          list_type: listType,
          profile_user_id: profileUserId,
          ...detail,
        },
      })
    )
  }

  const loadList = async ({ reset }: { reset: boolean }) => {
    if (!profileUserId) return
    const nextOffset = reset ? 0 : offset
    if (reset) {
      setLoading(true)
      setError(null)
    }

    try {
      const token = authenticated ? await getAccessToken() : null
      const response = await fetch(
        `/api/follows/list?user_id=${encodeURIComponent(profileUserId)}&type=${listType}&limit=20&offset=${nextOffset}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to load list')

      const nextItems = (result.items || []) as SocialGraphListItem[]
      setItems((prev) => (reset ? nextItems : [...prev, ...nextItems]))
      setOffset(nextOffset + nextItems.length)
      setHasMore(!!result.has_more)
    } catch (loadError) {
      console.error('Error loading social graph list:', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load list')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    setItems([])
    setOffset(0)
    setHasMore(false)
    loadList({ reset: true })
    emitEvent({ action: 'view_list' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, listType, profileUserId])

  const toggleFollowFromList = async (targetUserId: string, currentlyFollowing: boolean) => {
    if (!authenticated) {
      login()
      return
    }

    setActionLoadingUserId(targetUserId)
    setItems((prev) =>
      prev.map((item) =>
        item.user_id === targetUserId
          ? {
              ...item,
              is_following: !currentlyFollowing,
            }
          : item
      )
    )

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch('/api/follows', {
        method: currentlyFollowing ? 'DELETE' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ following_id: targetUserId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update follow state')

      emitEvent({
        action: currentlyFollowing ? 'unfollow_from_list' : 'follow_from_list',
        target_user_id: targetUserId,
      })
    } catch (followError) {
      console.error('Error toggling follow from list:', followError)
      setItems((prev) =>
        prev.map((item) =>
          item.user_id === targetUserId
            ? {
                ...item,
                is_following: currentlyFollowing,
              }
            : item
        )
      )
      showToast('Failed to update follow state', 'error')
    } finally {
      setActionLoadingUserId(null)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          zIndex: 910,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'calc(100% - 32px)',
          maxWidth: '460px',
          maxHeight: '78vh',
          backgroundColor: '#111827',
          borderRadius: '14px',
          border: '1px solid #374151',
          zIndex: 911,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-800"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-3 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : error ? (
            <p className="text-sm text-gray-500">Couldn&apos;t load this list right now.</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-500">No users to show yet.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const isSelf = !!currentDbUserId && item.user_id === currentDbUserId
                const isActionLoading = actionLoadingUserId === item.user_id
                return (
                  <div
                    key={`${listType}-${item.user_id}-${item.followed_at}`}
                    className="flex items-center justify-between gap-3 border border-gray-800 rounded-lg px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        emitEvent({
                          action: 'click_user',
                          target_user_id: item.user_id,
                        })
                        onOpenUser(item.user_id)
                      }}
                      className="min-w-0 flex items-center gap-3 text-left"
                    >
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-800 flex items-center justify-center text-neon-green font-semibold">
                        {item.avatar_url ? (
                          <Image
                            src={item.avatar_url}
                            alt={item.username}
                            width={36}
                            height={36}
                            className="object-cover w-9 h-9"
                          />
                        ) : (
                          item.username.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{item.username}</p>
                        <p className="text-xs text-gray-500">Followed {formatRelativeTime(item.followed_at)}</p>
                      </div>
                    </button>

                    {authenticated && !isSelf ? (
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleFollowFromList(item.user_id, item.is_following)
                        }}
                        className={`text-xs px-2.5 py-1.5 rounded-md border ${
                          item.is_following
                            ? 'border-gray-700 text-gray-300'
                            : 'border-neon-green text-neon-green'
                        }`}
                      >
                        {isActionLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : item.is_following ? (
                          <span className="inline-flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            Following
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <UserPlus className="w-3 h-3" />
                            Follow
                          </span>
                        )}
                      </button>
                    ) : null}
                  </div>
                )
              })}

              {hasMore ? (
                <button
                  type="button"
                  onClick={() => loadList({ reset: false })}
                  className="w-full mt-2 text-sm text-gray-300 border border-gray-700 rounded-lg py-2 hover:border-gray-600"
                >
                  Load more
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

