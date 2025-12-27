'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { supabase } from '@/lib/supabase'
import { Project, Track } from '@/lib/types'
import AudioPlayer from './AudioPlayer'
import { Share2, Download, Plus, Copy, Check, X, MoreVertical, Pin, PinOff, ListMusic, FileText, Trash2 } from 'lucide-react'

interface SharedProjectPageProps {
  token: string
}

export default function SharedProjectPage({ token }: SharedProjectPageProps) {
  const { ready, authenticated, user, login } = usePrivy()
  const [project, setProject] = useState<Project | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [linkCopied, setLinkCopied] = useState(false)
  const [addedToProject, setAddedToProject] = useState(false)
  const checkedAddedRef = useRef<string | null>(null) // Track which project/user combo we've checked
  const [creatorUsername, setCreatorUsername] = useState<string | null>(null)
  const [trackShareLinkCopied, setTrackShareLinkCopied] = useState<string | null>(null)
  const [trackShareModal, setTrackShareModal] = useState<{ track: Track | null; isOpen: boolean }>({ track: null, isOpen: false })
  const [trackSharePrivacy, setTrackSharePrivacy] = useState<'private' | 'direct' | 'public'>('direct')
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const projectMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadProject()
  }, [token])

  useEffect(() => {
    // Privy pattern: Always check ready first before checking authenticated
    if (!ready) {
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

  // Close project menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(event.target as Node)) {
        setIsProjectMenuOpen(false)
      }
    }

    if (isProjectMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isProjectMenuOpen])

  // Check if project is pinned
  useEffect(() => {
    if (authenticated && user && project) {
      checkPinnedStatus()
    }
  }, [authenticated, user, project])

  const checkPinnedStatus = async () => {
    if (!user || !project) return
    try {
      const privyId = user.id
      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (dbUser) {
        const { data } = await supabase
          .from('user_projects')
          .select('pinned')
          .eq('user_id', dbUser.id)
          .eq('project_id', project.id)
          .single()

        setIsPinned(data?.pinned || false)
      }
    } catch (error) {
      setIsPinned(false)
    }
  }

  const handleTogglePin = async () => {
    if (!user || !project) return
    try {
      const privyId = user.id
      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (!dbUser) return

      const newPinnedState = !isPinned
      await supabase
        .from('user_projects')
        .upsert(
          { user_id: dbUser.id, project_id: project.id, pinned: newPinnedState },
          { onConflict: 'user_id,project_id' }
        )

      setIsPinned(newPinnedState)
      setIsProjectMenuOpen(false)
    } catch (error) {
      console.error('Error toggling pin:', error)
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
        const { data } = await supabase
          .from('user_projects')
          .select('id')
          .eq('user_id', dbUser.id)
          .eq('project_id', project.id)
          .single()

        setAddedToProject(!!data)
      }
    } catch (error) {
      // User not logged in or not added
      setAddedToProject(false)
    }
  }

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/share/${token}`
    await navigator.clipboard.writeText(url)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)

    // Track share
    if (project) {
      try {
        // Insert share record
        const { error: shareError } = await supabase
          .from('project_shares')
          .insert({ project_id: project.id })

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
          const { error: updateError } = await supabase
            .from('project_metrics')
            .update({ shares: (metrics.shares || 0) + 1 })
            .eq('project_id', project.id)

          if (updateError) {
            console.error('Error updating metrics:', updateError)
          }
        } else {
          // Create metrics record if it doesn't exist
          const { error: insertError } = await supabase
            .from('project_metrics')
            .insert({ project_id: project.id, shares: 1 })

          if (insertError) {
            console.error('Error creating metrics:', insertError)
          }
        }
      } catch (error) {
        console.error('Error tracking share:', error)
      }
    }
  }

  const handleAddToProject = async () => {
    if (!authenticated) {
      login()
      return
    }

    if (!user || !project) return

    try {
      const privyId = user.id
      let { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (!dbUser) {
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({ privy_id: privyId, email: user.email?.address || null })
          .select('id')
          .single()
        
        if (userError || !newUser) throw userError || new Error('Failed to create user')
        dbUser = newUser
      }

      if (!dbUser) throw new Error('User not found')
      
      await supabase
        .from('user_projects')
        .insert({ user_id: dbUser.id, project_id: project.id })

      // Track add
      const { data: metrics } = await supabase
        .from('project_metrics')
        .select('adds')
        .eq('project_id', project.id)
        .single()

      if (metrics) {
        await supabase
          .from('project_metrics')
          .update({ adds: (metrics.adds || 0) + 1 })
          .eq('project_id', project.id)
      } else {
        await supabase
          .from('project_metrics')
          .insert({ project_id: project.id, adds: 1 })
      }

      setAddedToProject(true)
    } catch (error) {
      console.error('Error adding to project:', error)
    }
  }

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
      // Insert track play record
      const { error: playError } = await supabase
        .from('track_plays')
        .insert({ track_id: trackId })

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
        const { error: updateError } = await supabase
          .from('project_metrics')
          .update({ plays: (metrics.plays || 0) + 1 })
          .eq('project_id', project.id)

        if (updateError) {
          console.error('Error updating metrics:', updateError)
        }
      } else {
        // Create metrics record if it doesn't exist
        const { error: insertError } = await supabase
          .from('project_metrics')
          .insert({ project_id: project.id, plays: 1 })

        if (insertError) {
          console.error('Error creating metrics:', insertError)
        }
      }
    } catch (error) {
      console.error('Error tracking play:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-neon-green">Loading...</div>
      </div>
    )
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

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Simple app header so users can discover Hubba from shared links */}
      <header className="border-b border-gray-800 bg-black px-4 py-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight text-white">
            Hubba
          </Link>
          <div className="flex items-center gap-2">
            {!authenticated ? (
              <button
                onClick={login}
                className="px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-200 transition"
              >
                Sign in / Sign up
              </button>
            ) : (
              <Link
                href="/dashboard"
                className="px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-200 transition"
              >
                Open app
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Cover Image */}
        {project.cover_image_url && (
          <div className="w-full h-40 md:h-56 rounded-lg overflow-hidden mb-6">
            <img
              src={project.cover_image_url}
              alt={project.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Project Info */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-bold text-white">{project.title}</h1>
              {creatorUsername && (
                <span className="text-lg text-neon-green opacity-70">by {creatorUsername}</span>
              )}
            </div>
            {/* Project Menu - Only show if authenticated */}
            {authenticated && user && (
              <div className="relative" ref={projectMenuRef}>
                <button
                  onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
                  className="w-12 h-12 sm:w-10 sm:h-10 bg-gray-800 text-white rounded-lg flex items-center justify-center hover:bg-gray-700 active:bg-gray-600 transition touch-manipulation"
                  title="More options"
                >
                  <MoreVertical className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
                
                {isProjectMenuOpen && (
                  <>
                    {/* Backdrop for mobile */}
                    <div 
                      className="fixed inset-0 bg-black bg-opacity-50 z-40 sm:hidden"
                      onClick={() => setIsProjectMenuOpen(false)}
                    />
                    {/* Menu - Side panel on mobile, dropdown on desktop */}
                    <div className="fixed top-0 right-0 bottom-0 w-64 bg-gray-900 border-l border-gray-700 shadow-xl z-50 overflow-y-auto sm:absolute sm:top-11 sm:bottom-auto sm:w-auto sm:min-w-[200px] sm:max-w-[280px] sm:rounded-lg sm:border sm:border-gray-700">
                      <div className="p-4 border-b border-gray-800 sm:border-b-0 sm:p-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopyLink()
                          }}
                          className="w-full px-4 py-3 sm:py-2 text-left text-base sm:text-sm text-white hover:bg-gray-800 active:bg-gray-700 flex items-center gap-3 sm:gap-2 transition touch-manipulation"
                        >
                          <Share2 className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0" />
                          <span className="flex-1">Share</span>
                        </button>
                      </div>
                      <div className="p-4 border-b border-gray-800 sm:border-b-0 sm:p-0 sm:px-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAddToProject()
                          }}
                          disabled={addedToProject}
                          className={`w-full px-4 py-3 sm:py-2 text-left text-base sm:text-sm hover:bg-gray-800 active:bg-gray-700 flex items-center gap-3 sm:gap-2 transition touch-manipulation ${
                            addedToProject ? 'text-gray-400 cursor-not-allowed' : 'text-white'
                          }`}
                        >
                          <ListMusic className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0" />
                          <span className="flex-1">{addedToProject ? 'Added to Queue' : 'Add to Queue'}</span>
                        </button>
                      </div>
                      <div className="p-4 border-b border-gray-800 sm:border-b-0 sm:p-0 sm:px-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            alert('Notes feature coming soon!')
                            setIsProjectMenuOpen(false)
                          }}
                          className="w-full px-4 py-3 sm:py-2 text-left text-base sm:text-sm text-white hover:bg-gray-800 active:bg-gray-700 flex items-center gap-3 sm:gap-2 transition touch-manipulation"
                        >
                          <FileText className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0" />
                          <span className="flex-1">Notes</span>
                        </button>
                      </div>
                      <div className="p-4 border-b border-gray-800 sm:border-b-0 sm:p-0 sm:px-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTogglePin()
                          }}
                          className="w-full px-4 py-3 sm:py-2 text-left text-base sm:text-sm text-white hover:bg-gray-800 active:bg-gray-700 flex items-center gap-3 sm:gap-2 transition touch-manipulation"
                        >
                          {isPinned ? (
                            <>
                              <PinOff className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span className="flex-1">Unpin Project</span>
                            </>
                          ) : (
                            <>
                              <Pin className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span className="flex-1">Pin Project</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {project.description && (
            <p className="text-neon-green text-lg mb-6 opacity-90">{project.description}</p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleAddToProject}
              disabled={addedToProject}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition ${
                addedToProject
                  ? 'bg-gray-800 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-gray-200'
              }`}
            >
              {addedToProject ? (
                <>
                  <Check className="w-4 h-4" />
                  Added
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add to My Projects
                </>
              )}
            </button>

            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-full font-semibold hover:bg-gray-700 transition"
            >
              {linkCopied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tracks */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold mb-4">Tracks</h2>
          {tracks.length === 0 ? (
            <p className="text-neon-green">No tracks in this project yet.</p>
          ) : (
            tracks.map((track) => (
              <div key={track.id} className="bg-gray-900 rounded-lg p-4">
                <div className="flex gap-4 mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-2 text-neon-green">{track.title}</h3>
                  </div>
                </div>
                <AudioPlayer
                  src={track.audio_url}
                  title={track.title}
                  onPlay={() => handleTrackPlay(track.id)}
                  coverImageUrl={track.image_url || project.cover_image_url}
                  showDownload={project.allow_downloads || false}
                  showShare={true}
                  onDownload={() => handleDownload(track)}
                  onShare={() => handleShareTrack(track)}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
