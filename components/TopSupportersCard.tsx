'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Heart } from 'lucide-react'

interface TopSupporterItem {
  supporter_user_id: string
  supporter_name: string
  avatar_url: string | null
  total_tip_amount_cents: number
  tip_count: number
  last_tipped_at: string
}

interface TopSupportersCardProps {
  projectId: string
  source: 'project_detail' | 'shared_project'
  authenticated: boolean
  getAccessToken: () => Promise<string | null>
  onOpenSupporter: (supporterUserId: string) => void
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export default function TopSupportersCard({
  projectId,
  source,
  authenticated,
  getAccessToken,
  onOpenSupporter,
}: TopSupportersCardProps) {
  const [supporters, setSupporters] = useState<TopSupporterItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const viewEventSentRef = useRef<string | null>(null)

  const emitEvent = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('top_supporters_event', {
        detail: {
          schema: 'top_supporters.v1',
          source,
          project_id: projectId,
          ...detail,
        },
      })
    )
  }

  useEffect(() => {
    let cancelled = false

    const loadSupporters = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = authenticated ? await getAccessToken() : null
        const response = await fetch(
          `/api/projects/supporters?project_id=${encodeURIComponent(projectId)}&limit=5`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          }
        )
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load top supporters')
        if (!cancelled) {
          setSupporters((result.supporters || []) as TopSupporterItem[])
        }
      } catch (loadError) {
        console.error('Error loading top supporters:', loadError)
        if (!cancelled) setError('Unable to load supporters right now.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSupporters()
    return () => {
      cancelled = true
    }
  }, [authenticated, getAccessToken, projectId])

  useEffect(() => {
    if (loading) return
    const eventKey = `${projectId}:${source}`
    if (viewEventSentRef.current === eventKey) return
    viewEventSentRef.current = eventKey
    emitEvent({ action: 'view' })
  }, [loading, projectId, source])

  return (
    <section className="bg-gray-900 rounded-xl mb-6 border border-gray-800" style={{ padding: '16px 20px' }}>
      <div className="flex items-center gap-2 mb-3">
        <Heart className="w-4 h-4 text-neon-green" />
        <h3 className="font-semibold text-neon-green">Top Supporters</h3>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading supporters...</p>
      ) : error ? (
        <p className="text-sm text-gray-500">Couldn&apos;t load supporters right now.</p>
      ) : supporters.length === 0 ? (
        <p className="text-sm text-gray-500">No supporters yet.</p>
      ) : (
        <div className="space-y-2">
          {supporters.map((supporter, index) => (
            <button
              key={supporter.supporter_user_id}
              type="button"
              onClick={() => {
                emitEvent({
                  action: 'click_supporter',
                  supporter_user_id: supporter.supporter_user_id,
                  rank_position: index + 1,
                })
                onOpenSupporter(supporter.supporter_user_id)
              }}
              className="w-full flex items-center justify-between border border-gray-800 rounded-lg px-3 py-2 hover:border-gray-700 transition"
            >
              <div className="min-w-0 flex items-center gap-3 text-left">
                <span className="text-xs text-gray-500 w-4">#{index + 1}</span>
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-800 flex items-center justify-center text-neon-green font-semibold">
                  {supporter.avatar_url ? (
                    <Image
                      src={supporter.avatar_url}
                      alt={supporter.supporter_name}
                      width={32}
                      height={32}
                      className="w-8 h-8 object-cover"
                    />
                  ) : (
                    supporter.supporter_name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{supporter.supporter_name}</p>
                  <p className="text-xs text-gray-500">{supporter.tip_count} {supporter.tip_count === 1 ? 'tip' : 'tips'}</p>
                </div>
              </div>
              <span className="text-sm text-gray-300">{formatUsd(supporter.total_tip_amount_cents)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

