'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Project } from '@/lib/types'
import { Plus, Music, Eye, List, Grid } from 'lucide-react'

export default function ClientDashboard() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid')
  const loadingRef = useRef(false)
  const loadedUserIdRef = useRef<string | null>(null)
  const lastProcessedStateRef = useRef<string | null>(null)
  
  // Stabilize user ID to prevent unnecessary re-renders
  const userId = useMemo(() => user?.id || null, [user?.id])

  // Load view preference from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedView = localStorage.getItem('projectViewMode') as 'list' | 'grid' | null
      if (savedView === 'list' || savedView === 'grid') {
        setViewMode(savedView)
      }
    }
  }, [])

  // Save view preference to localStorage
  const handleViewModeChange = (mode: 'list' | 'grid') => {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('projectViewMode', mode)
    }
  }

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
    if (loadingRef.current) {
      return
    }
    
    // Mark this state as processed
    lastProcessedStateRef.current = stateKey
    
    // Mark that we're loading to prevent concurrent loads
    loadingRef.current = true
    loadedUserIdRef.current = userId
    
    // Capture user data to avoid stale closure
    const privyId = userId
    const userEmail = user?.email?.address || null
    
    // Use a separate async function to avoid closure issues
    const loadProjects = async () => {
      try {
        // First, get or create the user in our database
        // Check if user exists
        let { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('privy_id', privyId)
          .single()

        // Create user if doesn't exist
        if (!existingUser) {
          const { data: newUser, error } = await supabase
            .from('users')
            .insert({
              privy_id: privyId,
              email: userEmail,
            })
            .select('id')
            .single()

          if (error) throw error
          existingUser = newUser
        }

        // Load user's username
        const { data: userData } = await supabase
          .from('users')
          .select('username, email')
          .eq('id', existingUser.id)
          .single()
        
        if (userData) {
          setUsername(userData.username || userData.email || null)
        }

        // Load projects
        const { data: projectsData, error } = await supabase
          .from('projects')
          .select('*')
          .eq('creator_id', existingUser.id)
          .order('created_at', { ascending: false })

        if (error) throw error
        setProjects(projectsData || [])
      } catch (error) {
        console.error('Error loading projects:', error)
      } finally {
        setLoading(false)
        loadingRef.current = false
      }
    }

    // Run async function
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId, authenticated]) // Depend on all state, but use ref to prevent duplicate processing

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
          <p className="mb-4 text-neon-green opacity-90">Please login to access your dashboard</p>
          <button
            onClick={login}
            className="bg-white text-black px-6 py-2 rounded-full font-semibold"
          >
            Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-white">
            Hubba
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="text-sm text-neon-green hover:opacity-80 underline-offset-4 hover:underline opacity-70"
            >
              Account
            </Link>
            <Link
              href="/dashboard/projects/new"
              className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full font-semibold hover:bg-gray-200 transition"
            >
              <Plus className="w-4 h-4" />
              New Project
            </Link>
            <button
              onClick={logout}
              className="text-sm text-black hover:opacity-80"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="px-4 py-8 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Your Projects</h1>
          {!loading && projects.length > 0 && (
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-1">
              <button
                onClick={() => handleViewModeChange('grid')}
                className={`p-2 rounded transition ${
                  viewMode === 'grid'
                    ? 'bg-white text-black'
                    : 'text-neon-green hover:bg-gray-800'
                }`}
                title="Grid view"
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleViewModeChange('list')}
                className={`p-2 rounded transition ${
                  viewMode === 'list'
                    ? 'bg-white text-black'
                    : 'text-neon-green hover:bg-gray-800'
                }`}
                title="List view"
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-neon-green">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <Music className="w-16 h-16 mx-auto mb-4 text-neon-green opacity-50" />
            <p className="text-neon-green mb-4">No projects yet</p>
            <Link
              href="/dashboard/projects/new"
              className="inline-block bg-white text-black px-6 py-2 rounded-full font-semibold"
            >
              Create Your First Project
            </Link>
          </div>
        ) : viewMode === 'grid' ? (
          // Grid/Icon View - Smaller images for mobile
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="bg-gray-900 rounded-lg overflow-hidden hover:bg-gray-800 transition active:scale-95"
              >
                {project.cover_image_url ? (
                  <img
                    src={project.cover_image_url}
                    alt={project.title}
                    className="w-full aspect-square object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square bg-gray-800 flex items-center justify-center">
                    <Music className="w-8 h-8 sm:w-12 sm:h-12 text-gray-600" />
                  </div>
                )}
                <div className="p-2 sm:p-3">
                  <h3 className="text-sm sm:text-base font-semibold text-neon-green line-clamp-2 mb-1">
                    {project.title}
                  </h3>
                  <p className="text-xs text-neon-green opacity-70">
                    {new Date(project.created_at).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          // List View
          <div className="space-y-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="bg-gray-900 rounded-lg overflow-hidden hover:bg-gray-800 transition flex gap-4"
              >
                {project.cover_image_url ? (
                  <img
                    src={project.cover_image_url}
                    alt={project.title}
                    className="w-20 h-20 sm:w-24 sm:h-24 object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <Music className="w-8 h-8 text-gray-600" />
                  </div>
                )}
                <div className="flex-1 py-3 pr-4 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-base sm:text-lg font-semibold text-neon-green line-clamp-1">
                      {project.title}
                    </h3>
                    {username && (
                      <span className="text-xs text-neon-green opacity-70 flex-shrink-0">
                        by {username}
                      </span>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-sm text-neon-green line-clamp-2 opacity-90 mb-2">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs sm:text-sm text-neon-green opacity-70">
                    <span>{new Date(project.created_at).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1">
                      <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>View</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

