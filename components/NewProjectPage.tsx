'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { X, ArrowLeft, ImagePlus, Music2 } from 'lucide-react'
import { showToast } from './Toast'

export default function NewProjectPage() {
  const { user, getAccessToken } = usePrivy()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null)
  const [tracks, setTracks] = useState<Array<{ file: File; title: string; autoFilledTitle: boolean }>>([])
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [dragOverImage, setDragOverImage] = useState(false)
  const [dragOverTracks, setDragOverTracks] = useState(false)
  const [dismissedAutoFillTip, setDismissedAutoFillTip] = useState(false)
  const coverImageInputRef = useRef<HTMLInputElement | null>(null)
  const bulkTrackInputRef = useRef<HTMLInputElement | null>(null)

  const setCoverImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (JPG, PNG, or WEBP).', 'error')
      return
    }
    setCoverImage(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setCoverImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setCoverImageFile(file)
  }

  const handleBulkTrackUpload = (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    const audioFiles = files.filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(file.name))

    if (audioFiles.length === 0) {
      showToast('Please upload audio files (MP3, WAV, M4A, AAC, FLAC, or OGG).', 'error')
      return
    }

    let validFilesCount = 0
    const maxAudioSize = 100 * 1024 * 1024
    const preparedTracks = audioFiles
      .filter((file) => {
        const isValidSize = file.size <= maxAudioSize
        if (!isValidSize) {
          showToast(`"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 100MB.`, 'error')
        } else {
          validFilesCount += 1
        }
        return isValidSize
      })
      .map((file) => ({
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        autoFilledTitle: true,
      }))

    if (preparedTracks.length === 0) return

    setTracks((prev) => [...prev, ...preparedTracks])

    showToast(`${validFilesCount} track${validFilesCount > 1 ? 's' : ''} added`, 'success')
  }

  const removeTrack = (index: number) => {
    setTracks(tracks.filter((_, i) => i !== index))
  }

  const hasTrack = tracks.some((t) => !!t.file)
  const canSubmit = !loading && !submitted && !!title.trim() && hasTrack
  const shouldShowAutoFillTip = !dismissedAutoFillTip && tracks.some((t) => t.autoFilledTitle)

  const uploadFile = async (file: File, path: string, fileType: 'audio' | 'image' = 'image'): Promise<string> => {
    // File size limits
    const maxAudioSize = 100 * 1024 * 1024 // 100MB for audio
    const maxImageSize = 25 * 1024 * 1024 // 25MB for images
    const maxSize = fileType === 'audio' ? maxAudioSize : maxImageSize
    
    if (file.size > maxSize) {
      const sizeMB = Math.round(maxSize / 1024 / 1024)
      throw new Error(`File "${file.name}" is too large. Maximum size is ${sizeMB}MB.`)
    }

    console.log(`Uploading ${fileType}: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB), type: ${file.type}`)
    
    // Determine correct content type (mobile browsers sometimes send wrong MIME type)
    let contentType = file.type
    const ext = file.name.toLowerCase().split('.').pop()
    if (fileType === 'audio') {
      const audioMimeTypes: Record<string, string> = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'm4a': 'audio/mp4',
        'aac': 'audio/aac',
        'flac': 'audio/flac',
        'ogg': 'audio/ogg',
      }
      if (ext && audioMimeTypes[ext]) {
        contentType = audioMimeTypes[ext]
      }
    }
    
    try {
      const { data, error } = await supabase.storage
        .from('hubba-files')
        .upload(`${path}/${Date.now()}-${file.name}`, file, {
          contentType,
          upsert: false,
        })

      if (error) {
        console.error(`Upload error for ${file.name}:`, error)
        if (error.message.includes('exceeded') || error.message.includes('size')) {
          throw new Error(`"${file.name}" is too large for upload. Try a smaller file or compress it.`)
        }
        throw new Error(error.message)
      }

      const { data: { publicUrl } } = supabase.storage
        .from('hubba-files')
        .getPublicUrl(data.path)

      console.log(`Upload successful: ${file.name}`)
      return publicUrl
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error'
      const isLargeWav = fileType === 'audio' && /\.wav$/i.test(file.name) && file.size > 25 * 1024 * 1024

      if (isLargeWav && /(network|fetch|timeout|failed)/i.test(errorMessage)) {
        throw new Error(`WAV upload failed for "${file.name}". Large WAV files can fail on slower networks. Try again or convert to MP3.`)
      }

      if (errorMessage.includes('too large')) {
        throw new Error(errorMessage)
      }

      throw new Error(`Failed to upload "${file.name}": ${errorMessage}`)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Prevent double submission
    if (!user || loading || submitted) return

    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      // Get or create user via API
      const privyId = user.id
      let { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (!dbUser) {
        // Create user via secure API
        const userResponse = await fetch('/api/user', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: user.email?.address || null }),
        })
        
        if (!userResponse.ok) {
          const err = await userResponse.json()
          throw new Error(err.error || 'Failed to create user')
        }
        
        const userData = await userResponse.json()
        dbUser = userData.user
      }

      if (!dbUser) throw new Error('User not found')

      const tracksToUpload = tracks.filter((t) => t.file)
      if (tracksToUpload.length === 0) {
        throw new Error('Add at least one audio track before creating your project.')
      }

      const hasUntitledTrack = tracksToUpload.some((t) => !t.title.trim())
      if (hasUntitledTrack) {
        throw new Error('Each uploaded track needs a title. Click to edit any track name, then try again.')
      }

      // Upload cover image if provided
      let coverImageUrl: string | undefined
      if (coverImage) {
        coverImageUrl = await uploadFile(coverImage, `projects/${dbUser.id}/covers`, 'image')
      }

      // Create project via secure API
      const projectResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description: description || null,
          cover_image_url: coverImageUrl,
          allow_downloads: false,
        }),
      })

      if (!projectResponse.ok) {
        const err = await projectResponse.json()
        throw new Error(err.error || 'Failed to create project')
      }

      const projectData = await projectResponse.json()
      const project = projectData.project

      // Upload and create tracks via secure API
      for (let i = 0; i < tracksToUpload.length; i++) {
        const track = tracksToUpload[i]
        const trackName = track.title.trim() || track.file.name
        
        try {
          console.log(`Processing track ${i + 1}/${tracksToUpload.length}: ${trackName}`)
          
          const audioUrl = await uploadFile(track.file, `projects/${dbUser.id}/tracks`, 'audio')

          const trackResponse = await fetch('/api/tracks', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              project_id: project.id,
              title: track.title.trim() || `Track ${i + 1}`,
              audio_url: audioUrl,
              order: i,
            }),
          })

          if (!trackResponse.ok) {
            const err = await trackResponse.json()
            throw new Error(err.error || `Failed to save track "${trackName}"`)
          }
          
          console.log(`Track ${i + 1} created successfully`)
        } catch (trackError: unknown) {
          const errorMsg = trackError instanceof Error ? trackError.message : `Unknown error with track "${trackName}"`
          console.error(`Error with track ${i + 1}:`, trackError)
          // Show specific error for this track
          showToast(`Error: ${errorMsg}`, 'error')
          // Continue with project creation but inform user about the failed track
          throw new Error(`Failed to add track "${trackName}". Project was created but some tracks may be missing.`)
        }
      }

      // Mark as submitted to prevent any further submissions
      setSubmitted(true)
      showToast('Project created successfully!', 'success')
      
      // Use replace to prevent back button issues, and ensure navigation happens
      const projectUrl = `/dashboard/projects/${project.id}`
      router.replace(projectUrl)
      
      // Fallback: if router.replace doesn't work, use window.location
      setTimeout(() => {
        if (!submitted) return // Already navigated
        window.location.href = projectUrl
      }, 500)
      
    } catch (error: unknown) {
      console.error('Error creating project:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project. Please try again.'
      showToast(errorMessage, 'error')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white pb-40">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link 
            href="/dashboard" 
            className="p-2 -ml-2 rounded-full hover:bg-gray-800 transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <h1 className="text-lg font-semibold">New Project</h1>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 sm:py-8 max-w-2xl mx-auto">
        <form id="new-project-form" onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
          
          {/* Project Image */}
          <div className="bg-emerald-500/[0.03] border border-emerald-400/20 rounded-2xl p-4 sm:p-5 space-y-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-xs font-medium mb-3">
                <ImagePlus className="w-3.5 h-3.5" />
                Step 1
              </div>
              <h2 className="text-base sm:text-lg font-semibold text-white">Project Image</h2>
              <p className="text-sm text-gray-400 mt-1">
                Add a cover image so your project is easy to recognize.
              </p>
            </div>
            {coverImagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-700 group">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => coverImageInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      coverImageInputRef.current?.click()
                    }
                  }}
                  className="relative cursor-pointer block w-full h-52 sm:h-64 focus-within:ring-2 focus-within:ring-neon-green/70 focus-within:ring-offset-2 focus-within:ring-offset-black rounded-xl"
                >
                  <img
                    src={coverImagePreview}
                    alt="Cover preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-2">
                    <ImagePlus className="w-6 h-6 text-white" />
                    <span className="text-white text-sm font-medium">Change image</span>
                  </div>
                  <input
                    ref={coverImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverImageChange}
                    className="hidden"
                  />
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setCoverImage(null)
                    setCoverImagePreview(null)
                  }}
                  className="absolute top-3 right-3 z-20 bg-black/75 hover:bg-red-500 text-white rounded-full p-1.5 transition"
                  title="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => coverImageInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    coverImageInputRef.current?.click()
                  }
                }}
                className={`relative w-full border-2 border-dashed rounded-xl cursor-pointer transition p-6 sm:p-8 flex flex-col items-center justify-center gap-3 text-center focus-within:ring-2 focus-within:ring-neon-green/70 focus-within:ring-offset-2 focus-within:ring-offset-black ${
                  dragOverImage
                    ? 'border-neon-green bg-neon-green/10'
                    : 'border-gray-600 hover:border-neon-green/60 hover:bg-gray-900/50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOverImage(true) }}
                onDragLeave={() => setDragOverImage(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverImage(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) setCoverImageFile(file)
                }}
              >
                <ImagePlus className="w-7 h-7 text-gray-300" />
                <div className="space-y-1">
                  <p className="text-sm sm:text-base font-medium text-white">Drop image here or click to browse</p>
                  <p className="text-xs text-gray-500">JPG, PNG, WEBP up to 25MB</p>
                </div>
                <input
                  ref={coverImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageChange}
                  className="hidden"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Or choose image file</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleCoverImageChange}
                className="w-full text-sm text-white file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-white file:text-black hover:file:bg-gray-200"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name your project"
              required
              className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-neon-green focus:ring-2 focus:ring-neon-green/30 transition"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Add a description or details"
              className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-neon-green focus:ring-2 focus:ring-neon-green/30 transition resize-none"
            />
          </div>

          {/* Audio Tracks */}
          <div className="bg-sky-500/[0.03] border border-sky-400/20 rounded-2xl p-4 sm:p-5 space-y-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-400/30 text-sky-300 text-xs font-medium mb-3">
                <Music2 className="w-3.5 h-3.5" />
                Step 2
              </div>
              <h2 className="text-base sm:text-lg font-semibold text-white">
                Audio Tracks <span className="text-red-400">*</span>
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Upload at least one track. You can add multiple files at once. Set track permissions after your project is created.
              </p>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => bulkTrackInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  bulkTrackInputRef.current?.click()
                }
              }}
              className={`relative w-full border-2 border-dashed rounded-xl cursor-pointer transition p-5 sm:p-6 flex flex-col items-center justify-center gap-3 text-center focus-within:ring-2 focus-within:ring-neon-green/70 focus-within:ring-offset-2 focus-within:ring-offset-black ${
                dragOverTracks
                  ? 'border-neon-green bg-neon-green/10'
                  : 'border-gray-600 hover:border-neon-green/60 hover:bg-gray-900/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOverTracks(true) }}
              onDragLeave={() => setDragOverTracks(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOverTracks(false)
                if (e.dataTransfer.files?.length) {
                  handleBulkTrackUpload(e.dataTransfer.files)
                }
              }}
            >
              <Music2 className="w-7 h-7 text-gray-300" />
              <div className="space-y-1">
                <p className="text-sm sm:text-base font-medium text-white">Drop audio files here or click to browse</p>
                <p className="text-xs text-gray-500">MP3, WAV, M4A, AAC, FLAC, OGG (up to 100MB each)</p>
              </div>
              <input
                ref={bulkTrackInputRef}
                type="file"
                multiple
                accept="audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/flac,audio/ogg,.mp3,.wav,.m4a,.aac,.flac,.ogg"
                onChange={(e) => {
                  if (e.target.files?.length) handleBulkTrackUpload(e.target.files)
                }}
                className="hidden"
              />
            </div>

            <div className="space-y-3">
              {shouldShowAutoFillTip && (
                <div className="flex items-start justify-between gap-3 bg-neon-green/10 border border-neon-green/30 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-neon-green">
                    Track names were auto-filled from filenames. You can edit any track name before creating the project.
                  </p>
                  <button
                    type="button"
                    onClick={() => setDismissedAutoFillTip(true)}
                    className="text-neon-green/80 hover:text-neon-green transition shrink-0 p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-green/60"
                    title="Dismiss tip"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {tracks.map((track, index) => (
                <div 
                  key={index} 
                  className="bg-gray-900/40 rounded-xl border border-gray-800 p-4"
                >
                  <div className="flex items-start gap-3">
                    {/* Track Number */}
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm font-semibold text-gray-400 shrink-0 mt-0.5">
                      {index + 1}
                    </div>
                    
                    <div className="flex-1 min-w-0 space-y-3">
                      <p className="text-sm text-neon-green truncate">
                        {track.file.name}
                      </p>
                      
                      {/* Track Title */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-xs font-medium text-gray-400">
                            Track name (editable)
                          </label>
                          {track.autoFilledTitle && (
                            <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-neon-green/15 border border-neon-green/35 text-neon-green">
                              Auto-filled
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={track.title}
                          onChange={(e) => {
                            const newTracks = [...tracks]
                            newTracks[index].title = e.target.value
                            newTracks[index].autoFilledTitle = false
                            setTracks(newTracks)
                          }}
                          placeholder="Track title"
                          className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-neon-green focus:ring-2 focus:ring-neon-green/30 text-sm transition"
                        />
                        <p className="text-xs text-gray-500">
                          Auto-filled from filename. Click to edit.
                        </p>
                      </div>
                    </div>
                    
                    {tracks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTrack(index)}
                        className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                        title="Remove track"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {tracks.length === 0 && (
                <p className="text-xs text-gray-500 text-center">
                  Uploaded tracks will appear here.
                </p>
              )}
            </div>

          </div>

          {/* Inline submit section for better visibility */}
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 sm:p-5">
            <button
              type="submit"
              form="new-project-form"
              disabled={!canSubmit}
              className="w-full py-5 rounded-2xl font-bold text-base transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-green/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              style={{
                backgroundColor: '#39FF14',
                color: '#000',
                boxShadow: canSubmit ? '0 0 22px rgba(57, 255, 20, 0.34)' : 'none',
              }}
            >
              {loading || submitted ? 'Creating Project...' : 'Create Project'}
            </button>
          </div>
        </form>
      </main>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/95 backdrop-blur-md border-t border-gray-800">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 space-y-2">
          <button
            type="submit"
            form="new-project-form"
            disabled={!canSubmit}
            className="w-full py-4 rounded-full font-bold text-base transition disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-green/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            style={{
              backgroundColor: '#39FF14',
              color: '#000',
              boxShadow: canSubmit
                ? '0 0 20px rgba(57, 255, 20, 0.3)'
                : 'none',
            }}
          >
            {loading || submitted ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                {submitted ? 'Redirecting...' : 'Creating Project...'}
              </span>
            ) : (
              'Create Project'
            )}
          </button>
          <Link
            href="/dashboard"
            className="block w-full text-center py-2 text-sm text-gray-500 hover:text-gray-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/60 rounded-md"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  )
}

