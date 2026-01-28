'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Edit, Check, X, Instagram, Globe, Save, Camera, Loader2, CreditCard, ExternalLink, CheckCircle, Heart, DollarSign, Mail, MessageSquare, Wallet, HelpCircle, User } from 'lucide-react'
import { showToast } from '@/components/Toast'
import Image from 'next/image'
import { getPendingProject, clearPendingProject } from '@/lib/pendingProject'
import { TipsSkeleton } from '@/components/SkeletonLoader'
import FAQModal from '@/components/FAQModal'

interface UserProfile {
  id: string
  username: string
  email: string | null
  avatar_url: string | null
  bio: string | null
  contact_email: string | null
  website: string | null
  instagram: string | null
  twitter: string | null
  farcaster: string | null
  wallet_address: string | null
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
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [editingUsername, setEditingUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  
  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editProfile, setEditProfile] = useState({
    bio: '',
    contact_email: '',
    website: '',
    instagram: '',
    twitter: '',
    farcaster: '',
  })
  
  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  
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

  const loadedUserIdRef = useRef<string | null>(null)
  const lastProcessedStateRef = useRef<string | null>(null)
  
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
          .select('id, username, email, avatar_url, bio, contact_email, website, instagram, twitter, farcaster, wallet_address')
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

        setProfile({
          id: existingUser.id,
          username: existingUser.username || '',
          email: existingUser.email || user.email?.address || null,
          avatar_url: existingUser.avatar_url || null,
          bio: existingUser.bio || null,
          contact_email: existingUser.contact_email || null,
          website: existingUser.website || null,
          instagram: existingUser.instagram || null,
          twitter: existingUser.twitter || null,
          farcaster: existingUser.farcaster || null,
          wallet_address: existingUser.wallet_address || null,
        })
        
        // Initialize edit form
        setEditProfile({
          bio: existingUser.bio || '',
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
      showToast('Failed to save username', 'error')
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
          bio: editProfile.bio.trim() || null,
          contact_email: editProfile.contact_email.trim() || null,
          website: editProfile.website.trim() || null,
          instagram: editProfile.instagram.trim() || null,
          twitter: editProfile.twitter.trim() || null,
          farcaster: editProfile.farcaster.trim() || null,
        },
      })
      
      setProfile({
        ...profile,
        bio: result.user.bio,
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

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <nav className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-white">
            Demo
          </Link>
          <div className="flex items-center" style={{ gap: '24px' }}>
          <Link
            href="/dashboard"
              className="text-sm text-neon-green hover:opacity-80 underline-offset-4 hover:underline opacity-70"
          >
              Dashboard
          </Link>
            <button
              onClick={logout}
              className="text-sm text-gray-400 hover:text-white transition"
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
              Set up your profile below. Add as much or as little info as you like.
            </p>
            <p className="text-sm text-gray-400 mb-4">
              When you&apos;re ready, head to your{' '}
              <Link href="/dashboard" className="text-neon-green hover:underline font-medium">
                Dashboard
              </Link>
              {' '}to create and manage your projects.
            </p>
            <p className="text-sm text-gray-400">
              View{' '}
              <span 
                onClick={() => setShowFAQ(true)}
                className="text-neon-green hover:underline underline-offset-4 font-medium cursor-pointer"
              >
                FAQs
              </span>
            </p>
          </div>
        )}
        
        <h1 className="text-3xl font-bold mb-6 text-white">{isOnboarding ? 'Set Up Your Profile' : 'Account'}</h1>

        {/* Basic Info Section */}
        <div 
          className="bg-gray-900 rounded-xl mb-6 border border-gray-800"
          style={{ padding: '20px 24px 24px 24px' }}
        >
          <h2 className="font-semibold text-neon-green text-lg" style={{ marginBottom: '20px' }}>
            Basic Info
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Profile Picture */}
            <div className="flex items-center gap-4">
              <label style={{ marginRight: '24px', minWidth: '100px', fontWeight: 600 }} className="text-sm text-white">Profile Picture</label>
              <div className="flex items-center gap-4">
                {/* Avatar display */}
                <div 
                  className="relative"
                  style={{ width: '80px', height: '80px' }}
                >
                  {profile?.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt="Profile"
                      width={80}
                      height={80}
                      className="rounded-full object-cover"
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
                  
                  {/* Upload overlay */}
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
                
                {/* Hidden file input */}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                
                {/* Upload button */}
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="text-sm text-gray-400 hover:text-white transition disabled:opacity-50"
                  style={{ marginLeft: '16px' }}
                >
                  {uploadingAvatar ? 'Uploading...' : profile?.avatar_url ? 'Change photo' : 'Choose photo'}
                </button>
              </div>
            </div>

            {/* Email */}
            <div className="flex items-center">
              <label style={{ marginRight: '24px', minWidth: '100px', fontWeight: 600 }} className="text-sm text-white">Email <span className="text-gray-500 font-normal">(Private)</span></label>
              <span className="text-sm text-white">
                {profile?.email || user?.email?.address || 'Not set'}
              </span>
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
                    className="p-1 text-gray-500 hover:text-white transition"
                    style={{ marginLeft: '16px' }}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

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
                className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition"
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
                      bio: profile?.bio || '',
                      contact_email: profile?.contact_email || '',
                      website: profile?.website || '',
                      instagram: profile?.instagram || '',
                      twitter: profile?.twitter || '',
                      farcaster: profile?.farcaster || '',
                    })
                  }}
                  className="text-sm text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="text-sm bg-neon-green text-black px-4 py-1.5 rounded-lg font-medium hover:opacity-80 transition disabled:opacity-50 flex items-center gap-1"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
          
          <p className="text-sm text-gray-500 mb-6">
            This information will be visible to users who view your projects.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
              <label className="block text-sm text-white mb-3" style={{ fontWeight: 600 }}>Social Links</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Instagram */}
                <div className="flex items-center" style={{ gap: '16px' }}>
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Instagram className="w-4 h-4 text-white" />
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
                <div className="flex items-center" style={{ gap: '16px' }}>
                  <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center border border-gray-600 flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 300 300" fill="white">
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
                <div className="flex items-center" style={{ gap: '16px' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#8A63D2' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                      <path d="M3 5V3h18v2h1v2h-1v14h-2v-9a4 4 0 0 0-4-4h-6a4 4 0 0 0-4 4v9H3V7H2V5h1z"/>
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
          </div>
        </div>

        {/* Payments Section */}
        <div 
          className="bg-gray-900 rounded-xl mb-6 border border-gray-800"
          style={{ padding: '20px 24px 24px 24px' }}
        >
          <h2 className="font-semibold text-neon-green text-lg" style={{ marginBottom: '20px' }}>
            Receive Tips
          </h2>
          
          <p className="text-sm text-gray-500 mb-6">
            Set up payments to receive tips from listeners who enjoy your music.
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
              Add your wallet address to receive tips in crypto (USDC on Base).
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
    </div>
  )
}
