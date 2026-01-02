'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home, ListMusic, User, X, Play, Pause, Trash2, SkipForward, SkipBack } from 'lucide-react'
import { usePrivy } from '@privy-io/react-auth'
import { showToast } from './Toast'

interface QueueItem {
  id: string
  title: string
  projectTitle: string
  audioUrl: string
  addedAt: number
}

export default function BottomTabBar() {
  const pathname = usePathname()
  const { authenticated, ready } = usePrivy()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  
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
  
  // Legacy compatibility
  const externalTrack = cassetteTrack
  const externalIsPlaying = cassetteIsPlaying
  const setExternalTrack = setCassetteTrack
  const setExternalIsPlaying = setCassetteIsPlaying

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Load queue from localStorage
  useEffect(() => {
    const savedQueue = localStorage.getItem('hubba-queue')
    if (savedQueue) {
      try {
        setQueue(JSON.parse(savedQueue))
      } catch (e) {
        console.error('Failed to parse queue:', e)
      }
    }

    // Listen for queue updates from other components
    const handleQueueUpdate = () => {
      const updated = localStorage.getItem('hubba-queue')
      if (updated) {
        try {
          setQueue(JSON.parse(updated))
        } catch (e) {
          console.error('Failed to parse queue:', e)
        }
      }
    }

    window.addEventListener('hubba-queue-updated', handleQueueUpdate)
    return () => window.removeEventListener('hubba-queue-updated', handleQueueUpdate)
  }, [])

  // Save queue to localStorage
  const saveQueue = (newQueue: QueueItem[]) => {
    setQueue(newQueue)
    localStorage.setItem('hubba-queue', JSON.stringify(newQueue))
    window.dispatchEvent(new Event('hubba-queue-updated'))
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
    
    if (audioRef.current) {
      audioRef.current.src = track.audioUrl
      audioRef.current.load()
      audioRef.current.play().then(() => {
        setCassetteIsPlaying(true)
        // Notify cassette UI that playback started
        window.dispatchEvent(new CustomEvent('hubba-playback-state', {
          detail: { isPlaying: true, trackId: track.id }
        }))
      }).catch(err => {
        console.error('Error playing cassette track:', err)
        showToast('Failed to play track', 'error')
      })
    }
  }

  const pauseCassettePlayback = () => {
    if (audioRef.current && cassetteTrack) {
      audioRef.current.pause()
      setCassetteIsPlaying(false)
      window.dispatchEvent(new CustomEvent('hubba-playback-state', {
        detail: { isPlaying: false, trackId: cassetteTrack.id }
      }))
    }
  }

  const resumeCassettePlayback = () => {
    if (audioRef.current && cassetteTrack) {
      audioRef.current.play().then(() => {
        setCassetteIsPlaying(true)
        window.dispatchEvent(new CustomEvent('hubba-playback-state', {
          detail: { isPlaying: true, trackId: cassetteTrack.id }
        }))
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

    window.addEventListener('hubba-cassette-play', handlePlayRequest as EventListener)
    window.addEventListener('hubba-cassette-pause', handlePauseRequest)
    window.addEventListener('hubba-cassette-resume', handleResumeRequest)
    window.addEventListener('hubba-cassette-seek', handleSeekRequest as EventListener)
    window.addEventListener('hubba-cassette-next', handleNextRequest)
    window.addEventListener('hubba-cassette-previous', handlePreviousRequest)
    window.addEventListener('hubba-global-playback', handleGlobalPlayback as EventListener)
    window.addEventListener('hubba-volume-change', handleVolumeChange as EventListener)
    
    return () => {
      window.removeEventListener('hubba-cassette-play', handlePlayRequest as EventListener)
      window.removeEventListener('hubba-cassette-pause', handlePauseRequest)
      window.removeEventListener('hubba-cassette-resume', handleResumeRequest)
      window.removeEventListener('hubba-cassette-seek', handleSeekRequest as EventListener)
      window.removeEventListener('hubba-cassette-next', handleNextRequest)
      window.removeEventListener('hubba-cassette-previous', handlePreviousRequest)
      window.removeEventListener('hubba-global-playback', handleGlobalPlayback as EventListener)
      window.removeEventListener('hubba-volume-change', handleVolumeChange as EventListener)
    }
  }, [cassetteTrack])

  // Broadcast time updates for cassette playback
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      if (cassetteTrack) {
        setCassetteCurrentTime(audio.currentTime)
        // Broadcast time update to cassette UI
        window.dispatchEvent(new CustomEvent('hubba-playback-time', {
          detail: { currentTime: audio.currentTime, duration: audio.duration || 0 }
        }))
      }
    }

    const handleDurationChange = () => {
      if (cassetteTrack) {
        setCassetteDuration(audio.duration || 0)
      }
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
        window.dispatchEvent(new CustomEvent('hubba-playback-state', {
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
    window.dispatchEvent(new CustomEvent('hubba-global-playback', {
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

  // Determine if we should show the full UI (but always keep audio element mounted)
  const showFullUI = ready && authenticated && pathname !== '/' && !pathname?.startsWith('/share/')
  
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
    { href: '#queue', icon: ListMusic, label: 'Queue', onClick: () => setIsQueueOpen(true), badge: queue.length },
    { href: '/account', icon: User, label: 'Account' },
  ]

  const isActive = (href: string) => {
    if (href === '#queue') return isQueueOpen
    if (href === '/dashboard') return pathname === '/dashboard' || pathname?.startsWith('/dashboard/')
    return pathname === href
  }

  // Determine what track to show in mini player
  const queueTrack = currentQueueIndex !== null ? queue[currentQueueIndex] : null
  const displayTrack = queueTrack || externalTrack
  const displayIsPlaying = queueTrack ? isPlaying : externalIsPlaying
  const isQueuePlayback = queueTrack !== null

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
export function addToQueue(item: { id: string; title: string; projectTitle: string; audioUrl: string }) {
  const savedQueue = localStorage.getItem('hubba-queue')
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
    addedAt: Date.now(),
  })

  localStorage.setItem('hubba-queue', JSON.stringify(queue))
  window.dispatchEvent(new Event('hubba-queue-updated'))
  return true
}

