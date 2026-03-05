'use client'

import { useState, useEffect } from 'react'
import { X, Mail, Globe, Instagram, ExternalLink, Heart, Loader2, EyeOff, CreditCard, Wallet, UserPlus, UserCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import { showToast } from '@/components/Toast'
import { usePrivy } from '@privy-io/react-auth'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { applyFollowerCountDelta } from '@/lib/follows'
import { markTipPromptConvertedInSession, type TipPromptSource, type TipPromptTrigger } from '@/lib/tipPrompt'
import SocialGraphListModal from '@/components/SocialGraphListModal'
import type { SocialGraphListType } from '@/lib/socialGraph'
import { getCreatorPublicPath } from '@/lib/publicCreatorProfile'
import {
  resolveProjectVisibility,
  shouldShowProjectOnCreatorProfile,
  type ProjectVisibility,
} from '@/lib/projectVisibility'

// Dynamically import CryptoTipButton to avoid SSR issues
const CryptoTipButton = dynamic(() => import('@/components/CryptoTipButton'), {
  ssr: false,
  loading: () => (
    <button
      disabled
      style={{
        width: '100%',
        padding: '12px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: '#39FF14',
        color: '#000',
        fontSize: '14px',
        fontWeight: 600,
        opacity: 0.5,
      }}
    >
      Loading...
    </button>
  ),
})

interface CreatorProfile {
  id: string
  username: string | null
  email: string | null
  avatar_url: string | null
  bio: string | null
  contact_email: string | null
  website: string | null
  instagram: string | null
  twitter: string | null
  farcaster: string | null
  stripe_onboarding_complete: boolean | null
  wallet_address: string | null
}

interface CreatorProfileModalProps {
  isOpen: boolean
  onClose: () => void
  creatorId: string
  openTipComposer?: boolean
  tipContext?: {
    source: TipPromptSource
    trigger: TipPromptTrigger
    projectId: string
  } | null
  viewerKey?: string | null
}

interface CreatorProfileProjectPreview {
  id: string
  title: string
  share_token: string
  visibility: ProjectVisibility
}

export default function CreatorProfileModal({
  isOpen,
  onClose,
  creatorId,
  openTipComposer = false,
  tipContext = null,
  viewerKey = null,
}: CreatorProfileModalProps) {
  const router = useRouter()
  const { user, authenticated, login, getAccessToken } = usePrivy()
  const [activeCreatorId, setActiveCreatorId] = useState(creatorId)
  const [creator, setCreator] = useState<CreatorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [projectCount, setProjectCount] = useState(0)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [tipperUsername, setTipperUsername] = useState<string | null>(null)
  const [currentDbUserId, setCurrentDbUserId] = useState<string | null>(null)
  const [isSocialGraphOpen, setIsSocialGraphOpen] = useState(false)
  const [socialGraphType, setSocialGraphType] = useState<SocialGraphListType>('followers')
  const [creatorProjects, setCreatorProjects] = useState<CreatorProfileProjectPreview[]>([])
  
  // Tip state
  const [showTipOptions, setShowTipOptions] = useState(false)
  const [selectedTip, setSelectedTip] = useState<number | null>(null)
  const [customTip, setCustomTip] = useState('')
  const [tipMessage, setTipMessage] = useState('')
  const [processingTip, setProcessingTip] = useState(false)
  const [sendAnonymously, setSendAnonymously] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'crypto'>('card')

  const TIP_AMOUNTS = [
    { value: 100, label: '$1' },
    { value: 500, label: '$5' },
    { value: 2000, label: '$20' },
    { value: 10000, label: '$100' },
  ]

  const emitEvent = (name: string, detail?: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(name, { detail }))
  }

  const fetchFollowState = async (targetCreatorId: string) => {
    if (!targetCreatorId) return

    const headers: Record<string, string> = {}
    if (authenticated) {
      const token = await getAccessToken()
      if (token) headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`/api/follows?creator_id=${targetCreatorId}`, { headers })
    if (!response.ok) return

    const result = await response.json()
    setFollowerCount(result.followerCount || 0)
    setFollowingCount(result.followingCount || 0)
    setIsFollowing(!!result.isFollowing)
  }

  useEffect(() => {
    if (isOpen) {
      setActiveCreatorId(creatorId)
    }
  }, [isOpen, creatorId])

  useEffect(() => {
    if (!isOpen || !activeCreatorId) return

    const loadCreator = async () => {
      setLoading(true)
      try {
        let viewerDbUserId: string | null = null
        // Fetch current user's username for tipping and self-view checks
        if (authenticated && user?.id) {
          const { data: tipperData } = await supabase
            .from('users')
            .select('id, username')
            .eq('privy_id', user.id)
            .single()

          viewerDbUserId = tipperData?.id || null
          setCurrentDbUserId(viewerDbUserId)
          setTipperUsername(tipperData?.username || null)
        } else {
          setCurrentDbUserId(null)
          setTipperUsername(null)
        }

        // Fetch creator profile including wallet_address
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, username, email, avatar_url, bio, contact_email, website, instagram, twitter, farcaster, stripe_onboarding_complete, wallet_address')
          .eq('id', activeCreatorId)
          .single()

        if (userError) throw userError
        setCreator(userData)

        const isOwnProfile = viewerDbUserId === activeCreatorId
        const { data: creatorProjectRows, error: projectError } = await supabase
          .from('projects')
          .select('id, title, share_token, visibility, sharing_enabled, created_at')
          .eq('creator_id', activeCreatorId)
          .order('created_at', { ascending: false })
          .limit(25)

        if (projectError) {
          console.error('Failed to load creator projects:', projectError)
          setProjectCount(0)
          setCreatorProjects([])
        } else {
          const visibleProjects = (creatorProjectRows || [])
            .map((row) => ({
              id: row.id as string,
              title: (row.title as string) || 'Untitled project',
              share_token: row.share_token as string,
              visibility: resolveProjectVisibility(row.visibility, row.sharing_enabled as boolean | null),
            }))
            .filter((row) =>
              shouldShowProjectOnCreatorProfile({
                visibility: row.visibility,
                isCreator: isOwnProfile,
              })
            )

          setProjectCount(visibleProjects.length)
          setCreatorProjects(visibleProjects.slice(0, 6))
        }

        await fetchFollowState(activeCreatorId)
      } catch (error) {
        console.error('Error loading creator profile:', error)
      } finally {
        setLoading(false)
      }
    }

    loadCreator()
  }, [isOpen, activeCreatorId, authenticated, user?.id])

  // Reset tip state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowTipOptions(false)
      setSelectedTip(null)
      setCustomTip('')
      setTipMessage('')
      setSendAnonymously(false)
      setPaymentMethod('card')
      setCurrentDbUserId(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && openTipComposer) {
      setShowTipOptions(true)
    }
  }, [isOpen, openTipComposer])

  const handleSendTip = async () => {
    const amount = selectedTip || (customTip ? Math.round(parseFloat(customTip) * 100) : 0)
    
    if (!amount || amount < 100) {
      showToast('Please enter a valid tip amount (minimum $1)', 'error')
      return
    }

    if (amount > 50000) {
      showToast('Maximum tip amount is $500', 'error')
      return
    }

    setProcessingTip(true)
    try {
      const token = authenticated ? await getAccessToken() : null
      const response = await fetch('/api/stripe/tip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          creatorId: creator?.id,
          amount,
          message: tipMessage,
          tipperUsername: sendAnonymously ? null : tipperUsername,
          projectId: tipContext?.projectId || null,
          tipPromptSource: tipContext?.source || null,
          tipPromptTrigger: tipContext?.trigger || null,
          viewerKey,
        }),
      })

      const data = await response.json()

      if (response.ok && data.url) {
        window.location.href = data.url
      } else {
        showToast(data.error || 'Failed to process tip', 'error')
      }
    } catch (error) {
      console.error('Error sending tip:', error)
      showToast('Failed to process tip', 'error')
    } finally {
      setProcessingTip(false)
    }
  }

  const handleToggleFollow = async () => {
    if (!authenticated) {
        emitEvent('creator_follow_auth_required', { creatorId: activeCreatorId })
      login()
      return
    }

    if (!creator || followLoading) return
    if (currentDbUserId && currentDbUserId === creator.id) return

    setFollowLoading(true)
    emitEvent('creator_follow_toggle_started', {
      creatorId: creator.id,
      action: isFollowing ? 'unfollow' : 'follow',
    })

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(
        isFollowing
          ? '/api/follows'
          : '/api/follows',
        {
          method: isFollowing ? 'DELETE' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ following_id: creator.id }),
        }
      )

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update follow status')

      const nextIsFollowing = !isFollowing
      setIsFollowing(nextIsFollowing)
      setFollowerCount((prev) => applyFollowerCountDelta(prev, nextIsFollowing))
      await fetchFollowState(creator.id)

      emitEvent('creator_follow_toggle_succeeded', {
        creatorId: creator.id,
        action: nextIsFollowing ? 'follow' : 'unfollow',
      })
    } catch (error) {
      emitEvent('creator_follow_toggle_failed', {
        creatorId: creator.id,
        action: isFollowing ? 'unfollow' : 'follow',
      })
      console.error('Error toggling follow:', error)
      showToast(error instanceof Error ? error.message : 'Failed to update follow status', 'error')
    } finally {
      setFollowLoading(false)
    }
  }

  // Get the tip amount in dollars for Daimo
  const getTipAmountDollars = () => {
    const amount = selectedTip || (customTip ? Math.round(parseFloat(customTip) * 100) : 0)
    return (amount / 100).toFixed(2)
  }

  // Check if tip amount is valid
  const isTipValid = () => {
    const amount = selectedTip || (customTip ? Math.round(parseFloat(customTip) * 100) : 0)
    return amount >= 100 && amount <= 50000
  }

  if (!isOpen) return null

  const displayName = creator?.username || creator?.email?.split('@')[0] || 'Creator'
  
  // Check which payment methods are available
  const hasStripe = creator?.stripe_onboarding_complete
  const hasCrypto = creator?.wallet_address
  const canTip = hasStripe || hasCrypto

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          zIndex: 900,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'calc(100% - 32px)',
          maxWidth: '480px',
          maxHeight: '85vh',
          backgroundColor: '#111827',
          borderRadius: '16px',
          zIndex: 901,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #374151',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#fff' }}>
            Creator Profile
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#374151',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <X style={{ width: '18px', height: '18px', color: '#9ca3af' }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#39FF14' }}>
              Loading...
            </div>
          ) : creator ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Avatar and Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    backgroundColor: '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '32px',
                    fontWeight: 700,
                    color: '#39FF14',
                    overflow: 'hidden',
                  }}
                >
                  {creator.avatar_url ? (
                    <Image
                      src={creator.avatar_url}
                      alt={displayName}
                      width={80}
                      height={80}
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', margin: 0 }}>
                    {displayName}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', color: '#9ca3af' }}>
                      {projectCount} {projectCount === 1 ? 'project' : 'projects'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSocialGraphType('followers')
                        setIsSocialGraphOpen(true)
                      }}
                      style={{
                        border: '1px solid #374151',
                        borderRadius: '999px',
                        padding: '2px 8px',
                        background: 'transparent',
                        color: '#d1d5db',
                        fontSize: '12px',
                      }}
                    >
                      {followerCount} followers
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSocialGraphType('following')
                        setIsSocialGraphOpen(true)
                      }}
                      style={{
                        border: '1px solid #374151',
                        borderRadius: '999px',
                        padding: '2px 8px',
                        background: 'transparent',
                        color: '#d1d5db',
                        fontSize: '12px',
                      }}
                    >
                      {followingCount} following
                    </button>
                  </div>
                </div>
              </div>

              {/* Follow CTA */}
              {(!authenticated || currentDbUserId !== creator.id) && (
                <button
                  onClick={handleToggleFollow}
                  disabled={followLoading}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px',
                    backgroundColor: isFollowing ? '#1f2937' : '#39FF14',
                    color: isFollowing ? '#fff' : '#000',
                    borderRadius: '12px',
                    border: isFollowing ? '1px solid #374151' : 'none',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: followLoading ? 'not-allowed' : 'pointer',
                    opacity: followLoading ? 0.7 : 1,
                  }}
                >
                  {followLoading ? (
                    <>
                      <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                      Saving...
                    </>
                  ) : isFollowing ? (
                    <>
                      <UserCheck style={{ width: '16px', height: '16px' }} />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus style={{ width: '16px', height: '16px' }} />
                      Follow
                    </>
                  )}
                </button>
              )}

              {/* Bio */}
              {creator.bio && (
                <div>
                  <p style={{ fontSize: '15px', color: '#d1d5db', lineHeight: 1.6, margin: 0 }}>
                    {creator.bio}
                  </p>
                </div>
              )}

              {creatorProjects.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#fff', margin: '0 0 10px' }}>
                    Projects
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {creatorProjects.map((project) => (
                      <a
                        key={project.id}
                        href={`/share/${project.share_token}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          backgroundColor: '#1f2937',
                          textDecoration: 'none',
                        }}
                        className="hover:bg-gray-700"
                      >
                        <span style={{ fontSize: '13px', color: '#e5e7eb', fontWeight: 500 }}>{project.title}</span>
                        {currentDbUserId === creator.id ? (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#9ca3af',
                              border: '1px solid #374151',
                              borderRadius: '999px',
                              padding: '2px 8px',
                              textTransform: 'capitalize',
                            }}
                          >
                            {project.visibility}
                          </span>
                        ) : null}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact & Links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Contact Email */}
                {creator.contact_email && (
                  <a
                    href={`mailto:${creator.contact_email}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      backgroundColor: '#1f2937',
                      borderRadius: '12px',
                      textDecoration: 'none',
                      transition: 'background-color 0.2s',
                    }}
                    className="hover:bg-gray-700"
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: '#374151',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Mail style={{ width: '20px', height: '20px', color: '#39FF14' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff' }}>Email</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af' }}>{creator.contact_email}</div>
                    </div>
                  </a>
                )}

                {/* Website */}
                {creator.website && (
                  <a
                    href={creator.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      backgroundColor: '#1f2937',
                      borderRadius: '12px',
                      textDecoration: 'none',
                    }}
                    className="hover:bg-gray-700"
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: '#374151',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Globe style={{ width: '20px', height: '20px', color: '#39FF14' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff' }}>Website</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {creator.website.replace(/^https?:\/\//, '')}
                      </div>
                    </div>
                    <ExternalLink style={{ width: '16px', height: '16px', color: '#6b7280' }} />
                  </a>
                )}

                {/* Social Links */}
                {(creator.instagram || creator.twitter || creator.farcaster) && (
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {/* Instagram */}
                    {creator.instagram && (
                      <a
                        href={`https://instagram.com/${creator.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          width: '48px',
                          height: '48px',
                          background: 'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #F77737 100%)',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={`@${creator.instagram}`}
                      >
                        <Instagram style={{ width: '24px', height: '24px', color: '#fff' }} />
                      </a>
                    )}
                    
                    {/* X (Twitter) */}
                    {creator.twitter && (
                      <a
                        href={`https://x.com/${creator.twitter}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          width: '48px',
                          height: '48px',
                          backgroundColor: '#000',
                          border: '1px solid #374151',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={`@${creator.twitter}`}
                      >
                        <svg width="22" height="22" viewBox="0 0 300 300" fill="white">
                          <path d="M178.57 127.15 290.27 0h-26.46l-97.03 110.38L89.34 0H0l117.13 166.93L0 300h26.46l102.4-116.59L209.66 300H299L178.57 127.15Zm-36.25 41.29-11.87-16.62L36.8 19.5h40.65l76.18 106.7 11.87 16.62 99.03 138.68h-40.65l-80.87-113.06Z"/>
                        </svg>
                      </a>
                    )}
                    
                    {/* Farcaster */}
                    {creator.farcaster && (
                      <a
                        href={`https://farcaster.xyz/${creator.farcaster}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          width: '48px',
                          height: '48px',
                          backgroundColor: '#8A63D2',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={`@${creator.farcaster}`}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                          <path d="M3 5V3h18v2h1v2h-1v14h-2v-9a4 4 0 0 0-4-4h-6a4 4 0 0 0-4 4v9H3V7H2V5h1z"/>
                        </svg>
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* No contact info message */}
              {!creator.contact_email && !creator.website && !creator.instagram && !creator.twitter && !creator.farcaster && !creator.bio && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                  <p style={{ margin: 0 }}>This creator hasn&apos;t added their contact info yet.</p>
                </div>
              )}

              {/* Tip Section */}
              {canTip && (
                <div style={{ 
                  borderTop: '1px solid #374151', 
                  paddingTop: '24px',
                  marginTop: '8px',
                }}>
                  {!showTipOptions ? (
                    <button
                      onClick={() => setShowTipOptions(true)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '14px',
                        backgroundColor: '#39FF14',
                        color: '#000',
                        borderRadius: '12px',
                        border: 'none',
                        fontSize: '15px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Heart style={{ width: '18px', height: '18px' }} />
                      Send a Tip
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', margin: 0 }}>
                        Support {displayName}
                      </h4>

                      {/* Payment method toggle - only show if both are available */}
                      {hasStripe && hasCrypto && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => setPaymentMethod('card')}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '10px',
                              borderRadius: '8px',
                              border: paymentMethod === 'card' ? '2px solid #39FF14' : '2px solid #374151',
                              backgroundColor: paymentMethod === 'card' ? 'rgba(57, 255, 20, 0.1)' : 'transparent',
                              color: paymentMethod === 'card' ? '#39FF14' : '#9ca3af',
                              fontSize: '14px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            <CreditCard style={{ width: '16px', height: '16px' }} />
                            Card
                          </button>
                          <button
                            onClick={() => setPaymentMethod('crypto')}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '10px',
                              borderRadius: '8px',
                              border: paymentMethod === 'crypto' ? '2px solid #39FF14' : '2px solid #374151',
                              backgroundColor: paymentMethod === 'crypto' ? 'rgba(57, 255, 20, 0.1)' : 'transparent',
                              color: paymentMethod === 'crypto' ? '#39FF14' : '#9ca3af',
                              fontSize: '14px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            <Wallet style={{ width: '16px', height: '16px' }} />
                            Crypto
                          </button>
                        </div>
                      )}
                      
                      {/* Preset amounts */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {TIP_AMOUNTS.map((tip) => (
                          <button
                            key={tip.value}
                            onClick={() => {
                              setSelectedTip(tip.value)
                              setCustomTip('')
                            }}
                            style={{
                              padding: '10px 20px',
                              borderRadius: '8px',
                              border: selectedTip === tip.value ? '2px solid #39FF14' : '2px solid #374151',
                              backgroundColor: selectedTip === tip.value ? 'rgba(57, 255, 20, 0.1)' : 'transparent',
                              color: selectedTip === tip.value ? '#39FF14' : '#fff',
                              fontSize: '14px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            {tip.label}
                          </button>
                        ))}
                      </div>

                      {/* Custom amount */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#9ca3af', fontSize: '14px' }}>or</span>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <span style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#9ca3af',
                          }}>$</span>
                          <input
                            type="number"
                            value={customTip}
                            onChange={(e) => {
                              setCustomTip(e.target.value)
                              setSelectedTip(null)
                            }}
                            placeholder="Custom"
                            min="1"
                            max="500"
                            style={{
                              width: '100%',
                              padding: '10px 12px 10px 28px',
                              borderRadius: '8px',
                              border: '2px solid #374151',
                              backgroundColor: 'transparent',
                              color: '#fff',
                              fontSize: '14px',
                            }}
                          />
                        </div>
                      </div>

                      {/* Optional message */}
                      <input
                        type="text"
                        value={tipMessage}
                        onChange={(e) => setTipMessage(e.target.value)}
                        placeholder="Add a message (optional)"
                        maxLength={200}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '2px solid #374151',
                          backgroundColor: 'transparent',
                          color: '#fff',
                          fontSize: '14px',
                        }}
                      />

                      {/* Anonymous toggle */}
                      <button
                        type="button"
                        onClick={() => setSendAnonymously(!sendAnonymously)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '0',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '4px',
                            border: sendAnonymously ? '2px solid #39FF14' : '2px solid #374151',
                            backgroundColor: sendAnonymously ? 'rgba(57, 255, 20, 0.2)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {sendAnonymously && (
                            <EyeOff style={{ width: '12px', height: '12px', color: '#39FF14' }} />
                          )}
                        </div>
                        <span style={{ fontSize: '13px', color: sendAnonymously ? '#39FF14' : '#9ca3af' }}>
                          Send anonymously
                        </span>
                      </button>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          onClick={() => setShowTipOptions(false)}
                          style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #374151',
                            backgroundColor: 'transparent',
                            color: '#9ca3af',
                            fontSize: '14px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        
                        {/* Stripe payment button */}
                        {paymentMethod === 'card' && hasStripe && (
                          <button
                            onClick={handleSendTip}
                            disabled={processingTip || (!selectedTip && !customTip)}
                            style={{
                              flex: 2,
                              padding: '12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: '#39FF14',
                              color: '#000',
                              fontSize: '14px',
                              fontWeight: 600,
                              cursor: processingTip || (!selectedTip && !customTip) ? 'not-allowed' : 'pointer',
                              opacity: processingTip || (!selectedTip && !customTip) ? 0.5 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                            }}
                          >
                            {processingTip ? (
                              <>
                                <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                                Processing...
                              </>
                            ) : (
                              <>
                                <CreditCard style={{ width: '16px', height: '16px' }} />
                                Pay with Card
                              </>
                            )}
                          </button>
                        )}
                        
                        {/* Crypto payment button - only show when crypto selected and valid */}
                        {/* Key forces remount when amount changes (Daimo props are frozen after first render) */}
                        {paymentMethod === 'crypto' && hasCrypto && isTipValid() && (
                          <div style={{ flex: 2 }}>
                            <CryptoTipButton
                              key={`crypto-tip-${getTipAmountDollars()}`}
                              creatorId={creator.id}
                              creatorName={displayName}
                              walletAddress={creator.wallet_address!}
                              amount={getTipAmountDollars()}
                              tipperUsername={sendAnonymously ? null : tipperUsername}
                              message={tipMessage || null}
                              projectId={tipContext?.projectId || null}
                              getAccessToken={getAccessToken}
                              onSuccess={() => {
                                if (tipContext?.projectId && viewerKey) {
                                  markTipPromptConvertedInSession(tipContext.projectId, viewerKey)
                                  if (typeof window !== 'undefined') {
                                    window.dispatchEvent(
                                      new CustomEvent('tip_prompt_converted', {
                                        detail: {
                                          schema: 'tip_prompt.v1',
                                          action: 'converted',
                                          source: tipContext.source,
                                          trigger: tipContext.trigger,
                                          project_id: tipContext.projectId,
                                          creator_id: creator.id,
                                          authenticated: !!authenticated,
                                          is_creator: currentDbUserId === creator.id,
                                        },
                                      })
                                    )
                                  }
                                }
                                setShowTipOptions(false)
                                setSelectedTip(null)
                                setCustomTip('')
                                setTipMessage('')
                              }}
                            />
                          </div>
                        )}
                        
                        {/* Show disabled crypto button when amount invalid */}
                        {paymentMethod === 'crypto' && hasCrypto && !isTipValid() && (
                          <button
                            disabled
                            style={{
                              flex: 2,
                              padding: '12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: '#39FF14',
                              color: '#000',
                              fontSize: '14px',
                              fontWeight: 600,
                              cursor: 'not-allowed',
                              opacity: 0.5,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                            }}
                          >
                            <Wallet style={{ width: '16px', height: '16px' }} />
                            Pay with Crypto
                          </button>
                        )}

                        {/* Fallback for only stripe */}
                        {!hasStripe && hasCrypto && paymentMethod === 'card' && (
                          <button
                            disabled
                            style={{
                              flex: 2,
                              padding: '12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: '#374151',
                              color: '#9ca3af',
                              fontSize: '14px',
                              fontWeight: 600,
                              cursor: 'not-allowed',
                            }}
                          >
                            Card not available
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
              Creator not found
            </div>
          )}
        </div>
      </div>
      {activeCreatorId ? (
        <SocialGraphListModal
          isOpen={isSocialGraphOpen}
          onClose={() => setIsSocialGraphOpen(false)}
          profileUserId={activeCreatorId}
          listType={socialGraphType}
          source="creator_profile"
          currentDbUserId={currentDbUserId}
          onOpenUser={(userId) => {
            setIsSocialGraphOpen(false)
            router.push(getCreatorPublicPath({ id: userId }))
            onClose()
          }}
        />
      ) : null}
    </>
  )
}
