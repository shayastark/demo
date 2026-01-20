'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Project } from '@/lib/types'
import { Plus, Music, Eye, MoreVertical, Share2, Trash2, Pin, X } from 'lucide-react'
import { ProjectCardSkeleton } from './SkeletonLoader'
import Image from 'next/image'
import { showToast } from './Toast'
import ShareModal from './ShareModal'

// Extended type for saved projects with additional info
interface SavedProject extends Project {
  pinned: boolean
  creator_username?: string
}

export default function ClientDashboard() {
  const { ready, authenticated, user, login, logout } = usePrivy()
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

        // Store db user id for later use
        setDbUserId(existingUser.id)

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
          // Filter out projects the user created and transform the data
          const savedProjectsWithInfo: SavedProject[] = []
          
          for (const item of savedData) {
            const project = item.project as unknown as Project
            if (project && project.creator_id !== existingUser.id) {
              // Fetch creator username
              const { data: creatorData } = await supabase
                .from('users')
                .select('username, email')
                .eq('id', project.creator_id)
                .single()

              savedProjectsWithInfo.push({
                ...project,
                pinned: item.pinned || false,
                creator_username: creatorData?.username || creatorData?.email || 'Unknown'
              })
            }
          }

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

  const handleTogglePinOwn = async (project: Project) => {
    setOpenMenuId(null)

    try {
      const newPinnedState = !project.pinned
      const { error } = await supabase
        .from('projects')
        .update({ pinned: newPinnedState })
        .eq('id', project.id)

      if (error) throw error

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
    } catch (error: any) {
      console.error('Error toggling pin:', error)
      showToast('Failed to update pin status', 'error')
    }
  }

  const handleTogglePinSaved = async (project: SavedProject) => {
    if (!dbUserId) return
    setOpenMenuId(null)

    try {
      const newPinnedState = !project.pinned
      const { error } = await supabase
        .from('user_projects')
        .update({ pinned: newPinnedState })
        .eq('user_id', dbUserId)
        .eq('project_id', project.id)

      if (error) throw error

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
    } catch (error: any) {
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
      const { error } = await supabase
        .from('user_projects')
        .delete()
        .eq('user_id', dbUserId)
        .eq('project_id', project.id)

      if (error) throw error

      showToast('Project removed from saved', 'success')
      setSavedProjects(prev => prev.filter(p => p.id !== project.id))
    } catch (error: any) {
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
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-white">
            Demo
          </Link>
          <div className="flex items-center" style={{ gap: '24px' }}>
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
              className="text-sm text-gray-400 hover:text-white transition"
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
          // Grid View with proper spacing - using inline styles for guaranteed spacing
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" style={{ gap: '24px' }}>
            {projects.map((project) => (
              <div
                key={project.id}
                style={{
                  backgroundColor: '#111827',
                  borderRadius: '12px',
                  padding: '12px',
                  position: 'relative',
                }}
                className="hover:bg-gray-800 transition group"
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
                      top: '8px',
                      right: '8px',
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
                        width: '32px',
                        height: '32px',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      className="hover:bg-black text-white transition shadow-lg"
                      title="More options"
                      type="button"
                    >
                      <MoreVertical style={{ width: '16px', height: '16px' }} />
                    </button>
                  </div>
                </div>
                
                {/* Title and date - BELOW the image */}
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  style={{ display: 'block' }}
                >
                  <h3 className="text-sm sm:text-base font-semibold text-neon-green line-clamp-2" style={{ marginBottom: '4px' }}>
                    {project.title}
                  </h3>
                  <p className="text-xs text-neon-green opacity-70">
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
            <h2 className="text-2xl font-bold mb-6 text-white">Saved Projects</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" style={{ gap: '24px' }}>
              {savedProjects.map((project) => (
                <div
                  key={`saved-${project.id}`}
                  style={{
                    backgroundColor: '#111827',
                    borderRadius: '12px',
                    padding: '12px',
                    position: 'relative',
                  }}
                  className="hover:bg-gray-800 transition group"
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
                        top: '8px',
                        right: '8px',
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
                          width: '32px',
                          height: '32px',
                          backgroundColor: 'rgba(0, 0, 0, 0.7)',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        className="hover:bg-black text-white transition shadow-lg"
                        title="More options"
                        type="button"
                      >
                        <MoreVertical style={{ width: '16px', height: '16px' }} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Title and creator */}
                  <Link
                    href={`/share/${project.share_token}`}
                    style={{ display: 'block' }}
                  >
                    <h3 className="text-sm sm:text-base font-semibold text-white line-clamp-2" style={{ marginBottom: '4px' }}>
                      {project.title}
                    </h3>
                    <p className="text-xs text-gray-400">
                      by {project.creator_username}
                    </p>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
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

