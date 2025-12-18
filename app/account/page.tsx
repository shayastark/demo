'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function AccountPage() {
  const { ready, authenticated, user, login } = usePrivy()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return
      try {
        const privyId = user.id

        let { data: existingUser } = await supabase
          .from('users')
          .select('id, username, email')
          .eq('privy_id', privyId)
          .single()

        if (!existingUser) {
          const { data: newUser, error } = await supabase
            .from('users')
            .insert({
              privy_id: privyId,
              email: user.email?.address || null,
            })
            .select('id, username, email')
            .single()

          if (error) throw error
          existingUser = newUser
        }

        setUsername(existingUser.username || '')
        setEmail(existingUser.email || user.email?.address || null)
      } catch (error) {
        console.error('Error loading account profile:', error)
      } finally {
        setLoaded(true)
      }
    }

    if (authenticated && user) {
      loadProfile()
    }
  }, [authenticated, user])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      const privyId = user.id

      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (fetchError || !existingUser) {
        alert('Unable to load your profile. Please try again.')
        return
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({ username: username.trim() || null })
        .eq('id', existingUser.id)

      if (updateError) throw updateError

      alert('Username saved')
    } catch (error) {
      console.error('Error saving username:', error)
      alert('Failed to save username. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div>Loading...</div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="mb-4">Please sign in to manage your account</p>
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
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold">
            Hubba
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-gray-300 hover:text-white underline-offset-4 hover:underline"
          >
            Back to Dashboard
          </Link>
        </div>
      </nav>

      <main className="px-4 py-8 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Account</h1>

        <div className="bg-gray-900 rounded-lg p-4 md:p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <div className="text-sm text-gray-200">
              {email || user?.email?.address || 'Not set'}
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white"
              />
              <p className="mt-1 text-xs text-gray-500">
                This will be used to identify you across Hubba.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="bg-white text-black px-6 py-2 rounded-full text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}


