'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { ExternalLink, Globe, Heart, Loader2, Mail, Sparkles, UserCheck, UserPlus } from 'lucide-react'
import { showToast } from '@/components/Toast'
import CreatorProfileModal from '@/components/CreatorProfileModal'
import { applyFollowerCountDelta } from '@/lib/follows'
import {
  getAvailabilityStatusLabel,
  getProfileTagLabel,
  isAvailabilityStatus,
  isProfileTag,
  type AvailabilityStatus,
  type ProfileTag,
} from '@/lib/profileCustomization'

interface PublicCreatorProfilePageProps {
  identifier: string
}

interface PublicCreatorApiResponse {
  creator: {
    id: string
    username: string | null
    display_name: string
    avatar_url: string | null
    banner_image_url: string | null
    bio: string | null
    profile_tags: string[]
    availability_status: AvailabilityStatus | null
    contact_email: string | null
    website: string | null
    instagram: string | null
    twitter: string | null
    farcaster: string | null
    youtube_url: string | null
    tiktok_url: string | null
    spotify_url: string | null
    discord_url: string | null
    other_link_url: string | null
    stripe_onboarding_complete: boolean | null
    wallet_address: string | null
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
  featured_project: {
    id: string
    title: string
    cover_image_url: string | null
    created_at: string
    target_path: string
  } | null
  viewer: {
    is_authenticated: boolean
    is_owner_view: boolean
  }
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return {
    value: new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: count >= 1000 ? 1 : 0,
    }).format(count),
    label: count === 1 ? singular : plural,
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
  const [isTipModalOpen, setIsTipModalOpen] = useState(false)

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
        ? { label: 'Website', href: data.creator.website, icon: Globe }
        : null,
      data.creator.instagram
        ? { label: 'Instagram', href: `https://instagram.com/${data.creator.instagram}`, icon: ExternalLink }
        : null,
      data.creator.twitter
        ? { label: 'X', href: `https://x.com/${data.creator.twitter}`, icon: ExternalLink }
        : null,
      data.creator.farcaster
        ? { label: 'Farcaster', href: `https://farcaster.xyz/${data.creator.farcaster}`, icon: ExternalLink }
        : null,
      data.creator.youtube_url
        ? { label: 'YouTube', href: data.creator.youtube_url, icon: ExternalLink }
        : null,
      data.creator.tiktok_url
        ? { label: 'TikTok', href: data.creator.tiktok_url, icon: ExternalLink }
        : null,
      data.creator.spotify_url
        ? { label: 'Spotify', href: data.creator.spotify_url, icon: ExternalLink }
        : null,
      data.creator.discord_url
        ? { label: 'Discord', href: data.creator.discord_url, icon: ExternalLink }
        : null,
      data.creator.other_link_url
        ? { label: 'Other', href: data.creator.other_link_url, icon: ExternalLink }
        : null,
    ].filter((item): item is { label: string; href: string; icon: typeof Globe } => !!item)
  }, [data])

  const profileTags = useMemo(
    () => (data?.creator.profile_tags || []).filter((tag): tag is ProfileTag => isProfileTag(tag)),
    [data?.creator.profile_tags]
  )

  const availabilityLabel = useMemo(() => {
    const status = data?.creator.availability_status
    return status && isAvailabilityStatus(status) ? getAvailabilityStatusLabel(status) : null
  }, [data?.creator.availability_status])

  const remainingProjects = useMemo(() => {
    if (!data) return []
    return data.public_projects.filter((project) => project.id !== data.featured_project?.id)
  }, [data])

  const canReceiveTips = !!(data?.creator.stripe_onboarding_complete || data?.creator.wallet_address)

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
        <div className="ui-card overflow-hidden rounded-[28px] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(57,255,20,0.08),transparent_32%),linear-gradient(180deg,rgba(10,12,18,0.98),rgba(6,8,12,0.98))] shadow-[0_30px_80px_rgba(0,0,0,0.38)]">
          {data.creator.banner_image_url ? (
            <div className="relative h-32 w-full overflow-hidden border-b border-white/8 bg-black/40 sm:h-40">
              <Image
                src={data.creator.banner_image_url}
                alt={`${data.creator.display_name} banner`}
                fill
                sizes="(max-width: 768px) 100vw, 896px"
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.48))]" />
            </div>
          ) : null}
          <div className="flex flex-col gap-6 p-5 sm:p-7">
            <div className="flex flex-col gap-4">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gray-800 text-2xl font-semibold text-neon-green shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                  {data.creator.avatar_url ? (
                    <Image
                      src={data.creator.avatar_url}
                      alt={data.creator.display_name}
                      width={80}
                      height={80}
                      className="h-20 w-20 rounded-full object-cover object-center"
                    />
                  ) : (
                    data.creator.display_name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 pt-1">
                  <h1 className="text-[30px] font-bold leading-[1.02] tracking-tight text-white sm:truncate sm:text-[32px]">
                    {data.creator.display_name}
                  </h1>
                  {data.creator.username?.trim() ? (
                    <p className="mt-2 text-sm font-medium text-gray-400">@{data.creator.username.trim()}</p>
                  ) : null}
                  {data.creator.bio ? (
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-200 sm:text-[15px]">
                      {data.creator.bio}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-gray-500">
                      {data.viewer.is_owner_view
                        ? 'Add a short bio so listeners know what you are about.'
                        : 'This creator has not added a bio yet.'}
                    </p>
                  )}
                  {(availabilityLabel || profileTags.length > 0) ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      {availabilityLabel ? (
                        <span className="inline-flex min-h-9 items-center rounded-full border border-neon-green/20 bg-neon-green/10 px-3.5 text-[12px] font-semibold text-neon-green">
                          {availabilityLabel}
                        </span>
                      ) : null}
                      {profileTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex min-h-9 items-center rounded-full border border-white/8 bg-white/[0.03] px-3.5 text-[12px] font-medium text-gray-200"
                        >
                          {getProfileTagLabel(tag)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {!data.viewer.is_owner_view ? (
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleToggleFollow}
                    disabled={followLoading}
                    aria-label={data.social.is_following ? 'Unfollow creator' : 'Follow creator'}
                    className="inline-flex min-h-11 w-auto self-start items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition"
                    style={{
                      WebkitAppearance: 'none',
                      appearance: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      backgroundColor: data.social.is_following ? 'rgba(255, 255, 255, 0.05)' : '#39FF14',
                      border: data.social.is_following ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                      color: data.social.is_following ? '#f9fafb' : '#000000',
                      boxShadow: data.social.is_following ? 'none' : '0 8px 24px rgba(57, 255, 20, 0.18)',
                    }}
                  >
                    {followLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : data.social.is_following ? (
                      <UserCheck className="h-4 w-4" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    {data.social.is_following ? 'Following' : 'Follow'}
                  </button>
                  {canReceiveTips ? (
                    <button
                      type="button"
                      onClick={() => setIsTipModalOpen(true)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/[0.06]"
                    >
                      <Heart className="h-4 w-4 text-neon-green" />
                      Send Tip
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/6 pt-1.5 sm:gap-x-8">
              {[
                formatCountLabel(data.social.followers_count, 'Follower'),
                formatCountLabel(data.social.following_count, 'Following', 'Following'),
                formatCountLabel(data.public_projects.length, 'Public project'),
              ].map((stat) => {
                return (
                  <div key={`${stat.value}-${stat.label}`} className="inline-flex min-w-0 items-baseline gap-2.5 whitespace-nowrap">
                    <span className="text-lg font-semibold leading-none text-white sm:text-[19px]">{stat.value}</span>
                    <span className="text-[12px] font-medium leading-none text-gray-400 sm:text-[13px]">
                      {stat.label}
                    </span>
                  </div>
                )
              })}
            </div>

            {(creatorLinks.length > 0 || data.creator.contact_email) ? (
              <div className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.018),rgba(255,255,255,0.008))] px-5 py-5 shadow-[0_18px_45px_rgba(0,0,0,0.14)] sm:px-6 sm:py-6">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Connect</p>
                <div className="flex flex-col gap-3.5">
                  {data.creator.contact_email ? (
                    <a
                      href={`mailto:${data.creator.contact_email}`}
                      className="flex items-start gap-4 rounded-[22px] bg-black/30 px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:bg-white/[0.02] sm:px-5 sm:py-5"
                    >
                      <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[14px] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                        <Mail className="h-4 w-4 text-neon-green" />
                      </div>
                      <div className="min-w-0 max-w-[34ch] flex-1">
                        <div className="text-sm font-semibold text-white">Contact</div>
                        <p
                          className="mt-2 text-sm leading-relaxed text-gray-300"
                          style={{ overflowWrap: 'anywhere' }}
                        >
                          {data.creator.contact_email}
                        </p>
                      </div>
                    </a>
                  ) : null}
                  {creatorLinks.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {creatorLinks.map((item) => {
                        const Icon = item.icon
                        return (
                          <a
                            key={`${item.label}-${item.href}`}
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2.5 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:border-white/16 hover:bg-white/[0.05]"
                          >
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </a>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {data.featured_project ? (
          <section className="mt-6">
            <div className="mb-4">
              <h2 className="text-[24px] font-bold tracking-tight text-white">Featured Project</h2>
              <p className="mt-1.5 text-sm text-gray-500">Pinned to this creator&apos;s profile.</p>
            </div>
            <Link
              href={data.featured_project.target_path}
              onClick={() =>
                emitEvent('project_click', {
                  project_id: data.featured_project?.id,
                  project_target: data.featured_project?.target_path,
                })
              }
              className="ui-card ui-pressable group block overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(7,10,16,0.98))] transition hover:border-white/15"
            >
              {data.featured_project.cover_image_url ? (
                <div className="relative h-48 w-full overflow-hidden border-b border-white/8 bg-black/30 sm:h-56">
                  <Image
                    src={data.featured_project.cover_image_url}
                    alt={data.featured_project.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 896px"
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                </div>
              ) : (
                <div className="flex h-48 w-full items-end border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(57,255,20,0.16),transparent_30%),linear-gradient(180deg,rgba(14,18,28,1),rgba(8,10,16,1))] p-5 sm:h-56">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Featured Project</span>
                </div>
              )}
              <div className="p-5 sm:p-6">
                <p className="text-lg font-semibold text-white">{data.featured_project.title}</p>
                <p className="mt-2 text-sm text-gray-400">Open project</p>
              </div>
            </Link>
          </section>
        ) : null}

        <section className="mt-6">
          <div className="mb-6">
            <h2 className="text-[28px] font-bold tracking-tight text-white">Public Projects</h2>
            <p className="mt-1.5 text-sm text-gray-500">
              {remainingProjects.length > 0
                ? 'Explore what this creator has shared.'
                : data.featured_project
                  ? 'More public releases will show up here.'
                : data.viewer.is_owner_view
                  ? 'Projects you publish publicly will appear here.'
                  : 'Nothing public yet, but this space is ready for future drops.'}
            </p>
          </div>
          {remainingProjects.length === 0 ? (
            <div className="ui-card overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(7,10,16,0.96))] px-7 py-8 sm:px-10 sm:py-9">
              <div className="flex max-w-xl flex-col gap-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-neon-green/20 bg-neon-green/10">
                  <Sparkles className="h-5 w-5 text-neon-green" />
                </div>
                <div className="pr-2">
                  <h3 className="text-lg font-semibold text-white">
                    {data.featured_project ? 'No more public projects yet' : 'No public projects yet'}
                  </h3>
                  <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-gray-400">
                    {data.featured_project
                      ? 'This creator has a featured release up top. Additional public projects will appear here over time.'
                    : data.viewer.is_owner_view
                      ? 'When you make a project public, it will show up here for listeners and collaborators to discover.'
                      : 'This creator has not shared anything publicly yet. Check back soon for new releases, experiments, and updates.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {remainingProjects.map((project) => (
                <Link
                  key={project.id}
                  href={project.target_path}
                  onClick={() =>
                    emitEvent('project_click', {
                      project_id: project.id,
                      project_target: project.target_path,
                    })
                  }
                  className="ui-card ui-pressable group overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(7,10,16,0.98))] transition hover:border-white/15"
                >
                  {project.cover_image_url ? (
                    <div className="relative h-44 w-full overflow-hidden border-b border-white/8 bg-black/30">
                      <Image
                        src={project.cover_image_url}
                        alt={project.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    </div>
                  ) : (
                    <div className="flex h-44 w-full items-end border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(57,255,20,0.16),transparent_30%),linear-gradient(180deg,rgba(14,18,28,1),rgba(8,10,16,1))] p-4">
                      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Public project</span>
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-base font-semibold text-white">{project.title}</p>
                    <p className="mt-1 text-sm text-gray-500">Open project</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
      {data && canReceiveTips ? (
        <CreatorProfileModal
          isOpen={isTipModalOpen}
          onClose={() => setIsTipModalOpen(false)}
          creatorId={data.creator.id}
          openTipComposer
          headerTitle="Send Tip"
          hideViewProfileButton
          viewerKey={authenticated ? 'public-creator-profile' : null}
        />
      ) : null}
    </div>
  )
}
