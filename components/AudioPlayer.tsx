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
    if (typeof window === 'undefined' || !isMenuOpen) return
    
    const handleClickOutside = (event: MouseEvent) => {
      // Only handle click outside on desktop (sm and up)
      if (window.innerWidth >= 640) {
        const target = event.target as Node
        // Don't close if clicking the button that opens the menu
        const menuButton = menuRef.current?.querySelector('button')
        if (menuButton && menuButton.contains(target)) {
          return
        }
        // Close if clicking outside the menu
        if (menuRef.current && !menuRef.current.contains(target)) {
          setIsMenuOpen(false)
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
              <div className="relative flex-shrink-0 z-50" ref={menuRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    setIsMenuOpen(!isMenuOpen)
                  }}
                  className="w-12 h-12 sm:w-10 sm:h-10 bg-gray-800 text-white rounded-lg flex items-center justify-center hover:bg-gray-700 active:bg-gray-600 transition touch-manipulation"
                  title="More options"
                  type="button"
                >
                  <MoreVertical className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
                
                {isMenuOpen && (
                  <>
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 bg-black bg-opacity-50 z-[55]"
                      onClick={() => setIsMenuOpen(false)}
                    />
                    {/* Menu - Bottom sheet on mobile, dropdown on desktop */}
                    <div 
                      className="bg-gray-900 border-t-2 border-gray-700 shadow-2xl z-[60] fixed bottom-0 left-0 right-0 sm:absolute sm:bottom-auto sm:top-11 sm:right-0 sm:left-auto sm:rounded-lg sm:w-auto sm:min-w-[220px] sm:max-w-[280px]"
                      style={{
                        borderRadius: '1rem 1rem 0 0',
                        maxHeight: '80vh',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 1rem)' }}>
                        {showEdit && (
                          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgb(31 41 55)' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit()
                              }}
                              className="w-full text-left text-white hover:bg-gray-800 active:bg-gray-700 flex items-center transition"
                              style={{ 
                                fontSize: '1.125rem',
                                lineHeight: '1.75rem',
                                paddingTop: '0.875rem',
                                paddingBottom: '0.875rem',
                                gap: '1rem'
                              }}
                            >
                              <Settings style={{ width: '1.5rem', height: '1.5rem', flexShrink: 0 }} />
                              <span style={{ wordBreak: 'break-word' }}>Edit</span>
                            </button>
                          </div>
                        )}
                        {showDownload && onDownload && (
                          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgb(31 41 55)' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onDownload()
                                setIsMenuOpen(false)
                              }}
                              className="w-full text-left text-white hover:bg-gray-800 active:bg-gray-700 flex items-center transition"
                              style={{ 
                                fontSize: '1.125rem',
                                lineHeight: '1.75rem',
                                paddingTop: '0.875rem',
                                paddingBottom: '0.875rem',
                                gap: '1rem'
                              }}
                            >
                              <Download style={{ width: '1.5rem', height: '1.5rem', flexShrink: 0 }} />
                              <span style={{ wordBreak: 'break-word' }}>Download</span>
                            </button>
                          </div>
                        )}
                        {showShare && onShare && (
                          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgb(31 41 55)' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onShare()
                                setIsMenuOpen(false)
                              }}
                              className="w-full text-left text-white hover:bg-gray-800 active:bg-gray-700 flex items-center transition"
                              style={{ 
                                fontSize: '1.125rem',
                                lineHeight: '1.75rem',
                                paddingTop: '0.875rem',
                                paddingBottom: '0.875rem',
                                gap: '1rem'
                              }}
                            >
                              <Share2 style={{ width: '1.5rem', height: '1.5rem', flexShrink: 0 }} />
                              <span style={{ wordBreak: 'break-word' }}>Share</span>
                            </button>
                          </div>
                        )}
                      </div>
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

