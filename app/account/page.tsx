'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Edit, Check, X, Instagram, Globe, Save, Camera, Loader2, CreditCard, ExternalLink, CheckCircle } from 'lucide-react'
import { showToast } from '@/components/Toast'
import Image from 'next/image'

interface UserProfile {
  id: string
  username: string
  email: string | null
  avatar_url: string | null
  bio: string | null
  contact_email: string | null
  website: string | null
  instagram: string | null
}

export default function AccountPage() {
  const { ready, authenticated, user, login, logout } = usePrivy()
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

  const loadedUserIdRef = useRef<string | null>(null)
  const lastProcessedStateRef = useRef<string | null>(null)
  
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
        let { data: existingUser } = await supabase
          .from('users')
          .select('id, username, email, avatar_url, bio, contact_email, website, instagram')
          .eq('privy_id', privyId)
          .single()

        if (!existingUser) {
          const { data: newUser, error } = await supabase
            .from('users')
            .insert({
              privy_id: privyId,
              email: user.email?.address || null,
            })
            .select('id, username, email, avatar_url, bio, contact_email, website, instagram')
            .single()

          if (error) throw error
          existingUser = newUser
        }

        console.log('Profile loaded from DB:', existingUser)
        setProfile({
          id: existingUser.id,
          username: existingUser.username || '',
          email: existingUser.email || user.email?.address || null,
          avatar_url: existingUser.avatar_url || null,
          bio: existingUser.bio || null,
          contact_email: existingUser.contact_email || null,
          website: existingUser.website || null,
          instagram: existingUser.instagram || null,
        })
        console.log('Profile state set with id:', existingUser.id)
        
        // Initialize edit form
        setEditProfile({
          bio: existingUser.bio || '',
          contact_email: existingUser.contact_email || '',
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
  }, [ready, user?.id, authenticated])

  // Check Stripe Connect status
  useEffect(() => {
    if (!profile?.id) return

    const checkStripeStatus = async () => {
      try {
        const response = await fetch(`/api/stripe/connect?userId=${profile.id}`)
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
  }, [profile?.id])

  // Handle Stripe Connect onboarding
  const handleSetupStripe = async () => {
    if (!profile) return
    
    setSettingUpStripe(true)
    try {
      const response = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
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

  const handleSaveUsername = async () => {
    console.log('handleSaveUsername called', { profile, editingUsername })
    if (!profile) {
      console.log('No profile found')
      alert('Profile not loaded - please refresh the page')
      return
    }
    setSaving(true)
    try {
      console.log('Updating username for profile.id:', profile.id)
      const { data, error } = await supabase
        .from('users')
        .update({ username: editingUsername.trim() || null })
        .eq('id', profile.id)
        .select()

      console.log('Username save result:', { data, error })
      
      if (error) {
        console.error('Supabase error:', error)
        alert(`Database error: ${error.message}`)
        throw error
      }
      
      setProfile({ ...profile, username: editingUsername.trim() })
      setIsEditingUsername(false)
      showToast('Username updated!', 'success')
    } catch (error) {
      console.error('Error saving username:', error)
      showToast('Failed to save username', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !profile) return
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error')
      return
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be less than 5MB', 'error')
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
        throw uploadError
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)
      
      // Update user profile with new avatar URL
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id)
      
      if (updateError) throw updateError
      
      setProfile({ ...profile, avatar_url: publicUrl })
      showToast('Profile picture updated!', 'success')
    } catch (error) {
      console.error('Error uploading avatar:', error)
      showToast('Failed to upload profile picture', 'error')
    } finally {
      setUploadingAvatar(false)
      // Reset input
      if (avatarInputRef.current) {
        avatarInputRef.current.value = ''
      }
    }
  }

  const handleSaveProfile = async () => {
    console.log('handleSaveProfile called', { profile, editProfile })
    if (!profile) {
      console.log('No profile, returning')
      alert('Profile not loaded - please refresh the page')
      return
    }
    setSaving(true)
    try {
      console.log('Saving profile to database...', profile.id)
      const { data, error } = await supabase
        .from('users')
        .update({
          bio: editProfile.bio.trim() || null,
          contact_email: editProfile.contact_email.trim() || null,
          website: editProfile.website.trim() || null,
          instagram: editProfile.instagram.trim() || null,
        })
        .eq('id', profile.id)
        .select()

      console.log('Save result:', { data, error })
      
      if (error) {
        console.error('Supabase error:', error)
        alert(`Database error: ${error.message}`)
        throw error
      }
      
      if (!data || data.length === 0) {
        console.log('No data returned - RLS might be blocking the update')
        alert('Update may have failed - no data returned. Check RLS policies.')
      }
      
      setProfile({
        ...profile,
        bio: editProfile.bio.trim() || null,
        contact_email: editProfile.contact_email.trim() || null,
        website: editProfile.website.trim() || null,
        instagram: editProfile.instagram.trim() || null,
      })
      setIsEditingProfile(false)
      showToast('Profile updated!', 'success')
    } catch (error) {
      console.error('Error saving profile:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
            Hubba
          </Link>
          <div className="flex items-center gap-6">
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
        <h1 className="text-3xl font-bold mb-6 text-white">Account</h1>

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
              <label style={{ marginRight: '24px', minWidth: '100px' }} className="text-sm text-gray-400">Profile Picture</label>
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
                      className="bg-gray-700 rounded-full flex items-center justify-center text-2xl font-bold text-neon-green"
                      style={{ width: '80px', height: '80px' }}
                    >
                      {(profile?.username || profile?.email || 'U').charAt(0).toUpperCase()}
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
                >
                  {uploadingAvatar ? 'Uploading...' : 'Change photo'}
                </button>
              </div>
            </div>

            {/* Email */}
            <div className="flex items-center">
              <label style={{ marginRight: '24px', minWidth: '100px' }} className="text-sm text-gray-400">Email</label>
              <span className="text-sm text-white">
                {profile?.email || user?.email?.address || 'Not set'}
              </span>
            </div>

            {/* Username */}
            <div className="flex items-center">
              <label style={{ marginRight: '24px', minWidth: '100px' }} className="text-sm text-gray-400">Username</label>
              {isEditingUsername ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editingUsername}
                    onChange={(e) => setEditingUsername(e.target.value)}
                    placeholder="Choose a username"
                    className="flex-1 max-w-xs bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveUsername}
                    disabled={saving}
                    className="p-1.5 bg-neon-green text-black rounded-lg hover:opacity-80 transition disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingUsername(false)
                      setEditingUsername(profile?.username || '')
                    }}
                    className="p-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
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
                    className="ml-3 p-1 text-gray-500 hover:text-white transition"
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
              <label className="block text-sm text-gray-400 mb-2">Bio</label>
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
              <label className="block text-sm text-gray-400 mb-2">Contact Email</label>
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
              <label className="block text-sm text-gray-400 mb-2">Website</label>
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
              <label className="block text-sm text-gray-400 mb-3">Social Links</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Instagram */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
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
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-neon-green">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Payments enabled</span>
              </div>
              <button
                onClick={handleSetupStripe}
                disabled={settingUpStripe}
                className="text-sm text-gray-400 hover:text-white transition flex items-center gap-1"
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
        </div>
      </main>
    </div>
  )
}
