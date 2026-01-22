'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { supabase } from '@/lib/supabase'
import { Project, Track } from '@/lib/types'
import TrackPlaylist from './TrackPlaylist'
import { Share2, Download, Plus, Copy, Check, X, MoreVertical, Pin, PinOff, ListMusic, Trash2, User, LayoutDashboard } from 'lucide-react'
import { setPendingProject } from '@/lib/pendingProject'
import { showToast } from './Toast'
import Image from 'next/image'
import { ProjectDetailSkeleton } from './SkeletonLoader'
import { addToQueue } from './BottomTabBar'
import ShareModal from './ShareModal'
import CreatorProfileModal from './CreatorProfileModal'

interface SharedProjectPageProps {
  token: string
}

export default function SharedProjectPage({ token }: SharedProjectPageProps) {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy()
  
  // Helper function for authenticated API requests
  const apiRequest = useCallback(async (
    endpoint: string,
    options: { method?: string; body?: unknown } = {}
  ) => {
    const authToken = await getAccessToken()
    if (!authToken) throw new Error('Not authenticated')
    
    const response = await fetch(endpoint, {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Request failed')
    return data
  }, [getAccessToken])
  const [project, setProject] = useState<Project | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [linkCopied, setLinkCopied] = useState(false)
  const [addedToProject, setAddedToProject] = useState(false)
  const checkedAddedRef = useRef<string | null>(null) // Track which project/user combo we've checked
  const [creatorUsername, setCreatorUsername] = useState<string | null>(null)
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [showCreatorModal, setShowCreatorModal] = useState(false)
  const [trackShareLinkCopied, setTrackShareLinkCopied] = useState<string | null>(null)
  const [trackShareModal, setTrackShareModal] = useState<{ track: Track | null; isOpen: boolean }>({ track: null, isOpen: false })
  const [trackSharePrivacy, setTrackSharePrivacy] = useState<'private' | 'direct' | 'public'>('direct')
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [trackMenuOpen, setTrackMenuOpen] = useState(false) // Track when child menu is open
  const projectMenuRef = useRef<HTMLDivElement>(null)

  // Detect mobile vs desktop
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    loadProject()
  }, [token])

  useEffect(() => {
    // Privy pattern: Always check ready first before checking authenticated
    if (!ready) {
      return
    }
    
    // Reset state when not authenticated
    if (!authenticated || !user) {
      setAddedToProject(false)
      setIsPinned(false)
      checkedAddedRef.current = null
      return
    }
    
    if (authenticated && user && project) {
      const checkKey = `${user.id}-${project.id}`
      // Prevent duplicate checks for the same user/project combo
      if (checkedAddedRef.current === checkKey) {
        return
      }
      checkedAddedRef.current = checkKey
      checkIfAdded()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, user?.id, project?.id]) // Add ready check following Privy's pattern

  // Close project menu when clicking outside (desktop only)
  useEffect(() => {
    if (typeof window === 'undefined' || !isProjectMenuOpen || isMobile) return
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      // Don't close if clicking the button that opens the menu
      const menuButton = projectMenuRef.current?.querySelector('button')
      if (menuButton && menuButton.contains(target)) {
        return
      }
      // Close if clicking outside the menu container
      if (projectMenuRef.current && !projectMenuRef.current.contains(target)) {
        setIsProjectMenuOpen(false)
      }
    }

    // Add listener with a small delay to avoid immediate closure
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [isProjectMenuOpen, isMobile])

  // Check if project is pinned
  useEffect(() => {
    if (authenticated && user && project) {
      checkPinnedStatus()
    }
  }, [authenticated, user, project])

  const checkPinnedStatus = async () => {
    if (!user || !project) {
      setIsPinned(false)
      return
    }
    try {
      const privyId = user.id
      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (dbUser) {
        // Use maybeSingle() to avoid throwing on no match
        const { data, error } = await supabase
          .from('user_projects')
          .select('pinned')
          .eq('user_id', dbUser.id)
          .eq('project_id', project.id)
          .maybeSingle()

        // Only set to true if we actually found a record with pinned = true
        if (!error && data && data.pinned === true) {
          setIsPinned(true)
        } else {
          setIsPinned(false)
        }
      } else {
        setIsPinned(false)
      }
    } catch (error) {
      console.error('Error checking pinned status:', error)
      setIsPinned(false)
    }
  }

  const handleTogglePin = async () => {
    if (!authenticated) {
      login()
      return
    }
    if (!user || !project) return
    
    try {
      // First, ensure the project is saved
      if (!addedToProject) {
        // Save the project first via secure API
        await apiRequest('/api/library', {
          method: 'POST',
          body: { project_id: project.id },
        })
        setAddedToProject(true)
      }

      const newPinnedState = !isPinned
      await apiRequest('/api/library', {
        method: 'PATCH',
        body: { project_id: project.id, pinned: newPinnedState },
      })

      setIsPinned(newPinnedState)
      setIsProjectMenuOpen(false)
      showToast(newPinnedState ? 'Project pinned to dashboard!' : 'Project unpinned', 'success')
    } catch (error) {
      console.error('Error toggling pin:', error)
      showToast('Failed to update pin status', 'error')
    }
  }

  const handleSaveProject = async () => {
    if (!authenticated) {
      login()
      return
    }
    if (!user || !project) return

    try {
      // Add to library via secure API (handles user creation, metrics, and duplicate check)
      const result = await apiRequest('/api/library', {
        method: 'POST',
        body: { project_id: project.id },
      })

      if (result.message === 'Already in library') {
        showToast('Project already saved!', 'info')
        setIsProjectMenuOpen(false)
        return
      }
      
      setAddedToProject(true)
      setIsProjectMenuOpen(false)
      showToast('Project saved to your library!', 'success')
    } catch (error) {
      console.error('Error saving project:', error)
      showToast('Failed to save project', 'error')
    }
  }

  const loadProject = async () => {
    try {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('share_token', token)
        .single()

      if (projectError) throw projectError
      setProject(projectData)

      // Fetch creator's username
      if (projectData.creator_id) {
        const { data: creatorData } = await supabase
          .from('users')
          .select('username, email')
          .eq('id', projectData.creator_id)
          .single()
        
        if (creatorData) {
          setCreatorUsername(creatorData.username || creatorData.email || null)
        }
        setCreatorId(projectData.creator_id)
      }

      const { data: tracksData, error: tracksError } = await supabase
        .from('tracks')
        .select('*')
        .eq('project_id', projectData.id)
        .order('order', { ascending: true })

      if (tracksError) throw tracksError
      setTracks(tracksData || [])

      // Track view - increment plays metric (only once per page load)
      // We'll track actual plays when tracks are played, not on page load
      // This prevents inflating play counts just from viewing the page
    } catch (error) {
      console.error('Error loading project:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkIfAdded = async () => {
    if (!user || !project) return

    try {
      const privyId = user.id
      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (dbUser) {
        // Use maybeSingle() instead of single() to avoid throwing on no match
        const { data, error } = await supabase
          .from('user_projects')
          .select('id')
          .eq('user_id', dbUser.id)
          .eq('project_id', project.id)
          .maybeSingle()

        // Only set to true if we actually found a record
        if (!error && data) {
          setAddedToProject(true)
        } else {
          setAddedToProject(false)
        }
      } else {
        setAddedToProject(false)
      }
    } catch (error) {
      // User not logged in or error occurred
      console.error('Error checking if added:', error)
      setAddedToProject(false)
    }
  }

  const handleRemoveFromLibrary = async () => {
    if (!authenticated) {
      login()
      return
    }
    if (!user || !project) return

    try {
      await apiRequest(`/api/library?project_id=${project.id}`, { method: 'DELETE' })

      setAddedToProject(false)
      setIsPinned(false)
      setIsProjectMenuOpen(false)
      showToast('Project removed from library', 'success')
    } catch (error) {
      console.error('Error removing from library:', error)
      showToast('Failed to remove project', 'error')
    }
  }

  const handleOpenShareModal = () => {
    if (!project) return
    
    // Check if sharing is enabled
    if (!project.sharing_enabled) {
      showToast('Sharing is disabled for this project by the creator.', 'error')
      setIsProjectMenuOpen(false)
      return
    }
    
    setShareModalOpen(true)
    setIsProjectMenuOpen(false)
  }

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/share/${token}`
    await navigator.clipboard.writeText(url)
    setLinkCopied(true)
    showToast('Link copied to clipboard!', 'success')
    setIsProjectMenuOpen(false) // Close the menu
    setTimeout(() => setLinkCopied(false), 2000)

    // Track share
    if (project) {
      try {
        // Get user ID if authenticated
        let userId: string | null = null
        if (user) {
          const privyId = user.id
          const { data: dbUser } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single()
          userId = dbUser?.id || null
        }

        // Insert share record with user_id
        const { error: shareError } = await supabase
        .from('project_shares')
          .insert({ 
            project_id: project.id,
            user_id: userId
          })

        if (shareError) {
          console.error('Error inserting share:', shareError)
        }

        // Update metrics
        const { data: metrics, error: metricsError } = await supabase
        .from('project_metrics')
        .select('shares')
        .eq('project_id', project.id)
        .single()

        if (metricsError && metricsError.code !== 'PGRST116') {
          console.error('Error fetching metrics:', metricsError)
        }

      if (metrics) {
          const currentShares = metrics.shares ?? 0
          const { error: updateError } = await supabase
          .from('project_metrics')
            .update({ shares: currentShares + 1 })
          .eq('project_id', project.id)

          if (updateError) {
            console.error('Error updating shares:', updateError)
            console.error('Update error details:', JSON.stringify(updateError, null, 2))
          }
      } else {
          // Create metrics record if it doesn't exist
          const { error: insertError } = await supabase
          .from('project_metrics')
            .insert({ project_id: project.id, shares: 1, plays: 0, adds: 0 })

          if (insertError) {
            console.error('Error creating metrics:', insertError)
            console.error('Insert error details:', JSON.stringify(insertError, null, 2))
          }
        }
      } catch (error) {
        console.error('Error tracking share:', error)
      }
    }
  }

  const handleAddToQueue = async () => {
    if (!project) return

    // Add all tracks to local playback queue
    let addedCount = 0
    for (const track of tracks) {
      const added = addToQueue({
        id: track.id,
        title: track.title,
        projectTitle: project.title,
        audioUrl: track.audio_url,
        projectCoverUrl: project.cover_image_url,
      })
      if (added) addedCount++
    }
    
    if (addedCount > 0) {
      showToast(`Added ${addedCount} track${addedCount !== 1 ? 's' : ''} to queue!`, 'success')
    } else {
      showToast('Tracks already in queue', 'info')
    }
    
    setIsProjectMenuOpen(false)
  }

  // Legacy function name for compatibility
  const handleAddToProject = handleAddToQueue

  const handleDownload = async (track: Track) => {
    if (!project?.allow_downloads) return

    try {
      const response = await fetch(track.audio_url)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${track.title}.mp3`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading track:', error)
    }
  }

  const handleShareTrack = async (track: Track) => {
    setTrackShareModal({ track, isOpen: true })
  }

  const handleConfirmTrackShare = async () => {
    if (!trackShareModal.track || !project) return

    let trackShareUrl = ''
    if (trackSharePrivacy === 'private') {
      // Private: Only shareable with specific people (for now, just copy the link)
      trackShareUrl = `${window.location.origin}/share/${project.share_token}?track=${trackShareModal.track.id}&privacy=private`
    } else if (trackSharePrivacy === 'direct') {
      // Direct: Share with a direct link
      trackShareUrl = `${window.location.origin}/share/${project.share_token}?track=${trackShareModal.track.id}`
    } else {
      // Public: Can be discovered (for now, same as direct)
      trackShareUrl = `${window.location.origin}/share/${project.share_token}?track=${trackShareModal.track.id}&privacy=public`
    }

    await navigator.clipboard.writeText(trackShareUrl)
    setTrackShareLinkCopied(trackShareModal.track.id)
    setTimeout(() => setTrackShareLinkCopied(null), 2000)
    setTrackShareModal({ track: null, isOpen: false })
  }

  const handleTrackPlay = async (trackId: string) => {
    if (!project) return

    try {
      // Get user ID if authenticated
      let userId: string | null = null
      if (user) {
        const privyId = user.id
        const { data: dbUser } = await supabase
          .from('users')
          .select('id')
          .eq('privy_id', privyId)
          .single()
        userId = dbUser?.id || null
      }

      // Get IP address (client-side approximation)
      let ipAddress: string | null = null
      try {
        const response = await fetch('https://api.ipify.org?format=json')
        const data = await response.json()
        ipAddress = data.ip || null
      } catch (ipError) {
        console.warn('Could not fetch IP address:', ipError)
      }

      // Insert track play record with user_id and ip_address
      const { error: playError } = await supabase
        .from('track_plays')
        .insert({ 
          track_id: trackId,
          user_id: userId,
          ip_address: ipAddress
        })

      if (playError) {
        console.error('Error inserting track play:', playError)
      }

      // Update project metrics
      const { data: metrics, error: metricsError } = await supabase
        .from('project_metrics')
        .select('plays')
        .eq('project_id', project.id)
        .single()

      if (metricsError && metricsError.code !== 'PGRST116') {
        // PGRST116 is "not found" - that's okay, we'll create it
        console.error('Error fetching metrics:', metricsError)
      }

      if (metrics) {
        const currentPlays = metrics.plays ?? 0
        const { error: updateError } = await supabase
          .from('project_metrics')
          .update({ plays: currentPlays + 1 })
          .eq('project_id', project.id)

        if (updateError) {
          console.error('Error updating plays:', updateError)
          console.error('Update error details:', JSON.stringify(updateError, null, 2))
        }
      } else {
        // Create metrics record if it doesn't exist
        const { error: insertError } = await supabase
          .from('project_metrics')
          .insert({ project_id: project.id, plays: 1, shares: 0, adds: 0 })

        if (insertError) {
          console.error('Error creating metrics:', insertError)
          console.error('Insert error details:', JSON.stringify(insertError, null, 2))
        }
      }
    } catch (error) {
      console.error('Error tracking play:', error)
    }
  }

  if (loading) {
    return <ProjectDetailSkeleton />
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-white">Project Not Found</h1>
          <p className="text-neon-green opacity-90">This project doesn't exist or the link is invalid.</p>
        </div>
      </div>
    )
  }

  // Check if sharing is disabled
  if (project.sharing_enabled === false) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-white">Sharing Disabled</h1>
          <p className="text-neon-green opacity-90">The creator has disabled sharing for this project.</p>
          <Link 
            href="/" 
            className="inline-block mt-6 px-6 py-2 rounded-full bg-white text-black font-semibold hover:bg-gray-200 transition"
          >
            Go to Demo
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative">
      {/* Subtle background gradient */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at top center, rgba(57, 255, 20, 0.03) 0%, transparent 50%)',
        }}
      />
      
      {/* Simple app header so users can discover Demo from shared links */}
      <header className="border-b border-gray-800/50 bg-black/80 backdrop-blur-sm px-4 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight text-white">
            Demo
          </Link>
          <div className="flex items-center gap-2">
            {!authenticated ? (
              <button
                onClick={() => {
                  // Store the current project so we can save it after login
                  if (project) {
                    setPendingProject({
                      projectId: project.id,
                      title: project.title,
                      token: token,
                    })
                  }
                  login()
                }}
                className="px-4 py-2 rounded-full bg-neon-green text-black text-sm font-semibold hover:shadow-lg hover:shadow-neon-green/20 transition-all flex items-center gap-2"
                title="Sign in to access your dashboard"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </button>
            ) : (
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-full bg-neon-green text-black text-sm font-semibold hover:shadow-lg hover:shadow-neon-green/20 transition-all flex items-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 relative z-[1]">
        {/* Cover Image with gradient overlay */}
        {project.cover_image_url && (
          <div className="w-full aspect-[21/9] sm:aspect-[3/1] rounded-xl overflow-hidden mb-6 relative shadow-2xl shadow-black/50">
            <Image
              src={project.cover_image_url}
              alt={project.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
              priority
            />
            {/* Bottom gradient for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>
        )}

        {/* Project Info */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight truncate">{project.title}</h1>
              <div className="flex items-center text-sm text-gray-400 flex-wrap gap-y-1">
                {creatorUsername && creatorId && (
                  <button
                    onClick={() => setShowCreatorModal(true)}
                    className="hover:text-neon-green transition underline-offset-2 hover:underline font-medium"
                  >
                    {creatorUsername}
                  </button>
                )}
                {tracks.length > 0 && (
                  <>
                    <span className="mx-2 text-gray-600">•</span>
                    <span>{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
                  </>
                )}
              </div>
            </div>
            {/* Project Menu Button - Only show if authenticated */}
            {authenticated && user && (
              <button
                onClick={() => {
                  if (!isProjectMenuOpen) {
                    setTrackMenuOpen(false) // This will trigger forceCloseMenu in TrackPlaylist
                  }
                  setIsProjectMenuOpen(!isProjectMenuOpen)
                }}
                className="w-11 h-11 sm:w-10 sm:h-10 bg-gray-800/80 hover:bg-gray-700 text-white rounded-xl flex items-center justify-center transition-colors touch-manipulation flex-shrink-0"
                title="More options"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            )}
          </div>
          {project.description && (
            <p className="text-gray-400 text-base mb-6 leading-relaxed">{project.description}</p>
          )}
        </div>

        {/* Tracks */}
        <div className="space-y-4">
          {tracks.length === 0 ? (
            <div className="text-center py-12 bg-gray-900/50 rounded-xl border border-gray-800/50">
              <p className="text-gray-500">No tracks in this project yet.</p>
            </div>
          ) : (
            <TrackPlaylist
              tracks={tracks}
              projectCoverUrl={project.cover_image_url}
              projectTitle={project.title}
              allowDownloads={project.allow_downloads}
              onTrackPlay={handleTrackPlay}
              onMenuOpen={() => {
                setIsProjectMenuOpen(false) // Close project menu when track menu opens
                setTrackMenuOpen(true)
              }}
              forceCloseMenu={isProjectMenuOpen} // Force track menu closed when project menu is open
            />
          )}
        </div>
      </div>

      {/* Project Menu Bottom Tray - Full width on mobile like ShareModal */}
      {isProjectMenuOpen && project && (
        <>
          {/* Backdrop */}
          <div 
            onClick={() => setIsProjectMenuOpen(false)}
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
          
          {/* Bottom Sheet */}
          <div
            style={{
              position: 'fixed',
              bottom: isMobile ? 0 : '50%',
              left: isMobile ? 0 : '50%',
              right: isMobile ? 0 : 'auto',
              transform: isMobile ? 'none' : 'translate(-50%, 50%)',
              width: isMobile ? '100%' : '400px',
              maxWidth: '100%',
              backgroundColor: '#111827',
              borderRadius: isMobile ? '16px 16px 0 0' : '16px',
              zIndex: 101,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid #374151',
              flexDirection: 'column',
            }}>
              <div style={{ width: '40px', height: '4px', backgroundColor: '#4B5563', borderRadius: '2px', marginBottom: '12px' }} />
              <h2 style={{ 
                fontSize: '16px', 
                fontWeight: 600, 
                color: '#fff',
                margin: 0,
                textAlign: 'center',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {project.title}
              </h2>
            </div>

            {/* Menu Options */}
            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => handleOpenShareModal()}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: '#1f2937',
                  color: !project.sharing_enabled ? '#6b7280' : '#fff',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: !project.sharing_enabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                  opacity: !project.sharing_enabled ? 0.5 : 1,
                }}
                className="hover:bg-gray-700 transition"
              >
                <div style={{
                  width: '44px',
                  height: '44px',
                  backgroundColor: '#374151',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Share2 style={{ width: '22px', height: '22px', color: !project.sharing_enabled ? '#6b7280' : '#39FF14' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Share</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    {!project.sharing_enabled ? 'Sharing disabled by creator' : 'Share this project with others'}
                  </div>
                </div>
              </button>

              {/* View Creator */}
              {creatorId && (
                <button
                  onClick={() => {
                    setShowCreatorModal(true)
                    setIsProjectMenuOpen(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    backgroundColor: '#1f2937',
                    color: '#fff',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    textAlign: 'left',
                  }}
                  className="hover:bg-gray-700 transition"
                >
                  <div style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#374151',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <User style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>View Creator</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      See creator profile and contact info
                    </div>
                  </div>
                </button>
              )}
              
              {/* Save to Library or Remove from Library button */}
              {addedToProject ? (
                <button
                  onClick={() => handleRemoveFromLibrary()}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    backgroundColor: '#1f2937',
                    color: '#fff',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    textAlign: 'left',
                  }}
                  className="hover:bg-gray-700 transition"
                >
                  <div style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#374151',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <X style={{ width: '22px', height: '22px', color: '#ef4444' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Remove from Library</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      Remove from your saved projects
                    </div>
                  </div>
                </button>
              ) : (
                <button
                  onClick={() => handleSaveProject()}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    backgroundColor: '#1f2937',
                    color: '#fff',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    textAlign: 'left',
                  }}
                  className="hover:bg-gray-700 transition"
                >
                  <div style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#39FF14',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Plus style={{ width: '22px', height: '22px', color: '#000' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Save to Library</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      Add to your saved projects
                    </div>
                  </div>
                </button>
              )}
              
              {/* Add to Queue button */}
              <button
                onClick={() => handleAddToProject()}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: '#1f2937',
                  color: '#fff',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                }}
                className="hover:bg-gray-700 transition"
              >
                <div style={{
                  width: '44px',
                  height: '44px',
                  backgroundColor: '#374151',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <ListMusic style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Add to Queue</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    Add all tracks to play queue
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => handleTogglePin()}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: '#1f2937',
                  color: '#fff',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                }}
                className="hover:bg-gray-700 transition"
              >
                <div style={{
                  width: '44px',
                  height: '44px',
                  backgroundColor: '#374151',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {isPinned ? (
                    <PinOff style={{ width: '22px', height: '22px', color: '#9ca3af' }} />
                  ) : (
                    <Pin style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{isPinned ? 'Unpin Project' : 'Pin Project'}</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    {isPinned ? 'Remove from pinned projects' : 'Pin to top of your dashboard'}
                  </div>
                </div>
              </button>
            </div>

            {/* Cancel button */}
            <div style={{ padding: '12px 20px 20px' }}>
              <button
                onClick={() => setIsProjectMenuOpen(false)}
                style={{
                  width: '100%',
                  padding: '16px',
                  backgroundColor: '#374151',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                className="hover:bg-gray-600 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Share Modal */}
      {project && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${token}`}
          title={project.title}
        />
      )}

      {/* Creator Profile Modal */}
      {creatorId && (
        <CreatorProfileModal
          isOpen={showCreatorModal}
          onClose={() => setShowCreatorModal(false)}
          creatorId={creatorId}
        />
      )}
    </div>
  )
}
