'use client'

import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ClientHomePage() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [username, setUsername] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold mb-4">Hubba</h1>
          <p className="text-lg mb-8 text-gray-300">
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
    const loadProfile = async () => {
      if (!user) return
      setLoadingProfile(true)
      try {
        const privyId = user.id

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
              email: user.email?.address || null,
            })
            .select('id, username')
            .single()

          if (error) throw error
          existingUser = newUser
        }

        setUsername(existingUser.username || null)
      } catch (error) {
        console.error('Error loading profile:', error)
      } finally {
        setLoadingProfile(false)
      }
    }

    if (authenticated && user) {
      loadProfile()
    }
  }, [authenticated, user])

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
              className="text-xs text-gray-300 hover:text-white underline-offset-4 hover:underline"
            >
              {username || user?.email?.address || 'Set username'}
            </Link>
            <button
              onClick={logout}
              className="text-xs text-gray-400 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <main className="px-4 py-8 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Welcome to Hubba</h2>
          <p className="text-gray-400 mb-8">
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

