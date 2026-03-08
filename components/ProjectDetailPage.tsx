'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { apiRequest } from '@/lib/api'
import {
  AUDIO_FILE_ACCEPT,
  MAX_AUDIO_UPLOAD_SIZE_BYTES,
  SUPPORTED_AUDIO_LABEL,
  getAudioFileValidationError,
  getAudioUploadContentType,
  isSupportedAudioFile,
} from '@/lib/audioUploadPolicy'
import { Project, Track, ProjectMetrics, ProjectNote, TrackNote } from '@/lib/types'
import TrackPlaylist from './TrackPlaylist'
import CommentsPanel from './CommentsPanel'
import ProjectUpdatesPanel from './ProjectUpdatesPanel'
import TipPromptCard from './TipPromptCard'
import TopSupportersCard from './TopSupportersCard'
import ProjectAttachmentsPanel from './ProjectAttachmentsPanel'
import ProjectActivityPanel from './ProjectActivityPanel'
import {
  Copy,
  Share2,
  Eye,
  EyeOff,
  Download,
  Plus,
  Edit,
  ArrowLeft,
  FileText,
  Save,
  X,
  Upload,
  Trash2,
  MoreVertical,
  Pin,
  PinOff,
  ListMusic,
  ChevronDown,
} from 'lucide-react'
import { showToast } from './Toast'
import Image from 'next/image'
import { ProjectDetailSkeleton } from './SkeletonLoader'
import ShareModal from './ShareModal'
import CreatorProfileModal from './CreatorProfileModal'
import { addToQueue } from './BottomTabBar'
import { User } from 'lucide-react'
import type { TipPromptTrigger } from '@/lib/tipPrompt'
import { resolveProjectVisibility, type ProjectVisibility } from '@/lib/projectVisibility'

interface ProjectDetailPageProps {
  projectId: string
}

type ProjectNotificationMode = 'all' | 'important' | 'mute'

type ProjectBootstrapResponse = {
  project: Project
  tracks?: Track[]
  metrics?: ProjectMetrics | null
  creator?: {
    id: string
    username: string | null
    email: string | null
    avatar_url: string | null
  } | null
  viewer?: {
    is_creator?: boolean
    saved_to_library?: boolean
    pinned_in_library?: boolean
    is_subscribed?: boolean
    subscriber_count?: number
    notification_mode?: ProjectNotificationMode
  } | null
}

type ProjectAccessGrant = {
  id: string
  project_id: string
  user_id: string
  granted_by_user_id: string | null
  created_at: string
  expires_at?: string | null
  is_expired?: boolean
  role?: 'viewer' | 'commenter' | 'contributor'
  username?: string | null
  email?: string | null
  avatar_url?: string | null
}

type ProjectAccessRequest = {
  id: string
  project_id: string
  requester_user_id: string
  requester_username?: string | null
  requester_email?: string | null
  status: 'pending' | 'approved' | 'denied'
  note: string | null
  created_at: string
}

type ProjectAccessIdentifierType = 'username' | 'email' | 'user_id'
type ProjectAccessRole = 'viewer' | 'commenter' | 'contributor'

type ProjectAccessInlineState = {
  tone: 'success' | 'error'
  message: string
}

type ProjectAccessExpiryPreset = 'never' | '24h' | '7d'
type ProjectAccessSearchResult = {
  id: string
  username: string | null
  email: string | null
  avatar_url: string | null
}

const COMPACT_DARK_SELECT_CLASS =
  'h-9 min-w-[116px] w-auto shrink-0 appearance-none rounded-md border border-gray-700 bg-gray-900 px-2.5 pr-8 text-sm text-gray-100 shadow-none transition focus:border-neon-green focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'
const COMPACT_DARK_SELECT_STYLE = {
  WebkitAppearance: 'none' as const,
  appearance: 'none' as const,
  backgroundImage: 'none',
  backgroundColor: '#111827',
  color: '#f3f4f6',
  colorScheme: 'dark' as const,
}
const NEON_GREEN_SELECT_CARET =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%2339FF14' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")"
const COMPACT_DANGER_ACTION_BUTTON_CLASS =
  'ui-pressable inline-flex h-9 min-w-[116px] w-auto shrink-0 appearance-none items-center justify-center whitespace-nowrap rounded-full border border-red-400/50 bg-red-500/10 px-4 text-sm font-semibold text-red-300 transition hover:border-red-300/70 hover:text-red-200 disabled:opacity-50'
const QUALIFIED_PLAY_SECONDS = 14
const QUALIFIED_PLAY_DELTA_TOLERANCE_SECONDS = 2.5

export default function ProjectDetailPage({ projectId }: ProjectDetailPageProps) {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [isCreator, setIsCreator] = useState(false)
  const [projectNote, setProjectNote] = useState<ProjectNote | null>(null)
  const [projectNoteContent, setProjectNoteContent] = useState('')
  const [editingProjectNote, setEditingProjectNote] = useState(false)
  const [trackNotes, setTrackNotes] = useState<Record<string, TrackNote>>({})
  const [editingTrackNotes, setEditingTrackNotes] = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)
  const [creatorUsername, setCreatorUsername] = useState<string | null>(null)
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(null)
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [showCreatorModal, setShowCreatorModal] = useState(false)
  const [newTracks, setNewTracks] = useState<Array<{ file: File | null; title: string; image?: File; imagePreview?: string }>>([])
  const [addingTracks, setAddingTracks] = useState(false)
  const [showAddTrackForm, setShowAddTrackForm] = useState(false)
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [savedToLibrary, setSavedToLibrary] = useState(false)
  const [viewerSubscriptionMode, setViewerSubscriptionMode] = useState<ProjectNotificationMode>('all')
  const [viewerIsSubscribed, setViewerIsSubscribed] = useState(false)
  const [updatingNotificationMode, setUpdatingNotificationMode] = useState(false)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const addTrackFormRef = useRef<HTMLDivElement>(null)
  const secondaryPanelsSentinelRef = useRef<HTMLDivElement>(null)
  const notesRef = useRef<HTMLDivElement>(null)
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
  const [editingProject, setEditingProject] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCoverImage, setEditCoverImage] = useState<File | null>(null)
  const [editCoverImagePreview, setEditCoverImagePreview] = useState<string | null>(null)
  const [savingProject, setSavingProject] = useState(false)
  const [editingTracks, setEditingTracks] = useState<Record<string, { title: string; image?: File; imagePreview?: string }>>({})
  const [savingTracks, setSavingTracks] = useState<Record<string, boolean>>({})
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null) // Track currently being edited in modal
  const [editingTrackTitle, setEditingTrackTitle] = useState('') // Title being edited
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [trackMenuOpen, setTrackMenuOpen] = useState(false) // Track when child menu is open
  const [tipPromptTrigger, setTipPromptTrigger] = useState<TipPromptTrigger | null>(null)
  const visibilityViewTrackedRef = useRef<string | null>(null)
  const [projectAccessGrants, setProjectAccessGrants] = useState<ProjectAccessGrant[]>([])
  const [projectAccessLoading, setProjectAccessLoading] = useState(false)
  const [projectAccessIdentifierInput, setProjectAccessIdentifierInput] = useState('')
  const [projectAccessSelectedUser, setProjectAccessSelectedUser] = useState<ProjectAccessSearchResult | null>(null)
  const [projectAccessSearchResults, setProjectAccessSearchResults] = useState<ProjectAccessSearchResult[]>([])
  const [projectAccessSearchLoading, setProjectAccessSearchLoading] = useState(false)
  const [projectAccessSearchError, setProjectAccessSearchError] = useState<string | null>(null)
  const [projectAccessSaving, setProjectAccessSaving] = useState(false)
  const [projectAccessInlineState, setProjectAccessInlineState] = useState<ProjectAccessInlineState | null>(null)
  const [projectAccessExpiryPreset, setProjectAccessExpiryPreset] = useState<ProjectAccessExpiryPreset>('never')
  const [projectAccessRequests, setProjectAccessRequests] = useState<ProjectAccessRequest[]>([])
  const [projectAccessRequestsLoading, setProjectAccessRequestsLoading] = useState(false)
  const [projectAccessRoleUpdatingUserId, setProjectAccessRoleUpdatingUserId] = useState<string | null>(null)
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(true)
  const [projectAccessExpirySelections, setProjectAccessExpirySelections] = useState<
    Record<string, ProjectAccessExpiryPreset>
  >({})
  const roleViewTrackedRef = useRef<string | null>(null)
  const [blockedPrivateAccess, setBlockedPrivateAccess] = useState<{
    projectId: string
    projectTitle: string | null
    requestStatus: 'pending' | 'approved' | 'denied' | null
  } | null>(null)
  const [blockedAccessRequestNote, setBlockedAccessRequestNote] = useState('')
  const [blockedAccessRequestSaving, setBlockedAccessRequestSaving] = useState(false)
  const [updatingDiscoveryPreference, setUpdatingDiscoveryPreference] = useState(false)
  const [showSecondaryPanels, setShowSecondaryPanels] = useState(false)
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
    if (!ready) return
    loadProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ready, authenticated])

  useEffect(() => {
    if (!showAddTrackForm) return
    const frame = window.requestAnimationFrame(() => {
      addTrackFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [showAddTrackForm])

  useEffect(() => {
    if (!project?.id) {
      setShowSecondaryPanels(false)
      return
    }
    if (showSecondaryPanels) return
    const node = secondaryPanelsSentinelRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShowSecondaryPanels(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShowSecondaryPanels(true)
          observer.disconnect()
        }
      },
      { rootMargin: '320px 0px' }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [project?.id, showSecondaryPanels])

  useEffect(() => {
    if (!project?.id || !isCreator || !user) {
      setProjectNote(null)
      setProjectNoteContent('')
      setTrackNotes({})
      return
    }

    let cancelled = false

    const loadCreatorNotes = async () => {
      try {
        const token = await getAccessToken()
        if (!token) return
        const notesResponse = await fetch(`/api/notes?project_id=${project.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!notesResponse.ok) return
        const notesResult = await notesResponse.json()
        if (cancelled) return

        const projectNoteData = notesResult.projectNote as ProjectNote | null
        const trackNotesData = notesResult.trackNotes as Record<string, TrackNote> | null
        setProjectNote(projectNoteData || null)
        setProjectNoteContent(projectNoteData?.content || '')
        setTrackNotes(trackNotesData || {})
      } catch (notesError) {
        console.error('Error loading notes:', notesError)
      }
    }

    loadCreatorNotes()
    return () => {
      cancelled = true
    }
  }, [getAccessToken, isCreator, project?.id, user])

  const reportQualifiedPlay = useCallback(
    async (trackId: string) => {
      try {
        const token = user ? await getAccessToken() : null
        const response = await fetch('/api/track-plays', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

        if (result?.counted && result?.metrics) {
          setMetrics(result.metrics)
        }
      } catch (error) {
        console.error('Error tracking qualified play:', error)
      }
    },
    [getAccessToken, user]
  )

  const handleTrackPlayStart = useCallback((trackId: string) => {
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

  // Close project menu when clicking outside (desktop only)
  useEffect(() => {
    if (typeof window === 'undefined' || !isProjectMenuOpen) return
    
    const handleClickOutside = (event: MouseEvent) => {
      // Only handle click outside on desktop (sm and up)
      if (window.innerWidth >= 640) {
        const target = event.target as Node
        // Don't close if clicking the button that opens the menu
        const menuButton = projectMenuRef.current?.querySelector('button')
        if (menuButton && menuButton.contains(target)) {
          return
        }
        // Close if clicking outside the menu
        if (projectMenuRef.current && !projectMenuRef.current.contains(target)) {
          setIsProjectMenuOpen(false)
        }
      }
    }

    // Add listener with a small delay to avoid immediate closure
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 50)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [isProjectMenuOpen])

  const emitLibrarySaveEvent = (detail: {
    action: 'save' | 'remove'
    subscription_seeded: boolean
  }) => {
    if (typeof window === 'undefined' || !project) return
    window.dispatchEvent(
      new CustomEvent('library_save_event', {
        detail: {
          schema: 'library_save.v1',
          source: 'project_detail',
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
          source: 'project_detail',
          action: 'change_mode',
          project_id: project.id,
          old_mode: detail.old_mode,
          new_mode: detail.new_mode,
        },
      })
    )
  }

  const loadProject = async () => {
    try {
      setLoading(true)
      const token = authenticated ? await getAccessToken() : null
      const response = await fetch(`/api/projects/bootstrap?id=${encodeURIComponent(projectId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 403 && errorData?.code === 'private_access_required') {
          setBlockedPrivateAccess({
            projectId: typeof errorData.project_id === 'string' ? errorData.project_id : projectId,
            projectTitle:
              typeof errorData.project_title === 'string' ? errorData.project_title : null,
            requestStatus:
              errorData.request_status === 'pending' ||
              errorData.request_status === 'approved' ||
              errorData.request_status === 'denied'
                ? errorData.request_status
                : null,
          })
          setProject(null)
          setTracks([])
          setMetrics(null)
          setCreatorUsername(null)
          setCreatorAvatarUrl(null)
          setCreatorId(null)
          setIsCreator(false)
          setLoading(false)
          return
        }
        if (response.status === 404) {
          setProject(null)
          setTracks([])
          setMetrics(null)
          setCreatorUsername(null)
          setCreatorAvatarUrl(null)
          setCreatorId(null)
          setIsCreator(false)
          setLoading(false)
          return
        }
        throw new Error(errorData.error || 'Failed to load project')
      }
      const result = (await response.json()) as ProjectBootstrapResponse
      const projectData = result.project
      setBlockedPrivateAccess(null)
      setProject(projectData)
      setTracks(result.tracks || [])
      setMetrics(result.metrics || null)
      
      // Set pinned state for creator's own projects
      setIsPinned(!!projectData.pinned)

      const creatorData = result.creator
      setCreatorUsername(creatorData?.username || creatorData?.email || null)
      setCreatorAvatarUrl(creatorData?.avatar_url || null)
      setCreatorId(creatorData?.id || projectData.creator_id || null)

      setIsCreator(!!result.viewer?.is_creator)
      setSavedToLibrary(!!result.viewer?.saved_to_library)
      setViewerIsSubscribed(!!result.viewer?.is_subscribed)
      setViewerSubscriptionMode(
        result.viewer?.notification_mode === 'important' || result.viewer?.notification_mode === 'mute'
          ? result.viewer.notification_mode
          : 'all'
      )
    } catch (error) {
      console.error('Error loading project:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isCreator || !project?.id) return
    if (visibilityViewTrackedRef.current === project.id) return
    visibilityViewTrackedRef.current = project.id
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('project_visibility_event', {
          detail: {
            schema: 'project_visibility.v1',
            action: 'view_setting',
            project_id: project.id,
            old_visibility: resolveProjectVisibility(project.visibility, project.sharing_enabled),
            source: 'project_detail_settings',
          },
        })
      )
    }
  }, [isCreator, project?.id, project?.visibility, project?.sharing_enabled])

  const loadProjectAccessGrants = async (targetProjectId: string) => {
    if (!isCreator) return
    setProjectAccessLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) return
      const response = await fetch(`/api/project-access?project_id=${encodeURIComponent(targetProjectId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to load private access list')
      setProjectAccessGrants(result.grants || [])
      setProjectAccessExpirySelections((current) => {
        const next: Record<string, ProjectAccessExpiryPreset> = {}
        const grants = Array.isArray(result.grants) ? (result.grants as ProjectAccessGrant[]) : []
        for (const grant of grants) {
          const existingChoice = current[grant.user_id]
          if (existingChoice) next[grant.user_id] = existingChoice
        }
        return next
      })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_access_event', {
            detail: {
              schema: 'project_access.v1',
              action: 'view_list',
              project_id: targetProjectId,
              source: 'project_detail_settings',
            },
          })
        )
        if (roleViewTrackedRef.current !== targetProjectId) {
          roleViewTrackedRef.current = targetProjectId
          window.dispatchEvent(
            new CustomEvent('project_access_role_event', {
              detail: {
                schema: 'project_access_role.v1',
                action: 'view_roles',
                project_id: targetProjectId,
                target_user_id: null,
                old_role: null,
                new_role: null,
                source: 'project_detail_settings',
              },
            })
          )
        }
      }
    } catch (error) {
      console.error('Error loading project access grants:', error)
      showToast(error instanceof Error ? error.message : 'Failed to load private access', 'error')
    } finally {
      setProjectAccessLoading(false)
    }
  }

  const loadProjectAccessRequests = async (targetProjectId: string) => {
    if (!isCreator) return
    setProjectAccessRequestsLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) return
      const response = await fetch(
        `/api/project-access-requests?project_id=${encodeURIComponent(targetProjectId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to load access requests')
      setProjectAccessRequests((result.requests || []) as ProjectAccessRequest[])
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_access_request_event', {
            detail: {
              schema: 'project_access_request.v1',
              action: 'request_view_list',
              project_id: targetProjectId,
              requester_user_id: null,
              reviewer_user_id: project?.creator_id || null,
              source: 'project_detail_settings',
            },
          })
        )
      }
    } catch (error) {
      console.error('Error loading project access requests:', error)
    } finally {
      setProjectAccessRequestsLoading(false)
    }
  }

  useEffect(() => {
    if (!project?.id || !isCreator) return
    const visibility = resolveProjectVisibility(project.visibility, project.sharing_enabled)
    if (visibility !== 'private') {
      setProjectAccessGrants([])
      setProjectAccessRequests([])
      return
    }
    loadProjectAccessGrants(project.id)
    loadProjectAccessRequests(project.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.visibility, project?.sharing_enabled, isCreator])

  const emitProjectAccessSearchEvent = (detail: {
    action: 'search' | 'select_result' | 'grant_from_result'
    query_length: number
    result_count?: number
    target_user_id?: string | null
  }) => {
    if (!project?.id || typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('project_access_search_event', {
        detail: {
          schema: 'project_access_search.v1',
          action: detail.action,
          project_id: project.id,
          query_length: detail.query_length,
          result_count: detail.result_count ?? null,
          target_user_id: detail.target_user_id ?? null,
          source: 'project_detail_settings',
        },
      })
    )
  }

  const getSearchCandidateInputLabel = (candidate: ProjectAccessSearchResult): string => {
    const username = typeof candidate.username === 'string' ? candidate.username.trim() : ''
    if (username) return username
    const email = typeof candidate.email === 'string' ? candidate.email.trim() : ''
    if (email) return email
    return candidate.id
  }

  const getSearchCandidatePrimaryLabel = (candidate: ProjectAccessSearchResult): string => {
    const username = typeof candidate.username === 'string' ? candidate.username.trim() : ''
    if (username) return username
    const email = typeof candidate.email === 'string' ? candidate.email.trim() : ''
    if (email.includes('@')) {
      const local = email.split('@')[0]?.trim()
      if (local) return local
    }
    if (email) return email
    return `User ${candidate.id.slice(0, 8)}`
  }

  const getSearchCandidateSecondaryLabel = (candidate: ProjectAccessSearchResult): string | null => {
    const username = typeof candidate.username === 'string' ? candidate.username.trim() : ''
    const email = typeof candidate.email === 'string' ? candidate.email.trim() : ''
    if (username && email) return email
    return null
  }

  useEffect(() => {
    const visibility = resolveProjectVisibility(project?.visibility, project?.sharing_enabled)
    if (!isCreator || visibility !== 'private') return

    const query = projectAccessIdentifierInput.trim()
    if (projectAccessSelectedUser && query === getSearchCandidateInputLabel(projectAccessSelectedUser)) {
      return
    }
    if (query.length < 2) {
      setProjectAccessSearchResults([])
      setProjectAccessSearchError(null)
      setProjectAccessSearchLoading(false)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      setProjectAccessSearchLoading(true)
      setProjectAccessSearchError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Not authenticated')
        const response = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}&limit=8`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to search users')
        if (cancelled) return
        const users = (result.users || []) as ProjectAccessSearchResult[]
        setProjectAccessSearchResults(users)
        emitProjectAccessSearchEvent({
          action: 'search',
          query_length: query.length,
          result_count: users.length,
        })
      } catch (error) {
        if (cancelled) return
        console.error('Error searching users for project access:', error)
        setProjectAccessSearchResults([])
        setProjectAccessSearchError(
          error instanceof Error ? error.message : 'Failed to search users'
        )
        emitProjectAccessSearchEvent({
          action: 'search',
          query_length: query.length,
          result_count: 0,
        })
      } finally {
        if (!cancelled) setProjectAccessSearchLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [
    isCreator,
    project?.visibility,
    project?.sharing_enabled,
    projectAccessIdentifierInput,
    projectAccessSelectedUser,
    getAccessToken,
  ])

  const handleGrantProjectAccess = async () => {
    if (!project?.id || !isCreator) return
    const projectIdForEvent = project.id
    const projectCreatorIdForEvent = project.creator_id
    const selectedUserId = projectAccessSelectedUser?.id || null
    const identifier = selectedUserId || projectAccessIdentifierInput.trim()
    if (!identifier) {
      setProjectAccessInlineState({
        tone: 'error',
        message: 'Enter a username or email.',
      })
      return
    }
    if (
      selectedUserId &&
      projectAccessGrants.some((grant) => grant.user_id === selectedUserId)
    ) {
      setProjectAccessInlineState({
        tone: 'error',
        message: 'That user already has access.',
      })
      return
    }

    const identifierType: ProjectAccessIdentifierType = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identifier
    )
      ? 'user_id'
      : identifier.includes('@')
        ? 'email'
        : 'username'

    setProjectAccessSaving(true)
    setProjectAccessInlineState(null)
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_access_event', {
            detail: {
              schema: 'project_access.v1',
              action: 'grant_attempt',
              project_id: projectIdForEvent,
              source: 'project_detail_settings',
              identifier_type: identifierType,
            },
          })
        )
      }
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/project-access', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectIdForEvent,
          identifier,
          ...(projectAccessExpiryPreset === 'never'
            ? {}
            : { expires_in_hours: projectAccessExpiryPreset === '24h' ? 24 : 24 * 7 }),
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        const failureReason =
          typeof result?.code === 'string' ? result.code : 'unknown_error'
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('project_access_event', {
              detail: {
                schema: 'project_access.v1',
                action: 'grant_failure',
                project_id: projectIdForEvent,
                source: 'project_detail_settings',
                identifier_type:
                  result?.identifier_type || identifierType,
                failure_reason: failureReason,
              },
            })
          )
        }
        if (failureReason === 'user_not_found') {
          setProjectAccessInlineState({ tone: 'error', message: 'No user found for that identifier.' })
        } else if (failureReason === 'self_grant') {
          setProjectAccessInlineState({ tone: 'error', message: 'You already have access as the project creator.' })
        } else if (failureReason === 'ambiguous_match') {
          setProjectAccessInlineState({ tone: 'error', message: 'That identifier matched multiple users. Use a unique username or email.' })
        } else if (failureReason === 'already_granted') {
          setProjectAccessInlineState({ tone: 'error', message: 'That user already has access.' })
        } else if (failureReason === 'invalid_expiry') {
          setProjectAccessInlineState({ tone: 'error', message: result.error || 'Invalid expiry value.' })
        } else if (failureReason === 'schema_mismatch') {
          const suggestedMigrations =
            Array.isArray(result?.suggested_migrations) &&
            result.suggested_migrations.every((item: unknown) => typeof item === 'string')
              ? (result.suggested_migrations as string[])
              : []
          const migrationHint = suggestedMigrations.slice(0, 2).join(', ')
          setProjectAccessInlineState({
            tone: 'error',
            message: migrationHint
              ? `Migration required. Apply: ${migrationHint}`
              : 'Migration required. Apply latest private-access SQL migrations.',
          })
        } else {
          setProjectAccessInlineState({
            tone: 'error',
            message: result.error || 'Failed to grant access.',
          })
        }
        return
      }

      setProjectAccessIdentifierInput('')
      setProjectAccessSelectedUser(null)
      setProjectAccessSearchResults([])
      setProjectAccessSearchError(null)
      await loadProjectAccessGrants(projectIdForEvent)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_access_event', {
            detail: {
              schema: 'project_access.v1',
              action: 'grant_success',
              project_id: projectIdForEvent,
              target_user_id: result.user_id,
              source: 'project_detail_settings',
              identifier_type: result.identifier_type || identifierType,
            },
          })
        )
        if (result?.notification?.action === 'created') {
          window.dispatchEvent(
            new CustomEvent('project_access_notification_event', {
              detail: {
                schema: 'project_access_notification.v1',
                action: 'created',
                project_id: projectIdForEvent,
                recipient_user_id: result.user_id,
                granted_by_user_id: projectCreatorIdForEvent,
                notification_type: result.notification.notification_type || 'new_track',
                source: 'project_detail_settings',
              },
            })
          )
        }
        if (result.grant_action === 'renew') {
          window.dispatchEvent(
            new CustomEvent('project_access_expiry_event', {
              detail: {
                schema: 'project_access_expiry.v1',
                action: 'renew',
                project_id: projectIdForEvent,
                target_user_id: result.user_id,
                expires_at: result.expires_at || null,
                source: 'project_detail_settings',
              },
            })
          )
        } else if (projectAccessExpiryPreset !== 'never') {
          window.dispatchEvent(
            new CustomEvent('project_access_expiry_event', {
              detail: {
                schema: 'project_access_expiry.v1',
                action: 'grant_with_expiry',
                project_id: projectIdForEvent,
                target_user_id: result.user_id,
                expires_at: result.expires_at || null,
                source: 'project_detail_settings',
              },
            })
          )
        }
        if (selectedUserId) {
          emitProjectAccessSearchEvent({
            action: 'grant_from_result',
            query_length: projectAccessIdentifierInput.trim().length,
            target_user_id: selectedUserId,
          })
        }
      }
      if (result.grant_action === 'unchanged') {
        setProjectAccessInlineState({ tone: 'success', message: 'Access already configured with this expiry.' })
      } else if (result.grant_action === 'renew') {
        setProjectAccessInlineState({ tone: 'success', message: 'Access renewed successfully.' })
      } else {
        setProjectAccessInlineState({ tone: 'success', message: 'Invite sent successfully.' })
      }
      showToast('Private access granted', 'success')
    } catch (error) {
      console.error('Error granting project access:', error)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_access_event', {
            detail: {
              schema: 'project_access.v1',
              action: 'grant_failure',
              project_id: projectIdForEvent,
              source: 'project_detail_settings',
              identifier_type: identifierType,
              failure_reason: 'request_failed',
            },
          })
        )
      }
      setProjectAccessInlineState({ tone: 'error', message: 'Failed to grant access.' })
      showToast(error instanceof Error ? error.message : 'Failed to grant access', 'error')
    } finally {
      setProjectAccessSaving(false)
    }
  }

  const handleBlockedAccessRequest = async () => {
    if (!blockedPrivateAccess?.projectId) return
    setBlockedAccessRequestSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Please sign in first')
      const response = await fetch('/api/project-access-requests', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: blockedPrivateAccess.projectId,
          note: blockedAccessRequestNote || null,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to request access')
      setBlockedPrivateAccess({
        ...blockedPrivateAccess,
        requestStatus: 'pending',
      })
      setBlockedAccessRequestNote('')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_access_request_event', {
            detail: {
              schema: 'project_access_request.v1',
              action: 'request_create',
              project_id: blockedPrivateAccess.projectId,
              requester_user_id: result?.request?.requester_user_id || null,
              reviewer_user_id: null,
              source: 'project_detail_blocked',
            },
          })
        )
      }
      showToast('Access request sent', 'success')
    } catch (error) {
      console.error('Error requesting access to private project:', error)
      showToast(error instanceof Error ? error.message : 'Failed to request access', 'error')
    } finally {
      setBlockedAccessRequestSaving(false)
    }
  }

  const handleSetProjectAccessExpiry = async (
    targetUserId: string,
    expiryPreset: ProjectAccessExpiryPreset
  ) => {
    if (!project?.id || !isCreator) return
    setProjectAccessSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const body: Record<string, unknown> = {
        project_id: project.id,
        user_id: targetUserId,
      }
      if (expiryPreset === 'never') {
        body.expires_at = null
      } else {
        body.expires_in_hours = expiryPreset === '24h' ? 24 : 24 * 7
      }
      const response = await fetch('/api/project-access', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update access expiry')
      await loadProjectAccessGrants(project.id)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_access_expiry_event', {
            detail: {
              schema: 'project_access_expiry.v1',
              action: 'renew',
              project_id: project.id,
              target_user_id: targetUserId,
              expires_at: result.expires_at || null,
              source: 'project_detail_settings',
            },
          })
        )
      }
      setProjectAccessInlineState({
        tone: 'success',
        message:
          expiryPreset === 'never'
            ? 'Access expiry updated to no expiry.'
            : `Access expiry updated to ${expiryPreset}.`,
      })
    } catch (error) {
      console.error('Error updating project access expiry:', error)
      setProjectAccessInlineState({ tone: 'error', message: 'Failed to update access expiry.' })
      showToast(error instanceof Error ? error.message : 'Failed to update access expiry', 'error')
    } finally {
      setProjectAccessSaving(false)
    }
  }

  const handleRevokeProjectAccess = async (targetUserId: string) => {
    if (!project?.id || !isCreator) return
    setProjectAccessSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/project-access', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: project.id,
          user_id: targetUserId,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to revoke access')
      await loadProjectAccessGrants(project.id)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_access_event', {
            detail: {
              schema: 'project_access.v1',
              action: 'revoke',
              project_id: project.id,
              target_user_id: targetUserId,
              source: 'project_detail_settings',
            },
          })
        )
        window.dispatchEvent(
          new CustomEvent('project_access_expiry_event', {
            detail: {
              schema: 'project_access_expiry.v1',
              action: 'revoke',
              project_id: project.id,
              target_user_id: targetUserId,
              expires_at: null,
              source: 'project_detail_settings',
            },
          })
        )
      }
      showToast('Private access revoked', 'success')
    } catch (error) {
      console.error('Error revoking project access:', error)
      showToast(error instanceof Error ? error.message : 'Failed to revoke access', 'error')
    } finally {
      setProjectAccessSaving(false)
    }
  }

  const handleChangeProjectAccessRole = async (
    grant: ProjectAccessGrant,
    nextRole: ProjectAccessRole
  ) => {
    if (!project?.id || !isCreator) return
    const oldRole: ProjectAccessRole = grant.role || 'viewer'
    if (oldRole === nextRole) return

    setProjectAccessRoleUpdatingUserId(grant.user_id)
    setProjectAccessInlineState(null)
    setProjectAccessGrants((current) =>
      current.map((entry) =>
        entry.user_id === grant.user_id
          ? {
              ...entry,
              role: nextRole,
            }
          : entry
      )
    )

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/project-access', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: project.id,
          user_id: grant.user_id,
          role: nextRole,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update collaborator role')

      setProjectAccessGrants((current) =>
        current.map((entry) =>
          entry.user_id === grant.user_id
            ? {
                ...entry,
                role: result.role || nextRole,
              }
            : entry
        )
      )

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_access_role_event', {
            detail: {
              schema: 'project_access_role.v1',
              action: 'change_role',
              project_id: project.id,
              target_user_id: grant.user_id,
              old_role: oldRole,
              new_role: result.role || nextRole,
              source: 'project_detail_settings',
            },
          })
        )
      }
      setProjectAccessInlineState({ tone: 'success', message: 'Collaborator role updated.' })
    } catch (error) {
      console.error('Error changing project collaborator role:', error)
      setProjectAccessGrants((current) =>
        current.map((entry) =>
          entry.user_id === grant.user_id
            ? {
                ...entry,
                role: oldRole,
              }
            : entry
        )
      )
      setProjectAccessInlineState({ tone: 'error', message: 'Failed to update collaborator role.' })
      showToast(error instanceof Error ? error.message : 'Failed to update collaborator role', 'error')
    } finally {
      setProjectAccessRoleUpdatingUserId(null)
    }
  }

  const handleReviewAccessRequest = async (
    requestId: string,
    requesterUserId: string,
    action: 'approve' | 'deny'
  ) => {
    if (!project?.id || !isCreator) return
    setProjectAccessSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/project-access-requests', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: requestId, action }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update request')

      await Promise.all([loadProjectAccessRequests(project.id), loadProjectAccessGrants(project.id)])

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_access_request_event', {
            detail: {
              schema: 'project_access_request.v1',
              action: action === 'approve' ? 'request_approve' : 'request_deny',
              project_id: project.id,
              requester_user_id: requesterUserId,
              reviewer_user_id: project.creator_id,
              source: 'project_detail_settings',
            },
          })
        )
      }
      showToast(action === 'approve' ? 'Access request approved' : 'Access request denied', 'success')
    } catch (error) {
      console.error('Error reviewing access request:', error)
      showToast(error instanceof Error ? error.message : 'Failed to update request', 'error')
    } finally {
      setProjectAccessSaving(false)
    }
  }

  const handleOpenShareModal = () => {
    if (!project) return
    
    // Check if sharing is enabled (default to true if not set)
    if (project.sharing_enabled === false) {
      showToast('Sharing is disabled for this project. Enable it in Project Settings.', 'error')
      setIsProjectMenuOpen(false)
      return
    }
    
    setShareModalOpen(true)
    setIsProjectMenuOpen(false)
    
    // Track share when modal is opened
    trackShare()
  }

  const handleCloseShareModal = () => {
    setShareModalOpen(false)
  }


  const trackShare = async () => {
    if (!project) return
    
    try {
      const token = user ? await getAccessToken() : null
      const res = await fetch('/api/project-shares', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ project_id: project.id }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new Error(payload?.error || 'Failed to track share')
      }

      const { metrics: updatedMetrics } = await res.json()
      if (updatedMetrics) setMetrics(updatedMetrics)
    } catch (error) {
      console.error('Error tracking share:', error)
    }
  }

  const handleAddToQueue = async () => {
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

      // Check if already added
      const { data: existingEntry } = await supabase
        .from('user_projects')
        .select('id')
        .eq('user_id', dbUser.id)
        .eq('project_id', project.id)
        .single()

      if (!existingEntry) {
        // Add to user_projects if not already added
        await supabase
          .from('user_projects')
          .upsert({ user_id: dbUser.id, project_id: project.id }, { onConflict: 'user_id,project_id' })

        // Atomically increment adds metric via API
        try {
          const res = await fetch('/api/metrics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: project.id, field: 'adds' }),
          })
          if (res.ok) {
            const { metrics: updatedMetrics } = await res.json()
            if (updatedMetrics) setMetrics(updatedMetrics)
          }
        } catch (metricsErr) {
          console.error('Error updating adds metric:', metricsErr)
        }

        // Also add all tracks to local playback queue
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
        
        showToast(`Added ${addedCount} track${addedCount !== 1 ? 's' : ''} to queue!`, 'success')
      } else {
        // Still add to local playback queue even if already in user's collection
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
          showToast('All tracks already in queue', 'info')
        }
      }
      setIsProjectMenuOpen(false)
    } catch (error) {
      console.error('Error adding to queue:', error)
      showToast('Failed to add to queue', 'error')
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
      
      if (isCreator) {
        // For creator's own projects, update via API (server verifies ownership)
        const { error } = await apiRequest('/api/projects', {
          method: 'PATCH',
          body: { id: project.id, pinned: newPinnedState },
          getAccessToken,
        })
        if (error) throw new Error(error)
      } else {
        // For saved projects, update via library API
        const { error } = await apiRequest('/api/library', {
          method: 'PATCH',
          body: { project_id: project.id, pinned: newPinnedState },
          getAccessToken,
        })
        if (error) throw new Error(error)
      }

      setIsPinned(newPinnedState)
      setIsProjectMenuOpen(false)
      showToast(newPinnedState ? 'Project pinned!' : 'Project unpinned', 'success')
    } catch (error) {
      console.error('Error toggling pin:', error)
      showToast('Failed to update pin status', 'error')
    }
  }

  const handleSaveToLibrary = async () => {
    if (!project || !user) return
    const { data, error } = await apiRequest<{
      message?: string
      notification_mode?: ProjectNotificationMode
      subscription_seeded?: boolean
    }>('/api/library', {
      method: 'POST',
      body: { project_id: project.id },
      getAccessToken,
    })
    if (error) {
      showToast(error, 'error')
      return
    }
    setSavedToLibrary(true)
    setViewerIsSubscribed(true)
    setViewerSubscriptionMode(
      data?.notification_mode === 'important' || data?.notification_mode === 'mute'
        ? data.notification_mode
        : 'all'
    )
    emitLibrarySaveEvent({
      action: 'save',
      subscription_seeded: !!data?.subscription_seeded,
    })
    setIsProjectMenuOpen(false)
    showToast(data?.message === 'Already in library' ? 'Project already saved!' : 'Project saved to your library!', 'success')
  }

  const handleRemoveFromLibrary = async () => {
    if (!project || !user) return
    const { data, error } = await apiRequest<{ warning?: string | null }>(
      `/api/library?project_id=${project.id}`,
      {
        method: 'DELETE',
        getAccessToken,
      }
    )
    if (error) {
      showToast(error, 'error')
      return
    }
    setSavedToLibrary(false)
    setViewerIsSubscribed(false)
    setViewerSubscriptionMode('all')
    emitLibrarySaveEvent({ action: 'remove', subscription_seeded: false })
    setIsProjectMenuOpen(false)
    if (data?.warning) {
      showToast(data.warning, 'error')
      return
    }
    showToast('Project removed from library', 'success')
  }

  const handleHideFromExplore = async () => {
    if (!project || !user) return
    setUpdatingDiscoveryPreference(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/discovery/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_type: 'project',
          target_id: project.id,
          preference: 'hide',
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update Explore preferences')

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('discovery_preference_event', {
            detail: {
              schema: 'discovery_preference.v1',
              action: 'hide_project',
              source: 'project_detail',
              target_type: 'project',
              target_id: project.id,
              position_index: null,
            },
          })
        )
        window.dispatchEvent(
          new CustomEvent('discovery_feedback_event', {
            detail: {
              schema: 'discovery_feedback.v1',
              action: 'hide_without_reason',
              source: 'project_detail',
              target_type: 'project',
              target_id: project.id,
              reason_code: null,
            },
          })
        )
      }

      setIsProjectMenuOpen(false)
      showToast("We'll show less like this in Explore", 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update Explore preferences', 'error')
    } finally {
      setUpdatingDiscoveryPreference(false)
    }
  }

  const handleViewerNotificationModeChange = async (nextMode: ProjectNotificationMode) => {
    if (!project || !user || !viewerIsSubscribed || updatingNotificationMode) return
    const oldMode = viewerSubscriptionMode
    if (oldMode === nextMode) return
    setUpdatingNotificationMode(true)
    setViewerSubscriptionMode(nextMode)
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
      setViewerSubscriptionMode(resolvedMode)
      emitProjectModeEvent({
        old_mode: oldMode,
        new_mode: resolvedMode,
      })
    } catch (error) {
      console.error('Error updating project notification mode:', error)
      setViewerSubscriptionMode(oldMode)
      showToast(error instanceof Error ? error.message : 'Failed to update notification mode', 'error')
    } finally {
      setUpdatingNotificationMode(false)
    }
  }

  const startEditingProject = () => {
    if (!project) return
    setEditTitle(project.title)
    setEditDescription(project.description || '')
    setEditCoverImagePreview(project.cover_image_url || null)
    setEditCoverImage(null)
    setEditingProject(true)
    setIsProjectMenuOpen(false)
  }

  const cancelEditingProject = () => {
    setEditingProject(false)
    setEditTitle('')
    setEditDescription('')
    setEditCoverImage(null)
    setEditCoverImagePreview(null)
  }

  const handleSaveProject = async () => {
    if (!project || !isCreator) return
    setSavingProject(true)

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      let coverImageUrl = project.cover_image_url

      // Upload new cover image if provided
      if (editCoverImage) {
        const privyId = user?.id
        if (!privyId) throw new Error('User not authenticated')

        let { data: dbUser } = await supabase
          .from('users')
          .select('id')
          .eq('privy_id', privyId)
          .single()

        if (!dbUser) {
          const { data: newUser, error: userError } = await supabase
            .from('users')
            .insert({ privy_id: privyId, email: user?.email?.address || null })
            .select('id')
            .single()
          if (userError || !newUser) throw new Error('Failed to get or create user')
          dbUser = newUser
        }

        coverImageUrl = await uploadFile(editCoverImage, `projects/${dbUser.id}/cover-images`)
      }

      // Update project via secure API
      const response = await fetch('/api/projects', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: project.id,
          title: editTitle,
          description: editDescription || null,
          cover_image_url: coverImageUrl || null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update project')
      }

      showToast('Project updated successfully!', 'success')
      setEditingProject(false)
      await loadProject()
    } catch (error: unknown) {
      console.error('Error updating project:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to update project. Please try again.'
      showToast(errorMessage, 'error')
    } finally {
      setSavingProject(false)
    }
  }

  const handleEditCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setEditCoverImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setEditCoverImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const startEditingTrack = (track: Track) => {
    console.log('startEditingTrack called with:', track)
    console.log('Setting editingTrackId to:', track.id)
    console.log('Setting editingTrackTitle to:', track.title)
    setEditingTrackId(track.id)
    setEditingTrackTitle(track.title)
  }

  const cancelEditingTrackModal = () => {
    setEditingTrackId(null)
    setEditingTrackTitle('')
  }

  const saveEditingTrack = async () => {
    if (!editingTrackId || !editingTrackTitle.trim()) return
    
    const track = tracks.find(t => t.id === editingTrackId)
    if (!track) return

    setSavingTracks({ ...savingTracks, [editingTrackId]: true })

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      // Update track via secure API
      const response = await fetch('/api/tracks', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingTrackId,
          title: editingTrackTitle.trim(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update track')
      }

      showToast('Track updated successfully!', 'success')
      cancelEditingTrackModal()
      await loadProject()
    } catch (error: unknown) {
      console.error('Error updating track:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to update track. Please try again.'
      showToast(errorMessage, 'error')
    } finally {
      setSavingTracks({ ...savingTracks, [editingTrackId]: false })
    }
  }

  const cancelEditingTrack = (trackId: string) => {
    const newEditingTracks = { ...editingTracks }
    delete newEditingTracks[trackId]
    setEditingTracks(newEditingTracks)
  }

  const handleSaveTrack = async (track: Track) => {
    if (!project || !isCreator) return
    setSavingTracks({ ...savingTracks, [track.id]: true })

    try {
      let trackImageUrl = track.image_url

      // Upload new track image if provided
      const editData = editingTracks[track.id]
      if (editData?.image) {
        const privyId = user?.id
        if (!privyId) throw new Error('User not authenticated')

        let { data: dbUser } = await supabase
          .from('users')
          .select('id')
          .eq('privy_id', privyId)
          .single()

        if (!dbUser) {
          const { data: newUser, error: userError } = await supabase
            .from('users')
            .insert({ privy_id: privyId, email: user?.email?.address || null })
            .select('id')
            .single()
          if (userError || !newUser) throw new Error('Failed to get or create user')
          dbUser = newUser
        }

        trackImageUrl = await uploadFile(editData.image, `projects/${dbUser.id}/track-images`)
      }

      // Update track
      const { error: updateError } = await supabase
        .from('tracks')
        .update({
          title: editData?.title || track.title,
          image_url: trackImageUrl || null,
        })
        .eq('id', track.id)

      if (updateError) throw updateError

      showToast('Track updated successfully!', 'success')
      cancelEditingTrack(track.id)
      await loadProject()
    } catch (error: any) {
      console.error('Error updating track:', error)
      showToast(error?.message || 'Failed to update track. Please try again.', 'error')
    } finally {
      setSavingTracks({ ...savingTracks, [track.id]: false })
    }
  }

  const handleTrackImageChange = (trackId: string, file: File) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      setEditingTracks({
        ...editingTracks,
        [trackId]: {
          ...editingTracks[trackId],
          image: file,
          imagePreview: reader.result as string,
        },
      })
    }
    reader.readAsDataURL(file)
  }

  const handleDeleteProject = async () => {
    if (!project || !isCreator) return
    setIsProjectMenuOpen(false)

    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return
    }

    try {
      // Delete the project via API (server verifies ownership)
      const { error: deleteError } = await apiRequest(`/api/projects?id=${project.id}`, {
        method: 'DELETE',
        getAccessToken,
      })

      if (deleteError) {
        throw new Error(deleteError)
      }

      showToast('Project deleted successfully!', 'success')
      router.push('/dashboard')
    } catch (error: any) {
      console.error('Error deleting project:', error)
      const errorMessage = error?.message || 'Failed to delete project. Please try again.'
      showToast(`Error: ${errorMessage}`, 'error')
    }
  }

  const handleSaveProjectNote = async () => {
    if (!project) return
    setSavingNote('project')

    try {
      if (projectNote) {
        // Update existing note
        const { data, error } = await supabase
          .from('project_notes')
          .update({ content: projectNoteContent })
          .eq('id', projectNote.id)
          .select()
          .single()

        if (error) throw error
        setProjectNote(data)
      } else {
        // Create new note
        const { data, error } = await supabase
          .from('project_notes')
          .insert({ project_id: project.id, content: projectNoteContent })
          .select()
          .single()

        if (error) throw error
        setProjectNote(data)
      }
      setEditingProjectNote(false)
    } catch (error) {
      console.error('Error saving project note:', error)
        showToast('Failed to save note', 'error')
    } finally {
      setSavingNote(null)
    }
  }

  const handleSaveTrackNote = async (trackId: string) => {
    setSavingNote(trackId)

    try {
      const content = (editingTrackNotes[trackId] || '').trim()
      if (!content) {
        throw new Error('Track note cannot be empty')
      }

      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const existingNoteId = trackNotes[trackId]?.id
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'track',
          track_id: trackId,
          note_id: existingNoteId,
          content,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save track note')
      }

      const note = result.note as TrackNote
      setTrackNotes({ ...trackNotes, [trackId]: note })

      // Exit edit mode by removing from editingTrackNotes
      const newEditing = { ...editingTrackNotes }
      delete newEditing[trackId]
      setEditingTrackNotes(newEditing)
      
      showToast('Note saved!', 'success')
    } catch (error) {
      console.error('Error saving track note:', error)
      showToast('Failed to save note', 'error')
    } finally {
      setSavingNote(null)
    }
  }

  const startEditingTrackNote = (trackId: string) => {
    const currentNote = trackNotes[trackId]
    setEditingTrackNotes({
      ...editingTrackNotes,
      [trackId]: currentNote?.content || ''
    })
  }

  const sanitizeFileName = (fileName: string): string => {
    // Remove or replace invalid characters for storage paths
    // Replace colons, commas, and other problematic characters with underscores
    return fileName
      .replace(/[:,\/\\?*|"<>]/g, '_') // Replace invalid characters with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
  }

  const uploadFile = async (file: File, path: string): Promise<string> => {
    if (!user) throw new Error('User not authenticated')
    
    const privyId = user.id
    
    // Get or create user
    let { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', privyId)
      .single()

    if (userError || !dbUser) {
      // Try to create user if doesn't exist
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          privy_id: privyId,
          email: user.email?.address || null,
        })
        .select('id')
        .single()

      if (createError || !newUser) {
        throw new Error(createError?.message || 'Failed to get or create user')
      }
      dbUser = newUser
    }

    if (!dbUser) throw new Error('User not found')

    // Sanitize the filename
    const sanitizedName = sanitizeFileName(file.name)
    const timestamp = Date.now()
    const uploadPath = `${path}/${timestamp}-${sanitizedName}`

    // Apply conservative file size guardrails before upload
    const isAudioFile = isSupportedAudioFile(file)
    if (isAudioFile) {
      const validationError = getAudioFileValidationError(file)
      if (validationError) {
        throw new Error(validationError)
      }
    } else if (file.size > 25 * 1024 * 1024) {
      throw new Error(`"${file.name}" is too large. Maximum size is 25MB.`)
    }

    const contentType = isAudioFile ? getAudioUploadContentType(file) : file.type || undefined

    const { data, error } = await supabase.storage
      .from('hubba-files')
      .upload(uploadPath, file, {
        contentType,
        upsert: false,
      })

    if (error) {
      console.error('Storage upload error:', error)
      if (error.message.includes('exceeded') || error.message.includes('size')) {
        throw new Error(`"${file.name}" is too large for upload. Try a smaller file or compress it.`)
      }
      if (isAudioFile && /\.wav$/i.test(file.name) && file.size > 25 * 1024 * 1024) {
        throw new Error(`WAV upload failed for "${file.name}". Large WAV files can fail on slower networks. Try again or convert to MP3.`)
      }
      throw new Error(`Failed to upload "${file.name}": ${error.message}`)
    }

    if (!data) {
      throw new Error('Upload succeeded but no data returned')
    }

    const { data: { publicUrl } } = supabase.storage
      .from('hubba-files')
      .getPublicUrl(data.path)

    return publicUrl
  }

  const handleAddNewTrack = () => {
    setNewTracks([...newTracks, { file: null, title: '' }])
    setShowAddTrackForm(true)
  }

  const handleNewTrackFileChange = (index: number, file: File) => {
    const validationError = getAudioFileValidationError(file)
    if (validationError) {
      showToast(validationError, 'error')
      return
    }

    const updatedTracks = [...newTracks]
    updatedTracks[index].file = file
    if (!updatedTracks[index].title) {
      const name = file.name.replace(/\.[^/.]+$/, '')
      updatedTracks[index].title = name
    }
    setNewTracks(updatedTracks)
  }

  const handleNewTrackImageChange = (index: number, file: File) => {
    const updatedTracks = [...newTracks]
    updatedTracks[index].image = file
    const reader = new FileReader()
    reader.onloadend = () => {
      updatedTracks[index].imagePreview = reader.result as string
      setNewTracks(updatedTracks)
    }
    reader.readAsDataURL(file)
  }

  const removeNewTrack = (index: number) => {
    setNewTracks(newTracks.filter((_, i) => i !== index))
    if (newTracks.length === 1) {
      setShowAddTrackForm(false)
    }
  }

  const handleDeleteTrack = async (trackId: string) => {
    if (!project || !isCreator) return
    
    if (!confirm('Are you sure you want to delete this track? This action cannot be undone.')) {
      return
    }

    try {
      // Delete the track via API (server verifies ownership and handles cascading deletes)
      const { error: deleteError } = await apiRequest(`/api/tracks?id=${trackId}`, {
        method: 'DELETE',
        getAccessToken,
      })

      if (deleteError) {
        throw new Error(deleteError)
      }

      // Reload the entire project to ensure everything is in sync
      await loadProject()

      showToast('Track deleted successfully!', 'success')
    } catch (error: any) {
      console.error('Error deleting track:', error)
      const errorMessage = error?.message || 'Failed to delete track. Please try again.'
      showToast(`Error: ${errorMessage}`, 'error')
    }
  }

  const handleSaveNewTracks = async () => {
    if (!project || !user || newTracks.length === 0) return

    setAddingTracks(true)
    try {
      const privyId = user.id
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      
      // Get or create user
      let { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (!dbUser) {
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({
            privy_id: privyId,
            email: user.email?.address || null,
          })
          .select('id')
          .single()

        if (userError || !newUser) {
          throw new Error(userError?.message || 'Failed to create user')
        }
        dbUser = newUser
      }

      if (!dbUser) throw new Error('User not found')

      // Get current max order
      const { data: existingTracks, error: orderError } = await supabase
        .from('tracks')
        .select('order')
        .eq('project_id', project.id)
        .order('order', { ascending: false })
        .limit(1)

      if (orderError) {
        console.error('Error fetching existing tracks:', orderError)
      }

      let nextOrder = 0
      if (existingTracks && existingTracks.length > 0 && existingTracks[0].order !== null) {
        nextOrder = existingTracks[0].order + 1
      }

      // Upload and save each new track via API (this triggers notifications)
      for (let i = 0; i < newTracks.length; i++) {
        const track = newTracks[i]
        if (!track.file) {
          console.warn(`Skipping track ${i + 1}: no file provided`)
          continue
        }

        if (!track.title || track.title.trim() === '') {
          throw new Error(`Track ${i + 1} must have a title`)
        }

        const audioUrl = await uploadFile(track.file, `projects/${dbUser.id}/tracks`)
        let trackImageUrl: string | undefined
        if (track.image) {
          trackImageUrl = await uploadFile(track.image, `projects/${dbUser.id}/track-images`)
        }

        // Use API route to create track (sends notifications to users who saved this project)
        const response = await fetch('/api/tracks', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: project.id,
            title: track.title.trim(),
            audio_url: audioUrl,
            size_bytes: track.file.size,
            image_url: trackImageUrl || null,
            order: nextOrder + i,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(`Failed to save track "${track.title}": ${errorData.error}`)
        }
      }

      // Reload project data
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectError) throw projectError
      setProject(projectData)

      // Reload tracks
      const tracksResponse = await fetch(`/api/tracks?project_id=${encodeURIComponent(projectId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!tracksResponse.ok) {
        const tracksErrorData = await tracksResponse.json().catch(() => ({}))
        throw new Error(tracksErrorData.error || 'Failed to load tracks')
      }
      const tracksPayload = await tracksResponse.json()
      setTracks(tracksPayload.tracks || [])
      
      // Reset form
      setNewTracks([])
      setShowAddTrackForm(false)
      showToast(`${newTracks.length} track${newTracks.length > 1 ? 's' : ''} added successfully!`, 'success')
    } catch (error: any) {
      console.error('Error adding tracks:', error)
      const errorMessage = error?.message || 'Failed to add tracks. Please try again.'
      showToast(errorMessage, 'error')
    } finally {
      setAddingTracks(false)
    }
  }

  if (loading) {
    return <ProjectDetailSkeleton />
  }

  if (!project) {
    if (blockedPrivateAccess?.projectId) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h1 className="text-xl font-semibold mb-2">Private project</h1>
            <p className="text-sm text-gray-400 mb-4">
              {blockedPrivateAccess.projectTitle
                ? `Request access to "${blockedPrivateAccess.projectTitle}".`
                : 'Request access to this private project.'}
            </p>
            <textarea
              value={blockedAccessRequestNote}
              onChange={(event) => setBlockedAccessRequestNote(event.target.value)}
              placeholder="Optional note to the creator"
              rows={3}
              className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green mb-3"
            />
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleBlockedAccessRequest}
                disabled={blockedAccessRequestSaving}
                className="px-4 py-2 rounded bg-neon-green text-black text-sm font-semibold disabled:opacity-50"
              >
                {blockedAccessRequestSaving ? 'Requesting...' : 'Request Access'}
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
          <Link href="/dashboard" className="text-neon-green hover:opacity-80">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${project.share_token}`

  const formatGrantExpiryLabel = (grant: ProjectAccessGrant): string => {
    if (!grant.expires_at) return 'No expiry'
    if (grant.is_expired) return 'Expired'
    const expiresAtMs = new Date(grant.expires_at).getTime()
    if (!Number.isFinite(expiresAtMs)) return 'No expiry'
    const remainingMs = expiresAtMs - Date.now()
    if (remainingMs <= 0) return 'Expired'
    const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000))
    if (remainingHours < 24) return `Expires in ${remainingHours}h`
    const remainingDays = Math.ceil(remainingHours / 24)
    return `Expires in ${remainingDays}d`
  }

  const deriveGrantExpiryPreset = (grant: ProjectAccessGrant): ProjectAccessExpiryPreset => {
    if (!grant.expires_at) return 'never'
    const expiresAtMs = new Date(grant.expires_at).getTime()
    if (!Number.isFinite(expiresAtMs)) return 'never'
    const remainingMs = expiresAtMs - Date.now()
    if (remainingMs <= 0) return '24h'
    const remainingHours = Math.round(remainingMs / (60 * 60 * 1000))
    return remainingHours <= 36 ? '24h' : '7d'
  }

  const getGrantDisplayName = (grant: ProjectAccessGrant): string => {
    const username = typeof grant.username === 'string' ? grant.username.trim() : ''
    if (username) return username
    const email = typeof grant.email === 'string' ? grant.email.trim() : ''
    if (email) return email
    return 'Invited member'
  }

  const getGrantEmail = (grant: ProjectAccessGrant): string | null => {
    const email = typeof grant.email === 'string' ? grant.email.trim() : ''
    if (!email) return null
    const username = typeof grant.username === 'string' ? grant.username.trim() : ''
    return username ? email : null
  }

  const getGrantInitial = (grant: ProjectAccessGrant): string => {
    const name = getGrantDisplayName(grant)
    return name.slice(0, 1).toUpperCase() || 'U'
  }

  const openGrantCreatorProfile = (grant: ProjectAccessGrant) => {
    setCreatorId(grant.user_id)
    setShowCreatorModal(true)
  }

  return (
    <div className="min-h-screen bg-black text-white relative">
      {/* Subtle background gradient */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at top center, rgba(57, 255, 20, 0.03) 0%, transparent 40%)',
        }}
      />
      
      <nav className="app-shell-nav py-4">
        <div className="app-shell-inner max-w-4xl">
          <Link href="/dashboard" className="app-shell-link gap-2">
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
          <Link href="/" className="app-shell-brand text-xl">
            Demo
          </Link>
          <button
            onClick={logout}
            className="btn-unstyled app-shell-link ui-link-muted text-sm sm:text-base"
            style={{
              WebkitAppearance: 'none',
              appearance: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="px-4 py-8 max-w-3xl mx-auto relative z-10">
        {/* Cover Image removed - now displayed on cassette player */}

        {/* Project Info */}
        <div className="mb-8 mt-8">
          {editingProject ? (
            <div className="bg-gray-900 rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4 text-neon-green">Edit Project</h2>
              
              {/* Cover Image Edit */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-neon-green">Cover Image</label>
                {editCoverImagePreview ? (
                  <div className="relative w-full h-40 md:h-56 rounded-lg overflow-hidden mb-2">
                    <Image
                      src={editCoverImagePreview}
                      alt="Cover preview"
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 768px"
                    />
              <button
                      onClick={() => {
                        setEditCoverImage(null)
                        setEditCoverImagePreview(project.cover_image_url || null)
                      }}
                      className="absolute top-2 right-2 bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-70"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : null}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleEditCoverImageChange}
                  className="w-full text-sm text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-white file:text-black hover:file:bg-gray-200"
                />
              </div>

              {/* Title Edit */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-neon-green">Title *</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-neon-green"
                />
              </div>

              {/* Description Edit */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-neon-green">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-neon-green resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={cancelEditingProject}
                  disabled={savingProject}
                  className="btn-ghost rounded-lg px-4 py-2 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProject}
                  disabled={savingProject || !editTitle.trim()}
                  className="btn-primary rounded-lg px-4 py-2 disabled:opacity-50"
                >
                  {savingProject ? 'Saving...' : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                  </>
                )}
              </button>
            </div>
            </div>
          ) : (
            <>
              {/* Title and Options button on the SAME ROW */}
              <div className="flex flex-row justify-between items-center gap-4 mb-4">
                {/* Left: Title and creator info */}
                <div className="flex-1 min-w-0">
                  <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-2">{project.title}</h1>
                  <div className="flex items-center text-sm text-gray-400 flex-wrap gap-y-1">
                    {creatorUsername && creatorId && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => setShowCreatorModal(true)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowCreatorModal(true) }}
                        className="inline-flex items-center gap-2 text-white text-lg font-medium hover:underline underline-offset-4 transition cursor-pointer"
                      >
                        <span className="relative inline-flex h-7 w-7 min-h-7 min-w-7 max-h-7 max-w-7 flex-shrink-0 items-center justify-center self-center overflow-hidden rounded-full border border-white/8 bg-gray-900 text-[10px] font-semibold text-gray-200 shadow-[0_6px_16px_rgba(0,0,0,0.25)]">
                          {creatorAvatarUrl ? (
                            <img
                              src={creatorAvatarUrl}
                              alt={`${creatorUsername} avatar`}
                              className="absolute inset-0 block h-full w-full object-cover"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              loading="lazy"
                              draggable={false}
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">
                              {creatorUsername.trim().charAt(0).toUpperCase()}
                            </span>
                          )}
                        </span>
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
                {/* Right: Options button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    if (!isProjectMenuOpen) {
                      setTrackMenuOpen(false)
                    }
                    setIsProjectMenuOpen(!isProjectMenuOpen)
                  }}
                  className="btn-secondary flex-shrink-0 px-3 text-sm"
                  title="Options"
                  type="button"
                  style={{
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <MoreVertical className="h-5 w-5 text-neon-green" />
                  <span className="hidden text-sm font-medium sm:inline">Options</span>
                </button>
              </div>
              {project.description && (
                <p className="text-gray-400 text-base mb-6 leading-relaxed">{project.description}</p>
              )}
            </>
          )}

          {/* Metrics - Only show for creators */}
          {isCreator && metrics && (
            <div className="mb-6 rounded-xl border border-gray-800/70 bg-gray-900/70 p-2.5 sm:p-3">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Project Stats
                </p>
                <p className="text-[11px] text-gray-500">Only visible to you</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                <div className="rounded-lg border border-gray-800/80 bg-black/25 px-2.5 py-2.5 text-center">
                  <Eye className="mx-auto mb-1 h-4 w-4 text-neon-green/70" />
                  <div className="text-lg font-bold leading-none text-neon-green">{metrics.plays || 0}</div>
                  <div className="mt-0.5 text-[11px] text-neon-green/70">Plays</div>
                </div>
                <div className="rounded-lg border border-gray-800/80 bg-black/25 px-2.5 py-2.5 text-center">
                  <Share2 className="mx-auto mb-1 h-4 w-4 text-neon-green/70" />
                  <div className="text-lg font-bold leading-none text-neon-green">{metrics.shares || 0}</div>
                  <div className="mt-0.5 text-[11px] text-neon-green/70">Shares</div>
                </div>
                <div className="rounded-lg border border-gray-800/80 bg-black/25 px-2.5 py-2.5 text-center">
                  <Plus className="mx-auto mb-1 h-4 w-4 text-neon-green/70" />
                  <div className="text-lg font-bold leading-none text-neon-green">{metrics.adds || 0}</div>
                  <div className="mt-0.5 text-[11px] text-neon-green/70">Adds</div>
                </div>
              </div>
            </div>
          )}

          {/* Settings - Only show for creators */}
          {isCreator && (
            <div className="mb-6 rounded-xl border border-gray-800/70 bg-gray-900/80 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-neon-green">Project Settings</h3>
                <button
                  type="button"
                  onClick={() => setProjectSettingsOpen((prev) => !prev)}
                  className="btn-unstyled ui-pressable inline-flex items-center gap-2 rounded-md border border-gray-700 bg-black px-3 py-1.5 text-xs font-semibold text-neon-green hover:border-gray-500 hover:text-neon-green/80"
                  style={{ WebkitAppearance: 'none', appearance: 'none' }}
                  aria-expanded={projectSettingsOpen}
                  aria-label={projectSettingsOpen ? 'Collapse project settings' : 'Expand project settings'}
                >
                  {projectSettingsOpen ? 'Collapse' : 'Expand'}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${projectSettingsOpen ? '' : '-rotate-90'}`}
                    aria-hidden
                  />
                </button>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-gray-300">
                Manage visibility, sharing, and collaboration access.
              </p>

              {projectSettingsOpen ? <div className="mt-4 space-y-4">
                <section className="rounded-lg bg-black/20 p-3 sm:p-4">
                  <h4 className="text-[17px] font-extrabold leading-6 tracking-tight text-white">Visibility &amp; Sharing</h4>
                  <p className="mt-2 text-sm leading-relaxed text-gray-400">
                    Configure who can discover this project and whether viewers can access shared links or downloads.
                  </p>

                  <div className="mt-4 space-y-5">
                    <div className="flex flex-col gap-4 rounded-xl bg-gray-950/40 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5 sm:p-5">
                      <div className="min-w-0 flex-1 sm:pr-2">
                        <div
                          className="text-[17px] font-extrabold leading-6 tracking-tight text-white"
                          style={{ fontWeight: 800, marginBottom: '14px' }}
                        >
                          Visibility
                        </div>
                        <div className="text-sm text-gray-400 leading-relaxed" style={{ lineHeight: 1.6 }}>
                          Public: profile listing. Unlisted: link-only. Private: invite-only.
                        </div>
                      </div>
                      <div className="relative w-full rounded-[16px] border border-white/6 bg-black/30 p-2.5 sm:w-auto sm:shrink-0">
                        <select
                          value={resolveProjectVisibility(project.visibility, project.sharing_enabled)}
                          onChange={async (event) => {
                            const newVisibility = event.target.value as ProjectVisibility
                            const oldVisibility = resolveProjectVisibility(
                              project.visibility,
                              project.sharing_enabled
                            )
                            const { error } = await apiRequest('/api/projects', {
                              method: 'PATCH',
                              body: { id: project.id, visibility: newVisibility },
                              getAccessToken,
                            })
                            if (error) {
                              showToast('Failed to update visibility', 'error')
                              return
                            }
                            setProject({
                              ...project,
                              visibility: newVisibility,
                              sharing_enabled: newVisibility !== 'private',
                            })
                            showToast(`Visibility set to ${newVisibility}`, 'success')
                            if (typeof window !== 'undefined') {
                              window.dispatchEvent(
                                new CustomEvent('project_visibility_event', {
                                  detail: {
                                    schema: 'project_visibility.v1',
                                    action: 'change_visibility',
                                    project_id: project.id,
                                    old_visibility: oldVisibility,
                                    new_visibility: newVisibility,
                                    source: 'project_detail_settings',
                                  },
                                })
                              )
                            }
                          }}
                          className="cursor-pointer appearance-none rounded-lg px-4 pr-14 text-sm font-semibold text-white transition hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-neon-green/40"
                          style={{
                            ...COMPACT_DARK_SELECT_STYLE,
                            WebkitAppearance: 'none',
                            appearance: 'none',
                            height: '46px',
                            width: '100%',
                            minWidth: '164px',
                            borderWidth: '2px',
                            borderStyle: 'solid',
                            borderColor: '#6b7280',
                            borderRadius: '10px',
                            backgroundColor: '#111827',
                            backgroundImage: NEON_GREEN_SELECT_CARET,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 12px center',
                            backgroundSize: '18px 18px',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
                            paddingRight: '44px',
                          }}
                          aria-label="Project visibility"
                        >
                          <option value="public">Public</option>
                          <option value="unlisted">Unlisted</option>
                          <option value="private">Private</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 rounded-xl bg-gray-950/40 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5 sm:p-5">
                      <div className="min-w-0 flex-1 sm:pr-2">
                        <div
                          className="text-[17px] font-extrabold leading-6 tracking-tight text-white"
                          style={{ fontWeight: 800, marginBottom: '14px' }}
                        >
                          Project Sharing
                        </div>
                        <div className="text-sm text-gray-400 leading-relaxed" style={{ lineHeight: 1.6 }}>
                          Allow others to view this project via share link.
                        </div>
                      </div>
                      <div className="self-start rounded-[16px] border border-white/6 bg-black/30 p-2.5 sm:shrink-0">
                        <button
                          onClick={async () => {
                            const newValue = !(project.sharing_enabled ?? true)
                            const currentVisibility = resolveProjectVisibility(project.visibility, project.sharing_enabled)
                            const nextVisibility: ProjectVisibility = newValue
                              ? currentVisibility === 'private'
                                ? 'unlisted'
                                : currentVisibility
                              : 'private'
                            const { error } = await apiRequest('/api/projects', {
                              method: 'PATCH',
                              body: { id: project.id, sharing_enabled: newValue, visibility: nextVisibility },
                              getAccessToken,
                            })
                            if (error) {
                              showToast('Failed to update sharing setting', 'error')
                            } else {
                              setProject({ ...project, sharing_enabled: newValue, visibility: nextVisibility })
                              showToast(`Sharing ${newValue ? 'enabled' : 'disabled'}`, 'success')
                            }
                          }}
                          style={{
                            position: 'relative',
                            width: '56px',
                            height: '32px',
                            borderRadius: '16px',
                            backgroundColor: (project.sharing_enabled ?? true) ? '#39FF14' : '#4B5563',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                            flexShrink: 0,
                          }}
                          aria-label="Toggle project sharing"
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: '4px',
                              left: (project.sharing_enabled ?? true) ? '28px' : '4px',
                              width: '24px',
                              height: '24px',
                              borderRadius: '12px',
                              backgroundColor: (project.sharing_enabled ?? true) ? '#000' : '#fff',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                              transition: 'left 0.2s, background-color 0.2s',
                            }}
                          />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 rounded-xl bg-gray-950/40 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5 sm:p-5">
                      <div className="min-w-0 flex-1 sm:pr-2">
                        <div
                          className="text-[17px] font-extrabold leading-6 tracking-tight text-white"
                          style={{ fontWeight: 800, marginBottom: '14px' }}
                        >
                          Allow Downloads
                        </div>
                        <div className="text-sm text-gray-400 leading-relaxed" style={{ lineHeight: 1.6 }}>
                          Users can download tracks from this project.
                        </div>
                      </div>
                      <div className="self-start rounded-[16px] border border-white/6 bg-black/30 p-2.5 sm:shrink-0">
                        <button
                          onClick={async () => {
                            const newValue = !project.allow_downloads
                            const { error } = await apiRequest('/api/projects', {
                              method: 'PATCH',
                              body: { id: project.id, allow_downloads: newValue },
                              getAccessToken,
                            })
                            if (error) {
                              showToast('Failed to update download setting', 'error')
                            } else {
                              setProject({ ...project, allow_downloads: newValue })
                              showToast(`Downloads ${newValue ? 'enabled' : 'disabled'}`, 'success')
                            }
                          }}
                          style={{
                            position: 'relative',
                            width: '56px',
                            height: '32px',
                            borderRadius: '16px',
                            backgroundColor: project.allow_downloads ? '#39FF14' : '#4B5563',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                            flexShrink: 0,
                          }}
                          aria-label="Toggle downloads"
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: '4px',
                              left: project.allow_downloads ? '28px' : '4px',
                              width: '24px',
                              height: '24px',
                              borderRadius: '12px',
                              backgroundColor: project.allow_downloads ? '#000' : '#fff',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                              transition: 'left 0.2s, background-color 0.2s',
                            }}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg bg-black/20 p-3 sm:p-4">
                  <h4 className="text-[17px] font-extrabold leading-6 tracking-tight text-white">Collaboration Access</h4>
                  <p className="mt-2 text-sm leading-relaxed text-gray-400">
                    Invite collaborators and manage role-based access.
                  </p>

                  {resolveProjectVisibility(project.visibility, project.sharing_enabled) === 'private' ? (
                    <div className="mt-4">
                      <div className="mb-3">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                          <div className="relative min-w-0 z-10">
                            <input
                              type="text"
                              placeholder="Search username or type username/email"
                              value={projectAccessIdentifierInput}
                              onChange={(event) => {
                                const value = event.target.value
                                setProjectAccessIdentifierInput(value)
                                if (
                                  projectAccessSelectedUser &&
                                  value !== getSearchCandidateInputLabel(projectAccessSelectedUser)
                                ) {
                                  setProjectAccessSelectedUser(null)
                                }
                              }}
                              className="min-h-11 w-full rounded-lg border border-gray-700 bg-black px-3 py-2.5 text-sm text-white focus:outline-none focus:border-neon-green"
                              aria-label="Grant access by username or email"
                            />
                            {!projectAccessSelectedUser && projectAccessSearchResults.length > 0 ? (
                              <ul className="absolute left-0 right-0 top-full z-50 mt-2 max-h-44 overflow-y-auto overflow-x-hidden rounded-lg border border-gray-800 bg-gray-950 shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
                                {projectAccessSearchResults.map((candidate) => (
                                  <li key={candidate.id}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const label = getSearchCandidateInputLabel(candidate)
                                        setProjectAccessIdentifierInput(label)
                                        setProjectAccessSelectedUser(candidate)
                                        setProjectAccessSearchResults([])
                                        setProjectAccessSearchError(null)
                                        emitProjectAccessSearchEvent({
                                          action: 'select_result',
                                          query_length: projectAccessIdentifierInput.trim().length,
                                          result_count: projectAccessSearchResults.length,
                                          target_user_id: candidate.id,
                                        })
                                      }}
                                      className="ui-pressable appearance-none flex w-full min-w-0 items-center gap-2 rounded-none border-0 border-b border-gray-800/80 bg-gray-950 px-3 py-2.5 text-left last:border-b-0 hover:bg-gray-900"
                                      aria-label={`Select ${getSearchCandidatePrimaryLabel(candidate)}`}
                                    >
                                      <span
                                        className="inline-flex flex-shrink-0 items-center justify-center overflow-hidden border border-gray-700 bg-gray-800 text-[10px] text-gray-300"
                                        style={{
                                          width: '24px',
                                          minWidth: '24px',
                                          maxWidth: '24px',
                                          height: '24px',
                                          minHeight: '24px',
                                          maxHeight: '24px',
                                          borderRadius: '999px',
                                          lineHeight: 1,
                                        }}
                                      >
                                        {candidate.avatar_url ? (
                                          <img
                                            src={candidate.avatar_url}
                                            alt={`${getSearchCandidatePrimaryLabel(candidate)} avatar`}
                                            style={{
                                              width: '24px',
                                              minWidth: '24px',
                                              maxWidth: '24px',
                                              height: '24px',
                                              minHeight: '24px',
                                              maxHeight: '24px',
                                              borderRadius: '999px',
                                              objectFit: 'cover',
                                              display: 'block',
                                            }}
                                          />
                                        ) : (
                                          <span
                                            aria-hidden
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              width: '100%',
                                              height: '100%',
                                              fontSize: '10px',
                                              fontWeight: 600,
                                              textTransform: 'uppercase',
                                              lineHeight: 1,
                                            }}
                                          >
                                            {getSearchCandidatePrimaryLabel(candidate).slice(0, 1)}
                                          </span>
                                        )}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-gray-100">
                                          {getSearchCandidatePrimaryLabel(candidate)}
                                        </span>
                                        {getSearchCandidateSecondaryLabel(candidate) ? (
                                          <span className="block truncate text-[11px] text-gray-400">
                                            {getSearchCandidateSecondaryLabel(candidate)}
                                          </span>
                                        ) : null}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={handleGrantProjectAccess}
                            disabled={projectAccessSaving || !projectAccessIdentifierInput.trim()}
                            className="ui-pressable z-20 min-h-11 flex-shrink-0 self-stretch whitespace-nowrap rounded-lg bg-neon-green px-3.5 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
                            aria-label="Grant private project access"
                          >
                            Grant
                          </button>
                        </div>
                        {projectAccessSearchLoading ? (
                          <p className="mt-2 text-xs text-gray-500">Searching users...</p>
                        ) : projectAccessSearchError ? (
                          <p className="mt-2 text-xs text-red-400">{projectAccessSearchError}</p>
                        ) : projectAccessIdentifierInput.trim().length >= 2 &&
                          !projectAccessSelectedUser &&
                          projectAccessSearchResults.length === 0 ? (
                          <p className="mt-2 text-xs text-gray-500">
                            No matching users. You can still grant by manual identifier.
                          </p>
                        ) : null}
                      </div>

                      {projectAccessInlineState ? (
                        <p
                          className={`mb-2 rounded-md border px-2.5 py-2 text-xs ${
                            projectAccessInlineState.tone === 'success'
                              ? 'border-neon-green/30 bg-neon-green/5 text-neon-green'
                              : 'border-red-400/30 bg-red-500/10 text-red-300'
                          }`}
                          role="status"
                          aria-live="polite"
                        >
                          {projectAccessInlineState.message}
                        </p>
                      ) : null}

                      {projectAccessLoading ? (
                        <p className="text-xs text-gray-500">Loading access list...</p>
                      ) : projectAccessGrants.length === 0 ? (
                        <p className="text-xs text-gray-500">No invited viewers yet.</p>
                      ) : (
                        <ul className="space-y-3">
                          {projectAccessGrants.map((grant) => (
                            <li key={grant.id} className="rounded-xl border border-gray-800/70 bg-gray-950/55 p-3.5">
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() => openGrantCreatorProfile(grant)}
                                  className="ui-pressable mt-0.5 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-700 bg-gray-800 text-sm text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-green/70"
                                  aria-label={`Open profile for ${getGrantDisplayName(grant)}`}
                                >
                                  {grant.avatar_url ? (
                                    <Image
                                      src={grant.avatar_url}
                                      alt={`${getGrantDisplayName(grant)} avatar`}
                                      width={44}
                                      height={44}
                                      className="h-11 w-11 rounded-full object-cover object-center"
                                    />
                                  ) : (
                                    <span
                                      aria-hidden
                                      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold uppercase leading-none"
                                    >
                                      {getGrantInitial(grant)}
                                    </span>
                                  )}
                                </button>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openGrantCreatorProfile(grant)}
                                      className="ui-pressable max-w-[46%] truncate text-left text-sm font-semibold text-white hover:text-neon-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-green/70 sm:max-w-full"
                                      aria-label={`Open profile for ${getGrantDisplayName(grant)}`}
                                    >
                                      {getGrantDisplayName(grant)}
                                    </button>
                                    {getGrantEmail(grant) ? (
                                      <span className="ml-auto max-w-[54%] truncate text-right text-xs text-gray-400">
                                        {getGrantEmail(grant)}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-semibold capitalize text-gray-300">
                                      {grant.role || 'viewer'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3.5 flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-x-3">
                                <div className="relative shrink-0">
                                  <div className="pointer-events-none inline-flex h-9 min-w-[116px] items-center rounded-md border border-gray-700 bg-gray-900 px-2.5 pr-8 text-sm text-gray-100">
                                    Roles
                                  </div>
                                  <select
                                    value={grant.role || 'viewer'}
                                    onChange={(event) =>
                                      handleChangeProjectAccessRole(
                                        grant,
                                        event.target.value as ProjectAccessRole
                                      )
                                    }
                                    disabled={
                                      projectAccessSaving || projectAccessRoleUpdatingUserId === grant.user_id
                                    }
                                    className="absolute inset-0 h-9 w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
                                    style={COMPACT_DARK_SELECT_STYLE}
                                    aria-label={`Role for ${getGrantDisplayName(grant)}`}
                                  >
                                    <option value="viewer">Viewer</option>
                                    <option value="commenter">Commenter</option>
                                    <option value="contributor">Contributor</option>
                                  </select>
                                  <ChevronDown
                                    className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                                    aria-hidden
                                  />
                                </div>
                                <div className="flex justify-end sm:ml-auto">
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeProjectAccess(grant.user_id)}
                                    disabled={
                                      projectAccessSaving || projectAccessRoleUpdatingUserId === grant.user_id
                                    }
                                    className={`btn-unstyled ${COMPACT_DANGER_ACTION_BUTTON_CLASS}`}
                                    style={{
                                      WebkitAppearance: 'none',
                                      appearance: 'none',
                                      borderRadius: '9999px',
                                      border: '1px solid rgba(248, 113, 113, 0.5)',
                                      background: 'rgba(239, 68, 68, 0.12)',
                                      color: '#fca5a5',
                                      minWidth: '116px',
                                      height: '36px',
                                      padding: '0 16px',
                                      fontSize: '14px',
                                      fontWeight: 600,
                                      lineHeight: 1,
                                    }}
                                    aria-label={`Remove access for ${getGrantDisplayName(grant)}`}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-gray-500">
                      Set visibility to Private to invite collaborators.
                    </p>
                  )}
                </section>

                <section className="rounded-lg bg-black/20 p-3 sm:p-4">
                  <h4 className="text-sm font-semibold text-white">Access Requests</h4>
                  <p className="mt-1 text-xs text-gray-500">
                    Review pending requests and approve or deny access.
                  </p>

                  {resolveProjectVisibility(project.visibility, project.sharing_enabled) !== 'private' ? (
                    <p className="mt-3 text-xs text-gray-500">
                      Requests are available when project visibility is set to Private.
                    </p>
                  ) : projectAccessRequestsLoading ? (
                    <p className="mt-3 text-xs text-gray-500">Loading requests...</p>
                  ) : projectAccessRequests.length === 0 ? (
                    <p className="mt-3 text-xs text-gray-500">No access requests yet.</p>
                  ) : (
                    <ul className="mt-3 space-y-2.5">
                      {projectAccessRequests.map((request) => (
                        <li
                          key={request.id}
                          className="flex flex-col gap-2 rounded-lg bg-gray-950/55 p-3 text-sm sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-white">
                              {request.requester_username || request.requester_email || request.requester_user_id}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {request.status}
                            </p>
                            {request.note ? (
                              <p className="mt-1 line-clamp-2 text-xs text-gray-400">{request.note}</p>
                            ) : null}
                          </div>
                          {request.status === 'pending' ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleReviewAccessRequest(request.id, request.requester_user_id, 'approve')
                                }
                                disabled={projectAccessSaving}
                                className="ui-pressable min-h-11 rounded-md border border-neon-green px-2.5 py-1.5 text-xs text-neon-green hover:bg-neon-green/10 disabled:opacity-50"
                                aria-label={`Approve request from ${request.requester_username || request.requester_user_id}`}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleReviewAccessRequest(request.id, request.requester_user_id, 'deny')
                                }
                                disabled={projectAccessSaving}
                                className="ui-pressable min-h-11 rounded-md border border-red-400/50 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                                aria-label={`Deny request from ${request.requester_username || request.requester_user_id}`}
                              >
                                Deny
                              </button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div> : null}
            </div>
          )}

          {/* Project Notes (Private to Creator) - Only show if user is creator */}
          {isCreator && (
          <div 
            ref={notesRef}
            className="bg-gray-900 rounded-xl mb-6 border border-yellow-900/50"
            style={{ padding: '20px 24px 24px 24px' }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
              <div className="flex items-center">
                <FileText className="w-5 h-5 text-yellow-400 mr-2" />
                <h3 className="font-semibold text-neon-green">Project Notes</h3>
                <span className="text-xs text-white opacity-60" style={{ marginLeft: '12px' }}>(Private)</span>
              </div>
              {!editingProjectNote && (
                <button
                  onClick={() => setEditingProjectNote(true)}
                  className="text-sm text-black hover:opacity-80 flex items-center gap-1"
                >
                  <Edit className="w-4 h-4" />
                  {projectNote ? 'Edit' : 'Add Note'}
                </button>
              )}
            </div>

            {editingProjectNote ? (
              <div className="space-y-3">
                <textarea
                  value={projectNoteContent}
                  onChange={(e) => setProjectNoteContent(e.target.value)}
                  placeholder="Add private notes about this project (not visible to listeners)..."
                  rows={6}
                  className="note-input w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-base sm:text-sm text-white focus:outline-none focus:border-yellow-600 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveProjectNote}
                    disabled={savingNote === 'project'}
                    className="flex items-center gap-2 bg-yellow-600 text-black px-4 py-2 rounded-lg text-sm font-semibold hover:bg-yellow-500 transition disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {savingNote === 'project' ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingProjectNote(false)
                      setProjectNoteContent(projectNote?.content || '')
                    }}
                    className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : projectNote ? (
                        <div className="bg-black rounded-lg p-3 text-sm text-neon-green whitespace-pre-wrap opacity-90">
                {projectNote.content}
              </div>
            ) : (
              <p className="text-sm text-neon-green opacity-70 italic">No notes yet. Click "Add Note" to add private notes about this project.</p>
            )}
          </div>
          )}
        </div>

        {/* Tracks */}
        <div>
          {/* Add Track Form (for creators) */}
          {isCreator && showAddTrackForm && (
            <div
              ref={addTrackFormRef}
              className="bg-gray-900 rounded-lg p-4 mb-4 border-2 border-neon-green border-opacity-30"
              style={{ scrollMarginTop: '88px' }}
            >
          <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-neon-green">Add New Tracks</h3>
                <button
                  onClick={() => {
                    setShowAddTrackForm(false)
                    setNewTracks([])
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
          </div>

              <div className="space-y-4 mb-4">
                {newTracks.map((track, index) => (
                  <div key={index} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-medium text-neon-green">Track {index + 1}</h4>
                      <button
                        onClick={() => removeNewTrack(index)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
            </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-neon-green opacity-70 mb-1">Audio File ({SUPPORTED_AUDIO_LABEL}) *</label>
                        <input
                          type="file"
                          accept={AUDIO_FILE_ACCEPT}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleNewTrackFileChange(index, file)
                          }}
                          className="w-full text-sm text-white"
                        />
                        <p className="mt-1 text-[11px] text-gray-500">
                          {SUPPORTED_AUDIO_LABEL} only, up to {Math.round(MAX_AUDIO_UPLOAD_SIZE_BYTES / 1024 / 1024)}MB.
                        </p>
                      </div>

                          <div>
                        <label className="block text-xs text-neon-green opacity-70 mb-1">Track Title *</label>
                        <input
                          type="text"
                          value={track.title}
                          onChange={(e) => {
                            const updatedTracks = [...newTracks]
                            updatedTracks[index].title = e.target.value
                            setNewTracks(updatedTracks)
                          }}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                          placeholder="Enter track title"
                        />
                          </div>
                        </div>
                      </div>
                ))}
                    </div>

              <div className="flex gap-3">
                <button
                  onClick={handleAddNewTrack}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition"
                >
                  <Plus className="w-4 h-4" />
                  Add Another Track
                </button>
                <button
                  onClick={handleSaveNewTracks}
                  disabled={addingTracks || newTracks.length === 0 || newTracks.some(t => !t.file || !t.title || t.title.trim() === '')}
                  className="ml-auto bg-white text-black px-6 py-2 rounded-full font-semibold hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingTracks ? 'Adding...' : 'Save Tracks'}
                </button>
              </div>
            </div>
          )}

          {/* Tracks Section - with spacing from Project Notes */}
          <div style={{ marginTop: '32px' }}>
          {tracks.length === 0 ? (
            <div className="ui-empty-state text-center py-12">
              <p className="ui-empty-title">No tracks in this project yet</p>
              <p className="ui-empty-copy mx-auto max-w-sm">
                Add your first track to unlock playback, updates, comments, and a shareable listening page.
              </p>
              {isCreator && (
                <button
                  onClick={handleAddNewTrack}
                  className="btn-primary mt-5 px-6 py-3"
                >
                  <Plus className="w-5 h-5" />
                  Add Track
                </button>
              )}
            </div>
          ) : (
            <TrackPlaylist
              tracks={tracks}
              projectCoverUrl={project.cover_image_url}
              projectTitle={project.title}
              isCreator={isCreator}
              allowDownloads={project.allow_downloads}
              onEditTrack={startEditingTrack}
              onDeleteTrack={handleDeleteTrack}
              onMenuOpen={() => {
                setIsProjectMenuOpen(false) // Close project menu when track menu opens
                setTrackMenuOpen(true)
              }}
              forceCloseMenu={isProjectMenuOpen} // Force track menu closed when project menu is open
              onTrackPlay={handleTrackPlayStart}
              onPlaybackSnapshotChange={handlePlaybackSnapshotChange}
            />
          )}
          </div>

          {/* Add Track button for creators - positioned below tracks */}
          {isCreator && tracks.length > 0 && (
            <div className="flex justify-center mt-6">
              <button
                onClick={handleAddNewTrack}
                className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-semibold hover:bg-gray-200 transition"
              >
                <Plus className="w-5 h-5" />
                Add Track
              </button>
            </div>
          )}

          {/* Track Notes Section - Only for creators */}
          {isCreator && tracks.length > 0 && (
            <div 
              className="mt-6 bg-gray-900 rounded-xl"
              style={{ padding: '20px 24px 24px 24px' }}
            >
              <div className="flex items-center" style={{ marginBottom: '16px' }}>
                <FileText className="w-5 h-5 text-yellow-400 mr-2" />
                <h3 className="font-semibold text-neon-green">Track Notes</h3>
                <span className="text-xs text-white opacity-60" style={{ marginLeft: '12px' }}>(Private)</span>
              </div>
              <div className="space-y-3">
                {tracks.map((track) => {
                  const trackNote = trackNotes[track.id]
                  const isEditingNote = editingTrackNotes.hasOwnProperty(track.id)
                  const noteContent = editingTrackNotes[track.id] || ''

                  return (
                    <div key={track.id} className="border-b border-gray-800 pb-3 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-white font-medium">{track.title}</span>
                        {!isEditingNote && (
                          <button
                            onClick={() => startEditingTrackNote(track.id)}
                            className="text-xs text-black hover:opacity-80 flex items-center gap-1"
                          >
                            <Edit className="w-3 h-3" />
                            {trackNote ? 'Edit' : 'Add'}
                          </button>
                        )}
                      </div>
                      {isEditingNote ? (
                        <div className="space-y-2">
                          <textarea
                            value={noteContent}
                            onChange={(e) => setEditingTrackNotes({ ...editingTrackNotes, [track.id]: e.target.value })}
                            placeholder="Add private notes..."
                            rows={2}
                            className="note-input w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white focus:outline-none focus:border-neon-green resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveTrackNote(track.id)}
                              disabled={savingNote === track.id}
                              className="flex items-center gap-1 bg-neon-green text-black px-3 py-1 rounded text-xs font-semibold hover:opacity-80 transition disabled:opacity-50"
                            >
                              <Save className="w-3 h-3" />
                              {savingNote === track.id ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => {
                                const newEditing = { ...editingTrackNotes }
                                delete newEditing[track.id]
                                setEditingTrackNotes(newEditing)
                              }}
                              className="text-xs text-gray-400 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : trackNote ? (
                        <p className="text-xs text-gray-400">{trackNote.content}</p>
                      ) : (
                        <p className="text-xs text-gray-500 italic">No notes</p>
                    )}
                  </div>
                )
              })}
              </div>
            </div>
          )}

          <div ref={secondaryPanelsSentinelRef} className="mt-6">
            {showSecondaryPanels ? (
              <div className="space-y-1.5">
                <CommentsPanel
                  projectId={project.id}
                  authenticated={!!user}
                  getAccessToken={getAccessToken}
                  onRequireAuth={() => showToast('Please sign in to comment.', 'error')}
                />
                <TopSupportersCard
                  projectId={project.id}
                  source="project_detail"
                  authenticated={!!user}
                  getAccessToken={getAccessToken}
                  onOpenSupporter={(supporterUserId) => {
                    setCreatorId(supporterUserId)
                    setShowCreatorModal(true)
                  }}
                />
                <TipPromptCard
                  source="project_detail"
                  projectId={project.id}
                  creatorId={project.creator_id}
                  authenticated={!!user}
                  isCreator={isCreator}
                  viewerKey={user?.id || null}
                  trackIds={tracks.map((track) => track.id)}
                  onSendTip={(trigger) => {
                    setTipPromptTrigger(trigger)
                    setShowCreatorModal(true)
                  }}
                />
                <ProjectUpdatesPanel
                  projectId={project.id}
                  authenticated={!!user}
                  getAccessToken={getAccessToken}
                  onRequireAuth={() => showToast('Please sign in to post updates.', 'error')}
                  source="project_detail"
                />
                <ProjectActivityPanel
                  projectId={project.id}
                  authenticated={!!user}
                  getAccessToken={getAccessToken}
                  onRequireAuth={() => showToast('Please sign in to view project activity.', 'error')}
                  source="project_detail"
                />
                <ProjectAttachmentsPanel
                  projectId={project.id}
                  authenticated={!!user}
                  getAccessToken={getAccessToken}
                  onRequireAuth={() => showToast('Please sign in to manage attachments.', 'error')}
                  source="project_detail"
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-900 bg-gray-950/35 px-4 py-4 text-sm text-gray-500">
                Loading discussion and updates...
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Track Edit Modal */}
      {editingTrackId && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-[950] flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Edit Track</h2>
              <button
                onClick={cancelEditingTrackModal}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Track Title</label>
              <input
                type="text"
                value={editingTrackTitle}
                onChange={(e) => setEditingTrackTitle(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-neon-green"
                placeholder="Enter track title"
                autoFocus
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelEditingTrackModal}
                className="px-6 py-2 text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={saveEditingTrack}
                disabled={!editingTrackTitle.trim() || savingTracks[editingTrackId]}
                className="px-6 py-2 bg-neon-green text-black rounded-full font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingTracks[editingTrackId] ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-[950] flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">Project Notes</h2>
              <button
                onClick={() => setShowNotesModal(false)}
                className="text-neon-green hover:opacity-80"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            {isCreator ? (
              <div>
                {editingProjectNote ? (
                  <div>
                    <textarea
                      value={projectNoteContent}
                      onChange={(e) => setProjectNoteContent(e.target.value)}
                      className="note-input w-full bg-black border border-gray-700 rounded p-3 text-base sm:text-sm text-white focus:outline-none focus:border-neon-green h-48 mb-4"
                      placeholder="Add your private notes about this project..."
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingProjectNote(false)
                          setProjectNoteContent(projectNote?.content || '')
                        }}
                        className="text-sm text-neon-green hover:opacity-80"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          await handleSaveProjectNote()
                          setShowNotesModal(false)
                        }}
                        className="text-sm bg-white text-black px-4 py-2 rounded-full hover:bg-gray-200"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-neon-green mb-4">
                      {projectNote?.content || 'No notes yet. Click "Edit" to add notes.'}
                    </p>
                    <button
                      onClick={() => setEditingProjectNote(true)}
                      className="text-sm bg-white text-black px-4 py-2 rounded-full hover:bg-gray-200"
                    >
                      {projectNote ? 'Edit Notes' : 'Add Notes'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-neon-green">Notes are only available to the project creator.</p>
            )}
          </div>
        </div>
      )}

      {/* Share Modal */}
      {project && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={handleCloseShareModal}
          shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${project.share_token}`}
          title={project.title}
        />
      )}

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
                onClick={() => (project.sharing_enabled !== false) && handleOpenShareModal()}
                disabled={project.sharing_enabled === false}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: '#1f2937',
                  color: project.sharing_enabled !== false ? '#fff' : '#6b7280',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: project.sharing_enabled !== false ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                  opacity: project.sharing_enabled !== false ? 1 : 0.5,
                }}
                className={project.sharing_enabled !== false ? "hover:bg-gray-700 transition" : ""}
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
                  <Share2 style={{ width: '22px', height: '22px', color: project.sharing_enabled !== false ? '#39FF14' : '#6b7280' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Share</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    {project.sharing_enabled !== false ? 'Share this project with others' : 'Sharing is disabled'}
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

              {user && !isCreator && (
                <>
                  {savedToLibrary ? (
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
                          Remove and unsubscribe project notifications
                        </div>
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSaveToLibrary()}
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
                          Save project and enable important updates
                        </div>
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => handleHideFromExplore()}
                    disabled={updatingDiscoveryPreference}
                    style={{
                      width: '100%',
                      padding: '16px 20px',
                      backgroundColor: '#1f2937',
                      color: '#fff',
                      border: '1px solid #374151',
                      borderRadius: '12px',
                      fontSize: '16px',
                      fontWeight: 500,
                      cursor: updatingDiscoveryPreference ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      textAlign: 'left',
                      opacity: updatingDiscoveryPreference ? 0.65 : 1,
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
                      <EyeOff style={{ width: '22px', height: '22px', color: '#ef4444' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Not Interested</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                        Hide this project from future Explore recommendations
                      </div>
                    </div>
                  </button>
                </>
              )}

              {user && !isCreator && viewerIsSubscribed && (
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
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Notifications</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '10px' }}>
                    Set update alerts for this saved project.
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
                        onClick={() => handleViewerNotificationModeChange(mode.id)}
                        disabled={updatingNotificationMode}
                        style={{
                          minHeight: '36px',
                          borderRadius: '999px',
                          border:
                            viewerSubscriptionMode === mode.id
                              ? '1px solid #39FF14'
                              : '1px solid #374151',
                          color: viewerSubscriptionMode === mode.id ? '#39FF14' : '#d1d5db',
                          backgroundColor:
                            viewerSubscriptionMode === mode.id
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
              
              {user && (
                <button
                  onClick={() => handleAddToQueue()}
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
                      Add project to your play queue
                    </div>
                  </div>
                </button>
              )}
              
              {user && (
                <button
                  onClick={() => {
                    // If creator has no notes yet, start in edit mode
                    if (isCreator && !projectNote?.content) {
                      setEditingProjectNote(true)
                    }
                    setIsProjectMenuOpen(false)
                    // Scroll to notes section with a small delay to let menu close
                    setTimeout(() => {
                      notesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 100)
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
                    <FileText style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Notes</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      View or add project notes
                    </div>
                  </div>
                </button>
              )}
              
              {user && (
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
              )}

              {isCreator && (
                <>
                  <button
                    onClick={() => startEditingProject()}
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
                      <Edit style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Edit Project</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                        Modify project details
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteProject()}
                    style={{
                      width: '100%',
                      padding: '16px 20px',
                      backgroundColor: '#1f2937',
                      color: '#ef4444',
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
                      <Trash2 style={{ width: '22px', height: '22px', color: '#ef4444' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Delete Project</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                        Permanently remove this project
                      </div>
                    </div>
                  </button>
                </>
              )}
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
                  source: 'project_detail',
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

