'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { supabase } from '@/lib/supabase'
import { Project, Track } from '@/lib/types'
import TrackPlaylist from './TrackPlaylist'
import CommentsPanel from './CommentsPanel'
import ProjectUpdatesPanel from './ProjectUpdatesPanel'
import TipPromptCard from './TipPromptCard'
import TopSupportersCard from './TopSupportersCard'
import ProjectAttachmentsPanel from './ProjectAttachmentsPanel'
import { Share2, Download, Plus, Copy, Check, X, MoreVertical, Pin, PinOff, ListMusic, Trash2, User, LayoutDashboard } from 'lucide-react'
import { setPendingProject } from '@/lib/pendingProject'
import { showToast } from './Toast'
import Image from 'next/image'
import { ProjectDetailSkeleton } from './SkeletonLoader'
import { addToQueue } from './BottomTabBar'
import ShareModal from './ShareModal'
import CreatorProfileModal from './CreatorProfileModal'
import type { TipPromptTrigger } from '@/lib/tipPrompt'
import { resolveProjectVisibility } from '@/lib/projectVisibility'

interface SharedProjectPageProps {
  token: string
}

type ProjectNotificationMode = 'all' | 'important' | 'mute'

type ViewerSubscriptionState = {
  isSubscribed: boolean
  subscriberCount: number
  notificationMode: ProjectNotificationMode
}

const QUALIFIED_PLAY_SECONDS = 14
const QUALIFIED_PLAY_DELTA_TOLERANCE_SECONDS = 2.5

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
  const qualifiedPlayProgressRef = useRef<{
    trackId: string | null
    lastTime: number
    listenedSeconds: number
    reported: boolean
  }>({
    trackId: null,
    lastTime: 0,
    listenedSeconds: 0,
    reported: false,
  })
  const [isCreatorViewer, setIsCreatorViewer] = useState(false)
  const [tipPromptTrigger, setTipPromptTrigger] = useState<TipPromptTrigger | null>(null)
  const [viewerSubscription, setViewerSubscription] = useState<ViewerSubscriptionState>({
    isSubscribed: false,
    subscriberCount: 0,
    notificationMode: 'all',
  })
  const [updatingNotificationMode, setUpdatingNotificationMode] = useState(false)
  const [blockedPrivateAccess, setBlockedPrivateAccess] = useState<{
    projectId: string
    projectTitle: string | null
    requestStatus: 'pending' | 'approved' | 'denied' | null
  } | null>(null)
  const [accessRequestNote, setAccessRequestNote] = useState('')
  const [requestingAccess, setRequestingAccess] = useState(false)

  // Detect mobile vs desktop
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const emitLibrarySaveEvent = (detail: {
    action: 'save' | 'remove'
    subscription_seeded: boolean
  }) => {
    if (typeof window === 'undefined' || !project) return
    window.dispatchEvent(
      new CustomEvent('library_save_event', {
        detail: {
          schema: 'library_save.v1',
          source: 'shared_project',
          action: detail.action,
          project_id: project.id,
          subscription_seeded: detail.subscription_seeded,
        },
      })
    )
  }

  const emitProjectModeEvent = (detail: {
    old_mode: ProjectNotificationMode
    new_mode: ProjectNotificationMode
  }) => {
    if (typeof window === 'undefined' || !project) return
    window.dispatchEvent(
      new CustomEvent('project_notification_mode_event', {
        detail: {
          schema: 'project_notification_mode.v1',
          source: 'shared_project',
          action: 'change_mode',
          project_id: project.id,
          old_mode: detail.old_mode,
          new_mode: detail.new_mode,
        },
      })
    )
  }

  const loadViewerSubscriptionState = useCallback(async (projectId: string) => {
    try {
      const token = authenticated ? await getAccessToken() : null
      const response = await fetch(
        `/api/project-subscriptions?project_id=${encodeURIComponent(projectId)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to load project notification settings')
      setViewerSubscription({
        isSubscribed: !!result.isSubscribed,
        subscriberCount: result.subscriberCount || 0,
        notificationMode:
          result.notification_mode === 'important' || result.notification_mode === 'mute'
            ? result.notification_mode
            : 'all',
      })
    } catch (error) {
      console.error('Error loading project notification settings:', error)
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    loadProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authenticated])

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

  useEffect(() => {
    const checkCreatorViewer = async () => {
      if (!authenticated || !creatorId) {
        setIsCreatorViewer(false)
        return
      }
      try {
        const token = await getAccessToken()
        if (!token) {
          setIsCreatorViewer(false)
          return
        }
        const response = await fetch('/api/user', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          setIsCreatorViewer(false)
          return
        }
        const data = await response.json()
        setIsCreatorViewer(data.user?.id === creatorId)
      } catch {
        setIsCreatorViewer(false)
      }
    }

    checkCreatorViewer()
  }, [authenticated, creatorId, getAccessToken])

  useEffect(() => {
    if (!project?.id) return
    loadViewerSubscriptionState(project.id)
  }, [project?.id, authenticated, loadViewerSubscriptionState])

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
      setAddedToProject(true)
      setViewerSubscription((prev) => ({
        ...prev,
        isSubscribed: true,
        notificationMode:
          result.notification_mode === 'important' || result.notification_mode === 'mute'
            ? result.notification_mode
            : prev.notificationMode,
      }))
      await loadViewerSubscriptionState(project.id)
      emitLibrarySaveEvent({
        action: 'save',
        subscription_seeded: !!result.subscription_seeded,
      })
      setIsProjectMenuOpen(false)
      showToast(result.message === 'Already in library' ? 'Project already saved!' : 'Project saved to your library!', 'success')
    } catch (error) {
      console.error('Error saving project:', error)
      showToast('Failed to save project', 'error')
    }
  }

  const loadProject = async () => {
    try {
      const authToken = authenticated ? await getAccessToken() : null
      const response = await fetch(`/api/projects?share_token=${encodeURIComponent(token)}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 403 && errorData?.code === 'private_access_required') {
          setBlockedPrivateAccess({
            projectId: typeof errorData.project_id === 'string' ? errorData.project_id : '',
            projectTitle:
              typeof errorData.project_title === 'string' ? errorData.project_title : null,
            requestStatus:
              errorData.request_status === 'pending' ||
              errorData.request_status === 'approved' ||
              errorData.request_status === 'denied'
                ? errorData.request_status
                : null,
          })
        } else {
          setBlockedPrivateAccess(null)
        }
        setProject(null)
        setLoading(false)
        return
      }
      const { project: projectData } = await response.json()
      setBlockedPrivateAccess(null)
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

      const tracksResponse = await fetch(`/api/tracks?project_id=${encodeURIComponent(projectData.id)}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      })
      if (!tracksResponse.ok) {
        const tracksErrorData = await tracksResponse.json().catch(() => ({}))
        throw new Error(tracksErrorData.error || 'Failed to load tracks')
      }
      const tracksPayload = await tracksResponse.json()
      setTracks(tracksPayload.tracks || [])

      // Track view - increment plays metric (only once per page load)
      // We'll track actual plays when tracks are played, not on page load
      // This prevents inflating play counts just from viewing the page
    } catch (error) {
      console.error('Error loading project:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRequestAccess = async () => {
    if (!blockedPrivateAccess?.projectId) return
    if (!authenticated) {
      login()
      return
    }
    setRequestingAccess(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/project-access-requests', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: blockedPrivateAccess.projectId,
          note: accessRequestNote || null,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to request access')
      setBlockedPrivateAccess({
        ...blockedPrivateAccess,
        requestStatus: 'pending',
      })
      setAccessRequestNote('')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_access_request_event', {
            detail: {
              schema: 'project_access_request.v1',
              action: 'request_create',
              project_id: blockedPrivateAccess.projectId,
              requester_user_id: result?.request?.requester_user_id || null,
              reviewer_user_id: null,
              source: 'shared_project_blocked',
            },
          })
        )
      }
      showToast('Access request sent', 'success')
    } catch (error) {
      console.error('Error requesting private project access:', error)
      showToast(error instanceof Error ? error.message : 'Failed to request access', 'error')
    } finally {
      setRequestingAccess(false)
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
      const result = await apiRequest(`/api/library?project_id=${project.id}`, { method: 'DELETE' })

      setAddedToProject(false)
      setIsPinned(false)
      setViewerSubscription((prev) => ({
        ...prev,
        isSubscribed: false,
        notificationMode: 'all',
      }))
      await loadViewerSubscriptionState(project.id)
      emitLibrarySaveEvent({ action: 'remove', subscription_seeded: false })
      setIsProjectMenuOpen(false)
      showToast(
        result?.warning ? 'Removed from library. Notifications could not be unsubscribed immediately.' : 'Project removed from library',
        result?.warning ? 'error' : 'success'
      )
    } catch (error) {
      console.error('Error removing from library:', error)
      showToast('Failed to remove project', 'error')
    }
  }

  const handleNotificationModeChange = async (nextMode: ProjectNotificationMode) => {
    if (!project || !authenticated || updatingNotificationMode) return
    const oldMode = viewerSubscription.notificationMode
    if (oldMode === nextMode) return
    setUpdatingNotificationMode(true)
    setViewerSubscription((prev) => ({ ...prev, notificationMode: nextMode }))
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/project-subscriptions', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: project.id,
          notification_mode: nextMode,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update notification mode')
      const resolvedMode: ProjectNotificationMode =
        result.notification_mode === 'important' || result.notification_mode === 'mute'
          ? result.notification_mode
          : 'all'
      setViewerSubscription((prev) => ({ ...prev, notificationMode: resolvedMode, isSubscribed: true }))
      emitProjectModeEvent({ old_mode: oldMode, new_mode: resolvedMode })
    } catch (error) {
      console.error('Error updating notification mode:', error)
      setViewerSubscription((prev) => ({ ...prev, notificationMode: oldMode }))
      showToast(error instanceof Error ? error.message : 'Failed to update notification mode', 'error')
    } finally {
      setUpdatingNotificationMode(false)
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
        const authToken = authenticated ? await getAccessToken() : null
        const response = await fetch('/api/project-shares', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ project_id: project.id }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error || 'Failed to track share')
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

  const reportQualifiedPlay = useCallback(
    async (trackId: string) => {
      try {
        const authToken = authenticated ? await getAccessToken() : null
        const response = await fetch('/api/track-plays', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            track_id: trackId,
            listened_seconds: QUALIFIED_PLAY_SECONDS,
          }),
        })

        const result = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(result?.error || 'Failed to record qualified play')
        }
      } catch (error) {
        console.error('Error tracking qualified play:', error)
      }
    },
    [authenticated, getAccessToken]
  )

  const handleTrackPlay = useCallback((trackId: string) => {
    qualifiedPlayProgressRef.current = {
      trackId,
      lastTime: 0,
      listenedSeconds: 0,
      reported: false,
    }
  }, [])

  const handlePlaybackSnapshotChange = useCallback(
    (snapshot: { trackId: string | null; currentTime: number; duration: number }) => {
      const { trackId, currentTime } = snapshot
      if (!trackId) return

      const progress = qualifiedPlayProgressRef.current
      if (progress.trackId !== trackId) {
        qualifiedPlayProgressRef.current = {
          trackId,
          lastTime: currentTime,
          listenedSeconds: 0,
          reported: false,
        }
        return
      }

      const delta = currentTime - progress.lastTime
      if (delta > 0 && delta <= QUALIFIED_PLAY_DELTA_TOLERANCE_SECONDS) {
        progress.listenedSeconds += delta
      }

      progress.lastTime = currentTime

      if (!progress.reported && progress.listenedSeconds >= QUALIFIED_PLAY_SECONDS) {
        progress.reported = true
        void reportQualifiedPlay(trackId)
      }
    },
    [reportQualifiedPlay]
  )

  const handleRequireAuthForFeedback = () => {
    if (project) {
      setPendingProject({
        projectId: project.id,
        title: project.title,
        token,
      })
    }
    login()
  }

  if (loading) {
    return <ProjectDetailSkeleton />
  }

  if (!project) {
    if (blockedPrivateAccess?.projectId) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h1 className="text-xl font-semibold text-white mb-2">
              Private project
            </h1>
            <p className="text-sm text-gray-400 mb-4">
              {blockedPrivateAccess.projectTitle
                ? `You need access to open "${blockedPrivateAccess.projectTitle}".`
                : 'You need access to open this private project.'}
            </p>
            <textarea
              value={accessRequestNote}
              onChange={(event) => setAccessRequestNote(event.target.value)}
              placeholder="Optional note to the creator"
              rows={3}
              className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green mb-3"
            />
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleRequestAccess}
                disabled={requestingAccess}
                className="px-4 py-2 rounded bg-neon-green text-black text-sm font-semibold disabled:opacity-50"
              >
                {requestingAccess ? 'Requesting...' : 'Request Access'}
              </button>
              <span className="text-xs text-gray-500">
                {blockedPrivateAccess.requestStatus === 'pending'
                  ? 'Status: Pending'
                  : blockedPrivateAccess.requestStatus === 'approved'
                    ? 'Status: Approved'
                    : blockedPrivateAccess.requestStatus === 'denied'
                      ? 'Status: Denied'
                      : 'No request yet'}
              </span>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-white">Project Not Found</h1>
          <p className="text-neon-green opacity-90">This project doesn't exist or the link is invalid.</p>
        </div>
      </div>
    )
  }

  // Backward-compatible check for legacy projects where sharing was explicitly disabled.
  if (
    resolveProjectVisibility(project.visibility, project.sharing_enabled) !== 'private' &&
    project.sharing_enabled === false
  ) {
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
      <header className="app-shell-nav">
        <div className="app-shell-inner max-w-3xl">
          <Link href="/" className="app-shell-brand">
            Demo
          </Link>
          <div className="app-shell-actions gap-2">
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
                className="btn-primary text-sm"
                title="Sign in to access your dashboard"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </button>
            ) : (
              <Link
                href="/dashboard"
                className="btn-primary text-sm"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 relative z-[1]">
        {/* Cover Image removed - now displayed on cassette player */}

        {/* Project Info */}
        <div className="mb-8 mt-8">
          {/* Title and Options button on the SAME ROW */}
          <div className="mb-4 flex flex-row items-center justify-between gap-4">
            {/* Left: Title and creator info */}
            <div className="flex-1 min-w-0">
              <h1 className="mb-2 text-3xl font-bold leading-tight text-white sm:text-4xl">{project.title}</h1>
              <div className="flex items-center text-sm text-gray-400 flex-wrap gap-y-1">
                {creatorUsername && creatorId && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowCreatorModal(true)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowCreatorModal(true) }}
                    className="text-white text-lg font-medium hover:underline underline-offset-4 transition cursor-pointer"
                  >
                    {creatorUsername}
                  </span>
                )}
                {tracks.length > 0 && (
                  <>
                    <span className="text-gray-600" style={{ margin: '0 12px' }}>•</span>
                    <span>{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
                  </>
                )}
              </div>
            </div>
            {/* Right: Options button - dark gray background, white text */}
            {authenticated && user && (
              <button
                onClick={() => {
                  if (!isProjectMenuOpen) {
                    setTrackMenuOpen(false)
                  }
                  setIsProjectMenuOpen(!isProjectMenuOpen)
                }}
                className="btn-secondary flex-shrink-0 text-sm"
                title="Options"
                aria-label="Project options"
              >
                <MoreVertical className="w-5 h-5" />
                <span className="text-sm font-medium">Options</span>
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
            <div className="ui-empty-state text-center py-12">
              <p className="ui-empty-title">No tracks in this project yet</p>
              <p className="ui-empty-copy mx-auto max-w-sm">
                This page is ready for future uploads, revisions, and shared listening sessions.
              </p>
            </div>
          ) : (
            <TrackPlaylist
              tracks={tracks}
              projectCoverUrl={project.cover_image_url}
              projectTitle={project.title}
              allowDownloads={project.allow_downloads}
              onTrackPlay={handleTrackPlay}
              onPlaybackSnapshotChange={handlePlaybackSnapshotChange}
              onMenuOpen={() => {
                setIsProjectMenuOpen(false) // Close project menu when track menu opens
                setTrackMenuOpen(true)
              }}
              forceCloseMenu={isProjectMenuOpen} // Force track menu closed when project menu is open
            />
          )}
        </div>

        <div className="mt-6 space-y-1.5">
          <CommentsPanel
            projectId={project.id}
            authenticated={authenticated}
            getAccessToken={getAccessToken}
            onRequireAuth={handleRequireAuthForFeedback}
          />
          <TopSupportersCard
            projectId={project.id}
            source="shared_project"
            authenticated={authenticated}
            getAccessToken={getAccessToken}
            onOpenSupporter={(supporterUserId) => {
              setCreatorId(supporterUserId)
              setShowCreatorModal(true)
            }}
          />
          <TipPromptCard
            source="shared_project"
            projectId={project.id}
            creatorId={project.creator_id}
            authenticated={authenticated}
            isCreator={isCreatorViewer}
            viewerKey={user?.id || null}
            trackIds={tracks.map((track) => track.id)}
            onSendTip={(trigger) => {
              setTipPromptTrigger(trigger)
              setShowCreatorModal(true)
            }}
          />
          <ProjectUpdatesPanel
            projectId={project.id}
            authenticated={authenticated}
            getAccessToken={getAccessToken}
            onRequireAuth={handleRequireAuthForFeedback}
            source="shared_project"
          />
          <ProjectAttachmentsPanel
            projectId={project.id}
            authenticated={authenticated}
            getAccessToken={getAccessToken}
            onRequireAuth={handleRequireAuthForFeedback}
            source="shared_project"
          />
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

              {viewerSubscription.isSubscribed && (
                <div
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    backgroundColor: '#111827',
                    color: '#fff',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
                    Notifications
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '10px' }}>
                    Choose update alerts for this project.
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'important', label: 'Important' },
                        { id: 'mute', label: 'Mute' },
                      ] as const
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => handleNotificationModeChange(mode.id)}
                        disabled={updatingNotificationMode}
                        style={{
                          minHeight: '36px',
                          borderRadius: '999px',
                          border:
                            viewerSubscription.notificationMode === mode.id
                              ? '1px solid #39FF14'
                              : '1px solid #374151',
                          color:
                            viewerSubscription.notificationMode === mode.id
                              ? '#39FF14'
                              : '#d1d5db',
                          backgroundColor:
                            viewerSubscription.notificationMode === mode.id
                              ? 'rgba(57, 255, 20, 0.08)'
                              : 'transparent',
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
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
          onClose={() => {
            setShowCreatorModal(false)
            setTipPromptTrigger(null)
          }}
          creatorId={creatorId}
          openTipComposer={!!tipPromptTrigger}
          tipContext={
            tipPromptTrigger
              ? {
                  source: 'shared_project',
                  trigger: tipPromptTrigger,
                  projectId: project.id,
                }
              : null
          }
          viewerKey={user?.id || null}
        />
      )}
    </div>
  )
}
