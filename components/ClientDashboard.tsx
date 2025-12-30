'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Project } from '@/lib/types'
import { Plus, Music, Eye, MoreVertical, Share2, Trash2 } from 'lucide-react'
import { ProjectCardSkeleton } from './SkeletonLoader'
import Image from 'next/image'
import { showToast } from './Toast'
import ShareModal from './ShareModal'

export default function ClientDashboard() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareModalProject, setShareModalProject] = useState<Project | null>(null)
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
          // Grid View with proper spacing - using inline styles for guaranteed spacing
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" style={{ gap: '24px' }}>
            {projects.map((project) => (
              <div
                key={project.id}
                style={{
                  backgroundColor: '#111827',
                  borderRadius: '12px',
                  padding: '12px',
                }}
                className="hover:bg-gray-800 transition group"
              >
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
                      zIndex: 20,
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
                  
                    {openMenuId === project.id && (
                      <>
                        {/* Backdrop - only show on mobile */}
                        {isMobile && (
                          <div 
                            onClick={() => setOpenMenuId(null)}
                            style={{ 
                              position: 'fixed',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: 'rgba(0, 0, 0, 0.5)',
                              zIndex: 55,
                            }}
                          />
                        )}
                        {/* Menu - Bottom sheet on mobile, dropdown on desktop */}
                        <div 
                          style={{
                            position: isMobile ? 'fixed' : 'absolute',
                            bottom: isMobile ? 0 : 'auto',
                            top: isMobile ? 'auto' : '40px',
                            left: isMobile ? 0 : 'auto',
                            right: isMobile ? 0 : 0,
                            width: isMobile ? '100%' : '200px',
                            maxWidth: isMobile ? '100%' : '200px',
                            borderRadius: isMobile ? '16px 16px 0 0' : '8px',
                            maxHeight: '80vh',
                            backgroundColor: '#111827',
                            borderTop: '2px solid #374151',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            zIndex: 60,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ overflowY: 'auto', maxHeight: 'calc(80vh - 16px)' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1f2937' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleOpenShareModal(project)
                                }}
                                className="w-full text-left text-white hover:bg-gray-800 active:bg-gray-700 flex items-center transition"
                                style={{ 
                                  fontSize: '16px',
                                  lineHeight: '24px',
                                  paddingTop: '12px',
                                  paddingBottom: '12px',
                                  gap: '14px',
                                  minWidth: 0,
                                }}
                              >
                                <Share2 style={{ width: '20px', height: '20px', flexShrink: 0 }} />
                                <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word', flex: 1, minWidth: 0 }}>Share</span>
                              </button>
                            </div>
                            <div style={{ padding: '16px 20px', borderTop: '1px solid #374151' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteProject(project)
                                }}
                                className="w-full text-left text-red-400 hover:bg-gray-800 active:bg-gray-700 flex items-center transition"
                                style={{ 
                                  fontSize: '16px',
                                  lineHeight: '24px',
                                  paddingTop: '12px',
                                  paddingBottom: '12px',
                                  gap: '14px',
                                  minWidth: 0,
                                }}
                              >
                                <Trash2 style={{ width: '20px', height: '20px', flexShrink: 0 }} />
                                <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word', flex: 1, minWidth: 0 }}>Delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
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
    </div>
  )
}

