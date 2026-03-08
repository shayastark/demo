'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays } from 'lucide-react'

interface CreatorDigestTopProject {
  id: string
  title: string
  metric_label: string
  metric_value: number
}

interface CreatorDigestResponse {
  window_days: number
  has_complete_window: boolean
  new_followers_count: number
  new_comments_count: number
  updates_posted_count: number
  tips_count: number
  tips_amount_cents: number
  top_project: CreatorDigestTopProject | null
  highlights: string[]
}

interface CreatorDigestCardProps {
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

export default function CreatorDigestCard({ authenticated, getAccessToken, source }: CreatorDigestCardProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [digest, setDigest] = useState<CreatorDigestResponse | null>(null)

  useEffect(() => {
    if (!authenticated) return

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) {
          setError('Sign in to view your digest.')
          return
        }
        const response = await fetch('/api/creator-digest?window_days=7', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load digest')
        setDigest(result as CreatorDigestResponse)
      } catch (loadError) {
        console.error('Error loading creator digest:', loadError)
        setError('Unable to load your weekly digest right now.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [authenticated, getAccessToken])

  const hasActivity =
    (digest?.new_followers_count || 0) > 0 ||
    (digest?.new_comments_count || 0) > 0 ||
    (digest?.updates_posted_count || 0) > 0 ||
    (digest?.tips_count || 0) > 0

  useEffect(() => {
    if (!authenticated || loading || !digest) return
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('creator_digest_event', {
        detail: {
          schema: 'creator_digest.v1',
          action: 'view',
          source,
          window_days: digest.window_days,
          has_activity: hasActivity,
          new_followers_count: digest.new_followers_count,
          new_comments_count: digest.new_comments_count,
          updates_posted_count: digest.updates_posted_count,
          tips_count: digest.tips_count,
        },
      })
    )
  }, [authenticated, digest, hasActivity, loading, source])

  return (
    <section className="bg-gray-900 rounded-xl mb-6 border border-gray-800" style={{ padding: '20px 24px 24px 24px' }}>
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="w-4 h-4 text-neon-green" />
        <h2 className="font-semibold text-neon-green text-lg">This week</h2>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading digest...</p>
      ) : error ? (
        <p className="text-sm text-gray-500">{error}</p>
      ) : !digest ? (
        <p className="text-sm text-gray-500">No digest data available.</p>
      ) : !hasActivity ? (
        <div className="text-sm text-gray-500">
          {digest.has_complete_window ? (
            <>
              <p>No new activity in the last {digest.window_days} days.</p>
              <p className="mt-1">Post an update or share your projects to build momentum.</p>
            </>
          ) : (
            <>
              <p>Check back after a week has gone by.</p>
              <p className="mt-1">This section fills in once a full weekly window has passed.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="bg-black rounded-lg p-2.5 border border-gray-800">
              <p className="text-[11px] text-gray-500">Followers</p>
              <p className="text-sm font-semibold text-white">{digest.new_followers_count}</p>
            </div>
            <div className="bg-black rounded-lg p-2.5 border border-gray-800">
              <p className="text-[11px] text-gray-500">Comments</p>
              <p className="text-sm font-semibold text-white">{digest.new_comments_count}</p>
            </div>
            <div className="bg-black rounded-lg p-2.5 border border-gray-800">
              <p className="text-[11px] text-gray-500">Updates</p>
              <p className="text-sm font-semibold text-white">{digest.updates_posted_count}</p>
            </div>
            <div className="bg-black rounded-lg p-2.5 border border-gray-800">
              <p className="text-[11px] text-gray-500">Tips</p>
              <p className="text-sm font-semibold text-white">{digest.tips_count}</p>
            </div>
            <div className="bg-black rounded-lg p-2.5 border border-gray-800">
              <p className="text-[11px] text-gray-500">Tip Amount</p>
              <p className="text-sm font-semibold text-white">{formatUsd(digest.tips_amount_cents)}</p>
            </div>
          </div>

          {digest.top_project ? (
            <div className="rounded-lg border border-gray-800 bg-black p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Top project</p>
              <Link
                href={`/dashboard/projects/${digest.top_project.id}`}
                className="text-sm text-white hover:text-neon-green transition"
                onClick={() => {
                  if (typeof window === 'undefined') return
                  window.dispatchEvent(
                    new CustomEvent('creator_digest_event', {
                      detail: {
                        schema: 'creator_digest.v1',
                        action: 'click_top_project',
                        source,
                        window_days: digest.window_days,
                        has_activity: hasActivity,
                        new_followers_count: digest.new_followers_count,
                        new_comments_count: digest.new_comments_count,
                        updates_posted_count: digest.updates_posted_count,
                        tips_count: digest.tips_count,
                        project_id: digest.top_project?.id,
                      },
                    })
                  )
                }}
              >
                {digest.top_project.title}
              </Link>
              <p className="text-xs text-gray-500 mt-1">
                {digest.top_project.metric_value} {digest.top_project.metric_label}
              </p>
            </div>
          ) : null}

          {digest.highlights.length > 0 ? (
            <ul className="space-y-1">
              {digest.highlights.map((highlight, index) => (
                <li key={`${highlight}-${index}`} className="text-sm text-gray-300">
                  {highlight}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  )
}

