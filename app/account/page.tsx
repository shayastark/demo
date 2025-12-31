'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Edit, Check, X } from 'lucide-react'

export default function AccountPage() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [username, setUsername] = useState('')
  const [editingUsername, setEditingUsername] = useState('')
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const loadedUserIdRef = useRef<string | null>(null)
  const lastProcessedStateRef = useRef<string | null>(null)
  
  useEffect(() => {
    // Privy pattern: Always check ready first before checking authenticated
    if (!ready) {
      return
    }
    
    // Only proceed if ready AND authenticated (following Privy's recommended pattern)
    if (!authenticated || !user || !user.id) {
      return
    }
    
    // Create a unique key for this state combination
    const stateKey = `${user.id}-${ready}-${authenticated}`
    
    // Prevent loading if we've already processed this exact state
    if (lastProcessedStateRef.current === stateKey) {
      return
    }
    
    // Mark this state as processed
    lastProcessedStateRef.current = stateKey
    
    const loadProfile = async () => {
      const privyId = user.id
      
      // Prevent loading if already loaded for this user
      if (loadedUserIdRef.current === privyId) {
        return
      }
      
      loadedUserIdRef.current = privyId
      
      try {
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

    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.id, authenticated]) // Depend on all state, but use ref to prevent duplicate processing

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
    <div className="min-h-screen bg-black text-white">
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

        <div className="bg-gray-900 rounded-lg p-4 md:p-6 space-y-6">
          {/* Email - inline layout */}
          <div className="flex items-center">
            <label style={{ marginRight: '24px', minWidth: '80px' }} className="text-sm text-white font-medium">Email</label>
            <span className="text-sm text-neon-green">
              {email || user?.email?.address || 'Not set'}
            </span>
          </div>

          {/* Username - show value with edit button */}
          <div>
            <div className="flex items-center">
              <label style={{ marginRight: '24px', minWidth: '80px' }} className="text-sm text-white font-medium">Username</label>
              {isEditingUsername ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editingUsername}
                    onChange={(e) => setEditingUsername(e.target.value)}
                    placeholder="Choose a username"
                    className="flex-1 max-w-xs bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:border-gray-500"
                    autoFocus
                  />
                  <button
                    onClick={async () => {
                      setSaving(true)
                      try {
                        const privyId = user?.id
                        if (!privyId) return
                        
                        const { data: existingUser } = await supabase
                          .from('users')
                          .select('id')
                          .eq('privy_id', privyId)
                          .single()

                        if (existingUser) {
                          const { error: updateError } = await supabase
                            .from('users')
                            .update({ username: editingUsername.trim() || null })
                            .eq('id', existingUser.id)

                          if (updateError) throw updateError
                          setUsername(editingUsername.trim())
                          setIsEditingUsername(false)
                        }
                      } catch (error) {
                        console.error('Error saving username:', error)
                        alert('Failed to save username. Please try again.')
                      } finally {
                        setSaving(false)
                      }
                    }}
                    disabled={saving}
                    className="p-1.5 bg-neon-green text-black rounded-lg hover:opacity-80 transition disabled:opacity-50"
                    title="Save"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingUsername(false)
                      setEditingUsername(username)
                    }}
                    className="p-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center flex-1">
                  <span className="text-sm text-neon-green">
                    {username || 'Not set'}
                  </span>
                  <button
                    onClick={() => {
                      setEditingUsername(username)
                      setIsEditingUsername(true)
                    }}
                    className="ml-auto p-1 text-gray-500 hover:text-white transition"
                    title="Edit username"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <p style={{ marginLeft: '104px' }} className="mt-2 text-xs text-gray-500">
              This will be used to identify you across Hubba.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}


