'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward, Repeat, Volume2, MoreVertical, Edit, Download, ListPlus, Trash2 } from 'lucide-react'
import CassettePlayer from './CassettePlayer'
import SoundwaveVisualizer from './SoundwaveVisualizer'
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
  const audioRef = useRef<HTMLAudioElement | null>(null)
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

  // Dispatch event when playback starts from this component
  const notifyPlaybackStart = useCallback((track: Track) => {
    window.dispatchEvent(new CustomEvent('hubba-global-playback', {
      detail: {
        source: 'cassette',
        componentId: componentIdRef.current,
        track: {
          id: track.id,
          title: track.title,
          audioUrl: track.audio_url,
          projectTitle: projectTitle,
          projectCoverUrl: projectCoverUrl,
        }
      }
    }))
  }, [projectTitle, projectCoverUrl])

  // Listen for playback from other sources (queue player)
  useEffect(() => {
    const handleGlobalPlayback = (e: CustomEvent) => {
      const { source, componentId } = e.detail
      
      // If playback started from queue or a different cassette player, stop our playback
      if (source === 'queue' || (source === 'cassette' && componentId !== componentIdRef.current)) {
        const audio = audioRef.current
        if (audio && !audio.paused) {
          audio.pause()
          setIsPlaying(false)
        }
      }
    }

    window.addEventListener('hubba-global-playback', handleGlobalPlayback as EventListener)
    return () => window.removeEventListener('hubba-global-playback', handleGlobalPlayback as EventListener)
  }, [])

  // Close menu when parent requests it
  useEffect(() => {
    if (forceCloseMenu) {
      setOpenMenuIndex(null)
    }
  }, [forceCloseMenu])

  // Handle audio element events
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(audio.duration || 0)
    const handleEnded = () => {
      if (isRepeat) {
        audio.currentTime = 0
        audio.play()
      } else {
        handleNext()
      }
    }
    const handlePlay = () => {
      setIsPlaying(true)
      // Notify other players that we started playing
      const track = tracks[currentTrackIndex!]
      if (track) {
        notifyPlaybackStart(track)
      }
    }
    const handlePause = () => {
      setIsPlaying(false)
      // Notify mini-player that we paused
      window.dispatchEvent(new CustomEvent('hubba-global-pause'))
    }
    const handleCanPlay = () => {
      // Audio is ready to play
      if (currentTrackIndex !== null) {
        audio.play().catch(console.error)
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('canplay', handleCanPlay)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('canplay', handleCanPlay)
    }
  }, [isRepeat, currentTrackIndex, tracks.length])

  // Update audio source when track changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || currentTrackIndex === null) return

    const track = tracks[currentTrackIndex]
    if (track && track.audio_url) {
      audio.src = track.audio_url
      audio.load()
      
      if (onTrackPlay) {
        onTrackPlay(track.id)
      }
    }
  }, [currentTrackIndex, tracks])

  const handleTrackClick = (index: number) => {
    if (currentTrackIndex === index) {
      // Toggle play/pause if same track
      togglePlay()
    } else {
      // Play new track
      setCurrentTrackIndex(index)
    }
  }

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (currentTrackIndex === null && tracks.length > 0) {
      // If no track selected, start with first track
      setCurrentTrackIndex(0)
      return
    }

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(console.error)
    }
  }

  const handlePrevious = () => {
    if (currentTrackIndex === null) {
      if (tracks.length > 0) setCurrentTrackIndex(0)
      return
    }
    
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      // If more than 3 seconds in, restart current track
      audio.currentTime = 0
    } else {
      // Go to previous track
      const newIndex = currentTrackIndex > 0 ? currentTrackIndex - 1 : tracks.length - 1
      setCurrentTrackIndex(newIndex)
    }
  }

  const handleNext = () => {
    if (currentTrackIndex === null) {
      if (tracks.length > 0) setCurrentTrackIndex(0)
      return
    }
    
    const newIndex = currentTrackIndex < tracks.length - 1 ? currentTrackIndex + 1 : 0
    setCurrentTrackIndex(newIndex)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const newTime = parseFloat(e.target.value)
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
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
    })
    
    if (added) {
      showToast(`Added to queue: ${track.title}`, 'success')
    } else {
      showToast(`Already in queue: ${track.title}`, 'info')
    }
    setOpenMenuIndex(null)
  }

  const handleEditClick = (track: Track) => {
    if (onEditTrack) {
      onEditTrack(track)
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
      {/* Audio element */}
      <audio 
        ref={audioRef} 
        crossOrigin="anonymous"
        preload="metadata"
      />

      {/* Cassette Player with project cover */}
      <CassettePlayer
        coverImageUrl={projectCoverUrl}
        isPlaying={isPlaying}
        title={currentTrack?.title || projectTitle}
      />

      {/* Soundwave Visualizer */}
      <SoundwaveVisualizer
        audioElement={audioRef.current}
        isPlaying={isPlaying}
      />

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
                if (audioRef.current) {
                  if (volume > 0) {
                    audioRef.current.volume = 0
                    setVolume(0)
                  } else {
                    audioRef.current.volume = 1
                    setVolume(1)
                  }
                }
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
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => handleTrackClick(index)}
                >
                  <div className="text-white text-xl font-medium truncate">
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
                  className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-gray-700 transition text-gray-400 hover:text-white flex-shrink-0 ml-4"
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
              {isCreator && onEditTrack && (
                <button
                  onClick={() => handleEditClick(tracks[openMenuIndex])}
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
                  onClick={() => handleDownload(tracks[openMenuIndex])}
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
                    <Download style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Download</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      Save for offline listening
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
