'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Edit, Check, X, Instagram, Globe, Save, Camera, Loader2, CreditCard, ExternalLink, CheckCircle, Heart, DollarSign, MessageSquare, Wallet, HelpCircle, User } from 'lucide-react'
import { showToast } from '@/components/Toast'
import Image from 'next/image'
import { getPendingProject, clearPendingProject } from '@/lib/pendingProject'
import { TipsSkeleton } from '@/components/SkeletonLoader'
import FAQModal from '@/components/FAQModal'
import CreatorProfileModal from '@/components/CreatorProfileModal'
import CreatorEarningsSnapshot from '@/components/CreatorEarningsSnapshot'
import CreatorDigestCard from '@/components/CreatorDigestCard'
import NotificationPreferencesSection from '@/components/NotificationPreferencesSection'
import HiddenDiscoverySection from '@/components/HiddenDiscoverySection'
import OnboardingPreferencesSection from '@/components/OnboardingPreferencesSection'
import SocialGraphListModal from '@/components/SocialGraphListModal'
import type { SocialGraphListType } from '@/lib/socialGraph'
import { getFollowerIdFromQueryParam } from '@/lib/notificationInbox'
import { getCreatorPublicPath } from '@/lib/publicCreatorProfile'
import {
  AVAILABILITY_STATUS_OPTIONS,
  getAvailabilityStatusLabel,
  getProfileTagLabel,
  isAvailabilityStatus,
  isProfileTag,
  PROFILE_TAG_LIMIT,
  PROFILE_TAG_OPTIONS,
  type AvailabilityStatus,
  type ProfileTag,
} from '@/lib/profileCustomization'
import { resolveProjectVisibility } from '@/lib/projectVisibility'

interface UserProfile {
  id: string
  username: string
  display_name: string | null
  email: string | null
  avatar_url: string | null
  banner_image_url: string | null
  bio: string | null
  profile_tags: ProfileTag[]
  availability_status: AvailabilityStatus | null
  pinned_project_id: string | null
  contact_email: string | null
  website: string | null
  instagram: string | null
  twitter: string | null
  farcaster: string | null
  wallet_address: string | null
}

interface SelectablePublicProject {
  id: string
  title: string
  cover_image_url: string | null
}

interface Tip {
  id: string
  amount: number
  currency: string
  tipper_email: string | null  // Captured for records, not displayed
  tipper_username: string | null  // Displayed in UI
  message: string | null
  is_read: boolean
  created_at: string
}

// Wrapper component to provide Suspense boundary for useSearchParams
export default function AccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-neon-green">Loading...</div>
      </div>
    }>
      <AccountPageContent />
    </Suspense>
  )
}

function AccountPageContent() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'
  const followerIdFromQuery = getFollowerIdFromQueryParam(searchParams.get('follower_id'))
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [editingUsername, setEditingUsername] = useState('')
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false)
  const [editingDisplayName, setEditingDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  
  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editProfile, setEditProfile] = useState({
    banner_image_url: '',
    bio: '',
    profile_tags: [] as ProfileTag[],
    availability_status: null as AvailabilityStatus | null,
    pinned_project_id: '',
    contact_email: '',
    website: '',
    instagram: '',
    twitter: '',
    farcaster: '',
  })
  
  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [publicProjects, setPublicProjects] = useState<SelectablePublicProject[]>([])
  
  // Stripe Connect state
  const [stripeStatus, setStripeStatus] = useState<{
    hasAccount: boolean
    onboardingComplete: boolean
    loading: boolean
  }>({ hasAccount: false, onboardingComplete: false, loading: true })
  const [settingUpStripe, setSettingUpStripe] = useState(false)
  
  // Tips state
  const [tips, setTips] = useState<Tip[]>([])
  const [tipsLoading, setTipsLoading] = useState(true)
  const [unreadTipCount, setUnreadTipCount] = useState(0)
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [visibleTipsCount, setVisibleTipsCount] = useState(5)
  const [expandedTips, setExpandedTips] = useState<Set<string>>(new Set())
  
  // Wallet address state
  const [isEditingWallet, setIsEditingWallet] = useState(false)
  const [editingWalletAddress, setEditingWalletAddress] = useState('')
  const [savingWallet, setSavingWallet] = useState(false)
  const [showFAQ, setShowFAQ] = useState(false)
  const [deepLinkedCreatorId, setDeepLinkedCreatorId] = useState<string | null>(null)
  const [isCreatorProfileOpen, setIsCreatorProfileOpen] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isSocialGraphOpen, setIsSocialGraphOpen] = useState(false)
  const [socialGraphType, setSocialGraphType] = useState<SocialGraphListType>('followers')

  const loadedUserIdRef = useRef<string | null>(null)
  const lastProcessedStateRef = useRef<string | null>(null)
  const processedFollowerDeepLinkRef = useRef<string | null>(null)
  
  // Helper function for authenticated API requests
  const apiRequest = useCallback(async (
    endpoint: string,
    options: { method?: string; body?: unknown } = {}
  ) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Not authenticated')
    
    const response = await fetch(endpoint, {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Request failed')
    return data
  }, [getAccessToken])

  const emitEvent = (name: string, detail?: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(name, { detail }))
  }

  useEffect(() => {
    if (!ready) return
    if (!authenticated || !user || !user.id) return
    
    const stateKey = `${user.id}-${ready}-${authenticated}`
    if (lastProcessedStateRef.current === stateKey) return
    lastProcessedStateRef.current = stateKey
    
    const loadProfile = async () => {
      const privyId = user.id
      if (loadedUserIdRef.current === privyId) return
      loadedUserIdRef.current = privyId
      
      try {
        // First try to get existing user via public read
        let { data: existingUser } = await supabase
          .from('users')
          .select('id, username, display_name, email, avatar_url, banner_image_url, bio, profile_tags, availability_status, pinned_project_id, contact_email, website, instagram, twitter, farcaster, wallet_address')
          .eq('privy_id', privyId)
          .single()

        // If user doesn't exist, create via secure API
        if (!existingUser) {
          const result = await apiRequest('/api/user', {
            method: 'POST',
            body: { email: user.email?.address || null },
          })
          existingUser = result.user
        }
        
        if (!existingUser) {
          throw new Error('Failed to load or create user profile')
        }

        const normalizedProfileTags = Array.isArray(existingUser.profile_tags)
          ? existingUser.profile_tags.filter((tag: unknown): tag is ProfileTag => isProfileTag(tag))
          : []
        const normalizedAvailabilityStatus = isAvailabilityStatus(existingUser.availability_status)
          ? existingUser.availability_status
          : null

        setProfile({
          id: existingUser.id,
          username: existingUser.username || '',
          display_name: existingUser.display_name || null,
          email: existingUser.email || user.email?.address || null,
          avatar_url: existingUser.avatar_url || null,
          banner_image_url: existingUser.banner_image_url || null,
          bio: existingUser.bio || null,
          profile_tags: normalizedProfileTags,
          availability_status: normalizedAvailabilityStatus,
          pinned_project_id: existingUser.pinned_project_id || null,
          contact_email: existingUser.contact_email || null,
          website: existingUser.website || null,
          instagram: existingUser.instagram || null,
          twitter: existingUser.twitter || null,
          farcaster: existingUser.farcaster || null,
          wallet_address: existingUser.wallet_address || null,
        })
        setEditingDisplayName(existingUser.display_name || '')
        
        // Initialize edit form
        setEditProfile({
          banner_image_url: existingUser.banner_image_url || '',
          bio: existingUser.bio || '',
          profile_tags: normalizedProfileTags,
          availability_status: normalizedAvailabilityStatus,
          pinned_project_id: existingUser.pinned_project_id || '',
          contact_email: existingUser.contact_email || '',
          twitter: existingUser.twitter || '',
          farcaster: existingUser.farcaster || '',
          website: existingUser.website || '',
          instagram: existingUser.instagram || '',
        })
      } catch (error) {
        console.error('Error loading account profile:', error)
      } finally {
        setLoaded(true)
      }
    }

      loadProfile()
  }, [ready, user?.id, authenticated, user?.email?.address, apiRequest])

  // Auto-start Creator Profile editing in onboarding mode
  useEffect(() => {
    if (isOnboarding && loaded && profile) {
      setIsEditingProfile(true)
    }
  }, [isOnboarding, loaded, profile])

  useEffect(() => {
    if (!profile?.id) return

    const loadPublicProjects = async () => {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('id, title, cover_image_url, visibility, sharing_enabled, created_at')
          .eq('creator_id', profile.id)
          .order('created_at', { ascending: false })

        if (error) throw error

        setPublicProjects(
          (data || [])
            .filter((project) => resolveProjectVisibility(project.visibility, project.sharing_enabled) === 'public')
            .map((project) => ({
              id: project.id,
              title: project.title?.trim() || 'Untitled project',
              cover_image_url: project.cover_image_url || null,
            }))
        )
      } catch (error) {
        console.error('Error loading public projects for profile customization:', error)
      }
    }

    loadPublicProjects()
  }, [profile?.id])

  // Deep-link entry point: /account?follower_id=<uuid>
  useEffect(() => {
    if (!ready || !authenticated) return
    if (!followerIdFromQuery) return
    if (processedFollowerDeepLinkRef.current === followerIdFromQuery) return
    processedFollowerDeepLinkRef.current = followerIdFromQuery

    const resolveFollowerDeepLink = async () => {
      try {
        const { data: followerUser } = await supabase
          .from('users')
          .select('id')
          .eq('id', followerIdFromQuery)
          .single()

        if (!followerUser?.id) return

        setDeepLinkedCreatorId(followerUser.id)
        setIsCreatorProfileOpen(true)

        emitEvent('creator_profile_opened', {
          source: 'notification',
          creator_id: followerUser.id,
          entry_path: `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
        })
      } catch (error) {
        console.error('Invalid or missing follower deep-link target:', error)
      }
    }

    resolveFollowerDeepLink()
  }, [authenticated, followerIdFromQuery, pathname, ready, searchParams])

  // Check Stripe Connect status
  useEffect(() => {
    if (!profile?.id) return

    const checkStripeStatus = async () => {
      try {
        const token = await getAccessToken()
        const response = await fetch('/api/stripe/connect', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
        const data = await response.json()
        
        if (response.ok) {
          setStripeStatus({
            hasAccount: data.hasAccount,
            onboardingComplete: data.onboardingComplete,
            loading: false,
          })
        }
      } catch (error) {
        console.error('Error checking Stripe status:', error)
        setStripeStatus(prev => ({ ...prev, loading: false }))
      }
    }

    checkStripeStatus()
  }, [profile?.id, getAccessToken])

  useEffect(() => {
    if (!profile?.id) return

    const loadFollowCounts = async () => {
      try {
        const token = authenticated ? await getAccessToken() : null
        const response = await fetch(`/api/follows?creator_id=${profile.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!response.ok) return
        const result = await response.json()
        setFollowerCount(result.followerCount || 0)
        setFollowingCount(result.followingCount || 0)
      } catch (error) {
        console.error('Error loading social graph counts:', error)
      }
    }

    loadFollowCounts()
  }, [authenticated, getAccessToken, profile?.id])

  // Load tips
  useEffect(() => {
    if (!profile?.id || !stripeStatus.onboardingComplete) {
      setTipsLoading(false)
      return
    }

    const loadTips = async () => {
      try {
        const token = await getAccessToken()
        const response = await fetch('/api/tips', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
        const data = await response.json()
        
        if (response.ok) {
          setTips(data.tips || [])
          setUnreadTipCount(data.unreadCount || 0)
          setTotalEarnings(data.totalEarnings || 0)
        }
      } catch (error) {
        console.error('Error loading tips:', error)
      } finally {
        setTipsLoading(false)
      }
    }

    loadTips()
  }, [profile?.id, stripeStatus.onboardingComplete, getAccessToken])

  // Mark tips as read
  const markTipsAsRead = async () => {
    if (!profile?.id || unreadTipCount === 0) return
    
    try {
      const token = await getAccessToken()
      await fetch('/api/tips', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      })
      
      setUnreadTipCount(0)
      setTips(tips.map(tip => ({ ...tip, is_read: true })))
    } catch (error) {
      console.error('Error marking tips as read:', error)
    }
  }

  // Handle Stripe Connect onboarding
  const handleSetupStripe = async () => {
    if (!profile) return
    
    setSettingUpStripe(true)
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: profile.email,
        }),
      })

      const data = await response.json()
      
      if (response.ok && data.url) {
        window.location.href = data.url
      } else {
        showToast(data.error || 'Failed to set up payments', 'error')
      }
    } catch (error) {
      console.error('Error setting up Stripe:', error)
      showToast('Failed to set up payments', 'error')
    } finally {
      setSettingUpStripe(false)
    }
  }

  // Handle saving wallet address (via secure API)
  const handleSaveWalletAddress = async () => {
    if (!profile) return
    
    const address = editingWalletAddress.trim()
    
    // Basic validation for Ethereum address
    if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      showToast('Please enter a valid Ethereum address (0x...)', 'error')
      return
    }
    
    setSavingWallet(true)
    try {
      const result = await apiRequest('/api/user', {
        method: 'PATCH',
        body: { wallet_address: address || null },
      })
      
      setProfile({ ...profile, wallet_address: result.user.wallet_address })
      setIsEditingWallet(false)
      showToast(address ? 'Wallet address saved!' : 'Wallet address removed', 'success')
    } catch (error) {
      console.error('Error saving wallet address:', error)
      showToast('Failed to save wallet address', 'error')
    } finally {
      setSavingWallet(false)
    }
  }

  // Handle saving username (via secure API)
  const handleSaveUsername = async () => {
    if (!profile) {
      showToast('Profile not loaded - please refresh the page', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await apiRequest('/api/user', {
        method: 'PATCH',
        body: { username: editingUsername.trim() || null },
      })
      
      setProfile({ ...profile, username: result.user.username || '' })
      setIsEditingUsername(false)
      showToast('Username saved!', 'success')
      
      // If in onboarding mode with a pending project, save it to library
      if (isOnboarding) {
        const pendingProject = getPendingProject()
        if (pendingProject) {
          try {
            const token = await getAccessToken()
            if (token) {
              // Check if already saved
              const { data: existingSave } = await supabase
                .from('user_projects')
        .select('id')
                .eq('user_id', profile.id)
                .eq('project_id', pendingProject.projectId)
        .single()

              if (!existingSave) {
                // Save the project to user's library
                await fetch('/api/library', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ projectId: pendingProject.projectId }),
                })
                showToast(`"${pendingProject.title}" saved to your library!`, 'success')
              }
            }
          } catch (error) {
            console.error('Error saving pending project:', error)
          } finally {
            clearPendingProject()
          }
        }
        // Don't auto-redirect - let user continue setting up their profile
      }
    } catch (error) {
      console.error('Error saving username:', error)
      if (error instanceof Error && /username.*taken/i.test(error.message)) {
        showToast('That username is already taken.', 'error')
      } else {
        showToast('Failed to save username', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDisplayName = async () => {
    if (!profile) {
      showToast('Profile not loaded - please refresh the page', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await apiRequest('/api/user', {
        method: 'PATCH',
        body: { display_name: editingDisplayName.trim() || null },
      })
      setProfile({ ...profile, display_name: result.user.display_name || null })
      setIsEditingDisplayName(false)
      showToast('Display name saved!', 'success')
    } catch (error) {
      console.error('Error saving display name:', error)
      showToast('Failed to save display name', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Handle avatar upload (storage upload + secure API for user update)
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !profile) return
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error')
      return
    }
    
    // Validate file size (max 25MB for profile pictures)
    const maxSizeMB = 25
    if (file.size > maxSizeMB * 1024 * 1024) {
      showToast(`Image is too large. Please use an image under ${maxSizeMB}MB`, 'error')
      return
    }
    
    setUploadingAvatar(true)
    try {
      // Create unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`
      
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })
      
      if (uploadError) {
        console.error('Upload error:', uploadError)
        // Check for specific error types
        if (uploadError.message?.includes('Payload too large') || uploadError.message?.includes('413')) {
          throw new Error('File size too large. Please use a smaller image.')
        }
        throw uploadError
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)
      
      // Update user profile via secure API
      const result = await apiRequest('/api/user', {
        method: 'PATCH',
        body: { avatar_url: publicUrl },
      })
      
      setProfile({ ...profile, avatar_url: result.user.avatar_url })
      showToast('Profile picture updated!', 'success')
    } catch (error: unknown) {
      console.error('Error uploading avatar:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload profile picture'
      showToast(errorMessage, 'error')
    } finally {
      setUploadingAvatar(false)
      // Reset input
      if (avatarInputRef.current) {
        avatarInputRef.current.value = ''
      }
    }
  }

  const handleBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !profile) return

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error')
      return
    }

    const maxSizeMB = 25
    if (file.size > maxSizeMB * 1024 * 1024) {
      showToast(`Image is too large. Please use an image under ${maxSizeMB}MB`, 'error')
      return
    }

    setUploadingBanner(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`
      const filePath = `banners/${fileName}`

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true })
      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(filePath)

      setEditProfile((prev) => ({ ...prev, banner_image_url: publicUrl }))
      showToast('Banner image ready to save.', 'success')
    } catch (error: unknown) {
      console.error('Error uploading banner:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload banner'
      showToast(errorMessage, 'error')
    } finally {
      setUploadingBanner(false)
      if (bannerInputRef.current) {
        bannerInputRef.current.value = ''
      }
    }
  }

  const toggleProfileTag = (tag: ProfileTag) => {
    setEditProfile((prev) => {
      const hasTag = prev.profile_tags.includes(tag)
      if (hasTag) {
        return { ...prev, profile_tags: prev.profile_tags.filter((item) => item !== tag) }
      }
      if (prev.profile_tags.length >= PROFILE_TAG_LIMIT) {
        showToast(`Choose up to ${PROFILE_TAG_LIMIT} profile tags.`, 'info')
        return prev
      }
      return { ...prev, profile_tags: [...prev.profile_tags, tag] }
    })
  }

  // Handle saving profile (via secure API)
  const handleSaveProfile = async () => {
    if (!profile) {
      showToast('Profile not loaded - please refresh the page', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await apiRequest('/api/user', {
        method: 'PATCH',
        body: {
          banner_image_url: editProfile.banner_image_url.trim() || null,
          bio: editProfile.bio.trim() || null,
          profile_tags: editProfile.profile_tags,
          availability_status: editProfile.availability_status,
          pinned_project_id: editProfile.pinned_project_id || null,
          contact_email: editProfile.contact_email.trim() || null,
          website: editProfile.website.trim() || null,
          instagram: editProfile.instagram.trim() || null,
          twitter: editProfile.twitter.trim() || null,
          farcaster: editProfile.farcaster.trim() || null,
        },
      })

      const normalizedProfileTags = Array.isArray(result.user.profile_tags)
        ? result.user.profile_tags.filter((tag: unknown): tag is ProfileTag => isProfileTag(tag))
        : []
      const normalizedAvailabilityStatus = isAvailabilityStatus(result.user.availability_status)
        ? result.user.availability_status
        : null
      
      setProfile({
        ...profile,
        banner_image_url: result.user.banner_image_url,
        bio: result.user.bio,
        profile_tags: normalizedProfileTags,
        availability_status: normalizedAvailabilityStatus,
        pinned_project_id: result.user.pinned_project_id,
        contact_email: result.user.contact_email,
        website: result.user.website,
        instagram: result.user.instagram,
        twitter: result.user.twitter,
        farcaster: result.user.farcaster,
      })
      setIsEditingProfile(false)
      showToast('Profile updated!', 'success')
    } catch (error) {
      console.error('Error saving profile:', error)
      showToast('Failed to save profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-neon-green">Loading...</div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="mb-4 text-neon-green opacity-90">Please sign in to manage your account</p>
          <button
            onClick={login}
            className="bg-white text-black px-6 py-2 rounded-full font-semibold"
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  const emailSignIn = profile?.email || user?.email?.address || null
  const phoneAccount = (user as { phone?: { number?: string; e164?: string; phoneNumber?: string } | null } | null)?.phone
  const phoneSignIn = phoneAccount?.number || phoneAccount?.e164 || phoneAccount?.phoneNumber || null
  const signInMethodLabel = emailSignIn ? 'Email' : phoneSignIn ? 'Phone Number' : 'Sign in'
  const signInMethodValue = emailSignIn || phoneSignIn || 'Not set'

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <nav className="app-shell-nav">
        <div className="app-shell-inner max-w-4xl">
          <Link href="/" className="app-shell-brand text-2xl">
            Demo
          </Link>
          <div className="app-shell-actions" style={{ gap: '16px' }}>
          <Link
            href="/dashboard"
              className="app-shell-link sm:text-sm"
          >
              Dashboard
          </Link>
            <button
              onClick={logout}
              className="btn-unstyled app-shell-link ui-link-muted text-[15px]"
              style={{
                WebkitAppearance: 'none',
                appearance: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="px-4 py-8 max-w-4xl mx-auto">
        {/* Onboarding Banner */}
        {isOnboarding && (
          <div 
            className="bg-gradient-to-r from-neon-green/20 to-green-900/20 border border-neon-green/30 rounded-xl mb-6"
            style={{ padding: '20px 24px' }}
          >
            <h2 className="text-xl font-bold text-neon-green mb-3">Welcome to Demo</h2>
            <p className="text-gray-300 mb-4">
              Set up your profile below. Username is required. Add as much or as little info as you like.
            </p>
            <p className="text-sm text-gray-400 mb-4">
              When you&apos;re ready, head to your{' '}
              <button
                type="button"
                onClick={(e) => {
                  if (!profile?.username) {
                    e.preventDefault()
                    showToast('Choose a username', 'error')
                  } else {
                    router.push('/dashboard')
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (!profile?.username) {
                      e.preventDefault()
                      showToast('Choose a username', 'error')
                    } else {
                      router.push('/dashboard')
                    }
                  }
                }}
                className="btn-unstyled ui-link font-medium cursor-pointer"
              >
                Dashboard
              </button>
              {' '}to create and manage your projects.
            </p>
            <p className="text-sm text-gray-400">
              View{' '}
              <button 
                type="button"
                onClick={() => setShowFAQ(true)}
                className="ui-link font-medium cursor-pointer bg-transparent border-none p-0 m-0"
                style={{ background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit' }}
              >
                FAQs
              </button>
            </p>
          </div>
        )}
        
        <h1 className="text-3xl font-bold mb-6 text-white">{isOnboarding ? 'Set Up Your Profile' : 'Account'}</h1>

        {/* Creator Profile Section */}
        <div 
          className="bg-gray-900 rounded-xl mb-6 border border-gray-800"
          style={{ padding: '20px 24px 24px 24px' }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
            <h2 className="font-semibold text-neon-green text-lg">
              Creator Profile
            </h2>
            {!isEditingProfile ? (
              <button
                onClick={() => setIsEditingProfile(true)}
                className="btn-secondary rounded-md px-3 py-1.5 text-sm"
                style={{
                  WebkitAppearance: 'none',
                  appearance: 'none',
                }}
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsEditingProfile(false)
                    // Reset to current values
                    setEditProfile({
                      banner_image_url: profile?.banner_image_url || '',
                      bio: profile?.bio || '',
                      profile_tags: profile?.profile_tags || [],
                      availability_status: profile?.availability_status || null,
                      pinned_project_id: profile?.pinned_project_id || '',
                      contact_email: profile?.contact_email || '',
                      website: profile?.website || '',
                      instagram: profile?.instagram || '',
                      twitter: profile?.twitter || '',
                      farcaster: profile?.farcaster || '',
                    })
                  }}
                  className="btn-ghost text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="btn-primary rounded-lg px-4 py-1.5 text-sm disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="rounded-2xl border border-gray-800 bg-black/30 p-4 sm:p-5">
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-white">User Info</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Profile Picture */}
                <div className="flex items-center gap-4">
                  <label style={{ marginRight: '24px', minWidth: '100px', fontWeight: 600 }} className="text-sm text-white">Profile Picture</label>
                  <div className="flex items-center gap-4">
                    <div className="relative aspect-square h-20 w-20 min-h-20 min-w-20 flex-shrink-0 overflow-hidden rounded-full">
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt="Profile"
                          className="block h-full w-full rounded-full object-cover object-center"
                          style={{ width: '80px', height: '80px' }}
                        />
                      ) : (
                        <div
                          className="bg-gray-800 rounded-full flex items-center justify-center"
                          style={{ width: '80px', height: '80px' }}
                        >
                          <User className="w-10 h-10 text-gray-500" />
                        </div>
                      )}

                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
                      >
                        {uploadingAvatar ? (
                          <Loader2 className="w-6 h-6 text-white animate-spin" />
                        ) : (
                          <Camera className="w-6 h-6 text-white" />
                        )}
                      </button>
                    </div>

                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />

                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="inline-flex min-h-9 items-center rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
                      style={{
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        marginLeft: '16px',
                        backgroundColor: '#111827',
                        border: '1px solid #374151',
                        color: '#f3f4f6',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      {uploadingAvatar ? 'Uploading...' : profile?.avatar_url ? 'Change photo' : 'Choose photo'}
                    </button>
                  </div>
                </div>

                {/* Username */}
                <div className="flex items-center">
                  <label style={{ marginRight: '24px', minWidth: '100px', fontWeight: 600 }} className="text-sm text-white">Username</label>
                  {isEditingUsername ? (
                    <div className="flex items-center gap-2" style={{ flex: '1', minWidth: 0 }}>
                      <input
                        type="text"
                        value={editingUsername}
                        onChange={(e) => setEditingUsername(e.target.value)}
                        placeholder="Choose a username"
                        className="bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                        style={{ flex: '1', minWidth: '100px', maxWidth: '200px' }}
                        autoFocus
                      />
                      <button
                        onClick={handleSaveUsername}
                        disabled={saving}
                        className="p-1.5 bg-neon-green text-black rounded-lg hover:opacity-80 transition disabled:opacity-50 flex-shrink-0"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingUsername(false)
                          setEditingUsername(profile?.username || '')
                        }}
                        className="p-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center flex-1">
                      <span className="text-sm text-white">
                        {profile?.username || 'Not set'}
                      </span>
                      <button
                        onClick={() => {
                          setEditingUsername(profile?.username || '')
                          setIsEditingUsername(true)
                        }}
                        className="inline-flex min-h-9 items-center justify-center rounded-md p-2 transition"
                        style={{
                          WebkitAppearance: 'none',
                          appearance: 'none',
                          marginLeft: '16px',
                          backgroundColor: '#111827',
                          border: '1px solid #374151',
                          color: '#f3f4f6',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Display Name */}
                <div className="flex items-center">
                  <label style={{ marginRight: '24px', minWidth: '100px', fontWeight: 600 }} className="text-sm text-white">Display Name</label>
                  {isEditingDisplayName ? (
                    <div className="flex items-center gap-2" style={{ flex: '1', minWidth: 0 }}>
                      <input
                        type="text"
                        value={editingDisplayName}
                        onChange={(e) => setEditingDisplayName(e.target.value)}
                        placeholder="How your name appears publicly"
                        className="bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                        style={{ flex: '1', minWidth: '100px', maxWidth: '280px' }}
                        autoFocus
                      />
                      <button
                        onClick={handleSaveDisplayName}
                        disabled={saving}
                        className="p-1.5 bg-neon-green text-black rounded-lg hover:opacity-80 transition disabled:opacity-50 flex-shrink-0"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingDisplayName(false)
                          setEditingDisplayName(profile?.display_name || '')
                        }}
                        className="p-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center flex-1">
                      <span className="text-sm text-white">
                        {profile?.display_name || <span className="text-gray-500 italic">Not set</span>}
                      </span>
                      <button
                        onClick={() => {
                          setEditingDisplayName(profile?.display_name || '')
                          setIsEditingDisplayName(true)
                        }}
                        className="inline-flex min-h-9 items-center justify-center rounded-md p-2 transition"
                        style={{
                          WebkitAppearance: 'none',
                          appearance: 'none',
                          marginLeft: '16px',
                          backgroundColor: '#111827',
                          border: '1px solid #374151',
                          color: '#f3f4f6',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-500 italic">
              This information will be visible to users who view your projects.
            </p>

            {/* Bio */}
            <div>
              <label className="block text-sm text-white mb-2" style={{ fontWeight: 600 }}>Bio</label>
              {isEditingProfile ? (
                <textarea
                  value={editProfile.bio}
                  onChange={(e) => setEditProfile({ ...editProfile, bio: e.target.value })}
                  placeholder="Tell listeners about yourself..."
                  rows={3}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green resize-none"
                />
              ) : (
                <p className="text-sm text-white">
                  {profile?.bio || <span className="text-gray-600 italic">No bio yet</span>}
                </p>
              )}
            </div>

            {/* Contact Email */}
            <div>
              <label className="block text-sm text-white mb-2" style={{ fontWeight: 600 }}>Contact Email</label>
              {isEditingProfile ? (
                <input
                  type="email"
                  value={editProfile.contact_email}
                  onChange={(e) => setEditProfile({ ...editProfile, contact_email: e.target.value })}
                  placeholder="Public email for collaboration inquiries"
                  className="w-full max-w-md bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                />
              ) : (
                <p className="text-sm text-white">
                  {profile?.contact_email || <span className="text-gray-600 italic">Not set</span>}
                </p>
              )}
            </div>

            {/* Website */}
            <div>
              <label className="block text-sm text-white mb-2" style={{ fontWeight: 600 }}>Website</label>
              {isEditingProfile ? (
                <div className="flex items-center gap-2 max-w-md">
                  <Globe className="w-4 h-4 text-gray-500" />
                  <input
                    type="url"
                    value={editProfile.website}
                    onChange={(e) => setEditProfile({ ...editProfile, website: e.target.value })}
                    placeholder="https://yourwebsite.com"
                    className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                  />
                </div>
              ) : (
                <p className="text-sm text-white">
                  {profile?.website ? (
                    <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-neon-green hover:underline">
                      {profile.website}
                    </a>
                  ) : (
                    <span className="text-gray-600 italic">Not set</span>
                  )}
                </p>
              )}
            </div>

            {/* Social Links */}
            <div>
              <label className="block text-sm text-white" style={{ fontWeight: 600, marginBottom: '16px' }}>Social Links</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Instagram */}
                <div className="flex items-center" style={{ gap: '12px' }}>
                  <div style={{ width: '24px', minWidth: '24px' }} className="flex items-center justify-center">
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  {isEditingProfile ? (
                    <input
                      type="text"
                      value={editProfile.instagram}
                      onChange={(e) => setEditProfile({ ...editProfile, instagram: e.target.value })}
                      placeholder="Instagram username"
                      className="flex-1 max-w-xs bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                    />
                  ) : (
                    <span className="text-sm text-white">
                      {profile?.instagram ? `@${profile.instagram}` : <span className="text-gray-600 italic">Not set</span>}
                    </span>
                  )}
                </div>
                
                {/* X (Twitter) */}
                <div className="flex items-center" style={{ gap: '12px' }}>
                  <div style={{ width: '24px', minWidth: '24px' }} className="flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 300 300" fill="white">
                      <path d="M178.57 127.15 290.27 0h-26.46l-97.03 110.38L89.34 0H0l117.13 166.93L0 300h26.46l102.4-116.59L209.66 300H299L178.57 127.15Zm-36.25 41.29-11.87-16.62L36.8 19.5h40.65l76.18 106.7 11.87 16.62 99.03 138.68h-40.65l-80.87-113.06Z"/>
                    </svg>
                  </div>
                  {isEditingProfile ? (
                    <input
                      type="text"
                      value={editProfile.twitter}
                      onChange={(e) => setEditProfile({ ...editProfile, twitter: e.target.value })}
                      placeholder="X (Twitter) username"
                      className="flex-1 max-w-xs bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                    />
                  ) : (
                    <span className="text-sm text-white">
                      {profile?.twitter ? `@${profile.twitter}` : <span className="text-gray-600 italic">Not set</span>}
                    </span>
                  )}
                </div>
                
                {/* Farcaster */}
                <div className="flex items-center" style={{ gap: '12px' }}>
                  <div style={{ width: '24px', minWidth: '24px' }} className="flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 1000 1000" fill="#8A63D2">
                      <path d="M257.778 155.556H742.222V844.444H671.111V528.889C671.111 442.593 601.109 372.778 514.444 372.778H485.556C398.891 372.778 328.889 442.593 328.889 528.889V844.444H257.778V155.556Z"/>
                      <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z"/>
                      <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.444H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z"/>
                    </svg>
                  </div>
                  {isEditingProfile ? (
                    <input
                      type="text"
                      value={editProfile.farcaster}
                      onChange={(e) => setEditProfile({ ...editProfile, farcaster: e.target.value })}
                      placeholder="Farcaster username"
                      className="flex-1 max-w-xs bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                    />
                  ) : (
                    <span className="text-sm text-white">
                      {profile?.farcaster ? `@${profile.farcaster}` : <span className="text-gray-600 italic">Not set</span>}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-black/30 p-4 sm:p-5">
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-white">Profile customization</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
                  Add a banner, highlight one public project, and choose a few genres so your public page feels more like you.
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-white">Banner image</label>
                  <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950/80">
                    {editProfile.banner_image_url ? (
                      <div className="relative h-28 w-full sm:h-36">
                        <img
                          src={editProfile.banner_image_url}
                          alt="Profile banner preview"
                          className="h-full w-full object-cover object-center"
                        />
                      </div>
                    ) : (
                      <div className="flex h-28 items-end bg-[radial-gradient(circle_at_top_left,rgba(57,255,20,0.16),transparent_32%),linear-gradient(180deg,rgba(14,18,28,1),rgba(8,10,16,1))] px-4 py-4 sm:h-36">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">No banner yet</p>
                      </div>
                    )}
                  </div>
                  {isEditingProfile ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      <input
                        ref={bannerInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleBannerUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => bannerInputRef.current?.click()}
                        disabled={uploadingBanner}
                        className="inline-flex min-h-9 items-center rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition disabled:opacity-50"
                      >
                        {uploadingBanner ? 'Uploading...' : editProfile.banner_image_url ? 'Change banner' : 'Upload banner'}
                      </button>
                      {editProfile.banner_image_url ? (
                        <button
                          type="button"
                          onClick={() => setEditProfile((prev) => ({ ...prev, banner_image_url: '' }))}
                          className="inline-flex min-h-9 items-center rounded-md border border-gray-700 bg-black px-3 py-1.5 text-sm font-medium text-gray-300 transition hover:text-white"
                        >
                          Remove banner
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-white">Pinned project</label>
                  {isEditingProfile ? (
                    <select
                      value={editProfile.pinned_project_id}
                      onChange={(e) => setEditProfile((prev) => ({ ...prev, pinned_project_id: e.target.value }))}
                      className="w-full max-w-md rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                    >
                      <option value="">No pinned project</option>
                      {publicProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.title}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-white">
                      {publicProjects.find((project) => project.id === profile?.pinned_project_id)?.title || (
                        <span className="text-gray-600 italic">No pinned project</span>
                      )}
                    </p>
                  )}
                  {publicProjects.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">Make at least one project public to pin it on your profile.</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-white">Availability</label>
                  {isEditingProfile ? (
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={() => setEditProfile((prev) => ({ ...prev, availability_status: null }))}
                        className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition ${
                          !editProfile.availability_status
                            ? 'border-neon-green/30 bg-neon-green/10 text-neon-green'
                            : 'border-gray-700 bg-black text-gray-300 hover:text-white'
                        }`}
                      >
                        None
                      </button>
                      {AVAILABILITY_STATUS_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setEditProfile((prev) => ({ ...prev, availability_status: option.id }))}
                          className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition ${
                            editProfile.availability_status === option.id
                              ? 'border-neon-green/30 bg-neon-green/10 text-neon-green'
                              : 'border-gray-700 bg-black text-gray-300 hover:text-white'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-white">
                      {profile?.availability_status ? (
                        getAvailabilityStatusLabel(profile.availability_status)
                      ) : (
                        <span className="text-gray-600 italic">No availability status</span>
                      )}
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="block text-sm font-semibold text-white">Profile genres</label>
                    <span className="text-xs text-gray-500">
                      {editProfile.profile_tags.length}/{PROFILE_TAG_LIMIT}
                    </span>
                  </div>
                  {isEditingProfile ? (
                    <div className="flex flex-wrap gap-2.5">
                      {PROFILE_TAG_OPTIONS.map((option) => {
                        const selected = editProfile.profile_tags.includes(option.id)
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => toggleProfileTag(option.id)}
                            className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition ${
                              selected
                                ? 'border-neon-green/30 bg-neon-green/10 text-neon-green'
                                : 'border-gray-700 bg-black text-gray-300 hover:text-white'
                            }`}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  ) : profile?.profile_tags.length ? (
                    <div className="flex flex-wrap gap-2.5">
                      {profile.profile_tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex min-h-9 items-center rounded-full border border-gray-700 bg-black px-3.5 text-sm font-medium text-gray-200"
                        >
                          {getProfileTagLabel(tag)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 italic">No profile genres yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="bg-gray-900 rounded-xl mb-6 border border-gray-800"
          style={{ padding: '20px 24px 24px 24px' }}
        >
          <h2 className="font-semibold text-neon-green text-lg" style={{ marginBottom: '16px' }}>
            Sign in Method
          </h2>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-800 bg-black/30 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-white">
                {signInMethodLabel} <span className="text-gray-500 font-normal text-[11px]">(Private)</span>
              </p>
              <p className="mt-1 text-sm text-gray-300 break-all">{signInMethodValue}</p>
            </div>
          </div>
        </div>

        {profile?.id ? (
          <div
            className="bg-gray-900 rounded-xl mb-6 border border-gray-800"
            style={{ padding: '20px 24px 24px 24px' }}
          >
            <h2 className="font-semibold text-neon-green text-lg" style={{ marginBottom: '14px' }}>
              Social Graph
            </h2>
            <div className="grid max-w-sm grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSocialGraphType('followers')
                  setIsSocialGraphOpen(true)
                }}
                className="inline-flex flex-col items-start rounded-lg border border-gray-800 bg-black/40 px-3 py-2 text-left transition hover:border-gray-600"
                style={{
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  backgroundColor: 'rgba(0, 0, 0, 0.45)',
                  border: '1px solid rgba(55, 65, 81, 0.9)',
                  color: '#ffffff',
                  padding: '8px 12px',
                }}
              >
                <span className="text-lg font-semibold leading-none text-white">{followerCount}</span>
                <span className="mt-1 text-[11px] font-medium uppercase tracking-wide text-gray-300">
                  Followers
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSocialGraphType('following')
                  setIsSocialGraphOpen(true)
                }}
                className="inline-flex flex-col items-start rounded-lg border border-gray-800 bg-black/40 px-3 py-2 text-left transition hover:border-gray-600"
                style={{
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  backgroundColor: 'rgba(0, 0, 0, 0.45)',
                  border: '1px solid rgba(55, 65, 81, 0.9)',
                  color: '#ffffff',
                  padding: '8px 12px',
                }}
              >
                <span className="text-lg font-semibold leading-none text-white">{followingCount}</span>
                <span className="mt-1 text-[11px] font-medium uppercase tracking-wide text-gray-300">
                  Following
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Payments Section */}
        <CreatorEarningsSnapshot
          authenticated={authenticated}
          getAccessToken={getAccessToken}
          source="account"
        />
        <CreatorDigestCard
          authenticated={authenticated}
          getAccessToken={getAccessToken}
          source="account"
        />

        <NotificationPreferencesSection
          authenticated={authenticated}
          getAccessToken={getAccessToken}
        />
        <OnboardingPreferencesSection
          authenticated={authenticated}
          getAccessToken={getAccessToken}
          source={isOnboarding ? 'onboarding' : 'account_settings'}
          isOnboardingMode={isOnboarding}
        />
        <HiddenDiscoverySection
          authenticated={authenticated}
          getAccessToken={getAccessToken}
        />

        {/* Payments Section */}
        <div 
          className="bg-gray-900 rounded-xl mb-6 border border-gray-800"
          style={{ padding: '20px 24px 24px 24px' }}
        >
          <h2 className="font-semibold text-neon-green text-lg" style={{ marginBottom: '20px' }}>
            Receive Tips
          </h2>
          
          <p className="text-sm text-gray-500 mb-6">
            Set up payments to receive tips from listeners who want to support you.
          </p>

          {stripeStatus.loading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Checking payment status...</span>
            </div>
          ) : stripeStatus.onboardingComplete ? (
            <div className="flex items-center" style={{ gap: '24px' }}>
              <div className="flex items-center" style={{ gap: '8px' }}>
                <CheckCircle className="w-5 h-5 text-neon-green" />
                <span className="text-sm font-medium text-neon-green">Payments enabled</span>
              </div>
              <button
                onClick={handleSetupStripe}
                disabled={settingUpStripe}
                className="text-sm text-gray-400 hover:text-white transition flex items-center"
                style={{ gap: '4px' }}
              >
                <ExternalLink className="w-4 h-4" />
                Manage
              </button>
            </div>
          ) : stripeStatus.hasAccount ? (
            <div>
              <p className="text-sm text-yellow-500 mb-3">
                Your payment setup is incomplete. Click below to finish.
              </p>
              <button
                onClick={handleSetupStripe}
                disabled={settingUpStripe}
                className="flex items-center gap-2 bg-neon-green text-black px-4 py-2 rounded-lg font-medium hover:opacity-80 transition disabled:opacity-50"
              >
                {settingUpStripe ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                {settingUpStripe ? 'Loading...' : 'Complete Setup'}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-400 mb-4">
                Connect with Stripe to start receiving tips. Stripe handles all payments securely.
              </p>
              <button
                onClick={handleSetupStripe}
                disabled={settingUpStripe}
                className="flex items-center gap-2 bg-neon-green text-black px-4 py-2 rounded-lg font-medium hover:opacity-80 transition disabled:opacity-50"
              >
                {settingUpStripe ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                {settingUpStripe ? 'Loading...' : 'Set Up Payments'}
              </button>
            </div>
          )}

          {/* Crypto Wallet Section */}
          <div style={{ borderTop: '1px solid #374151', marginTop: '24px', paddingTop: '24px' }}>
            <div className="flex items-center" style={{ gap: '12px', marginBottom: '12px' }}>
              <Wallet className="w-5 h-5 text-neon-green" />
              <h3 className="font-medium text-white">Crypto Tips</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Add your wallet address to receive tips in crypto.
            </p>
            
            {isEditingWallet ? (
              <div className="flex items-center" style={{ gap: '12px' }}>
                <input
                  type="text"
                  value={editingWalletAddress}
                  onChange={(e) => setEditingWalletAddress(e.target.value)}
                  placeholder="0x..."
                  className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green font-mono"
                  style={{ maxWidth: '400px' }}
                />
                <button
                  onClick={handleSaveWalletAddress}
                  disabled={savingWallet}
                  className="p-2 bg-neon-green text-black rounded-lg hover:opacity-80 transition disabled:opacity-50"
                >
                  {savingWallet ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsEditingWallet(false)
                    setEditingWalletAddress(profile?.wallet_address || '')
                  }}
                  className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : profile?.wallet_address ? (
              <div className="flex items-center" style={{ gap: '16px' }}>
                <div className="flex items-center" style={{ gap: '8px' }}>
                  <CheckCircle className="w-5 h-5 text-neon-green" />
                  <span className="text-sm font-medium text-neon-green">Wallet connected</span>
                </div>
                <span className="text-sm text-gray-400 font-mono">
                  {profile.wallet_address.slice(0, 6)}...{profile.wallet_address.slice(-4)}
                </span>
                <button
                  onClick={() => {
                    setEditingWalletAddress(profile.wallet_address || '')
                    setIsEditingWallet(true)
                  }}
                  className="text-sm text-gray-400 hover:text-white transition"
                >
                  Edit
                </button>
              </div>
            ) : (
            <button
                onClick={() => {
                  setEditingWalletAddress('')
                  setIsEditingWallet(true)
                }}
                className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-700 transition"
              >
                <Wallet className="w-4 h-4" />
                Add Wallet Address
            </button>
            )}
          </div>
        </div>

        {/* Tips Received Section - Only show if any payment method is set up */}
        {(stripeStatus.onboardingComplete || profile?.wallet_address) && (
          <div 
            className="bg-gray-900 rounded-xl mb-6 border border-gray-800"
            style={{ padding: '20px 24px 24px 24px' }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
              <div className="flex items-center" style={{ gap: '12px' }}>
                <h2 className="font-semibold text-neon-green text-lg">
                  Tips Received
                </h2>
                {unreadTipCount > 0 && (
                  <span className="bg-neon-green text-black text-xs font-bold px-2 py-0.5 rounded-full">
                    {unreadTipCount} new
                  </span>
                )}
              </div>
              {unreadTipCount > 0 && (
                <button
                  onClick={markTipsAsRead}
                  className="text-sm text-gray-400 hover:text-white transition"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-black rounded-lg p-4 border border-gray-800 text-center">
                <p className="text-2xl font-bold text-white">${(totalEarnings / 100).toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">All Time</p>
              </div>
              <div className="bg-black rounded-lg p-4 border border-gray-800 text-center">
                <p className="text-2xl font-bold text-white">{tips.length}</p>
                <p className="text-xs text-gray-500 mt-1">Tips</p>
              </div>
              <div className="bg-black rounded-lg p-4 border border-gray-800 text-center">
                <p className="text-2xl font-bold text-white">
                  ${tips.length > 0 ? ((totalEarnings / 100) / tips.length).toFixed(2) : '0.00'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Average</p>
              </div>
            </div>

            {/* Tips List */}
            {tipsLoading ? (
              <TipsSkeleton />
            ) : tips.length === 0 ? (
              <div className="text-center py-8">
                <Heart className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500">No tips yet</p>
                <p className="text-sm text-gray-600 mt-1">
                  When listeners send you tips, they&apos;ll appear here
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-3">Recent</p>
                <div className="divide-y divide-gray-800">
                  {tips.slice(0, visibleTipsCount).map((tip) => {
                    const isExpanded = expandedTips.has(tip.id)
                    const hasMessage = !!tip.message
                    
                    return (
                      <div
                        key={tip.id}
                        className={`py-3 ${!tip.is_read ? 'bg-gray-800/30' : ''}`}
                      >
                        <div 
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => {
                            if (hasMessage) {
                              setExpandedTips(prev => {
                                const next = new Set(prev)
                                if (next.has(tip.id)) {
                                  next.delete(tip.id)
                                } else {
                                  next.add(tip.id)
                                }
                                return next
                              })
                            }
                          }}
                        >
                          <div className="flex items-center" style={{ gap: '12px' }}>
                            <span className="text-white font-semibold" style={{ minWidth: '60px' }}>
                              ${(tip.amount / 100).toFixed(2)}
                            </span>
                            <span className="text-gray-400 text-sm">
                              {tip.tipper_username ? `@${tip.tipper_username}` : 'Anonymous'}
                            </span>
                            {hasMessage && (
                              <MessageSquare className={`w-3.5 h-3.5 transition-colors ${isExpanded ? 'text-neon-green' : 'text-gray-600'}`} />
                            )}
                            {!tip.is_read && (
                              <span className="w-2 h-2 rounded-full bg-neon-green" />
                            )}
                          </div>
                          <span className="text-xs text-gray-600">
                            {(() => {
                              const now = new Date()
                              const tipDate = new Date(tip.created_at)
                              const diffMs = now.getTime() - tipDate.getTime()
                              const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
                              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
                              
                              if (diffHours < 1) return 'Just now'
                              if (diffHours < 24) return `${diffHours}h ago`
                              if (diffDays < 7) return `${diffDays}d ago`
                              return tipDate.toLocaleDateString()
                            })()}
                          </span>
                        </div>
                        {hasMessage && isExpanded && (
                          <div className="mt-2 ml-[72px] text-sm text-gray-300 bg-gray-800/50 rounded-lg p-3">
                            &quot;{tip.message}&quot;
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                
                {/* Show More Button */}
                {tips.length > visibleTipsCount && (
                  <button
                    onClick={() => setVisibleTipsCount(prev => prev + 10)}
                    className="w-full mt-4 py-2 text-sm text-gray-400 hover:text-white transition border border-gray-800 rounded-lg hover:border-gray-700"
                  >
                    Show more ({tips.length - visibleTipsCount} older tips)
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* FAQ Modal */}
      <FAQModal isOpen={showFAQ} onClose={() => setShowFAQ(false)} />

      {/* Follower deep-link profile modal entry point */}
      {deepLinkedCreatorId && (
        <CreatorProfileModal
          isOpen={isCreatorProfileOpen}
          onClose={() => setIsCreatorProfileOpen(false)}
          creatorId={deepLinkedCreatorId}
        />
      )}

      {profile?.id ? (
        <SocialGraphListModal
          isOpen={isSocialGraphOpen}
          onClose={() => setIsSocialGraphOpen(false)}
          profileUserId={profile.id}
          listType={socialGraphType}
          source="account"
          currentDbUserId={profile.id}
          onOpenUser={(userId) => {
            setIsSocialGraphOpen(false)
            router.push(getCreatorPublicPath({ id: userId }))
          }}
        />
      ) : null}
    </div>
  )
}
