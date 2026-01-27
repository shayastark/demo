'use client'

import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

export default function ClientHomePage() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [username, setUsername] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const loadingProfileRef = useRef(false)
  const loadedUserIdRef = useRef<string | null>(null)
  const lastProcessedStateRef = useRef<string | null>(null)
  
  // Stabilize user ID to prevent unnecessary re-renders
  const userId = useMemo(() => user?.id || null, [user?.id])

  // Load or create user profile and fetch username
  // IMPORTANT: This hook must be called before any early returns
  useEffect(() => {
    // Privy pattern: Always check ready first before checking authenticated
    if (!ready) {
      return
    }
    
    // Only proceed if ready AND authenticated (following Privy's recommended pattern)
    if (!authenticated || !user || !userId) {
      return
    }
    
    // Create a unique key for this state combination
    const stateKey = `${userId}-${ready}-${authenticated}`
    
    // Prevent loading if we've already processed this exact state
    if (lastProcessedStateRef.current === stateKey) {
      return
    }
    
    // Prevent loading if already loading
    if (loadingProfileRef.current) {
      return
    }
    
    // Mark this state as processed
    lastProcessedStateRef.current = stateKey
    
    // Mark that we're loading to prevent concurrent loads
    loadingProfileRef.current = true
    loadedUserIdRef.current = userId
    
    // Capture user data to avoid stale closure
    const privyId = userId
    const userEmail = user?.email?.address || null
    
    // Use a separate async function to avoid closure issues
    const loadProfile = async () => {
      try {
        setLoadingProfile(true)
        
        let { data: existingUser } = await supabase
          .from('users')
          .select('id, username')
          .eq('privy_id', privyId)
          .single()

        if (!existingUser) {
          const { data: newUser, error } = await supabase
            .from('users')
            .insert({
              privy_id: privyId,
              email: userEmail,
            })
            .select('id, username')
            .single()

          if (error) throw error
          existingUser = newUser
        }

        setUsername(existingUser.username || null)
      } catch (error) {
        console.error('Error loading profile:', error)
        // Don't set error state - just log it and continue
        // This prevents error UI from blocking the page
      } finally {
        loadingProfileRef.current = false
        setLoadingProfile(false)
      }
    }

    // Run async function
    loadProfile()
  }, [ready, userId, authenticated, user])

  // All hooks are now above - conditional returns are safe below this line

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-neon-green">Loading...</div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-black text-white px-4 relative overflow-hidden">
        {/* Background gradient */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center top, rgba(57, 255, 20, 0.08) 0%, transparent 50%), radial-gradient(ellipse at center bottom, rgba(0, 217, 255, 0.05) 0%, transparent 50%)',
          }}
        />
        
        {/* Header with sign in */}
        <header className="relative z-10 px-4 py-4">
          <div className="max-w-7xl mx-auto flex justify-end">
            <button
              onClick={login}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              Sign in
            </button>
          </div>
        </header>
        
        <div className="flex-1 flex flex-col items-center justify-center pb-24 relative z-10">
          <h1 className="text-5xl sm:text-6xl font-bold mb-3 text-white tracking-tight text-center">Demo</h1>
          <p className="text-lg sm:text-xl mb-12 text-gray-400 text-center max-w-md">
            Share your unreleased tracks on your terms
          </p>
          
          {/* Mixtape Cassette Image */}
          <div style={{ marginTop: '48px', marginBottom: '48px', display: 'flex', justifyContent: 'center' }}>
            <Image
              src="/mixtape-cassette.png"
              alt="Demo - Share your music"
              width={320}
              height={200}
              priority
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
          
          <button
            onClick={login}
            className="bg-neon-green text-black px-10 py-4 rounded-full font-semibold text-lg hover:shadow-lg hover:shadow-neon-green/30 transition-all hover:scale-105 active:scale-100"
          >
            Get Started
          </button>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center text-neon-green">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background gradient */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(57, 255, 20, 0.05) 0%, transparent 50%)',
        }}
      />
      
      <nav className="border-b border-gray-800/50 bg-black/80 backdrop-blur-sm px-4 py-3 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link
            href="/dashboard"
            className="text-xl font-semibold tracking-tight text-white hover:text-neon-green transition"
          >
            Dashboard
          </Link>
          <div className="flex items-center" style={{ gap: '24px' }}>
            <Link
              href="/account"
              className="text-sm text-gray-400 hover:text-white transition"
            >
              {loadingProfile ? 'Loading...' : username || user?.email?.address || 'Set username'}
            </Link>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-300 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <main className="px-4 py-16 max-w-7xl mx-auto relative z-10">
        <div className="text-center">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-white tracking-tight">Welcome to Demo</h2>
          <p className="text-lg text-gray-400 mb-12 max-w-md mx-auto">
            Share your unreleased tracks on your terms
          </p>
          
          {/* Mixtape Cassette Image */}
          <div style={{ marginTop: '48px', marginBottom: '48px', display: 'flex', justifyContent: 'center' }}>
            <Image
              src="/mixtape-cassette.png"
              alt="Demo - Share your music"
              width={320}
              height={200}
              priority
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
          
          <Link
            href="/dashboard"
            className="inline-block bg-neon-green text-black px-10 py-4 rounded-full font-semibold text-lg hover:shadow-lg hover:shadow-neon-green/30 transition-all hover:scale-105 active:scale-100"
          >
            Go to Your Dashboard
          </Link>
        </div>
      </main>
    </div>
  )
}
