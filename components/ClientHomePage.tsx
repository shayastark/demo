'use client'

import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'
import { useEffect } from 'react'

export default function ClientHomePage() {
  const { ready, authenticated, user, login } = usePrivy()

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-gray-900/70 bg-black/80 backdrop-blur px-4 py-3 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link
            href="/"
            className="text-lg md:text-xl font-semibold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent"
          >
            Hubba
          </Link>
          <div className="flex gap-2 md:gap-3 items-center">
            <Link
              href="/dashboard"
              className="px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-gray-700/80 bg-gray-900/60 text-xs md:text-sm font-medium hover:bg-gray-800 hover:border-gray-500 transition"
            >
              Dashboard
            </Link>
            <button
              onClick={() => {
                // Logout will be handled by Privy
              }}
              className="hidden sm:inline-flex text-xs md:text-sm text-gray-400 hover:text-white"
            >
              {user?.email?.address || 'Account'}
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
            Go to Dashboard
          </Link>
        </div>
      </main>
    </div>
  )
}

