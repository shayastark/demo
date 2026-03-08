'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { ArrowUpRight, Loader2, UserPlus, UserCheck, X } from 'lucide-react'
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
          maxWidth: '500px',
          maxHeight: '78vh',
          background: 'linear-gradient(180deg, rgba(9, 13, 21, 0.98), rgba(5, 7, 12, 0.98))',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.45)',
          zIndex: 911,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition hover:border-white/20 hover:bg-white/[0.06]"
            style={{
              WebkitAppearance: 'none',
              appearance: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <X className="w-4 h-4 text-gray-300" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : error ? (
            <p className="text-sm text-gray-500">Couldn&apos;t load this list right now.</p>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-5 text-sm text-gray-500">
              No users to show yet.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const isSelf = !!currentDbUserId && item.user_id === currentDbUserId
                const isActionLoading = actionLoadingUserId === item.user_id
                return (
                  <div
                    key={`${listType}-${item.user_id}-${item.followed_at}`}
                    className="flex items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(7,10,16,0.96))] px-3.5 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.22)]"
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
                      className="min-w-0 flex flex-1 items-center gap-3 text-left"
                      style={{
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        background: 'transparent',
                        border: 'none',
                      }}
                    >
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gray-800 text-sm font-semibold text-neon-green">
                        {item.avatar_url ? (
                          <Image
                            src={item.avatar_url}
                            alt={item.username}
                            width={48}
                            height={48}
                            className="h-12 w-12 object-cover"
                          />
                        ) : (
                          item.username.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-white">{item.username}</p>
                        <p className="mt-1 text-xs text-gray-500">Followed {formatRelativeTime(item.followed_at)}</p>
                      </div>
                      <ArrowUpRight className="ml-auto hidden h-4 w-4 flex-shrink-0 text-gray-600 sm:block" />
                    </button>

                    {authenticated && !isSelf ? (
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleFollowFromList(item.user_id, item.is_following)
                        }}
                        className="inline-flex min-h-10 w-auto flex-shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition"
                        style={{
                          WebkitAppearance: 'none',
                          appearance: 'none',
                          WebkitTapHighlightColor: 'transparent',
                          backgroundColor: item.is_following ? 'rgba(255, 255, 255, 0.05)' : '#39FF14',
                          border: item.is_following ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                          color: item.is_following ? '#f9fafb' : '#000000',
                        }}
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
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-sm font-medium text-gray-300 transition hover:border-white/20 hover:bg-white/[0.05]"
                  style={{
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
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

