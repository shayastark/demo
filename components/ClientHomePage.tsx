'use client'

import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import FAQModal from './FAQModal'

export default function ClientHomePage() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [username, setUsername] = useState<string | null>(null)
  const [showFAQ, setShowFAQ] = useState(false)
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
        
        {/* Header with FAQ + sign in */}
        <header className="relative z-10 px-4 py-4 sm:py-5">
          <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
            <button
              onClick={() => setShowFAQ(true)}
              className="rounded-full border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:border-gray-500 hover:text-white"
            >
              FAQ
            </button>
            <button
              onClick={login}
              className="rounded-full border border-neon-green px-3.5 py-1.5 text-sm font-semibold text-neon-green hover:bg-neon-green/10"
              aria-label="Sign in"
            >
              Sign in
            </button>
          </div>
        </header>
        
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center pb-24">
          <h1 className="mb-3 text-center text-5xl font-bold tracking-tight text-white sm:text-6xl">Demo</h1>
          <p className="mb-12 max-w-md text-center text-lg text-gray-300 sm:text-xl">
            From rough cuts to real support.
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
            className="min-h-12 rounded-full bg-neon-green px-10 py-3.5 text-lg font-semibold text-black transition-all hover:bg-[#4cff2e] hover:shadow-lg hover:shadow-neon-green/30 active:scale-100"
            aria-label="Get started"
          >
            Get Started
          </button>
        </div>
        <FAQModal isOpen={showFAQ} onClose={() => setShowFAQ(false)} />
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
      
      <nav className="sticky top-0 z-20 overflow-x-hidden border-b border-gray-800/50 bg-black/80 px-4 py-3 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-2">
          <Link
            href="/dashboard"
            className="text-lg sm:text-xl font-semibold tracking-tight text-white hover:text-neon-green transition flex-shrink-0"
          >
            Dashboard
          </Link>
          <div className="flex items-center min-w-0 gap-3 max-[390px]:gap-1.5 sm:gap-4 pr-0.5">
            <button
              onClick={() => setShowFAQ(true)}
              className="btn-unstyled text-xs max-[390px]:text-[10px] sm:text-sm text-neon-green underline underline-offset-4 decoration-neon-green/80 hover:opacity-80 transition whitespace-nowrap flex-shrink-0"
            >
              FAQ
            </button>
            <span className="text-gray-600 text-xs max-[390px]:text-[10px] select-none mx-0.5 max-[390px]:mx-0">|</span>
            <Link
              href="/account"
              className="text-xs max-[390px]:text-[10px] sm:text-sm text-gray-300 hover:text-white transition truncate max-w-[72px] sm:max-w-[220px]"
            >
              {loadingProfile ? 'Loading...' : username || user?.email?.address || 'Set username'}
            </Link>
            <span className="text-gray-600 text-xs max-[390px]:text-[10px] select-none mx-0.5 max-[390px]:mx-0">|</span>
            <button
              onClick={logout}
              className="btn-unstyled text-xs max-[390px]:text-[10px] sm:text-sm text-gray-500 hover:text-gray-300 transition whitespace-nowrap flex-shrink-0"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-16">
        <div className="text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">Welcome to Demo</h2>
          <p className="mx-auto mb-12 max-w-md text-lg text-gray-300">
            From rough cuts to real support.
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
            className="inline-block min-h-12 rounded-full bg-neon-green px-10 py-3.5 text-lg font-semibold text-black transition-all hover:bg-[#4cff2e] hover:shadow-lg hover:shadow-neon-green/30 active:scale-100"
          >
            Go to Your Dashboard
          </Link>
        </div>
      </main>
      <FAQModal isOpen={showFAQ} onClose={() => setShowFAQ(false)} />
    </div>
  )
}
