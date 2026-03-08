'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Home, ListMusic, User, X, Play, Pause, Trash2, SkipForward, SkipBack, Bell, Check, DollarSign, Trash, UserPlus, Music2, Share2, Compass } from 'lucide-react'
import { usePrivy } from '@privy-io/react-auth'
import { showToast } from './Toast'
import { createClient } from '@supabase/supabase-js'
import { normalizeNotificationType, type NotificationType } from '@/lib/notificationTypes'
import type { NotificationDeliveryMode, NotificationDigestWindow } from '@/lib/notificationPreferences'
import {
  getProjectAccessInviteProjectId,
  getFollowerNotificationName,
  getNotificationPrimaryText,
  getNotificationTargetPath,
  isProjectAccessInviteNotification,
  sortNotificationsForInbox,
} from '@/lib/notificationInbox'
import {
  getNotificationSnoozeScopeKey,
  splitNotificationsBySnooze,
  type NotificationSnoozeRow,
} from '@/lib/notificationSnooze'

// Create a Supabase client for realtime subscriptions
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseRealtime = createClient(supabaseUrl, supabaseAnonKey)

interface Notification {
  id: string
  type: string
  title: string
  message: string | null
  data: Record<string, any>
  is_read: boolean
  created_at: string
}

interface NotificationDigestGroup {
  id: string
  group_type: string
  grouped_count: number
  latest_created_at: string
  target_path: string | null
  title: string
}

const NOTIFICATION_ACTION_EVENT = 'notification_inbox_event'

function getNotificationTypeLabel(type: NotificationType): string {
  if (type === 'tip_received') return 'Tip'
  if (type === 'new_follower') return 'Follower'
  if (type === 'new_track') return 'New Track'
  if (type === 'project_saved') return 'Project Saved'
  if (type === 'project_shared') return 'Project Shared'
  return 'Notification'
}

interface QueueItem {
  id: string
  title: string
  projectTitle: string
  audioUrl: string
  projectCoverUrl?: string | null
  addedAt: number
}

export default function BottomTabBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { authenticated, ready, getAccessToken } = usePrivy()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  
  // Notification state
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationDeliveryMode, setNotificationDeliveryMode] = useState<NotificationDeliveryMode>('instant')
  const [notificationDigestWindow, setNotificationDigestWindow] = useState<NotificationDigestWindow>('daily')
  const [digestGroups, setDigestGroups] = useState<NotificationDigestGroup[]>([])
  const [digestLoading, setDigestLoading] = useState(false)
  const [snoozes, setSnoozes] = useState<NotificationSnoozeRow[]>([])
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [unreadPriorityEnabled, setUnreadPriorityEnabled] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  
  // Queue playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // External/cassette playback state - now handled by this global player
  const [cassetteTrack, setCassetteTrack] = useState<{
    id: string
    title: string
    audioUrl: string
    projectTitle: string
    projectCoverUrl?: string | null
    tracks?: Array<{ id: string; title: string; audio_url: string }>
    currentIndex?: number
  } | null>(null)
  const [cassetteIsPlaying, setCassetteIsPlaying] = useState(false)
  const [cassetteCurrentTime, setCassetteCurrentTime] = useState(0)
  const [cassetteDuration, setCassetteDuration] = useState(0)
  
  // Audio visualization refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const frequencyAnimationRef = useRef<number | null>(null)
  const audioContextInitializedRef = useRef(false)
  
  // Track the last played track ID for pause/resume when player bar is closed
  const lastPlayedTrackIdRef = useRef<string | null>(null)
  
  // Legacy compatibility
  const externalTrack = cassetteTrack
  const externalIsPlaying = cassetteIsPlaying
  const setExternalTrack = setCassetteTrack
  const setExternalIsPlaying = setCassetteIsPlaying

  const emitNotificationEvent = useCallback(
    (
      action: 'open' | 'read' | 'delete' | 'click',
      payload?: {
        notificationId?: string
        notificationType?: string
        targetPath?: string | null
      }
    ) => {
      if (typeof window === 'undefined') return

      window.dispatchEvent(
        new CustomEvent(NOTIFICATION_ACTION_EVENT, {
          detail: {
            schema: 'notification_inbox.v1',
            action,
            source: 'bottom_tab_bar',
            notification_id: payload?.notificationId || null,
            notification_type: payload?.notificationType || null,
            target_path: payload?.targetPath || null,
            unread_count: unreadNotificationCount,
            total_count: notifications.length,
          },
        })
      )
    },
    [notifications.length, unreadNotificationCount]
  )

  const emitProjectAccessNotificationEvent = useCallback(
    (
      action: 'click' | 'revoked_before_open',
      payload: {
        projectId: string | null
        recipientUserId: string | null
        grantedByUserId: string | null
        notificationType: string
      }
    ) => {
      if (typeof window === 'undefined') return
      window.dispatchEvent(
        new CustomEvent('project_access_notification_event', {
          detail: {
            schema: 'project_access_notification.v1',
            action,
            project_id: payload.projectId,
            recipient_user_id: payload.recipientUserId,
            granted_by_user_id: payload.grantedByUserId,
            notification_type: payload.notificationType,
            source: 'bottom_tab_bar',
          },
        })
      )
    },
    []
  )

  const emitNotificationDigestEvent = useCallback(
    (
      action: 'mode_change' | 'digest_view' | 'digest_click',
      payload?: {
        groupType?: string | null
        groupedCount?: number | null
      }
    ) => {
      if (typeof window === 'undefined') return
      window.dispatchEvent(
        new CustomEvent('notification_digest_event', {
          detail: {
            schema: 'notification_digest.v1',
            action,
            source: 'bottom_tab_bar',
            delivery_mode: notificationDeliveryMode,
            digest_window: notificationDigestWindow,
            group_type: payload?.groupType || null,
            grouped_count: payload?.groupedCount ?? null,
          },
        })
      )
    },
    [notificationDeliveryMode, notificationDigestWindow]
  )

  const emitNotificationControlEvent = useCallback(
    (
      action: 'snooze' | 'unsnooze' | 'view_snoozed' | 'open_unread_priority',
      payload?: { scopeKey?: string; snoozeDuration?: '24h' | '7d' | null }
    ) => {
      if (typeof window === 'undefined') return
      window.dispatchEvent(
        new CustomEvent('notification_control_event', {
          detail: {
            schema: 'notification_control.v1',
            action,
            scope_key: payload?.scopeKey || null,
            snooze_duration: payload?.snoozeDuration || null,
            source: 'bottom_tab_bar',
          },
        })
      )
    },
    []
  )

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Load queue from localStorage
  useEffect(() => {
    const savedQueue = localStorage.getItem('demo-queue')
    if (savedQueue) {
      try {
        setQueue(JSON.parse(savedQueue))
      } catch (e) {
        console.error('Failed to parse queue:', e)
      }
    }

    // Listen for queue updates from other components
    const handleQueueUpdate = () => {
      const updated = localStorage.getItem('demo-queue')
      if (updated) {
        try {
          setQueue(JSON.parse(updated))
        } catch (e) {
          console.error('Failed to parse queue:', e)
        }
      }
    }

    window.addEventListener('demo-queue-updated', handleQueueUpdate)
    return () => window.removeEventListener('demo-queue-updated', handleQueueUpdate)
  }, [])

  // Save queue to localStorage
  const saveQueue = (newQueue: QueueItem[]) => {
    setQueue(newQueue)
    localStorage.setItem('demo-queue', JSON.stringify(newQueue))
    window.dispatchEvent(new Event('demo-queue-updated'))
  }

  const removeFromQueue = (id: string) => {
    const itemIndex = queue.findIndex(item => item.id === id)
    const newQueue = queue.filter(item => item.id !== id)
    saveQueue(newQueue)
    
    // Handle removal of currently playing track
    if (currentQueueIndex !== null && itemIndex !== -1) {
      if (itemIndex === currentQueueIndex) {
        // Removed the currently playing track
        if (newQueue.length === 0) {
          stopPlayback()
        } else if (itemIndex < newQueue.length) {
          // Play the next track (which is now at the same index)
          playQueue(itemIndex)
        } else {
          // We removed the last track, play the new last track
          playQueue(newQueue.length - 1)
        }
      } else if (itemIndex < currentQueueIndex) {
        // Removed a track before the current one, adjust index
        setCurrentQueueIndex(currentQueueIndex - 1)
      }
    }
  }

  const clearQueue = () => {
    saveQueue([])
    setIsQueueOpen(false)
    stopPlayback()
  }

  // Handle cassette track playback - this is now the GLOBAL audio player
  const playCassetteTrack = (track: {
    id: string
    title: string
    audioUrl: string
    projectTitle: string
    projectCoverUrl?: string | null
    tracks?: Array<{ id: string; title: string; audio_url: string }>
    currentIndex?: number
  }) => {
    // Stop queue playback if playing
    setCurrentQueueIndex(null)
    setIsPlaying(false)
    
    // Set up cassette track
    setCassetteTrack(track)
    
    // Store track ID for pause/resume when player bar is closed
    lastPlayedTrackIdRef.current = track.id
    
    if (audioRef.current) {
      audioRef.current.src = track.audioUrl
      audioRef.current.load()
      audioRef.current.play().then(() => {
        setCassetteIsPlaying(true)
        // Notify cassette UI that playback started
        window.dispatchEvent(new CustomEvent('demo-playback-state', {
          detail: { isPlaying: true, trackId: track.id }
        }))
      }).catch(err => {
        console.error('Error playing cassette track:', err)
        showToast('Failed to play track', 'error')
      })
    }
  }

  const pauseCassettePlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      setCassetteIsPlaying(false)
      // Dispatch event with track id if available
      const trackId = cassetteTrack?.id || lastPlayedTrackIdRef.current
      if (trackId) {
        window.dispatchEvent(new CustomEvent('demo-playback-state', {
          detail: { isPlaying: false, trackId }
        }))
      }
    }
  }

  const resumeCassettePlayback = () => {
    if (audioRef.current && audioRef.current.src) {
      audioRef.current.play().then(() => {
        setCassetteIsPlaying(true)
        // Dispatch event with track id if available
        const trackId = cassetteTrack?.id || lastPlayedTrackIdRef.current
        if (trackId) {
          window.dispatchEvent(new CustomEvent('demo-playback-state', {
            detail: { isPlaying: true, trackId }
          }))
        }
      }).catch(() => {
        // Audio play failed (possibly no src loaded)
      })
    }
  }

  const seekCassette = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
    }
  }

  const cassetteNext = () => {
    if (!cassetteTrack?.tracks || cassetteTrack.currentIndex === undefined) return
    const nextIndex = cassetteTrack.currentIndex + 1
    if (nextIndex < cassetteTrack.tracks.length) {
      const nextTrack = cassetteTrack.tracks[nextIndex]
      playCassetteTrack({
        ...cassetteTrack,
        id: nextTrack.id,
        title: nextTrack.title,
        audioUrl: nextTrack.audio_url,
        currentIndex: nextIndex,
      })
    }
  }

  const cassettePrevious = () => {
    if (!cassetteTrack?.tracks || cassetteTrack.currentIndex === undefined) return
    const prevIndex = cassetteTrack.currentIndex - 1
    if (prevIndex >= 0) {
      const prevTrack = cassetteTrack.tracks[prevIndex]
      playCassetteTrack({
        ...cassetteTrack,
        id: prevTrack.id,
        title: prevTrack.title,
        audioUrl: prevTrack.audio_url,
        currentIndex: prevIndex,
      })
    }
  }

  // Listen for playback requests from cassette players
  useEffect(() => {
    const handlePlayRequest = (e: CustomEvent) => {
      const { track, tracks, currentIndex, projectTitle, projectCoverUrl } = e.detail
      playCassetteTrack({
        id: track.id,
        title: track.title,
        audioUrl: track.audioUrl,
        projectTitle,
        projectCoverUrl,
        tracks,
        currentIndex,
      })
    }

    const handlePauseRequest = () => {
      pauseCassettePlayback()
    }

    const handleResumeRequest = () => {
      resumeCassettePlayback()
    }

    const handleSeekRequest = (e: CustomEvent) => {
      seekCassette(e.detail.time)
    }

    const handleNextRequest = () => {
      cassetteNext()
    }

    const handlePreviousRequest = () => {
      cassettePrevious()
    }

    const handleGlobalPlayback = (e: CustomEvent) => {
      const { source } = e.detail
      
      if (source === 'queue') {
        // Queue player started - clear cassette track display
        setCassetteTrack(null)
        setCassetteIsPlaying(false)
      }
    }

    const handleVolumeChange = (e: CustomEvent) => {
      if (audioRef.current) {
        audioRef.current.volume = e.detail.volume
      }
    }

    window.addEventListener('demo-cassette-play', handlePlayRequest as EventListener)
    window.addEventListener('demo-cassette-pause', handlePauseRequest)
    window.addEventListener('demo-cassette-resume', handleResumeRequest)
    window.addEventListener('demo-cassette-seek', handleSeekRequest as EventListener)
    window.addEventListener('demo-cassette-next', handleNextRequest)
    window.addEventListener('demo-cassette-previous', handlePreviousRequest)
    window.addEventListener('demo-global-playback', handleGlobalPlayback as EventListener)
    window.addEventListener('demo-volume-change', handleVolumeChange as EventListener)
    
    return () => {
      window.removeEventListener('demo-cassette-play', handlePlayRequest as EventListener)
      window.removeEventListener('demo-cassette-pause', handlePauseRequest)
      window.removeEventListener('demo-cassette-resume', handleResumeRequest)
      window.removeEventListener('demo-cassette-seek', handleSeekRequest as EventListener)
      window.removeEventListener('demo-cassette-next', handleNextRequest)
      window.removeEventListener('demo-cassette-previous', handlePreviousRequest)
      window.removeEventListener('demo-global-playback', handleGlobalPlayback as EventListener)
      window.removeEventListener('demo-volume-change', handleVolumeChange as EventListener)
    }
  }, [cassetteTrack])

  // Broadcast time updates for all playback (cassette and queue)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      // Always update the current time state for the mini-player/now-playing slider
      setCassetteCurrentTime(audio.currentTime)
      
      // Also broadcast for cassette UI if cassette track is playing
      if (cassetteTrack) {
        window.dispatchEvent(new CustomEvent('demo-playback-time', {
          detail: { 
            currentTime: audio.currentTime, 
            duration: audio.duration || 0,
            trackId: cassetteTrack.id 
          }
        }))
      }
    }

    const handleDurationChange = () => {
      // Always update duration for the mini-player/now-playing slider
      setCassetteDuration(audio.duration || 0)
    }

    const handleEnded = () => {
      if (cassetteTrack) {
        // Try to play next track if available
        if (cassetteTrack.tracks && cassetteTrack.currentIndex !== undefined) {
          const nextIndex = cassetteTrack.currentIndex + 1
          if (nextIndex < cassetteTrack.tracks.length) {
            cassetteNext()
            return
          }
        }
        // End of playlist
        setCassetteIsPlaying(false)
        window.dispatchEvent(new CustomEvent('demo-playback-state', {
          detail: { isPlaying: false, trackId: cassetteTrack.id, ended: true }
        }))
      } else if (currentQueueIndex !== null) {
        playNext()
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('ended', handleEnded)
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [cassetteTrack, currentQueueIndex, queue])

  // Queue playback functions
  const playQueue = (startIndex: number = 0) => {
    if (queue.length === 0) return
    
    const index = Math.min(startIndex, queue.length - 1)
    setCurrentQueueIndex(index)
    
    // Clear any external track display
    setExternalTrack(null)
    setExternalIsPlaying(false)
    
    // Dispatch event to stop cassette players
    window.dispatchEvent(new CustomEvent('demo-global-playback', {
      detail: { source: 'queue' }
    }))
    
    if (audioRef.current) {
      audioRef.current.src = queue[index].audioUrl
      audioRef.current.load()
      audioRef.current.play().then(() => {
        setIsPlaying(true)
        showToast(`Now playing: ${queue[index].title}`, 'success')
      }).catch(err => {
        console.error('Error playing audio:', err)
        showToast('Failed to play track', 'error')
      })
    }
    setIsQueueOpen(false)
  }

  const togglePlayPause = () => {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().then(() => setIsPlaying(true))
    }
  }

  const playNext = () => {
    if (currentQueueIndex === null || queue.length === 0) return
    
    const nextIndex = currentQueueIndex + 1
    if (nextIndex < queue.length) {
      playQueue(nextIndex)
    } else {
      // End of queue
      stopPlayback()
      showToast('Queue finished', 'info')
    }
  }

  const playPrevious = () => {
    if (currentQueueIndex === null || queue.length === 0) return
    
    const prevIndex = currentQueueIndex - 1
    if (prevIndex >= 0) {
      playQueue(prevIndex)
    }
  }

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    setIsPlaying(false)
    setCurrentQueueIndex(null)
  }

  // Handle audio ended event
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleEnded = () => {
      playNext()
    }

    audio.addEventListener('ended', handleEnded)
    return () => audio.removeEventListener('ended', handleEnded)
  }, [currentQueueIndex, queue])

  // Lock body scroll when queue modal is open (prevents mobile viewport issues)
  useEffect(() => {
    if (isQueueOpen) {
      // Save current scroll position and lock body
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
      document.body.style.overflow = 'hidden'
      
      return () => {
        // Restore scroll position when modal closes
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.overflow = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [isQueueOpen])

  // Lock body scroll when Now Playing modal is open
  useEffect(() => {
    if (isNowPlayingOpen) {
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
      document.body.style.overflow = 'hidden'
      
      return () => {
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.overflow = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [isNowPlayingOpen])

  // Lock body scroll when Notifications modal is open
  useEffect(() => {
    if (isNotificationsOpen) {
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
      document.body.style.overflow = 'hidden'
      
      return () => {
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.overflow = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [isNotificationsOpen])

  // Initialize AudioContext and connect analyser for frequency visualization
  const initializeAudioAnalyser = () => {
    const audio = audioRef.current
    if (!audio || audioContextInitializedRef.current) return

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) {
        console.warn('Web Audio API not supported')
        return
      }

      const audioContext = new AudioContextClass()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 64 // Gives us 32 frequency bins
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser

      const source = audioContext.createMediaElementSource(audio)
      source.connect(analyser)
      analyser.connect(audioContext.destination)
      sourceNodeRef.current = source

      audioContextInitializedRef.current = true
    } catch (error) {
      console.warn('Could not initialize audio analyser:', error)
    }
  }

  // Broadcast frequency data when audio is playing
  useEffect(() => {
    const isAudioPlaying = isPlaying || cassetteIsPlaying
    
    if (isAudioPlaying) {
      // Initialize audio context on first play (requires user interaction)
      if (!audioContextInitializedRef.current) {
        initializeAudioAnalyser()
      }
      
      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume()
      }

      // Start broadcasting frequency data
      const broadcastFrequency = () => {
        if (analyserRef.current) {
          const bufferLength = analyserRef.current.frequencyBinCount
          const dataArray = new Uint8Array(bufferLength)
          analyserRef.current.getByteFrequencyData(dataArray)
          
          // Broadcast the frequency data
          window.dispatchEvent(new CustomEvent('demo-audio-frequency', {
            detail: { frequencyData: Array.from(dataArray) }
          }))
        }
        
        frequencyAnimationRef.current = requestAnimationFrame(broadcastFrequency)
      }
      
      broadcastFrequency()
      
      return () => {
        if (frequencyAnimationRef.current) {
          cancelAnimationFrame(frequencyAnimationRef.current)
          frequencyAnimationRef.current = null
        }
      }
    } else {
      // Stop broadcasting when not playing
      if (frequencyAnimationRef.current) {
        cancelAnimationFrame(frequencyAnimationRef.current)
        frequencyAnimationRef.current = null
      }
      
      // Broadcast empty data to indicate stopped
      window.dispatchEvent(new CustomEvent('demo-audio-frequency', {
        detail: { frequencyData: null }
      }))
    }
  }, [isPlaying, cassetteIsPlaying])

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!authenticated) return
    
    setNotificationsLoading(true)
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/notifications?limit=20', {
        headers: { Authorization: `Bearer ${token}` },
      })
      
      if (response.ok) {
        const data = await response.json()
        setNotifications(sortNotificationsForInbox(data.notifications || []))
        setUnreadNotificationCount(data.unreadCount || 0)
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setNotificationsLoading(false)
    }
  }, [authenticated, getAccessToken])

  const fetchNotificationDeliveryPreferences = useCallback(async () => {
    if (!authenticated) return
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/notification-preferences', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return
      const data = await response.json()
      const mode =
        data?.preferences?.delivery_mode === 'digest' || data?.preferences?.delivery_mode === 'instant'
          ? data.preferences.delivery_mode
          : 'instant'
      const window =
        data?.preferences?.digest_window === 'weekly' || data?.preferences?.digest_window === 'daily'
          ? data.preferences.digest_window
          : 'daily'
      setNotificationDeliveryMode(mode)
      setNotificationDigestWindow(window)
    } catch (error) {
      console.error('Error loading notification delivery preferences:', error)
    }
  }, [authenticated, getAccessToken])

  const fetchDigestGroups = useCallback(async () => {
    if (!authenticated) return
    setDigestLoading(true)
    try {
      const token = await getAccessToken()
      const response = await fetch(
        `/api/notifications/digest?window=${encodeURIComponent(notificationDigestWindow)}&limit=10`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (!response.ok) {
        setDigestGroups([])
        return
      }
      const data = await response.json()
      const nextGroups = (data.items || []) as NotificationDigestGroup[]
      setDigestGroups(nextGroups)
      emitNotificationDigestEvent('digest_view')
    } catch (error) {
      console.error('Error loading notification digest groups:', error)
      setDigestGroups([])
    } finally {
      setDigestLoading(false)
    }
  }, [authenticated, getAccessToken, notificationDigestWindow, emitNotificationDigestEvent])

  const fetchNotificationSnoozes = useCallback(async () => {
    if (!authenticated) return
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/notifications/snooze', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        setSnoozes([])
        return
      }
      const data = await response.json()
      setSnoozes((data.snoozes || []) as NotificationSnoozeRow[])
    } catch (error) {
      console.error('Error loading notification snoozes:', error)
      setSnoozes([])
    }
  }, [authenticated, getAccessToken])

  // Fetch user ID for realtime subscription
  useEffect(() => {
    const fetchUserId = async () => {
      if (!authenticated) return
      
      try {
        const token = await getAccessToken()
        const response = await fetch('/api/user', {
          headers: { Authorization: `Bearer ${token}` },
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.user?.id) {
            setUserId(data.user.id)
          }
        }
      } catch (error) {
        console.error('Error fetching user ID:', error)
      }
    }
    
    fetchUserId()
  }, [authenticated, getAccessToken])

  // Initial notification fetch
  useEffect(() => {
    if (authenticated) {
      fetchNotifications()
      fetchNotificationDeliveryPreferences()
      fetchNotificationSnoozes()
    }
  }, [authenticated, fetchNotifications, fetchNotificationDeliveryPreferences, fetchNotificationSnoozes])

  useEffect(() => {
    if (!authenticated || notificationDeliveryMode !== 'digest') return
    fetchDigestGroups()
  }, [authenticated, notificationDeliveryMode, notificationDigestWindow, fetchDigestGroups])

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!userId) return

    const channel = supabaseRealtime
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('New notification received:', payload)
          const newNotification = payload.new as Notification
          
          setNotifications((prev) => sortNotificationsForInbox([newNotification, ...prev]))
          setUnreadNotificationCount((prev) => prev + 1)
          
          showToast(newNotification.title, 'success')
        }
      )
      .subscribe()

    return () => {
      supabaseRealtime.removeChannel(channel)
    }
  }, [userId])

  // Mark notifications as read
  const markNotificationsAsRead = async (notificationIds?: string[]) => {
    if (!authenticated) return
    
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationIds }),
      })

      if (!response.ok) {
        throw new Error('Failed to mark notifications as read')
      }
      
      if (notificationIds) {
        setNotifications((prev) =>
          sortNotificationsForInbox(
            prev.map((n) =>
            notificationIds.includes(n.id) ? { ...n, is_read: true } : n
          )
          )
        )
        setUnreadNotificationCount((prev) => Math.max(0, prev - notificationIds.length))
        notificationIds.forEach((notificationId) => {
          const matched = notifications.find((n) => n.id === notificationId)
          emitNotificationEvent('read', {
            notificationId,
            notificationType: matched?.type,
            targetPath: matched ? getNotificationTargetPath(matched) : null,
          })
        })
      } else {
        setNotifications((prev) => sortNotificationsForInbox(prev.map((n) => ({ ...n, is_read: true }))))
        setUnreadNotificationCount(0)
        emitNotificationEvent('read')
      }
    } catch (error) {
      console.error('Error marking notifications as read:', error)
    }
  }

  // Delete notification
  const deleteNotification = async (notificationId: string) => {
    if (!authenticated) return
    
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationIds: [notificationId] }),
      })

      if (!response.ok) {
        throw new Error('Failed to delete notification')
      }
      
      const notification = notifications.find((n) => n.id === notificationId)
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
      if (notification && !notification.is_read) {
        setUnreadNotificationCount((prev) => Math.max(0, prev - 1))
      }
      emitNotificationEvent('delete', {
        notificationId,
        notificationType: notification?.type,
        targetPath: notification ? getNotificationTargetPath(notification) : null,
      })
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  const snoozeNotificationScope = async (
    notification: Notification,
    duration: '24h' | '7d'
  ) => {
    if (!authenticated) return
    const scopeKey = getNotificationSnoozeScopeKey(notification)
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/notifications/snooze', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scope_key: scopeKey, duration }),
      })
      if (!response.ok) throw new Error('Failed to snooze')
      emitNotificationControlEvent('snooze', {
        scopeKey,
        snoozeDuration: duration,
      })
      await fetchNotificationSnoozes()
    } catch (error) {
      console.error('Error snoozing notification scope:', error)
    }
  }

  const unsnoozeScope = async (scopeKey: string) => {
    if (!authenticated) return
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/notifications/snooze', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scope_key: scopeKey }),
      })
      if (!response.ok) throw new Error('Failed to unsnooze')
      emitNotificationControlEvent('unsnooze', {
        scopeKey,
      })
      await fetchNotificationSnoozes()
    } catch (error) {
      console.error('Error unsnoozing notification scope:', error)
    }
  }

  const { activeNotifications, snoozedNotifications } = useMemo(() => {
    const split = splitNotificationsBySnooze({
      notifications,
      snoozes,
    })
    return {
      activeNotifications: sortNotificationsForInbox(split.active, unreadPriorityEnabled),
      snoozedNotifications: sortNotificationsForInbox(split.snoozed, true),
    }
  }, [notifications, snoozes, unreadPriorityEnabled])

  const updateNotificationDigestMode = async (
    mode: NotificationDeliveryMode,
    window: NotificationDigestWindow = notificationDigestWindow
  ) => {
    if (!authenticated) return
    const prevMode = notificationDeliveryMode
    const prevWindow = notificationDigestWindow
    setNotificationDeliveryMode(mode)
    setNotificationDigestWindow(window)
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/notification-preferences', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          delivery_mode: mode,
          digest_window: window,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update digest mode')
      const resolvedMode =
        result?.preferences?.delivery_mode === 'digest' || result?.preferences?.delivery_mode === 'instant'
          ? result.preferences.delivery_mode
          : mode
      const resolvedWindow =
        result?.preferences?.digest_window === 'weekly' || result?.preferences?.digest_window === 'daily'
          ? result.preferences.digest_window
          : window
      setNotificationDeliveryMode(resolvedMode)
      setNotificationDigestWindow(resolvedWindow)
      emitNotificationDigestEvent('mode_change')
    } catch (error) {
      console.error('Error updating digest mode:', error)
      setNotificationDeliveryMode(prevMode)
      setNotificationDigestWindow(prevWindow)
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    const target = getNotificationTargetPath(notification)
    const isAccessInvite = isProjectAccessInviteNotification(notification)
    const projectId = isAccessInvite ? getProjectAccessInviteProjectId(notification) : null
    const grantedByUserId =
      typeof notification.data?.granted_by_user_id === 'string'
        ? notification.data.granted_by_user_id
        : typeof notification.data?.grantedByUserId === 'string'
          ? notification.data.grantedByUserId
          : null

    emitNotificationEvent('click', {
      notificationId: notification.id,
      notificationType: notification.type,
      targetPath: target,
    })

    if (!notification.is_read) {
      await markNotificationsAsRead([notification.id])
    }

    if (isAccessInvite) {
      emitProjectAccessNotificationEvent('click', {
        projectId,
        recipientUserId: userId,
        grantedByUserId,
        notificationType: notification.type,
      })
    }

    if (target) {
      if (isAccessInvite && projectId) {
        try {
          const token = await getAccessToken()
          const accessResponse = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          if (!accessResponse.ok) {
            emitProjectAccessNotificationEvent('revoked_before_open', {
              projectId,
              recipientUserId: userId,
              grantedByUserId,
              notificationType: notification.type,
            })
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('project_access_expiry_event', {
                  detail: {
                    schema: 'project_access_expiry.v1',
                    action: 'expired_block',
                    project_id: projectId,
                    target_user_id: userId,
                    expires_at: null,
                    source: 'bottom_tab_bar',
                  },
                })
              )
            }
            showToast('Access to this private project was removed.', 'error')
            setIsNotificationsOpen(false)
            router.push('/dashboard')
            return
          }
        } catch (error) {
          console.error('Error validating project access before open:', error)
        }
      }

      setIsNotificationsOpen(false)
      router.push(target)
    }
  }

  // Format time ago helper
  const formatNotificationTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return date.toLocaleDateString()
  }

  const getNotificationIcon = (type: NotificationType, isAccessInvite = false) => {
    if (isAccessInvite) {
      return <UserPlus style={{ width: '16px', height: '16px', color: '#39FF14' }} />
    }
    if (type === 'tip_received') {
      return <DollarSign style={{ width: '16px', height: '16px', color: '#39FF14' }} />
    }
    if (type === 'new_follower') {
      return <UserPlus style={{ width: '16px', height: '16px', color: '#39FF14' }} />
    }
    if (type === 'new_track') {
      return <Music2 style={{ width: '16px', height: '16px', color: '#39FF14' }} />
    }
    if (type === 'project_shared' || type === 'project_saved') {
      return <Share2 style={{ width: '16px', height: '16px', color: '#39FF14' }} />
    }
    return <Bell style={{ width: '16px', height: '16px', color: '#9ca3af' }} />
  }

  // Determine if we should show the full UI (but always keep audio element mounted)
  const showFullUI = ready && authenticated && pathname !== '/' && !pathname?.startsWith('/share/')

  // Safety reset: if auth state changes while a sheet is open, ensure body scroll isn't left locked.
  useEffect(() => {
    if (!authenticated) {
      setIsQueueOpen(false)
      setIsNowPlayingOpen(false)
      setIsNotificationsOpen(false)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
    }
  }, [authenticated])
  
  // Always render the audio element to persist playback across navigation
  // But hide the visual UI on certain pages
  if (!ready || !authenticated) {
    return (
      <>
        {/* Hidden audio element - always mounted for playback persistence */}
        <audio ref={audioRef} crossOrigin="anonymous" preload="metadata" style={{ display: 'none' }} />
      </>
    )
  }
  
  // On homepage and share pages, only show mini-player if something is playing
  const isMinimalMode = pathname === '/' || pathname?.startsWith('/share/')

  const tabs = [
    { href: '/dashboard', icon: Home, label: 'Home' },
    { href: '/explore', icon: Compass, label: 'Explore' },
    {
      href: '#queue',
      icon: ListMusic,
      label: 'Queue',
      onClick: () => setIsQueueOpen(true),
      badge: queue.length > 0 ? queue.length : null,
    },
    { href: '#notifications', icon: Bell, label: 'Alerts', onClick: () => {
      setIsNotificationsOpen(true)
      emitNotificationEvent('open')
      fetchNotificationDeliveryPreferences()
      fetchNotificationSnoozes()
      if (notificationDeliveryMode === 'digest') {
        fetchDigestGroups()
      }
      // Mark first 5 unread as read when opening
      const unreadIds = activeNotifications.filter((n) => !n.is_read).slice(0, 5).map((n) => n.id)
      if (unreadIds.length > 0) {
        markNotificationsAsRead(unreadIds)
      }
    }, badge: unreadNotificationCount > 0 ? unreadNotificationCount : null },
    { href: '/account', icon: User, label: 'Account' },
  ]

  const isActive = (href: string) => {
    if (href === '#queue') return isQueueOpen
    if (href === '#notifications') return isNotificationsOpen
    if (href === '/dashboard') return pathname === '/dashboard' || pathname?.startsWith('/dashboard/')
    return pathname === href
  }

  // Determine what track to show in mini player
  const queueTrack = currentQueueIndex !== null ? queue[currentQueueIndex] : null
  const displayTrack = queueTrack || externalTrack
  const displayIsPlaying = queueTrack ? isPlaying : externalIsPlaying
  const isQueuePlayback = queueTrack !== null

  // Format time helper
  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <>
      {/* Hidden Audio Element - persists across all pages */}
      <audio ref={audioRef} crossOrigin="anonymous" preload="metadata" style={{ display: 'none' }} />

      {/* Mini Player - Shows when playing (either from queue or cassette) */}
      {displayTrack && (
        <div
          style={{
            position: 'fixed',
            bottom: isMinimalMode ? '0px' : '70px', // At bottom when no tab bar
            left: 0,
            right: 0,
            height: '60px',
            backgroundColor: '#1f2937',
            borderTop: '1px solid #374151',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: '12px',
            zIndex: 49,
            paddingBottom: isMinimalMode ? 'env(safe-area-inset-bottom)' : 0,
          }}
        >
          {/* Clickable area to expand Now Playing modal */}
          <div 
            onClick={() => setIsNowPlayingOpen(true)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              flex: 1, 
              minWidth: 0,
              cursor: 'pointer',
            }}
          >
            {/* Source indicator */}
            <div 
              style={{ 
                width: '6px', 
                height: '40px', 
                backgroundColor: isQueuePlayback ? '#39FF14' : '#14b8a6', // Green for queue, teal for cassette
                borderRadius: '3px',
                flexShrink: 0,
              }} 
            />
            
            {/* Track info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayTrack.title}
              </div>
              <div style={{ color: '#9ca3af', fontSize: '12px' }}>
                {displayTrack.projectTitle}
              </div>
            </div>
          </div>

          {/* Controls - only show full controls for queue playback */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isQueuePlayback ? (
              <>
                <button
                  onClick={playPrevious}
                  disabled={currentQueueIndex === 0}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: currentQueueIndex === 0 ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: currentQueueIndex === 0 ? 0.3 : 1,
                  }}
                >
                  <SkipBack style={{ width: '20px', height: '20px', color: '#fff' }} />
                </button>
                
                <button
                  onClick={togglePlayPause}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#39FF14',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isPlaying ? (
                    <Pause style={{ width: '20px', height: '20px', color: '#000' }} />
                  ) : (
                    <Play style={{ width: '20px', height: '20px', color: '#000', marginLeft: '2px' }} />
                  )}
                </button>
                
                <button
                  onClick={playNext}
                  disabled={currentQueueIndex === queue.length - 1}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: currentQueueIndex === queue.length - 1 ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: currentQueueIndex === queue.length - 1 ? 0.3 : 1,
                  }}
                >
                  <SkipForward style={{ width: '20px', height: '20px', color: '#fff' }} />
                </button>

                <button
                  onClick={stopPlayback}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X style={{ width: '18px', height: '18px', color: '#9ca3af' }} />
                </button>
              </>
            ) : (
              // External playback (cassette) - just show playing indicator and dismiss button
              <>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: displayIsPlaying ? '#14b8a6' : '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {displayIsPlaying ? (
                    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                      <div style={{ width: '3px', height: '12px', backgroundColor: '#000', borderRadius: '1px', animation: 'pulse 0.6s ease-in-out infinite' }} />
                      <div style={{ width: '3px', height: '16px', backgroundColor: '#000', borderRadius: '1px', animation: 'pulse 0.6s ease-in-out infinite 0.1s' }} />
                      <div style={{ width: '3px', height: '10px', backgroundColor: '#000', borderRadius: '1px', animation: 'pulse 0.6s ease-in-out infinite 0.2s' }} />
                    </div>
                  ) : (
                    <Pause style={{ width: '20px', height: '20px', color: '#9ca3af' }} />
                  )}
                </div>

                <button
                  onClick={() => {
                    setExternalTrack(null)
                    setExternalIsPlaying(false)
                  }}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X style={{ width: '18px', height: '18px', color: '#9ca3af' }} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bottom Tab Bar - hidden on homepage and share pages */}
      {!isMinimalMode && (
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '70px',
          backgroundColor: '#111827',
          borderTop: '1px solid #374151',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 50,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = isActive(tab.href)

          if (tab.onClick) {
            return (
              <button
                key={tab.href}
                onClick={tab.onClick}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  height: '100%',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <div style={{ position: 'relative' }}>
                  <Icon
                    style={{
                      width: '24px',
                      height: '24px',
                      color: active ? '#39FF14' : '#9ca3af',
                      transition: 'color 0.2s',
                    }}
                  />
                  {tab.badge && tab.badge > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-10px',
                        backgroundColor: '#39FF14',
                        color: '#000',
                        fontSize: '10px',
                        fontWeight: 700,
                        minWidth: '18px',
                        height: '18px',
                        borderRadius: '9px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                      }}
                    >
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    marginTop: '4px',
                    color: active ? '#39FF14' : '#9ca3af',
                    fontWeight: active ? 600 : 400,
                    transition: 'color 0.2s',
                  }}
                >
                  {tab.label}
                </span>
              </button>
            )
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                height: '100%',
                textDecoration: 'none',
              }}
            >
              <Icon
                style={{
                  width: '24px',
                  height: '24px',
                  color: active ? '#39FF14' : '#9ca3af',
                  transition: 'color 0.2s',
                }}
              />
              <span
                style={{
                  fontSize: '11px',
                  marginTop: '4px',
                  color: active ? '#39FF14' : '#9ca3af',
                  fontWeight: active ? 600 : 400,
                  transition: 'color 0.2s',
                }}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </nav>
      )}

      {/* Now Playing Modal */}
      {isNowPlayingOpen && displayTrack && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsNowPlayingOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              zIndex: 100,
            }}
          />
          
          {/* Modal Content */}
          <div
            style={{
              position: 'fixed',
              bottom: isMobile ? 0 : '50%',
              left: isMobile ? 0 : '50%',
              right: isMobile ? 0 : 'auto',
              transform: isMobile ? 'none' : 'translate(-50%, 50%)',
              width: isMobile ? '100%' : '400px',
              maxHeight: isMobile ? '85vh' : '600px',
              backgroundColor: '#111827',
              borderRadius: isMobile ? '24px 24px 0 0' : '24px',
              zIndex: 101,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar for mobile */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px' }}>
              <div 
                onClick={() => setIsNowPlayingOpen(false)}
                style={{ 
                  width: '40px', 
                  height: '4px', 
                  backgroundColor: '#4B5563', 
                  borderRadius: '2px',
                  cursor: 'pointer',
                }} 
              />
            </div>

            {/* Album Art / Visual */}
            <div style={{ padding: '24px 32px', display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  width: '200px',
                  height: '200px',
                  borderRadius: '12px',
                  backgroundColor: '#1f2937',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  boxShadow: displayIsPlaying 
                    ? '0 0 40px rgba(57, 255, 20, 0.3)' 
                    : '0 10px 40px rgba(0, 0, 0, 0.3)',
                  transition: 'box-shadow 0.3s',
                }}
              >
                {(() => {
                  // Get cover URL based on what's actually playing
                  // If queue is playing, use queue track's cover; otherwise use cassette track's cover
                  const coverUrl = isQueuePlayback 
                    ? queueTrack?.projectCoverUrl
                    : cassetteTrack?.projectCoverUrl
                  
                  if (coverUrl) {
                    return (
                      <img 
                        src={coverUrl} 
                        alt="Album art"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )
                  }
                  return <ListMusic style={{ width: '64px', height: '64px', color: '#4B5563' }} />
                })()}
              </div>
            </div>

            {/* Track Info */}
            <div style={{ padding: '0 32px', textAlign: 'center' }}>
              <h2 style={{ 
                color: '#fff', 
                fontSize: '22px', 
                fontWeight: 600, 
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {displayTrack.title}
              </h2>
              <p style={{ 
                color: '#9ca3af', 
                fontSize: '16px', 
                margin: '8px 0 0 0',
              }}>
                {displayTrack.projectTitle}
              </p>
            </div>

            {/* Progress Bar */}
            <div style={{ padding: '24px 32px 16px' }}>
              <input
                type="range"
                min="0"
                max={cassetteDuration || 100}
                value={cassetteCurrentTime}
                onChange={(e) => {
                  const newTime = parseFloat(e.target.value)
                  if (cassetteTrack) {
                    window.dispatchEvent(new CustomEvent('demo-cassette-seek', {
                      detail: { time: newTime }
                    }))
                  } else if (audioRef.current) {
                    audioRef.current.currentTime = newTime
                  }
                }}
                style={{
                  width: '100%',
                  height: '6px',
                  borderRadius: '3px',
                  appearance: 'none',
                  background: `linear-gradient(to right, #39FF14 0%, #00D9FF ${(cassetteCurrentTime / (cassetteDuration || 1)) * 100}%, #374151 ${(cassetteCurrentTime / (cassetteDuration || 1)) * 100}%, #374151 100%)`,
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                  {formatTime(cassetteCurrentTime)}
                </span>
                <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                  {formatTime(cassetteDuration)}
                </span>
              </div>
            </div>

            {/* Playback Controls */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '24px',
              padding: '16px 32px 32px',
            }}>
              {/* Previous */}
              <button
                onClick={() => {
                  if (isQueuePlayback) {
                    playPrevious()
                  } else {
                    window.dispatchEvent(new Event('demo-cassette-previous'))
                  }
                }}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SkipBack style={{ width: '28px', height: '28px', color: '#fff' }} />
              </button>

              {/* Play/Pause */}
              <button
                onClick={() => {
                  if (isQueuePlayback) {
                    togglePlayPause()
                  } else if (displayIsPlaying) {
                    window.dispatchEvent(new Event('demo-cassette-pause'))
                  } else {
                    window.dispatchEvent(new Event('demo-cassette-resume'))
                  }
                }}
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '50%',
                  backgroundColor: '#39FF14',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(57, 255, 20, 0.4)',
                }}
              >
                {displayIsPlaying ? (
                  <Pause style={{ width: '32px', height: '32px', color: '#000' }} />
                ) : (
                  <Play style={{ width: '32px', height: '32px', color: '#000', marginLeft: '4px' }} />
                )}
              </button>

              {/* Next */}
              <button
                onClick={() => {
                  if (isQueuePlayback) {
                    playNext()
                  } else {
                    window.dispatchEvent(new Event('demo-cassette-next'))
                  }
                }}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SkipForward style={{ width: '28px', height: '28px', color: '#fff' }} />
              </button>
            </div>

            {/* Close button */}
            <div style={{ padding: '0 32px 32px' }}>
              <button
                onClick={() => setIsNowPlayingOpen(false)}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: '#374151',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {/* Queue Modal */}
      {isQueueOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsQueueOpen(false)}
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

          {/* Queue Panel */}
          <div
            style={{
              position: 'fixed',
              bottom: isMobile ? '70px' : '50%', // Account for tab bar on mobile
              left: isMobile ? 0 : '50%',
              right: isMobile ? 0 : 'auto',
              transform: isMobile ? 'none' : 'translate(-50%, 50%)',
              width: isMobile ? '100%' : '450px',
              maxWidth: '100%',
              maxHeight: isMobile ? 'calc(100vh - 140px)' : '600px', // Leave room for tab bar + some top space
              backgroundColor: '#111827',
              borderRadius: isMobile ? '16px 16px 0 0' : '16px',
              zIndex: 101,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #374151',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ListMusic style={{ width: '24px', height: '24px', color: '#39FF14' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', margin: 0 }}>
                  Queue
                </h2>
                {queue.length > 0 && (
                  <span style={{ fontSize: '14px', color: '#9ca3af' }}>
                    ({queue.length} {queue.length === 1 ? 'track' : 'tracks'})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {queue.length > 0 && (
                  <button
                    onClick={clearQueue}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'transparent',
                      color: '#ef4444',
                      border: '1px solid #ef4444',
                      borderRadius: '8px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => setIsQueueOpen(false)}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: '#374151',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X style={{ width: '20px', height: '20px', color: '#fff' }} />
                </button>
              </div>
            </div>

            {/* Queue Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {queue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <ListMusic style={{ width: '48px', height: '48px', color: '#4b5563', margin: '0 auto 16px' }} />
                  <p style={{ color: '#9ca3af', fontSize: '16px', marginBottom: '8px' }}>
                    Your queue is empty
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '14px' }}>
                    Add tracks from the three-dot menu
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {queue.map((item, index) => {
                    const isCurrentTrack = currentQueueIndex === index
                    return (
                      <div
                        key={item.id}
                        onClick={() => playQueue(index)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '12px 16px',
                          backgroundColor: isCurrentTrack ? '#374151' : '#1f2937',
                          borderRadius: '12px',
                          gap: '12px',
                          cursor: 'pointer',
                          borderLeft: isCurrentTrack ? '3px solid #39FF14' : '3px solid transparent',
                          transition: 'background-color 0.2s',
                        }}
                        className="hover:bg-gray-700"
                      >
                        <span style={{ 
                          color: isCurrentTrack ? '#39FF14' : '#6b7280', 
                          fontSize: '14px', 
                          minWidth: '24px',
                          fontWeight: isCurrentTrack ? 600 : 400,
                        }}>
                          {isCurrentTrack && isPlaying ? '▶' : index + 1}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ 
                            color: isCurrentTrack ? '#39FF14' : '#fff', 
                            fontSize: '14px', 
                            fontWeight: 500, 
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis' 
                          }}>
                            {item.title}
                          </div>
                          <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '2px' }}>
                            {item.projectTitle}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeFromQueue(item.id)
                          }}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          className="hover:bg-gray-600"
                        >
                          <Trash2 style={{ width: '16px', height: '16px', color: '#9ca3af' }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer with play button */}
            {queue.length > 0 && (
              <div style={{ padding: '16px', borderTop: '1px solid #374151' }}>
                <button
                  onClick={() => playQueue(0)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: '#39FF14',
                    color: '#000',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Play style={{ width: '20px', height: '20px' }} />
                  Play Queue
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Notifications Modal */}
      {isNotificationsOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsNotificationsOpen(false)}
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

          {/* Notifications Panel */}
          <div
            style={{
              position: 'fixed',
              bottom: isMobile ? '70px' : '50%',
              left: isMobile ? 0 : '50%',
              right: isMobile ? 0 : 'auto',
              transform: isMobile ? 'none' : 'translate(-50%, 50%)',
              width: isMobile ? '100%' : '420px',
              maxWidth: '100%',
              maxHeight: isMobile ? 'calc(100vh - 140px)' : '600px',
              backgroundColor: '#0f172a',
              borderRadius: isMobile ? '16px 16px 0 0' : '16px',
              zIndex: 101,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #1f2937',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 18px',
                borderBottom: '1px solid #374151',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Bell style={{ width: '24px', height: '24px', color: '#39FF14' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', margin: 0 }}>
                  Notifications
                </h2>
                {unreadNotificationCount > 0 && (
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#d1d5db',
                      border: '1px solid rgba(57, 255, 20, 0.45)',
                      backgroundColor: 'rgba(57, 255, 20, 0.14)',
                      borderRadius: '999px',
                      padding: '3px 8px',
                      fontWeight: 600,
                    }}
                  >
                    {unreadNotificationCount} unread
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {unreadNotificationCount > 0 && (
                  <button
                    onClick={() => markNotificationsAsRead()}
                    aria-label="Mark all notifications as read"
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'transparent',
                      color: '#39FF14',
                      border: '1px solid #39FF14',
                      borderRadius: '8px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setIsNotificationsOpen(false)}
                  aria-label="Close notifications panel"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    backgroundColor: '#1f2937',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X style={{ width: '20px', height: '20px', color: '#fff' }} />
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderBottom: '1px solid #1f2937',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => updateNotificationDigestMode('instant')}
                  aria-label="Set notification delivery to instant"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '9px',
                    border: '1px solid',
                    borderColor: notificationDeliveryMode === 'instant' ? '#39FF14' : '#374151',
                    color: notificationDeliveryMode === 'instant' ? '#39FF14' : '#9ca3af',
                    backgroundColor: 'transparent',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Instant
                </button>
                <button
                  onClick={() => updateNotificationDigestMode('digest')}
                  aria-label="Set notification delivery to digest"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '9px',
                    border: '1px solid',
                    borderColor: notificationDeliveryMode === 'digest' ? '#39FF14' : '#374151',
                    color: notificationDeliveryMode === 'digest' ? '#39FF14' : '#9ca3af',
                    backgroundColor: 'transparent',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Digest
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  disabled={notificationDeliveryMode !== 'digest'}
                  onClick={() => updateNotificationDigestMode(notificationDeliveryMode, 'daily')}
                  aria-label="Set digest schedule to daily"
                  style={{
                    padding: '4px 8px',
                    borderRadius: '9px',
                    border: '1px solid',
                    borderColor: notificationDigestWindow === 'daily' ? '#39FF14' : '#374151',
                    color: notificationDigestWindow === 'daily' ? '#39FF14' : '#9ca3af',
                    backgroundColor: 'transparent',
                    fontSize: '11px',
                    cursor: notificationDeliveryMode === 'digest' ? 'pointer' : 'default',
                    opacity: notificationDeliveryMode === 'digest' ? 1 : 0.5,
                  }}
                >
                  Daily
                </button>
                <button
                  disabled={notificationDeliveryMode !== 'digest'}
                  onClick={() => updateNotificationDigestMode(notificationDeliveryMode, 'weekly')}
                  aria-label="Set digest schedule to weekly"
                  style={{
                    padding: '4px 8px',
                    borderRadius: '9px',
                    border: '1px solid',
                    borderColor: notificationDigestWindow === 'weekly' ? '#39FF14' : '#374151',
                    color: notificationDigestWindow === 'weekly' ? '#39FF14' : '#9ca3af',
                    backgroundColor: 'transparent',
                    fontSize: '11px',
                    cursor: notificationDeliveryMode === 'digest' ? 'pointer' : 'default',
                    opacity: notificationDeliveryMode === 'digest' ? 1 : 0.5,
                  }}
                >
                  Weekly
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 16px',
                borderBottom: '1px solid #1f2937',
              }}
            >
              <button
                onClick={() => {
                  const next = !unreadPriorityEnabled
                  setUnreadPriorityEnabled(next)
                  if (next) emitNotificationControlEvent('open_unread_priority')
                }}
                aria-label={unreadPriorityEnabled ? 'Disable unread priority ordering' : 'Enable unread priority ordering'}
                style={{
                  padding: '5px 9px',
                    borderRadius: '9px',
                  border: '1px solid',
                  borderColor: unreadPriorityEnabled ? '#39FF14' : '#374151',
                  color: unreadPriorityEnabled ? '#39FF14' : '#9ca3af',
                  backgroundColor: 'transparent',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Unread Priority {unreadPriorityEnabled ? 'On' : 'Off'}
              </button>
              <button
                onClick={() => {
                  const next = !showSnoozed
                  setShowSnoozed(next)
                  if (next) emitNotificationControlEvent('view_snoozed')
                }}
                aria-label={showSnoozed ? 'Hide snoozed notifications' : 'Show snoozed notifications'}
                style={{
                  padding: '5px 9px',
                  borderRadius: '9px',
                  border: '1px solid #374151',
                  color: '#9ca3af',
                  backgroundColor: 'transparent',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {showSnoozed ? 'Hide Snoozed' : `Show Snoozed (${snoozedNotifications.length})`}
              </button>
            </div>

            {/* Notifications Content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {notificationsLoading && activeNotifications.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px' }}>
                  <div style={{ 
                    width: '24px', 
                    height: '24px', 
                    border: '2px solid #39FF14',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                </div>
              ) : activeNotifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <Bell style={{ width: '48px', height: '48px', color: '#4b5563', margin: '0 auto 16px' }} />
                  <p style={{ color: '#9ca3af', fontSize: '16px', marginBottom: '8px' }}>
                    {snoozedNotifications.length > 0 ? 'All notifications are snoozed' : 'No notifications yet'}
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '14px' }}>
                    {snoozedNotifications.length > 0
                      ? 'Use "Show Snoozed" to manage hidden items.'
                      : 'You&apos;ll be notified when you receive tips'}
                  </p>
                </div>
              ) : (
                <div>
                  {notificationDeliveryMode === 'digest' ? (
                    <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid #1f2937' }}>
                      <p style={{ color: '#9ca3af', fontSize: '11px', margin: '0 0 8px 4px', textTransform: 'uppercase' }}>
                        Digest summary
                      </p>
                      {digestLoading ? (
                        <p style={{ color: '#6b7280', fontSize: '12px', padding: '0 4px 6px' }}>Loading digest...</p>
                      ) : digestGroups.length === 0 ? (
                        <p style={{ color: '#6b7280', fontSize: '12px', padding: '0 4px 6px' }}>No digest groups in this window.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {digestGroups.map((group) => (
                            <button
                              key={group.id}
                              onClick={() => {
                                emitNotificationDigestEvent('digest_click', {
                                  groupType: group.group_type,
                                  groupedCount: group.grouped_count,
                                })
                                if (group.target_path) {
                                  setIsNotificationsOpen(false)
                                  router.push(group.target_path)
                                }
                              }}
                              style={{
                                border: '1px solid #374151',
                                borderRadius: '12px',
                                backgroundColor: '#111827',
                                padding: '10px 12px',
                                color: '#e5e7eb',
                                textAlign: 'left',
                                cursor: group.target_path ? 'pointer' : 'default',
                              }}
                            >
                              <div style={{ fontSize: '13px', fontWeight: 500 }}>{group.title}</div>
                              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                                {group.grouped_count} grouped • {formatNotificationTime(group.latest_created_at)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                  {activeNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      style={{
                        padding: '14px 16px',
                        borderBottom: '1px solid #1f2937',
                        backgroundColor: !notification.is_read ? 'rgba(57, 255, 20, 0.06)' : 'transparent',
                        borderLeft: !notification.is_read ? '2px solid rgba(57, 255, 20, 0.45)' : '2px solid transparent',
                        transition: 'background-color 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        {(() => {
                          const normalizedType = normalizeNotificationType(notification.type)
                          const targetPath = getNotificationTargetPath(notification)
                          const primaryText = getNotificationPrimaryText(notification)
                          const isAccessInvite = isProjectAccessInviteNotification(notification)
                          const followerName =
                            normalizedType === 'new_follower'
                              ? getFollowerNotificationName(notification)
                              : null

                          return (
                            <>
                        {/* Icon */}
                        <div style={{
                          padding: '8px',
                          borderRadius: '50%',
                          backgroundColor: normalizedType === 'new_follower' || isAccessInvite ? 'rgba(57, 255, 20, 0.15)' : '#1f2937',
                          border: normalizedType === 'new_follower' || isAccessInvite ? '1px solid rgba(57, 255, 20, 0.35)' : '1px solid transparent',
                          flexShrink: 0,
                        }}>
                          {getNotificationIcon(normalizedType, isAccessInvite)}
                        </div>
                        
                        {/* Content */}
                        <button
                          onClick={() => {
                            if (targetPath) handleNotificationClick(notification)
                          }}
                          disabled={!targetPath}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            border: 'none',
                            background: 'transparent',
                            textAlign: 'left',
                            padding: 0,
                            cursor: targetPath ? 'pointer' : 'default',
                          }}
                        >
                          <p style={{ color: '#9ca3af', fontSize: '11px', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {isAccessInvite ? 'Private Access' : getNotificationTypeLabel(normalizedType)}
                          </p>
                          <p style={{ 
                            color: !notification.is_read ? '#fff' : '#d1d5db',
                            fontSize: '14px',
                            fontWeight: !notification.is_read ? 500 : 400,
                            margin: 0,
                            lineHeight: 1.4,
                          }}>
                            {primaryText}
                          </p>
                          {normalizedType === 'new_follower' ? (
                            <p style={{ color: '#9ca3af', fontSize: '12px', margin: '4px 0 0 0' }}>
                              {followerName ? `From @${followerName.replace(/\s+/g, '').toLowerCase()} ` : 'New follower '}• {formatNotificationTime(notification.created_at)}
                            </p>
                          ) : notification.message && (
                            <p style={{ 
                              color: '#9ca3af',
                              fontSize: '13px',
                              margin: '4px 0 0 0',
                              fontStyle: 'italic',
                            }}>
                              &quot;{notification.message}&quot;
                            </p>
                          )}
                          {normalizedType !== 'new_follower' && (
                            <p style={{ 
                              color: '#9ca3af',
                              fontSize: '12px',
                              margin: '6px 0 0 0',
                            }}>
                              {formatNotificationTime(notification.created_at)}
                            </p>
                          )}
                        </button>
                        
                        {/* Actions */}
                          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => snoozeNotificationScope(notification, '24h')}
                            aria-label="Snooze notification for 24 hours"
                            style={{
                                padding: '6px 9px',
                                borderRadius: '9px',
                              backgroundColor: 'transparent',
                              border: '1px solid #374151',
                                color: '#d1d5db',
                              cursor: 'pointer',
                              fontSize: '11px',
                              lineHeight: 1.2,
                            }}
                            title="Snooze this group for 24h"
                          >
                            24h
                          </button>
                          <button
                            onClick={() => snoozeNotificationScope(notification, '7d')}
                            aria-label="Snooze notification for 7 days"
                            style={{
                                padding: '6px 9px',
                                borderRadius: '9px',
                              backgroundColor: 'transparent',
                              border: '1px solid #374151',
                                color: '#d1d5db',
                              cursor: 'pointer',
                              fontSize: '11px',
                              lineHeight: 1.2,
                            }}
                            title="Snooze this group for 7d"
                          >
                            7d
                          </button>
                          {targetPath && (
                            <button
                              onClick={() => handleNotificationClick(notification)}
                              aria-label="Open notification"
                              style={{
                                padding: '6px 10px',
                                borderRadius: '9px',
                                backgroundColor: '#162032',
                                border: '1px solid #2b3646',
                                color: '#e5e7eb',
                                cursor: 'pointer',
                                fontSize: '11px',
                                lineHeight: 1.2,
                              }}
                              title="Open notification target"
                            >
                              Open
                            </button>
                          )}
                          {!notification.is_read && (
                            <button
                              onClick={() => markNotificationsAsRead([notification.id])}
                              aria-label="Mark this notification as read"
                              style={{
                                padding: '6px',
                                borderRadius: '8px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                              }}
                              title="Mark as read"
                            >
                              <Check style={{ width: '14px', height: '14px', color: '#9ca3af' }} />
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notification.id)}
                            aria-label="Delete this notification"
                            style={{
                              padding: '6px',
                              borderRadius: '8px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                            title="Delete"
                          >
                            <Trash style={{ width: '14px', height: '14px', color: '#9ca3af' }} />
                          </button>
                        </div>
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  ))}

                  {showSnoozed && snoozedNotifications.length > 0 ? (
                    <div style={{ borderTop: '1px solid #1f2937' }}>
                      <p
                        style={{
                          color: '#9ca3af',
                          fontSize: '11px',
                          margin: 0,
                          padding: '12px 20px 6px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Snoozed
                      </p>
                      {snoozedNotifications.map((notification) => {
                        const scopeKey = getNotificationSnoozeScopeKey(notification)
                        return (
                          <div
                            key={`snoozed-${notification.id}`}
                            style={{
                              padding: '12px 16px',
                              borderBottom: '1px solid #1f2937',
                              opacity: 0.85,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                              <p style={{ color: '#d1d5db', fontSize: '13px', margin: 0 }}>
                                {getNotificationPrimaryText(notification)}
                              </p>
                              <button
                                onClick={() => unsnoozeScope(scopeKey)}
                                aria-label="Unsnooze this notification group"
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '8px',
                                  backgroundColor: 'transparent',
                                  border: '1px solid #374151',
                                  color: '#9ca3af',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                }}
                              >
                                Unsnooze
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Spacer to prevent content from being hidden behind tab bar + mini player */}
      {!isMinimalMode && (
        <div style={{ height: displayTrack ? '130px' : '70px' }} />
      )}
      {/* Spacer for minimal mode - only when mini player is showing */}
      {isMinimalMode && displayTrack && (
        <div style={{ height: '60px' }} />
      )}
    </>
  )
}

// Helper function to add items to queue (can be imported by other components)
export function addToQueue(item: { id: string; title: string; projectTitle: string; audioUrl: string; projectCoverUrl?: string | null }) {
  const savedQueue = localStorage.getItem('demo-queue')
  let queue: QueueItem[] = []
  
  if (savedQueue) {
    try {
      queue = JSON.parse(savedQueue)
    } catch (e) {
      console.error('Failed to parse queue:', e)
    }
  }

  // Check if already in queue
  if (queue.some(q => q.id === item.id)) {
    return false // Already in queue
  }

  queue.push({
    ...item,
    projectCoverUrl: item.projectCoverUrl || null,
    addedAt: Date.now(),
  })

  localStorage.setItem('demo-queue', JSON.stringify(queue))
  window.dispatchEvent(new Event('demo-queue-updated'))
  return true
}

