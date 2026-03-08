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

function formatCalendarDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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
          className="ui-pressable inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-black text-neon-green hover:border-gray-500 hover:text-neon-green/80 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs sm:font-semibold"
          style={{
            WebkitAppearance: 'none',
            appearance: 'none',
            WebkitTapHighlightColor: 'transparent',
            backgroundColor: '#000000',
            border: '1px solid #374151',
            color: '#39FF14',
          }}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse earnings' : 'Expand earnings'}
        >
          <span className="hidden sm:inline">{isOpen ? 'Collapse' : 'Expand'}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} aria-hidden />
        </button>
      </div>

      {!isOpen ? null : loading ? (
        <p className="text-sm text-gray-500">Loading earnings...</p>
      ) : error ? (
        <p className="text-sm text-gray-500">{error}</p>
      ) : !earnings || !hasEarnings ? (
        <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(7,10,16,0.96))] px-5 py-5 text-sm text-gray-400">
          <p className="font-medium text-white">No earnings yet.</p>
          <p className="mt-2 max-w-xl leading-relaxed">When supporters tip your projects, your snapshot will appear here.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.9),rgba(7,10,16,0.98))] px-5 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Total earned</p>
              <p className="mt-4 text-[28px] font-semibold tracking-tight text-white">{formatUsd(earnings.total_tips_amount_cents)}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.9),rgba(7,10,16,0.98))] px-5 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Last 30 days</p>
              <p className="mt-4 text-[28px] font-semibold tracking-tight text-white">{formatUsd(earnings.last_30d_amount_cents)}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.9),rgba(7,10,16,0.98))] px-5 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Tips count</p>
              <p className="mt-4 text-[28px] font-semibold tracking-tight text-white">{earnings.total_tips_count}</p>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Top projects</p>
            {topProjects.length === 0 ? (
              <div className="rounded-[20px] border border-white/8 bg-white/[0.02] px-4 py-4 text-sm text-gray-400">
                No project-attributed tips yet.
              </div>
            ) : (
              <div className="space-y-3">
                {topProjects.map((project) => (
                  <Link
                    key={project.project_id}
                    href={`/dashboard/projects/${project.project_id}`}
                    className="flex flex-col gap-3 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(7,10,16,0.96))] px-5 py-4 transition hover:border-white/14 sm:flex-row sm:items-center sm:justify-between"
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
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{project.project_title}</p>
                      <p className="mt-1.5 text-xs text-gray-500">
                        {project.tips_count} {project.tips_count === 1 ? 'tip' : 'tips'}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-black/25 px-3.5 py-1.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      {formatUsd(project.amount_cents)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Recent support activity</p>
            {recentTips.length === 0 ? (
              <div className="rounded-[20px] border border-white/8 bg-white/[0.02] px-4 py-4 text-sm text-gray-400">
                No recent tips.
              </div>
            ) : (
              <div className="space-y-3">
                {recentTips.map((tip, index) => (
                  <div
                    key={`${tip.created_at}-${tip.project_id || 'direct'}-${index}`}
                    className="flex flex-col gap-3 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(7,10,16,0.96))] px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-relaxed text-white">
                        {tip.supporter_name} tipped on {tip.project_title}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                        <span className="inline-flex items-center rounded-full bg-black/25 px-2.5 py-1">
                          {formatRelativeTime(tip.created_at)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-black/25 px-2.5 py-1">
                          {formatCalendarDate(tip.created_at)}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center self-start rounded-full bg-black/25 px-3.5 py-1.5 text-base font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      {formatUsd(tip.amount_cents)}
                    </span>
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

