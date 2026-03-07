'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, DollarSign } from 'lucide-react'

interface CreatorEarningsRecentTip {
  amount_cents: number
  created_at: string
  project_id: string | null
  project_title: string
  supporter_name: string
}

interface CreatorEarningsProjectTotal {
  project_id: string
  project_title: string
  tips_count: number
  amount_cents: number
}

interface CreatorEarningsResponse {
  total_tips_count: number
  total_tips_amount_cents: number
  last_30d_amount_cents: number
  recent_tips: CreatorEarningsRecentTip[]
  per_project_totals: CreatorEarningsProjectTotal[]
}

interface CreatorEarningsSnapshotProps {
  authenticated: boolean
  getAccessToken: () => Promise<string | null>
  source: 'account'
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function formatRelativeTime(iso: string): string {
  const createdAt = new Date(iso)
  const diffMs = Date.now() - createdAt.getTime()
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return createdAt.toLocaleDateString()
}

export default function CreatorEarningsSnapshot({
  authenticated,
  getAccessToken,
  source,
}: CreatorEarningsSnapshotProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [earnings, setEarnings] = useState<CreatorEarningsResponse | null>(null)
  const [isOpen, setIsOpen] = useState(true)

  useEffect(() => {
    if (!authenticated) return

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) {
          setError('Sign in to view earnings.')
          return
        }
        const response = await fetch('/api/creator-earnings', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const result = await response.json()
        if (!response.ok) {
          throw new Error(result.error || 'Failed to load earnings')
        }
        setEarnings(result as CreatorEarningsResponse)
      } catch (loadError) {
        console.error('Error loading creator earnings:', loadError)
        setError('Unable to load earnings right now.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [authenticated, getAccessToken])

  const hasEarnings = (earnings?.total_tips_amount_cents || 0) > 0
  const totalTipsCount = earnings?.total_tips_count || 0

  useEffect(() => {
    if (!authenticated || loading) return
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('creator_earnings_event', {
        detail: {
          schema: 'creator_earnings.v1',
          action: 'view',
          source,
          has_earnings: hasEarnings,
          total_tips_count: totalTipsCount,
        },
      })
    )
  }, [authenticated, hasEarnings, loading, source, totalTipsCount])

  const topProjects = useMemo(() => earnings?.per_project_totals || [], [earnings?.per_project_totals])
  const recentTips = useMemo(() => earnings?.recent_tips || [], [earnings?.recent_tips])

  return (
    <section className="bg-gray-900 rounded-xl mb-6 border border-gray-800" style={{ padding: '20px 24px 24px 24px' }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-neon-green" />
          <h2 className="font-semibold text-neon-green text-lg">Earnings</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="btn-unstyled ui-pressable inline-flex items-center gap-2 rounded-md border border-gray-700 bg-black px-3 py-1.5 text-xs font-semibold text-neon-green hover:border-gray-500 hover:text-neon-green/80"
          style={{ WebkitAppearance: 'none', appearance: 'none', WebkitTapHighlightColor: 'transparent' }}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse earnings' : 'Expand earnings'}
        >
          {isOpen ? 'Collapse' : 'Expand'}
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} aria-hidden />
        </button>
      </div>

      {!isOpen ? null : loading ? (
        <p className="text-sm text-gray-500">Loading earnings...</p>
      ) : error ? (
        <p className="text-sm text-gray-500">{error}</p>
      ) : !earnings || !hasEarnings ? (
        <div className="text-sm text-gray-500">
          <p>No earnings yet.</p>
          <p className="mt-1">When supporters tip your projects, your snapshot will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-black rounded-lg p-3 border border-gray-800">
              <p className="text-xs text-gray-500">Total Earned</p>
              <p className="text-lg font-semibold text-white">{formatUsd(earnings.total_tips_amount_cents)}</p>
            </div>
            <div className="bg-black rounded-lg p-3 border border-gray-800">
              <p className="text-xs text-gray-500">Last 30 Days</p>
              <p className="text-lg font-semibold text-white">{formatUsd(earnings.last_30d_amount_cents)}</p>
            </div>
            <div className="bg-black rounded-lg p-3 border border-gray-800">
              <p className="text-xs text-gray-500">Tips Count</p>
              <p className="text-lg font-semibold text-white">{earnings.total_tips_count}</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Top Projects</p>
            {topProjects.length === 0 ? (
              <p className="text-sm text-gray-500">No project-attributed tips yet.</p>
            ) : (
              <div className="divide-y divide-gray-800 rounded-lg border border-gray-800 bg-black">
                {topProjects.map((project) => (
                  <Link
                    key={project.project_id}
                    href={`/dashboard/projects/${project.project_id}`}
                    className="flex items-center justify-between px-3 py-2 hover:bg-gray-900 transition"
                    onClick={() => {
                      if (typeof window === 'undefined') return
                      window.dispatchEvent(
                        new CustomEvent('creator_earnings_event', {
                          detail: {
                            schema: 'creator_earnings.v1',
                            action: 'project_row_click',
                            source,
                            has_earnings: true,
                            total_tips_count: earnings.total_tips_count,
                            project_id: project.project_id,
                          },
                        })
                      )
                    }}
                  >
                    <span className="text-sm text-white truncate pr-3">{project.project_title}</span>
                    <span className="text-sm text-gray-300">
                      {formatUsd(project.amount_cents)} ({project.tips_count})
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Recent Support Activity</p>
            {recentTips.length === 0 ? (
              <p className="text-sm text-gray-500">No recent tips.</p>
            ) : (
              <div className="divide-y divide-gray-800 rounded-lg border border-gray-800 bg-black">
                {recentTips.map((tip, index) => (
                  <div key={`${tip.created_at}-${tip.project_id || 'direct'}-${index}`} className="px-3 py-2 flex items-center justify-between">
                    <div className="min-w-0 pr-3">
                      <p className="text-sm text-white truncate">
                        {tip.supporter_name} tipped on {tip.project_title}
                      </p>
                      <p className="text-xs text-gray-500">{formatRelativeTime(tip.created_at)}</p>
                    </div>
                    <span className="text-sm text-gray-300">{formatUsd(tip.amount_cents)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

