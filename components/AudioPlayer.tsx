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

  // Close menu when clicking outside (only on desktop)
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleClickOutside = (event: MouseEvent) => {
      // Only handle click outside on desktop (sm and up)
      if (window.innerWidth >= 640) {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          setIsMenuOpen(false)
        }
      }
    }

    if (isMenuOpen) {
      // Use a small delay to avoid closing immediately when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 100)

      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isMenuOpen])

  const handleEdit = () => {
    setIsMenuOpen(false)
    if (onEdit) {
      onEdit()
    } else {
      setIsEditorOpen(true)
    }
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
                  className="w-12 h-12 sm:w-10 sm:h-10 bg-gray-800 text-white rounded-lg flex items-center justify-center hover:bg-gray-700 active:bg-gray-600 transition touch-manipulation"
                  title="More options"
                >
                  <MoreVertical className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
                
                {isMenuOpen && (
                  <>
                    {/* Backdrop for mobile */}
                    <div 
                      className="fixed inset-0 bg-black bg-opacity-50 z-40 sm:hidden"
                      onClick={() => setIsMenuOpen(false)}
                    />
                    {/* Menu - Side panel on mobile, dropdown on desktop */}
                    <div className="fixed top-0 right-0 bottom-0 w-64 bg-gray-900 border-l border-gray-700 shadow-xl z-50 overflow-y-auto sm:absolute sm:top-11 sm:bottom-auto sm:w-auto sm:min-w-[160px] sm:max-w-[240px] sm:rounded-lg sm:border sm:border-gray-700">
                      {showEdit && (
                        <div className="p-4 border-b border-gray-800 sm:border-b-0 sm:p-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEdit()
                            }}
                            className="w-full px-4 py-3 sm:py-2 text-left text-base sm:text-sm text-white hover:bg-gray-800 active:bg-gray-700 flex items-center gap-3 sm:gap-2 transition touch-manipulation"
                          >
                            <Settings className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="flex-1">Edit</span>
                          </button>
                        </div>
                      )}
                      {showDownload && onDownload && (
                        <div className="p-4 border-b border-gray-800 sm:border-b-0 sm:p-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onDownload()
                              setIsMenuOpen(false)
                            }}
                            className="w-full px-4 py-3 sm:py-2 text-left text-base sm:text-sm text-white hover:bg-gray-800 active:bg-gray-700 flex items-center gap-3 sm:gap-2 transition touch-manipulation"
                          >
                            <Download className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="flex-1">Download</span>
                          </button>
                        </div>
                      )}
                      {showShare && onShare && (
                        <div className="p-4 border-b border-gray-800 sm:border-b-0 sm:p-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onShare()
                              setIsMenuOpen(false)
                            }}
                            className="w-full px-4 py-3 sm:py-2 text-left text-base sm:text-sm text-white hover:bg-gray-800 active:bg-gray-700 flex items-center gap-3 sm:gap-2 transition touch-manipulation"
                          >
                            <Share2 className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="flex-1">Share</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </>
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

