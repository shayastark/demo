'use client'

import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function ClientHomePage() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [username, setUsername] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [privyTimeout, setPrivyTimeout] = useState(false)
  const loadingProfileRef = useRef(false)
  const loadedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Add a timeout in case Privy never becomes ready (separate effect to avoid re-running)
  useEffect(() => {
    if (!ready) {
      const timeout = setTimeout(() => {
        setPrivyTimeout(true)
        console.error('Privy initialization timeout - check NEXT_PUBLIC_PRIVY_APP_ID')
      }, 10000) // 10 second timeout

      return () => clearTimeout(timeout)
    }
  }, [ready])

  // Always show loading until mounted and ready to prevent hydration mismatch
  // This ensures server and client render the same initial HTML
  if (typeof window === 'undefined' || !mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center text-neon-green">Loading...</div>
      </div>
    )
  }

  // Show loading while Privy initializes, but add a timeout to prevent infinite loading
  if (!ready) {
    if (privyTimeout) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold mb-4 text-red-400">Initialization Error</h1>
            <p className="text-neon-green mb-4 opacity-90">
              Authentication service is taking too long to initialize. Please check your browser console and ensure NEXT_PUBLIC_PRIVY_APP_ID is set correctly.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-white text-black px-6 py-2 rounded-full font-semibold hover:bg-gray-200 transition"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="text-neon-green mb-2">Loading...</div>
          <div className="text-xs text-neon-green opacity-50">Initializing authentication</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4 text-red-400">Error</h1>
          <p className="text-neon-green mb-4 opacity-90">{error}</p>
          <button
            onClick={() => {
              setError(null)
              window.location.reload()
            }}
            className="bg-white text-black px-6 py-2 rounded-full font-semibold hover:bg-gray-200 transition"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold mb-4 text-white">Hubba</h1>
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

  // Load or create user profile and fetch username
  useEffect(() => {
    if (!mounted || !ready || !authenticated || !user) return
    
    // Use user.id as a stable reference instead of the whole user object
    const privyId = user.id
    
    // Prevent loading if already loading or if we've already loaded this user
    if (loadingProfileRef.current || loadedUserIdRef.current === privyId) return
    
    const userEmail = user.email?.address || null
    
    const loadProfile = async () => {
      loadingProfileRef.current = true
      setLoadingProfile(true)
      try {
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
        loadedUserIdRef.current = privyId
      } catch (error) {
        console.error('Error loading profile:', error)
        setError('Failed to load profile. Please refresh the page.')
        loadedUserIdRef.current = null // Reset on error so we can retry
      } finally {
        loadingProfileRef.current = false
        setLoadingProfile(false)
      }
    }

    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, ready, authenticated, user?.id]) // Only depend on user.id, not the whole user object

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
            Hubba
          </Link>
          <div className="flex gap-3 items-center">
            <Link
              href="/account"
              className="text-xs text-neon-green hover:opacity-80 underline-offset-4 hover:underline opacity-70"
            >
              {loadingProfile ? 'Loading...' : username || user?.email?.address || 'Set username'}
            </Link>
            <button
              onClick={logout}
              className="text-xs text-neon-green hover:opacity-80 opacity-70"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <main className="px-4 py-8 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 text-white">Welcome to Hubba</h2>
          <p className="text-neon-green mb-8 opacity-90">
            Create and share your music projects
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

