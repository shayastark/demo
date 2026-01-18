'use client'

import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'
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
      <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold mb-4 text-white">Demo</h1>
          <p className="text-lg mb-8 text-neon-green opacity-90">
            Share your demos and unreleased tracks with the world
          </p>
          <button
            onClick={login}
            className="bg-white text-black px-8 py-3 rounded-full font-semibold hover:bg-gray-200 transition"
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
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-gray-800 bg-black px-4 py-3 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link
            href="/"
            className="text-xl font-semibold tracking-tight text-white"
          >
            Demo
          </Link>
          <div className="flex items-center" style={{ gap: '24px' }}>
            <Link
              href="/account"
              className="text-sm text-neon-green hover:opacity-80 underline-offset-4 hover:underline opacity-70"
            >
              {loadingProfile ? 'Loading...' : username || user?.email?.address || 'Set username'}
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
      <main className="px-4 py-8 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 text-white">Welcome to Demo</h2>
          <p className="text-white mb-8 opacity-90">
            Share and track your music projects
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-white text-black px-8 py-3 rounded-full font-semibold hover:bg-gray-200 transition"
          >
            Go to Your Dashboard
          </Link>
        </div>
      </main>
    </div>
  )
}
