'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Project } from '@/lib/types'
import { Plus, Music, Eye, MoreVertical, Share2, Trash2, Copy } from 'lucide-react'
import { ProjectCardSkeleton } from './SkeletonLoader'
import Image from 'next/image'
import { showToast } from './Toast'

export default function ClientDashboard() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const loadingRef = useRef(false)
  const loadedUserIdRef = useRef<string | null>(null)
  const lastProcessedStateRef = useRef<string | null>(null)
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({})
  
  // Stabilize user ID to prevent unnecessary re-renders
  const userId = useMemo(() => user?.id || null, [user?.id])

  // Detect mobile screen size
  useEffect(() => {
    if (typeof window === 'undefined') return
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close menus when clicking outside
  useEffect(() => {
    if (typeof window === 'undefined' || !openMenuId || isMobile) return
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const menuRef = menuRefs.current[openMenuId]
      if (menuRef && !menuRef.contains(target)) {
        setOpenMenuId(null)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [openMenuId, isMobile])

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

  const handleCopyShareLink = async (project: Project) => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${project.share_token}`
    await navigator.clipboard.writeText(url)
    showToast('Share link copied!', 'success')
    setOpenMenuId(null)
  }

  const handleDeleteProject = async (project: Project) => {
    setOpenMenuId(null)
    
    if (!confirm(`Are you sure you want to delete "${project.title}"? This action cannot be undone.`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id)

      if (error) throw error

      showToast('Project deleted successfully!', 'success')
      setProjects(projects.filter(p => p.id !== project.id))
    } catch (error: any) {
      console.error('Error deleting project:', error)
      showToast(error?.message || 'Failed to delete project. Please try again.', 'error')
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
        <h1 className="text-3xl font-bold mb-6 text-white">Your Projects</h1>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
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
        ) : (
          // Grid View
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-gray-900 rounded-lg overflow-hidden hover:bg-gray-800 transition relative group"
              >
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className="block"
                >
                  {project.cover_image_url ? (
                    <div className="relative w-full aspect-square p-2">
                      <div className="relative w-full h-full rounded-lg overflow-hidden">
                        <Image
                          src={project.cover_image_url}
                          alt={project.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full aspect-square p-2">
                      <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center">
                        <Music className="w-8 h-8 sm:w-12 sm:h-12 text-gray-600" />
                      </div>
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
                
                {/* Three-dot menu */}
                <div 
                  className="absolute top-2 right-2 z-10"
                  ref={(el) => { menuRefs.current[project.id] = el }}
                >
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setOpenMenuId(openMenuId === project.id ? null : project.id)
                    }}
                    className="w-8 h-8 bg-gray-800 bg-opacity-80 hover:bg-opacity-100 text-white rounded-lg flex items-center justify-center transition opacity-0 group-hover:opacity-100"
                    title="More options"
                    type="button"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  
                  {openMenuId === project.id && (
                    <>
                      {/* Backdrop - only show on mobile */}
                      {isMobile && (
                        <div 
                          className="fixed inset-0 bg-black bg-opacity-50 z-[55]"
                          onClick={() => setOpenMenuId(null)}
                          style={{ position: 'fixed' }}
                        />
                      )}
                      {/* Menu - Bottom sheet on mobile, dropdown on desktop */}
                      <div 
                        className="bg-gray-900 border-t-2 border-gray-700 shadow-2xl z-[60]"
                        style={{
                          position: isMobile ? 'fixed' : 'absolute',
                          bottom: isMobile ? 0 : 'auto',
                          top: isMobile ? 'auto' : '2.5rem',
                          left: isMobile ? 0 : 'auto',
                          right: isMobile ? 0 : 0,
                          width: isMobile ? '100%' : '200px',
                          maxWidth: isMobile ? '100%' : '200px',
                          borderRadius: isMobile ? '1rem 1rem 0 0' : '0.5rem',
                          maxHeight: '80vh',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 1rem)' }}>
                          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgb(31 41 55)' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopyShareLink(project)
                              }}
                              className="w-full text-left text-white hover:bg-gray-800 active:bg-gray-700 flex items-center transition"
                              style={{ 
                                fontSize: '1rem',
                                lineHeight: '1.5rem',
                                paddingTop: '0.75rem',
                                paddingBottom: '0.75rem',
                                gap: '0.875rem',
                                minWidth: 0
                              }}
                            >
                              <Share2 style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }} />
                              <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word', flex: 1, minWidth: 0 }}>Share</span>
                            </button>
                          </div>
                          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid rgb(55 65 81)' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteProject(project)
                              }}
                              className="w-full text-left text-red-400 hover:bg-gray-800 active:bg-gray-700 flex items-center transition"
                              style={{ 
                                fontSize: '1rem',
                                lineHeight: '1.5rem',
                                paddingTop: '0.75rem',
                                paddingBottom: '0.75rem',
                                gap: '0.875rem',
                                minWidth: 0
                              }}
                            >
                              <Trash2 style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }} />
                              <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word', flex: 1, minWidth: 0 }}>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

