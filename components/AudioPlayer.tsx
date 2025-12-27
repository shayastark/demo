'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Volume2, MoreVertical, Download, Share2, Settings } from 'lucide-react'
import CassettePlayer from './CassettePlayer'
import AudioEditor from './AudioEditor'

interface AudioPlayerProps {
  src: string
  title: string
  onPlay?: () => void
  coverImageUrl?: string | null
  showCassette?: boolean
  onDownload?: () => void
  onShare?: () => void
  onEdit?: () => void
  showDownload?: boolean
  showShare?: boolean
  showEdit?: boolean
}

export default function AudioPlayer({ 
  src, 
  title, 
  onPlay, 
  coverImageUrl, 
  showCassette = true,
  onDownload,
  onShare,
  onEdit,
  showDownload = false,
  showShare = false,
  showEdit = false
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.volume = volume

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration)
    const handleEnded = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [volume])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
      onPlay?.()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const newTime = parseFloat(e.target.value)
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  const handleEdit = () => {
    if (onEdit) {
      onEdit()
    } else {
      setIsEditorOpen(true)
    }
    setIsMenuOpen(false)
  }

  return (
    <>
      <div className="space-y-4">
        {/* Cassette Player - always show */}
        <CassettePlayer
          coverImageUrl={coverImageUrl}
          isPlaying={isPlaying}
          title={title}
        />
        
        {/* Audio Controls */}
        <div className="bg-gray-900 rounded-lg p-4">
          <audio ref={audioRef} src={src} />
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="flex-shrink-0 w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:bg-gray-200 transition"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-1" />
              )}
            </button>
            <div className="flex-1">
              <div className="text-sm font-medium mb-1 text-neon-green">{title}</div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-neon-green"
                  style={{
                    background: `linear-gradient(to right, #39FF14 0%, #39FF14 ${(currentTime / (duration || 1)) * 100}%, #374151 ${(currentTime / (duration || 1)) * 100}%, #374151 100%)`
                  }}
                />
                <span className="text-xs text-neon-green w-20 text-right">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
            </div>
            {/* Three-dot menu */}
            {(showDownload || showShare || showEdit) && (
              <div className="relative flex-shrink-0" ref={menuRef}>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="w-10 h-10 bg-gray-800 text-neon-green rounded-lg flex items-center justify-center hover:bg-gray-700 transition"
                  title="More options"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
                
                {isMenuOpen && (
                  <div className="absolute right-0 top-11 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-50 min-w-[160px]">
                    {showEdit && (
                      <button
                        onClick={handleEdit}
                        className="w-full px-4 py-2 text-left text-sm text-neon-green hover:bg-gray-800 flex items-center gap-2 transition"
                      >
                        <Settings className="w-4 h-4" />
                        Edit
                      </button>
                    )}
                    {showDownload && onDownload && (
                      <button
                        onClick={() => {
                          onDownload()
                          setIsMenuOpen(false)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-neon-green hover:bg-gray-800 flex items-center gap-2 transition"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    )}
                    {showShare && onShare && (
                      <button
                        onClick={() => {
                          onShare()
                          setIsMenuOpen(false)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-neon-green hover:bg-gray-800 flex items-center gap-2 transition"
                      >
                        <Share2 className="w-4 h-4" />
                        Share
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audio Editor Modal */}
      <AudioEditor
        src={src}
        title={title}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        audioElement={audioRef.current}
      />
    </>
  )
}

