'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { Loader2, UserCheck, UserPlus } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { applyFollowerCountDelta } from '@/lib/follows'

interface PublicCreatorProfilePageProps {
  identifier: string
}

interface PublicCreatorApiResponse {
  creator: {
    id: string
    username: string | null
    display_name: string
    avatar_url: string | null
    bio: string | null
    contact_email: string | null
    website: string | null
    instagram: string | null
    twitter: string | null
    farcaster: string | null
    canonical_identifier: string
    canonical_path: string
  }
  social: {
    followers_count: number
    following_count: number
    is_following: boolean
  }
  public_projects: Array<{
    id: string
    title: string
    cover_image_url: string | null
    created_at: string
    target_path: string
  }>
  viewer: {
    is_authenticated: boolean
    is_owner_view: boolean
  }
}

export default function PublicCreatorProfilePage({ identifier }: PublicCreatorProfilePageProps) {
  const router = useRouter()
  const { authenticated, ready, login, getAccessToken } = usePrivy()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [followLoading, setFollowLoading] = useState(false)
  const [data, setData] = useState<PublicCreatorApiResponse | null>(null)
  const [hasTrackedView, setHasTrackedView] = useState(false)

  const emitEvent = (action: 'view' | 'follow_click' | 'project_click', detail?: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('creator_profile_event', {
        detail: {
          schema: 'creator_profile.v1',
          action,
          source: 'public_creator_profile',
          creator_id: data?.creator.id || null,
          is_owner_view: !!data?.viewer.is_owner_view,
          is_authenticated: !!authenticated,
          ...detail,
        },
      })
    )
  }

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

        const response = await fetch(
          `/api/creator-profile?identifier=${encodeURIComponent(identifier)}&project_limit=24`,
          { headers }
        )
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load creator profile')

        setData(result as PublicCreatorApiResponse)
      } catch (loadError) {
        console.error('Error loading public creator profile:', loadError)
        setError(loadError instanceof Error ? loadError.message : 'Failed to load creator profile')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [authenticated, getAccessToken, identifier, ready])

  useEffect(() => {
    if (!data?.creator.canonical_identifier) return
    const expectedPath = `/creator/${encodeURIComponent(data.creator.canonical_identifier)}`
    if (typeof window !== 'undefined' && window.location.pathname !== expectedPath) {
      router.replace(expectedPath)
    }
  }, [data?.creator.canonical_identifier, router])

  useEffect(() => {
    if (!data || hasTrackedView) return
    emitEvent('view')
    setHasTrackedView(true)
  }, [data, hasTrackedView])

  const handleToggleFollow = async () => {
    if (!data || followLoading || data.viewer.is_owner_view) return
    if (!authenticated) {
      login()
      return
    }

    const currentlyFollowing = data.social.is_following
    setFollowLoading(true)
    setData((prev) =>
      prev
        ? {
            ...prev,
            social: {
              ...prev.social,
              is_following: !currentlyFollowing,
              followers_count: applyFollowerCountDelta(prev.social.followers_count, !currentlyFollowing),
            },
          }
        : prev
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
        body: JSON.stringify({ following_id: data.creator.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update follow status')

      emitEvent('follow_click', {
        follow_action: currentlyFollowing ? 'unfollow' : 'follow',
      })
    } catch (followError) {
      console.error('Error toggling follow from public profile:', followError)
      setData((prev) =>
        prev
          ? {
              ...prev,
              social: {
                ...prev.social,
                is_following: currentlyFollowing,
                followers_count: applyFollowerCountDelta(prev.social.followers_count, currentlyFollowing),
              },
            }
          : prev
      )
      showToast(followError instanceof Error ? followError.message : 'Failed to update follow status', 'error')
    } finally {
      setFollowLoading(false)
    }
  }

  const creatorLinks = useMemo(() => {
    if (!data) return []
    return [
      data.creator.website
        ? { label: 'Website', href: data.creator.website }
        : null,
      data.creator.instagram
        ? { label: 'Instagram', href: `https://instagram.com/${data.creator.instagram}` }
        : null,
      data.creator.twitter
        ? { label: 'X', href: `https://x.com/${data.creator.twitter}` }
        : null,
      data.creator.farcaster
        ? { label: 'Farcaster', href: `https://farcaster.xyz/${data.creator.farcaster}` }
        : null,
    ].filter((item): item is { label: string; href: string } => !!item)
  }, [data])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="inline-flex items-center gap-2 text-gray-300">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading creator profile...
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-lg text-white font-semibold">Creator not found</p>
          <p className="text-sm text-gray-400 mt-2">{error || 'This profile is unavailable.'}</p>
          <Link href="/dashboard" className="inline-block mt-4 text-neon-green text-sm hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black pb-24 text-white">
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="ui-card rounded-2xl bg-gray-900/90 p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gray-800 text-xl font-semibold text-neon-green">
                {data.creator.avatar_url ? (
                  <Image
                    src={data.creator.avatar_url}
                    alt={data.creator.display_name}
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-full object-cover object-center"
                  />
                ) : (
                  data.creator.display_name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold truncate">{data.creator.display_name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2.5 text-sm leading-relaxed text-gray-200">
                  <span>{data.social.followers_count} followers</span>
                  <span>{data.social.following_count} following</span>
                  <span>{data.public_projects.length} public projects</span>
                </div>
              </div>
            </div>

            {!data.viewer.is_owner_view ? (
              <button
                onClick={handleToggleFollow}
                disabled={followLoading}
                aria-label={data.social.is_following ? 'Unfollow creator' : 'Follow creator'}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  data.social.is_following
                    ? 'border border-gray-700 bg-gray-800 text-gray-100 hover:border-gray-500'
                    : 'bg-neon-green text-black hover:bg-[#4cff2e]'
                }`}
              >
                {followLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : data.social.is_following ? (
                  <UserCheck className="w-4 h-4" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                {data.social.is_following ? 'Following' : 'Follow'}
              </button>
            ) : null}
          </div>

          {data.creator.bio ? <p className="mt-5 text-sm leading-relaxed text-gray-200">{data.creator.bio}</p> : null}

          {(creatorLinks.length > 0 || data.creator.contact_email) ? (
            <div className="mt-5 flex flex-wrap gap-2.5">
              {data.creator.contact_email ? (
                <a
                  href={`mailto:${data.creator.contact_email}`}
                  className="rounded-full border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:border-gray-500"
                >
                  Contact
                </a>
              ) : null}
              {creatorLinks.map((item) => (
                <a
                  key={`${item.label}-${item.href}`}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:border-gray-500"
                >
                  {item.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-white">Public projects</h2>
          {data.public_projects.length === 0 ? (
            <div className="ui-card rounded-xl bg-gray-900/80 p-5 text-sm text-gray-300">
              No public projects yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {data.public_projects.map((project) => (
                <Link
                  key={project.id}
                  href={project.target_path}
                  onClick={() =>
                    emitEvent('project_click', {
                      project_id: project.id,
                      project_target: project.target_path,
                    })
                  }
                  className="ui-card ui-pressable rounded-xl bg-gray-900/80 p-4 transition hover:border-gray-600"
                >
                  <p className="text-sm font-semibold text-white">{project.title}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
