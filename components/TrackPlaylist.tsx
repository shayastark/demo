'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward, Repeat, Volume2, MoreVertical, Edit, Download, ListPlus, Trash2 } from 'lucide-react'
import CassettePlayer from './CassettePlayer'
import AudioVisualizer from './AudioVisualizer'
import { Track } from '@/lib/types'
import { showToast } from './Toast'
import { addToQueue } from './BottomTabBar'

// Unique ID for this component instance
let instanceId = 0

interface TrackPlaylistProps {
  tracks: Track[]
  projectCoverUrl?: string | null
  projectTitle: string
  onTrackPlay?: (trackId: string) => void
  isCreator?: boolean
  allowDownloads?: boolean
  onEditTrack?: (track: Track) => void
  onDeleteTrack?: (trackId: string) => void
  onMenuOpen?: () => void // Called when a track menu opens, so parent can close its menu
  forceCloseMenu?: boolean // When true, close any open track menu
}

export default function TrackPlaylist({ 
  tracks, 
  projectCoverUrl, 
  projectTitle,
  onTrackPlay,
  isCreator = false,
  allowDownloads = true,
  onEditTrack,
  onDeleteTrack,
  onMenuOpen,
  forceCloseMenu
}: TrackPlaylistProps) {
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRepeat, setIsRepeat] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null)
  const [downloadedTracks, setDownloadedTracks] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const componentIdRef = useRef<number>(0)

  // Initialize unique ID for this component instance
  useEffect(() => {
    componentIdRef.current = ++instanceId
  }, [])

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const currentTrack = currentTrackIndex !== null ? tracks[currentTrackIndex] : null

  // Track which track ID is currently playing from this component
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null)

  // Listen for playback state updates from the global player
  useEffect(() => {
    const handlePlaybackState = (e: CustomEvent) => {
      const { isPlaying: playing, trackId, ended } = e.detail
      
      // Check if this update is for one of our tracks
      const trackIndex = tracks.findIndex(t => t.id === trackId)
      if (trackIndex !== -1) {
        setActiveTrackId(trackId)
        setCurrentTrackIndex(trackIndex)
        setIsPlaying(playing)
        if (ended && !isRepeat) {
          // Track ended, move to next or stop
          const nextIndex = trackIndex + 1
          if (nextIndex < tracks.length) {
            playTrackAtIndex(nextIndex)
          } else {
            setCurrentTrackIndex(null)
            setActiveTrackId(null)
            setIsPlaying(false)
          }
        } else if (ended && isRepeat) {
          // Repeat the same track
          playTrackAtIndex(trackIndex)
        }
      } else {
        // This update is for a track NOT in our project - reset our state
        if (activeTrackId && !tracks.find(t => t.id === activeTrackId)) {
          // The active track is no longer in our list (different project)
          setCurrentTrackIndex(null)
          setActiveTrackId(null)
          setIsPlaying(false)
          setCurrentTime(0)
          setDuration(0)
        }
      }
    }

    const handlePlaybackTime = (e: CustomEvent) => {
      const { currentTime: time, duration: dur, trackId } = e.detail
      
      // Only update time if the playing track belongs to this project
      if (trackId && tracks.find(t => t.id === trackId)) {
        setCurrentTime(time)
        setDuration(dur)
      } else if (activeTrackId && tracks.find(t => t.id === activeTrackId)) {
        // Fallback: if no trackId in event but we have an active track in this project
        setCurrentTime(time)
        setDuration(dur)
      }
    }

    // Listen for when queue starts playing (stop our display)
    const handleGlobalPlayback = (e: CustomEvent) => {
      const { source } = e.detail
      if (source === 'queue') {
        setIsPlaying(false)
        setCurrentTrackIndex(null)
        setActiveTrackId(null)
        setCurrentTime(0)
        setDuration(0)
      }
    }

    window.addEventListener('demo-playback-state', handlePlaybackState as EventListener)
    window.addEventListener('demo-playback-time', handlePlaybackTime as EventListener)
    window.addEventListener('demo-global-playback', handleGlobalPlayback as EventListener)
    
    return () => {
      window.removeEventListener('demo-playback-state', handlePlaybackState as EventListener)
      window.removeEventListener('demo-playback-time', handlePlaybackTime as EventListener)
      window.removeEventListener('demo-global-playback', handleGlobalPlayback as EventListener)
    }
  }, [tracks, isRepeat, activeTrackId])

  // Reset state when tracks change (navigating to different project)
  useEffect(() => {
    // Check if our active track is still in the tracks list
    if (activeTrackId && !tracks.find(t => t.id === activeTrackId)) {
      setCurrentTrackIndex(null)
      setActiveTrackId(null)
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
    }
  }, [tracks, activeTrackId])

  // Close menu when parent requests it
  useEffect(() => {
    if (forceCloseMenu) {
      setOpenMenuIndex(null)
    }
  }, [forceCloseMenu])

  // Play a track by dispatching to the global player
  const playTrackAtIndex = useCallback((index: number) => {
    const track = tracks[index]
    if (!track) return

    setCurrentTrackIndex(index)
    
    // Dispatch play request to global player
    window.dispatchEvent(new CustomEvent('demo-cassette-play', {
      detail: {
        track: {
          id: track.id,
          title: track.title,
          audioUrl: track.audio_url,
        },
        tracks: tracks.map(t => ({ id: t.id, title: t.title, audio_url: t.audio_url })),
        currentIndex: index,
        projectTitle,
        projectCoverUrl,
      }
    }))

    if (onTrackPlay) {
      onTrackPlay(track.id)
    }
  }, [tracks, projectTitle, projectCoverUrl, onTrackPlay])

  const handleTrackClick = (index: number) => {
    if (currentTrackIndex === index && isPlaying) {
      // Pause if same track is playing
      window.dispatchEvent(new Event('demo-cassette-pause'))
      setIsPlaying(false)
    } else if (currentTrackIndex === index && !isPlaying) {
      // Resume if same track is paused
      window.dispatchEvent(new Event('demo-cassette-resume'))
      setIsPlaying(true)
    } else {
      // Play new track
      playTrackAtIndex(index)
    }
  }

  const togglePlay = () => {
    if (currentTrackIndex === null && tracks.length > 0) {
      // If no track selected, start with first track
      playTrackAtIndex(0)
      return
    }

    if (isPlaying) {
      window.dispatchEvent(new Event('demo-cassette-pause'))
      setIsPlaying(false)
    } else {
      window.dispatchEvent(new Event('demo-cassette-resume'))
      setIsPlaying(true)
    }
  }

  const handlePrevious = () => {
    if (currentTrackIndex === null) {
      if (tracks.length > 0) playTrackAtIndex(0)
      return
    }
    
    if (currentTime > 3) {
      // If more than 3 seconds in, restart current track
      window.dispatchEvent(new CustomEvent('demo-cassette-seek', {
        detail: { time: 0 }
      }))
      setCurrentTime(0)
    } else {
      // Go to previous track
      const newIndex = currentTrackIndex > 0 ? currentTrackIndex - 1 : tracks.length - 1
      playTrackAtIndex(newIndex)
    }
  }

  const handleNext = () => {
    if (currentTrackIndex === null) {
      if (tracks.length > 0) playTrackAtIndex(0)
      return
    }
    
    const newIndex = currentTrackIndex < tracks.length - 1 ? currentTrackIndex + 1 : 0
    playTrackAtIndex(newIndex)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    window.dispatchEvent(new CustomEvent('demo-cassette-seek', {
      detail: { time: newTime }
    }))
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    window.dispatchEvent(new CustomEvent('demo-volume-change', {
      detail: { volume: newVolume }
    }))
  }

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleDownload = async (track: Track) => {
    try {
      const response = await fetch(track.audio_url)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${track.title}.mp3`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      setDownloadedTracks(prev => new Set(prev).add(track.id))
      showToast(`Downloaded: ${track.title}`, 'success')
    } catch (error) {
      console.error('Download error:', error)
      showToast('Failed to download track', 'error')
    }
    setOpenMenuIndex(null)
  }

  const handleRemoveDownload = (track: Track) => {
    setDownloadedTracks(prev => {
      const newSet = new Set(prev)
      newSet.delete(track.id)
      return newSet
    })
    showToast(`Removed download: ${track.title}`, 'info')
    setOpenMenuIndex(null)
  }

  const handleAddToQueue = (track: Track) => {
    const added = addToQueue({
      id: track.id,
      title: track.title,
      projectTitle: projectTitle,
      audioUrl: track.audio_url,
      projectCoverUrl: projectCoverUrl,
    })
    
    if (added) {
      showToast(`Added to queue: ${track.title}`, 'success')
    } else {
      showToast(`Already in queue: ${track.title}`, 'info')
    }
    setOpenMenuIndex(null)
  }

  const handleEditClick = (track: Track) => {
    console.log('handleEditClick called with track:', track)
    if (onEditTrack) {
      console.log('Calling onEditTrack')
      onEditTrack(track)
    } else {
      console.log('onEditTrack is not defined')
    }
    setOpenMenuIndex(null)
  }

  const handleDeleteClick = (trackId: string) => {
    if (onDeleteTrack) {
      onDeleteTrack(trackId)
    }
    setOpenMenuIndex(null)
  }

  return (
    <div className="space-y-6">
      {/* Audio is now handled by the global player in BottomTabBar */}

      {/* Cassette Player with project cover */}
      <CassettePlayer
        coverImageUrl={projectCoverUrl}
        isPlaying={isPlaying}
        title={currentTrack?.title || projectTitle}
      />

      {/* Audio Visualizer - frequency bars */}
      <AudioVisualizer isPlaying={isPlaying} />

      {/* Transport Controls */}
      <div className="bg-gray-900 rounded-xl p-4" style={{ maxWidth: '320px', margin: '0 auto' }}>
        {/* Progress bar */}
        <div className="mb-4">
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #39FF14 0%, #00D9FF ${(currentTime / (duration || 1)) * 100}%, #374151 ${(currentTime / (duration || 1)) * 100}%, #374151 100%)`
            }}
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-center gap-4">
          {/* Repeat */}
          <button
            onClick={() => setIsRepeat(!isRepeat)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isRepeat ? '#39FF14' : '#1f2937',
              color: isRepeat ? '#000' : '#9ca3af',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            title={isRepeat ? 'Repeat On' : 'Repeat Off'}
          >
            <Repeat className="w-4 h-4" />
          </button>

          {/* Previous */}
          <button
            onClick={handlePrevious}
            className="w-12 h-12 rounded-full bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 transition"
            title="Previous"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:bg-gray-200 transition"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7" />
            ) : (
              <Play className="w-7 h-7 ml-1" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={handleNext}
            className="w-12 h-12 rounded-full bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 transition"
            title="Next"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Volume */}
          <div className="relative group">
            <button
              onClick={() => {
                // Toggle mute on click
                const newVolume = volume > 0 ? 0 : 1
                setVolume(newVolume)
                window.dispatchEvent(new CustomEvent('demo-volume-change', {
                  detail: { volume: newVolume }
                }))
              }}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#1f2937',
                color: volume === 0 ? '#ef4444' : '#9ca3af',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title={volume === 0 ? 'Unmute' : 'Mute'}
            >
              <Volume2 className="w-4 h-4" />
            </button>
            {/* Volume slider - shows on hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto shadow-lg">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                style={{ width: '80px', accentColor: '#39FF14' }}
              />
            </div>
          </div>
        </div>

        {/* Current track name */}
        {currentTrack && (
          <div className="text-center text-neon-green font-medium truncate" style={{ marginTop: '20px', marginBottom: '8px' }}>
            Now Playing: {currentTrack.title}
          </div>
        )}
      </div>

      {/* Track List */}
      <div className="bg-gray-900 rounded-xl overflow-visible">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white text-lg">{tracks.length} {tracks.length === 1 ? 'Track' : 'Tracks'}</h3>
        </div>
        <div className="py-2">
          {tracks.map((track, index) => {
            const isCurrentTrack = currentTrackIndex === index
            const isDownloaded = downloadedTracks.has(track.id)

            return (
              <div
                key={track.id}
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '8px',
                  margin: '4px 8px',
                  backgroundColor: isCurrentTrack ? 'rgba(57, 255, 20, 0.1)' : 'transparent',
                  borderLeft: isCurrentTrack ? '3px solid #39FF14' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
                className="hover:bg-gray-800/50"
              >
                {/* Track number */}
                <div 
                  className="flex items-center flex-shrink-0 cursor-pointer hover:opacity-80 transition"
                  style={{ marginRight: '24px', minWidth: '50px' }}
                  onClick={() => handleTrackClick(index)}
                >
                  <span style={{ 
                    color: isCurrentTrack ? '#39FF14' : '#6b7280',
                    fontSize: '16px',
                    fontWeight: isCurrentTrack ? 600 : 400,
                    minWidth: '24px',
                  }}>
                    {index + 1}
                  </span>
                  {isCurrentTrack && isPlaying && (
                    <div className="flex items-end gap-0.5 h-4 ml-2">
                      <div className="w-1 bg-neon-green animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
                      <div className="w-1 bg-neon-green animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
                      <div className="w-1 bg-neon-green animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>

                {/* Track info - clickable area */}
                <div 
                  style={{ 
                    flex: 1, 
                    minWidth: 0, 
                    overflow: 'hidden',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleTrackClick(index)}
                >
                  <div 
                    className="text-white text-xl font-medium"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}
                  >
                    {track.title}
                  </div>
                </div>

                {/* Three-dot menu button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (openMenuIndex === index) {
                      setOpenMenuIndex(null)
                    } else {
                      setOpenMenuIndex(index)
                      onMenuOpen?.() // Notify parent to close its menu
                    }
                  }}
                  style={{
                    width: '48px',
                    height: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    flexShrink: 0,
                    marginLeft: '12px',
                  }}
                  className="hover:bg-gray-700 transition text-gray-400 hover:text-white"
                >
                  <MoreVertical className="w-6 h-6" />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom Sheet Menu - Full width on mobile like ShareModal */}
      {openMenuIndex !== null && tracks[openMenuIndex] && (
        <>
          {/* Backdrop */}
          <div 
            onClick={() => setOpenMenuIndex(null)}
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
                {tracks[openMenuIndex].title}
              </h2>
            </div>

            {/* Menu Options */}
            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {isCreator && onEditTrack && openMenuIndex !== null && tracks[openMenuIndex] && (
                <button
                  onClick={() => {
                    const track = tracks[openMenuIndex]
                    if (track) {
                      handleEditClick(track)
                    }
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
                    <Edit style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Edit Track</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      Modify track details
                    </div>
                  </div>
                </button>
              )}
              
              {downloadedTracks.has(tracks[openMenuIndex].id) ? (
                <button
                  onClick={() => handleRemoveDownload(tracks[openMenuIndex])}
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
                    <Trash2 style={{ width: '22px', height: '22px', color: '#9ca3af' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Remove Download</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      Remove from offline storage
                    </div>
                  </div>
                </button>
              ) : (
                <button
                  onClick={() => allowDownloads && handleDownload(tracks[openMenuIndex])}
                  disabled={!allowDownloads}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    backgroundColor: '#1f2937',
                    color: allowDownloads ? '#fff' : '#6b7280',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 500,
                    cursor: allowDownloads ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    textAlign: 'left',
                    opacity: allowDownloads ? 1 : 0.5,
                  }}
                  className={allowDownloads ? "hover:bg-gray-700 transition" : ""}
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
                    <Download style={{ width: '22px', height: '22px', color: allowDownloads ? '#39FF14' : '#6b7280' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Download</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      {allowDownloads ? 'Save for offline listening' : 'Downloads disabled by creator'}
                    </div>
                  </div>
                </button>
              )}
              
              <button
                onClick={() => handleAddToQueue(tracks[openMenuIndex])}
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
                  <ListPlus style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Add to Queue</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    Play this track next
                  </div>
                </div>
              </button>

              {isCreator && onDeleteTrack && (
                <button
                  onClick={() => handleDeleteClick(tracks[openMenuIndex].id)}
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
                    <div style={{ fontWeight: 600 }}>Delete Track</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      Permanently remove this track
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* Cancel button */}
            <div style={{ padding: '12px 20px 20px' }}>
              <button
                onClick={() => setOpenMenuIndex(null)}
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
    </div>
  )
}
