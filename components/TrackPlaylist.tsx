'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, Repeat, Volume2, MoreVertical, Edit, Download, ListPlus, Trash2 } from 'lucide-react'
import CassettePlayer from './CassettePlayer'
import SoundwaveVisualizer from './SoundwaveVisualizer'
import { Track } from '@/lib/types'
import { showToast } from './Toast'

interface TrackPlaylistProps {
  tracks: Track[]
  projectCoverUrl?: string | null
  projectTitle: string
  onTrackPlay?: (trackId: string) => void
  isCreator?: boolean
  onEditTrack?: (track: Track) => void
  onDeleteTrack?: (trackId: string) => void
}

export default function TrackPlaylist({ 
  tracks, 
  projectCoverUrl, 
  projectTitle,
  onTrackPlay,
  isCreator = false,
  onEditTrack,
  onDeleteTrack
}: TrackPlaylistProps) {
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRepeat, setIsRepeat] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null)
  const [downloadedTracks, setDownloadedTracks] = useState<Set<string>>(new Set())
  const audioRef = useRef<HTMLAudioElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentTrack = currentTrackIndex !== null ? tracks[currentTrackIndex] : null

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuIndex(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
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
    // For now, just show a toast - queue functionality can be expanded later
    showToast(`Added to queue: ${track.title}`, 'success')
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
            className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
              isRepeat 
                ? 'bg-neon-green text-black' 
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title="Repeat"
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
              className="w-10 h-10 rounded-full bg-gray-800 text-gray-400 flex items-center justify-center hover:text-white hover:bg-gray-700 transition"
              title="Volume"
            >
              <Volume2 className="w-4 h-4" />
            </button>
            {/* Volume slider - shows on hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 rounded-lg appearance-none cursor-pointer accent-neon-green"
              />
            </div>
          </div>
        </div>

        {/* Current track name */}
        {currentTrack && (
          <div className="text-center mt-4 text-neon-green font-medium truncate">
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
                className={`px-5 py-5 flex items-center hover:bg-gray-800/50 transition rounded-lg mx-2 my-1 ${
                  isCurrentTrack ? 'bg-gray-800/30' : ''
                }`}
              >
                {/* Track number */}
                <div 
                  className="w-10 flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-80 transition"
                  style={{ marginRight: '24px' }}
                  onClick={() => handleTrackClick(index)}
                >
                  {isCurrentTrack && isPlaying ? (
                    <div className="flex items-end gap-0.5 h-5">
                      <div className="w-1 bg-neon-green animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
                      <div className="w-1 bg-neon-green animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
                      <div className="w-1 bg-neon-green animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <span className="text-gray-500 text-lg">{index + 1}</span>
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
                    setOpenMenuIndex(openMenuIndex === index ? null : index)
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

      {/* Bottom Sheet Menu - Rendered at root level */}
      {openMenuIndex !== null && tracks[openMenuIndex] && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpenMenuIndex(null)}
          />
          {/* Bottom Tray Container */}
          <div className="relative w-full max-w-lg mx-4 mb-4 bg-gray-900 rounded-2xl shadow-2xl overflow-hidden animate-slideUp">
            {/* Header with handle bar */}
            <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
              <div className="flex justify-center mb-2">
                <div className="w-10 h-1 bg-gray-600 rounded-full" />
              </div>
              <p className="text-base text-white font-medium truncate text-center">{tracks[openMenuIndex].title}</p>
            </div>

            {/* Menu options */}
            <div className="py-2">
              {isCreator && onEditTrack && (
                <button
                  onClick={() => handleEditClick(tracks[openMenuIndex])}
                  className="w-full px-5 py-4 text-left text-white hover:bg-gray-800 active:bg-gray-700 flex items-center gap-4 transition"
                >
                  <Edit className="w-5 h-5 text-gray-400" />
                  <span className="text-base">Edit Track</span>
                </button>
              )}
              
              {downloadedTracks.has(tracks[openMenuIndex].id) ? (
                <button
                  onClick={() => handleRemoveDownload(tracks[openMenuIndex])}
                  className="w-full px-5 py-4 text-left text-white hover:bg-gray-800 active:bg-gray-700 flex items-center gap-4 transition"
                >
                  <Trash2 className="w-5 h-5 text-gray-400" />
                  <span className="text-base">Remove Download</span>
                </button>
              ) : (
                <button
                  onClick={() => handleDownload(tracks[openMenuIndex])}
                  className="w-full px-5 py-4 text-left text-white hover:bg-gray-800 active:bg-gray-700 flex items-center gap-4 transition"
                >
                  <Download className="w-5 h-5 text-gray-400" />
                  <span className="text-base">Download</span>
                </button>
              )}
              
              <button
                onClick={() => handleAddToQueue(tracks[openMenuIndex])}
                className="w-full px-5 py-4 text-left text-white hover:bg-gray-800 active:bg-gray-700 flex items-center gap-4 transition"
              >
                <ListPlus className="w-5 h-5 text-gray-400" />
                <span className="text-base">Add to Queue</span>
              </button>

              {isCreator && onDeleteTrack && (
                <button
                  onClick={() => handleDeleteClick(tracks[openMenuIndex].id)}
                  className="w-full px-5 py-4 text-left text-red-400 hover:bg-gray-800 active:bg-gray-700 flex items-center gap-4 transition"
                >
                  <Trash2 className="w-5 h-5" />
                  <span className="text-base">Delete Track</span>
                </button>
              )}
            </div>

            {/* Cancel button */}
            <div className="p-4 border-t border-gray-700">
              <button
                onClick={() => setOpenMenuIndex(null)}
                className="w-full py-4 bg-gray-800 text-white rounded-xl text-base font-semibold hover:bg-gray-700 active:bg-gray-600 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
