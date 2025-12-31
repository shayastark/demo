'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, Repeat, Volume2 } from 'lucide-react'
import CassettePlayer from './CassettePlayer'
import SoundwaveVisualizer from './SoundwaveVisualizer'
import { Track } from '@/lib/types'

interface TrackPlaylistProps {
  tracks: Track[]
  projectCoverUrl?: string | null
  projectTitle: string
  onTrackPlay?: (trackId: string) => void
}

export default function TrackPlaylist({ 
  tracks, 
  projectCoverUrl, 
  projectTitle,
  onTrackPlay 
}: TrackPlaylistProps) {
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRepeat, setIsRepeat] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const audioRef = useRef<HTMLAudioElement>(null)

  const currentTrack = currentTrackIndex !== null ? tracks[currentTrackIndex] : null

  // Handle audio element events
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(audio.duration)
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

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [isRepeat, currentTrackIndex, tracks.length])

  // Play when track changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || currentTrackIndex === null) return

    audio.load()
    audio.play().catch(console.error)
    
    if (currentTrack && onTrackPlay) {
      onTrackPlay(currentTrack.id)
    }
  }, [currentTrackIndex])

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

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(console.error)
    }
  }

  const handlePrevious = () => {
    if (currentTrackIndex === null) return
    
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
      setCurrentTrackIndex(0)
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

  return (
    <div className="space-y-6">
      {/* Hidden audio element */}
      <audio ref={audioRef} src={currentTrack?.audio_url} />

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
            disabled={currentTrackIndex === null}
            className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 rounded-lg appearance-none cursor-pointer accent-neon-green"
                style={{ writingMode: 'horizontal-tb' }}
              />
            </div>
          </div>
        </div>

        {/* Current track name */}
        {currentTrack && (
          <div className="text-center mt-4 text-neon-green font-medium truncate">
            {currentTrack.title}
          </div>
        )}
      </div>

      {/* Track List */}
      <div className="bg-gray-900 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="font-semibold text-white">Tracks ({tracks.length})</h3>
        </div>
        <div className="divide-y divide-gray-800">
          {tracks.map((track, index) => (
            <button
              key={track.id}
              onClick={() => handleTrackClick(index)}
              className={`w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-800 transition text-left ${
                currentTrackIndex === index ? 'bg-gray-800' : ''
              }`}
            >
              {/* Track number or playing indicator */}
              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                {currentTrackIndex === index && isPlaying ? (
                  <div className="flex items-end gap-0.5 h-4">
                    <div className="w-1 bg-neon-green animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
                    <div className="w-1 bg-neon-green animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
                    <div className="w-1 bg-neon-green animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
                  </div>
                ) : currentTrackIndex === index ? (
                  <Pause className="w-4 h-4 text-neon-green" />
                ) : (
                  <span className="text-gray-500 text-sm">{index + 1}</span>
                )}
              </div>

              {/* Track info */}
              <div className="flex-1 min-w-0">
                <div className={`font-medium truncate ${
                  currentTrackIndex === index ? 'text-neon-green' : 'text-white'
                }`}>
                  {track.title}
                </div>
              </div>

              {/* Play icon on hover */}
              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100">
                {currentTrackIndex !== index && (
                  <Play className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

