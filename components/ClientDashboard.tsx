'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Project } from '@/lib/types'
import { Plus, Music, Eye, MoreVertical, Share2, Trash2, Pin, X, ChevronDown } from 'lucide-react'
import { ProjectCardSkeleton } from './SkeletonLoader'
import Image from 'next/image'
import { showToast } from './Toast'
import ShareModal from './ShareModal'
import { getPendingProject, clearPendingProject } from '@/lib/pendingProject'
import FollowingFeedSection from './FollowingFeedSection'
import SharedWithMeSection from './SharedWithMeSection'
import WhoToFollowSection from './WhoToFollowSection'

// Extended type for saved projects with additional info
interface SavedProject extends Project {
  pinned: boolean
  creator_username?: string
}

export default function ClientDashboard() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareModalProject, setShareModalProject] = useState<Project | null>(null)
  const [dbUserId, setDbUserId] = useState<string | null>(null)
  const [isMiniPlayerShowing, setIsMiniPlayerShowing] = useState(false)
  const [savedProjectsOpen, setSavedProjectsOpen] = useState(true)
  const loadingRef = useRef(false)
  const loadedUserIdRef = useRef<string | null>(null)
  const lastProcessedStateRef = useRef<string | null>(null)
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({})
  
  // Helper function for authenticated API requests
  const apiRequest = useCallback(async (
    endpoint: string,
    options: { method?: string; body?: unknown } = {}
  ) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Not authenticated')
    
    const response = await fetch(endpoint, {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Request failed')
    return data
  }, [getAccessToken])
  
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

  // Listen for mini-player visibility (track playback state)
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handlePlaybackState = (e: CustomEvent) => {
      // Mini-player shows when something is playing
      setIsMiniPlayerShowing(e.detail?.isPlaying || false)
    }
    
    const handleQueueUpdated = () => {
      // Check if queue has items - if so, mini-player might show
      const stored = localStorage.getItem('demo-queue')
      if (stored) {
        try {
          const queue = JSON.parse(stored)
          if (queue.length > 0) {
            setIsMiniPlayerShowing(true)
          }
        } catch {}
      }
    }
    
    window.addEventListener('demo-playback-state', handlePlaybackState as EventListener)
    window.addEventListener('demo-queue-updated', handleQueueUpdated)
    
    // Initial check - check if there's an active playback from local storage
    handleQueueUpdated()
    
    return () => {
      window.removeEventListener('demo-playback-state', handlePlaybackState as EventListener)
      window.removeEventListener('demo-queue-updated', handleQueueUpdated)
    }
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

        // Create user if doesn't exist (via secure API)
        if (!existingUser) {
          const token = await getAccessToken()
          if (!token) throw new Error('Not authenticated')
          
          const response = await fetch('/api/user', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: userEmail }),
          })
          
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || 'Failed to create user')
          existingUser = result.user
        }
        
        if (!existingUser) {
          throw new Error('Failed to get or create user')
        }

        // Load user's username
        const { data: userData } = await supabase
          .from('users')
          .select('username, email')
          .eq('id', existingUser.id)
          .single()
        
        // Check if user needs to complete profile (no username = new user)
        if (!userData?.username) {
          // Redirect to account page for onboarding
          router.push('/account?onboarding=true')
          return
        }
        
        if (userData) {
          setUsername(userData.username || userData.email || null)
        }

        // Store db user id for later use
        setDbUserId(existingUser.id)
        
        // Check for pending project to save (user came from shared project page)
        const pendingProject = getPendingProject()
        if (pendingProject) {
          try {
            const token = await getAccessToken()
            if (token) {
              // Check if already saved
              const { data: existingSave } = await supabase
                .from('user_projects')
                .select('id')
                .eq('user_id', existingUser.id)
                .eq('project_id', pendingProject.projectId)
                .single()
              
              if (!existingSave) {
                // Save the project to user's library
                await fetch('/api/library', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ projectId: pendingProject.projectId }),
                })
                showToast(`"${pendingProject.title}" saved to your library!`, 'success')
              }
            }
          } catch (error) {
            console.error('Error saving pending project:', error)
          } finally {
            clearPendingProject()
          }
        }

        // Load projects created by user
        const { data: projectsData, error } = await supabase
          .from('projects')
          .select('*')
          .eq('creator_id', existingUser.id)
          .order('created_at', { ascending: false })

        if (error) throw error
        
        // Sort with pinned projects first
        const sortedProjects = (projectsData || []).sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        setProjects(sortedProjects)

        // Load saved projects (from user_projects table) - excluding projects user created
        const { data: savedData } = await supabase
          .from('user_projects')
          .select(`
            pinned,
            project:projects(
              id,
              creator_id,
              title,
              description,
              cover_image_url,
              allow_downloads,
              sharing_enabled,
              share_token,
              created_at,
              updated_at
            )
          `)
          .eq('user_id', existingUser.id)

        if (savedData) {
          // Filter out projects the user created and hydrate creator metadata in one batch.
          const savedItems = (savedData || [])
            .map((item) => ({
              pinned: !!item.pinned,
              project: item.project as unknown as Project | null,
            }))
            .filter((item): item is { pinned: boolean; project: Project } =>
              !!item.project && item.project.creator_id !== existingUser.id
            )

          const creatorIds = Array.from(new Set(savedItems.map((item) => item.project.creator_id)))
          const { data: creatorRows } = creatorIds.length
            ? await supabase
                .from('users')
                .select('id, username, email')
                .in('id', creatorIds)
            : { data: [] as Array<{ id: string; username: string | null; email: string | null }> }

          const creatorsById = (creatorRows || []).reduce<Record<string, { username: string | null; email: string | null }>>(
            (acc, creator) => {
              acc[creator.id] = { username: creator.username, email: creator.email }
              return acc
            },
            {}
          )

          const savedProjectsWithInfo: SavedProject[] = savedItems.map((item) => ({
            ...item.project,
            pinned: item.pinned,
            creator_username:
              creatorsById[item.project.creator_id]?.username ||
              creatorsById[item.project.creator_id]?.email ||
              'Unknown',
          }))

          // Sort: pinned first, then by created_at
          savedProjectsWithInfo.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1
            if (!a.pinned && b.pinned) return 1
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          })

          setSavedProjects(savedProjectsWithInfo)
        }
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

  const handleOpenShareModal = (project: Project) => {
    setShareModalProject(project)
    setShareModalOpen(true)
    setOpenMenuId(null)
  }

  const handleCloseShareModal = () => {
    setShareModalOpen(false)
    setShareModalProject(null)
  }

  const handleDeleteProject = async (project: Project) => {
    setOpenMenuId(null)
    
    if (!confirm(`Are you sure you want to delete "${project.title}"? This action cannot be undone.`)) {
      return
    }

    try {
      await apiRequest(`/api/projects?id=${project.id}`, { method: 'DELETE' })

      showToast('Project deleted successfully!', 'success')
      setProjects(projects.filter(p => p.id !== project.id))
    } catch (error: unknown) {
      console.error('Error deleting project:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete project. Please try again.', 'error')
    }
  }

  const handleTogglePinOwn = async (project: Project) => {
    setOpenMenuId(null)

    try {
      const newPinnedState = !project.pinned
      await apiRequest('/api/projects', {
        method: 'PATCH',
        body: { id: project.id, pinned: newPinnedState },
      })

      // Update local state and re-sort: pinned first
      setProjects(prev => {
        const updated = prev.map(p => 
          p.id === project.id ? { ...p, pinned: newPinnedState } : p
        )
        updated.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        return updated
      })

      showToast(newPinnedState ? 'Project pinned!' : 'Project unpinned', 'success')
    } catch (error: unknown) {
      console.error('Error toggling pin:', error)
      showToast('Failed to update pin status', 'error')
    }
  }

  const handleTogglePinSaved = async (project: SavedProject) => {
    if (!dbUserId) return
    setOpenMenuId(null)

    try {
      const newPinnedState = !project.pinned
      await apiRequest('/api/library', {
        method: 'PATCH',
        body: { project_id: project.id, pinned: newPinnedState },
      })

      // Update local state
      setSavedProjects(prev => {
        const updated = prev.map(p => 
          p.id === project.id ? { ...p, pinned: newPinnedState } : p
        )
        // Re-sort: pinned first
        updated.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        return updated
      })

      showToast(newPinnedState ? 'Project pinned!' : 'Project unpinned', 'success')
    } catch (error: unknown) {
      console.error('Error toggling pin:', error)
      showToast('Failed to update pin status', 'error')
    }
  }

  const handleRemoveSavedProject = async (project: SavedProject) => {
    setOpenMenuId(null)

    if (!dbUserId) return

    if (!confirm(`Remove "${project.title}" from your saved projects?`)) {
      return
    }

    try {
      await apiRequest(`/api/library?project_id=${project.id}`, { method: 'DELETE' })

      showToast('Project removed from saved', 'success')
      setSavedProjects(prev => prev.filter(p => p.id !== project.id))
    } catch (error: unknown) {
      console.error('Error removing saved project:', error)
      showToast('Failed to remove project', 'error')
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
    <div className="min-h-screen bg-black text-white relative overflow-x-hidden">
      {/* Subtle background gradient */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at top center, rgba(57, 255, 20, 0.03) 0%, transparent 40%)',
        }}
      />
      
      <nav className="app-shell-nav">
        <div className="app-shell-inner max-w-7xl">
          <Link href="/" className="app-shell-brand sm:text-xl">
            Demo
          </Link>
          <div className="app-shell-actions pr-0.5 max-[390px]:gap-1.5 sm:gap-4">
            <Link
              href="/account"
              className="app-shell-link max-[390px]:text-[10px] sm:text-sm"
            >
              Account
            </Link>
            <span className="app-shell-divider text-xs max-[390px]:text-[10px] mx-0.5 max-[390px]:mx-0">|</span>
            <Link
              href="/explore"
              className="app-shell-link max-[390px]:text-[10px] sm:text-sm"
            >
              Explore
            </Link>
            <span className="app-shell-divider text-xs max-[390px]:text-[10px] mx-0.5 max-[390px]:mx-0">|</span>
            <Link
              href="/dashboard/projects/new"
              className="app-shell-link ui-link max-[390px]:gap-0.5 max-[390px]:text-[10px] sm:text-sm"
            >
              <Plus className="w-3 h-3 max-[390px]:w-2.5 max-[390px]:h-2.5 sm:w-4 sm:h-4" />
              New Project
            </Link>
            <span className="app-shell-divider text-xs max-[390px]:text-[10px] mx-0.5 max-[390px]:mx-0">|</span>
            <button
              onClick={logout}
              className="btn-unstyled app-shell-link ui-link-muted max-[390px]:text-[10px] sm:text-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl overflow-x-hidden px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold text-white">Your Projects</h1>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="ui-empty-state text-center py-12">
            <Music className="w-16 h-16 mx-auto mb-4 text-neon-green opacity-50" />
            <p className="ui-empty-title">No projects yet</p>
            <p className="ui-empty-copy mx-auto max-w-sm">
              Start your first drop, upload a cover, and build a space listeners can come back to.
            </p>
            <Link
              href="/dashboard/projects/new"
              className="btn-primary mt-5"
            >
              Create Your First Project
            </Link>
          </div>
        ) : (
          // Grid View with proper spacing - using inline styles for guaranteed spacing
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 md:gap-6 lg:grid-cols-5">
            {projects.map((project) => (
              <div
                key={project.id}
                style={{
                  backgroundColor: '#111827',
                  borderRadius: '12px',
                  padding: '12px',
                  position: 'relative',
                }}
                className="box-border hover:bg-gray-800 transition group w-full md:max-w-[190px] md:mx-auto"
              >
                {/* Pinned badge */}
                {project.pinned && (
                  <div 
                    style={{
                      position: 'absolute',
                      top: '4px',
                      left: '4px',
                      zIndex: 10,
                      backgroundColor: '#39FF14',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Pin style={{ width: '10px', height: '10px', color: '#000' }} />
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#000' }}>Pinned</span>
                  </div>
                )}
                
                {/* Image with menu overlay */}
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', marginBottom: '12px' }}>
                  <Link
                    href={`/dashboard/projects/${project.id}`}
                    style={{ display: 'block', width: '100%', height: '100%' }}
                  >
                    {project.cover_image_url ? (
                      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden' }}>
                        <Image
                          src={project.cover_image_url}
                          alt={project.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        />
                      </div>
                    ) : (
                      <div style={{ width: '100%', height: '100%', backgroundColor: '#1f2937', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Music className="w-8 h-8 sm:w-12 sm:h-12 text-gray-600" />
                      </div>
                    )}
                  </Link>
                  
                  {/* Three-dot menu button - TOP RIGHT of the IMAGE */}
                  <div 
                    ref={(el) => { menuRefs.current[project.id] = el }}
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      zIndex: 10,
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === project.id ? null : project.id)
                      }}
                      style={{
                        width: '28px',
                        height: '28px',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      className="text-white transition shadow-lg hover:bg-black sm:h-8 sm:w-8"
                      title="More options"
                      type="button"
                    >
                      <MoreVertical style={{ width: '14px', height: '14px' }} />
                    </button>
                  </div>
                </div>
                
                {/* Title and date - BELOW the image */}
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className="block space-y-1"
                >
                  <h3 className="min-h-[2.5rem] text-sm font-semibold leading-tight text-neon-green line-clamp-2 sm:min-h-[2.75rem] sm:text-base">
                    {project.title}
                  </h3>
                  <p className="text-xs leading-tight text-neon-green opacity-70">
                    {new Date(project.created_at).toLocaleDateString()}
                  </p>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Saved Projects Section */}
        {!loading && savedProjects.length > 0 && (
          <div style={{ marginTop: '48px' }}>
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold text-white">Saved Projects</h2>
              <button
                type="button"
                onClick={() => setSavedProjectsOpen((prev) => !prev)}
                className="btn-unstyled ui-pressable inline-flex items-center gap-2 rounded-md border border-gray-700 bg-black px-3 py-1.5 text-xs font-semibold text-neon-green hover:border-gray-500 hover:text-neon-green/80"
                style={{ WebkitAppearance: 'none', appearance: 'none' }}
                aria-expanded={savedProjectsOpen}
                aria-label={savedProjectsOpen ? 'Collapse saved projects' : 'Expand saved projects'}
              >
                {savedProjectsOpen ? 'Collapse' : 'Expand'}
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${savedProjectsOpen ? '' : '-rotate-90'}`}
                  aria-hidden
                />
              </button>
            </div>
            {savedProjectsOpen ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 md:gap-6 lg:grid-cols-5">
                {savedProjects.map((project) => (
                  <div
                    key={`saved-${project.id}`}
                    style={{
                      backgroundColor: '#111827',
                      borderRadius: '12px',
                      padding: '12px',
                      position: 'relative',
                    }}
                    className="box-border hover:bg-gray-800 transition group w-full md:max-w-[190px] md:mx-auto"
                  >
                    {/* Pinned badge */}
                    {project.pinned && (
                      <div 
                        style={{
                          position: 'absolute',
                          top: '4px',
                          left: '4px',
                          zIndex: 10,
                          backgroundColor: '#39FF14',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Pin style={{ width: '10px', height: '10px', color: '#000' }} />
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#000' }}>Pinned</span>
                      </div>
                    )}

                    {/* Image with menu overlay */}
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', marginBottom: '12px' }}>
                      <Link
                        href={`/share/${project.share_token}`}
                        style={{ display: 'block', width: '100%', height: '100%' }}
                      >
                        {project.cover_image_url ? (
                          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden' }}>
                            <Image
                              src={project.cover_image_url}
                              alt={project.title}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                            />
                          </div>
                        ) : (
                          <div style={{ width: '100%', height: '100%', backgroundColor: '#1f2937', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Music className="w-8 h-8 sm:w-12 sm:h-12 text-gray-600" />
                          </div>
                        )}
                      </Link>
                      
                      {/* Three-dot menu button */}
                      <div 
                        ref={(el) => { menuRefs.current[`saved-${project.id}`] = el }}
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          zIndex: 10,
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === `saved-${project.id}` ? null : `saved-${project.id}`)
                          }}
                          style={{
                            width: '28px',
                            height: '28px',
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                          className="text-white transition shadow-lg hover:bg-black sm:h-8 sm:w-8"
                          title="More options"
                          type="button"
                        >
                          <MoreVertical style={{ width: '14px', height: '14px' }} />
                        </button>
                      </div>
                    </div>
                    
                    {/* Title and creator */}
                    <Link
                      href={`/share/${project.share_token}`}
                      className="block space-y-1"
                    >
                      <h3 className="min-h-[2.5rem] text-sm font-semibold leading-tight text-white line-clamp-2 sm:min-h-[2.75rem] sm:text-base">
                        {project.title}
                      </h3>
                      <p className="truncate text-xs leading-tight text-gray-400">
                        by {project.creator_username}
                      </p>
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-12">
          <SharedWithMeSection authenticated={authenticated} getAccessToken={getAccessToken} />
          <FollowingFeedSection authenticated={authenticated} getAccessToken={getAccessToken} />
          <WhoToFollowSection authenticated={authenticated} getAccessToken={getAccessToken} />
        </div>
      </main>

      {/* Share Modal */}
      {shareModalProject && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={handleCloseShareModal}
          shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${shareModalProject.share_token}`}
          title={shareModalProject.title}
        />
      )}

      {/* Project Menu Modal - Rendered at root level for proper z-index */}
      {openMenuId && (() => {
        // Determine if it's an own project or saved project
        const isSavedProject = openMenuId.startsWith('saved-')
        const projectId = isSavedProject ? openMenuId.replace('saved-', '') : openMenuId
        const project = isSavedProject 
          ? savedProjects.find(p => p.id === projectId)
          : projects.find(p => p.id === projectId)
        
        if (!project) return null

        return (
          <>
            {/* Backdrop */}
            <div 
              onClick={() => setOpenMenuId(null)}
              style={{ 
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                zIndex: 100,
              }}
            />
            {/* Menu - Bottom sheet on mobile, centered modal on desktop */}
            <div 
              style={{
                position: 'fixed',
                bottom: isMobile ? (isMiniPlayerShowing ? '130px' : '70px') : '50%',
                left: isMobile ? 0 : '50%',
                right: isMobile ? 0 : 'auto',
                transform: isMobile ? 'none' : 'translate(-50%, 50%)',
                width: isMobile ? '100%' : '380px',
                maxWidth: '100%',
                borderRadius: isMobile ? '16px 16px 0 0' : '16px',
                backgroundColor: '#111827',
                boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
                zIndex: 101,
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle bar for mobile */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
                <div style={{ width: '40px', height: '4px', backgroundColor: '#4B5563', borderRadius: '2px' }} />
              </div>
              
              {/* Menu header */}
              <div style={{ 
                padding: '8px 20px 16px', 
                borderBottom: '1px solid #374151',
                textAlign: 'center',
              }}>
                <h3 style={{ 
                  color: '#fff', 
                  fontSize: '16px', 
                  fontWeight: 600,
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {project.title}
                </h3>
              </div>
              
              {/* Menu options */}
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Pin/Unpin */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isSavedProject) {
                      handleTogglePinSaved(project as SavedProject)
                    } else {
                      handleTogglePinOwn(project)
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    backgroundColor: '#1f2937',
                    color: '#fff',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    fontSize: '15px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: '36px',
                    height: '36px',
                    backgroundColor: '#374151',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Pin style={{ width: '18px', height: '18px', color: project.pinned ? '#39FF14' : '#fff' }} />
                  </div>
                  <span>{project.pinned ? 'Unpin' : 'Pin to Top'}</span>
                </button>
                
                {/* Share */}
                {isSavedProject ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (project.sharing_enabled !== false) {
                        handleOpenShareModal(project)
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      backgroundColor: '#1f2937',
                      color: project.sharing_enabled === false ? '#6b7280' : '#fff',
                      border: '1px solid #374151',
                      borderRadius: '12px',
                      fontSize: '15px',
                      fontWeight: 500,
                      cursor: project.sharing_enabled === false ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      textAlign: 'left',
                      opacity: project.sharing_enabled === false ? 0.5 : 1,
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: '#374151',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Share2 style={{ width: '18px', height: '18px', color: project.sharing_enabled === false ? '#6b7280' : '#39FF14' }} />
                    </div>
                    <div>
                      <span>Share</span>
                      {project.sharing_enabled === false && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                          Sharing disabled by creator
                        </div>
                      )}
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenShareModal(project)
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      backgroundColor: '#1f2937',
                      color: '#fff',
                      border: '1px solid #374151',
                      borderRadius: '12px',
                      fontSize: '15px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: '#374151',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Share2 style={{ width: '18px', height: '18px', color: '#39FF14' }} />
                    </div>
                    <span>Share</span>
                  </button>
                )}
                
                {/* Delete (own projects) or Remove from Saved (saved projects) */}
                {isSavedProject ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveSavedProject(project as SavedProject)
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      backgroundColor: '#1f2937',
                      color: '#ef4444',
                      border: '1px solid #374151',
                      borderRadius: '12px',
                      fontSize: '15px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: '#374151',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <X style={{ width: '18px', height: '18px', color: '#ef4444' }} />
                    </div>
                    <span>Remove from Saved</span>
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteProject(project)
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      backgroundColor: '#1f2937',
                      color: '#ef4444',
                      border: '1px solid #374151',
                      borderRadius: '12px',
                      fontSize: '15px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: '#374151',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Trash2 style={{ width: '18px', height: '18px', color: '#ef4444' }} />
                    </div>
                    <span>Delete</span>
                  </button>
                )}
              </div>
              
              {/* Cancel button */}
              <div style={{ padding: '8px 16px 16px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenMenuId(null)
                  }}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: '#374151',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )
      })()}
    </div>
  )
}

