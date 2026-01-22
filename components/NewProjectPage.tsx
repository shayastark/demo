'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Upload, X, ArrowLeft, Plus, ImagePlus } from 'lucide-react'
import { showToast } from './Toast'

export default function NewProjectPage() {
  const { user, getAccessToken } = usePrivy()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [allowDownloads, setAllowDownloads] = useState(false)
  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null)
  const [tracks, setTracks] = useState<Array<{ file: File; title: string }>>([{ file: null as any, title: '' }])
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setCoverImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setCoverImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAddTrack = () => {
    setTracks([...tracks, { file: null as any, title: '' }])
  }

  const handleTrackFileChange = (index: number, file: File) => {
    const newTracks = [...tracks]
    newTracks[index].file = file
    setTracks(newTracks)
    
    // Auto-set title from filename if empty
    if (!newTracks[index].title) {
      const name = file.name.replace(/\.[^/.]+$/, '')
      newTracks[index].title = name
      setTracks(newTracks)
    }
  }

  const removeTrack = (index: number) => {
    setTracks(tracks.filter((_, i) => i !== index))
  }

  const uploadFile = async (file: File, path: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from('hubba-files')
      .upload(`${path}/${Date.now()}-${file.name}`, file)

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
      .from('hubba-files')
      .getPublicUrl(data.path)

    return publicUrl
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

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

      // Upload cover image if provided
      let coverImageUrl: string | undefined
      if (coverImage) {
        coverImageUrl = await uploadFile(coverImage, `projects/${dbUser.id}/covers`)
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
          allow_downloads: allowDownloads,
        }),
      })

      if (!projectResponse.ok) {
        const err = await projectResponse.json()
        throw new Error(err.error || 'Failed to create project')
      }

      const projectData = await projectResponse.json()
      const project = projectData.project

      // Upload and create tracks via secure API
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i]
        if (!track.file) continue

        const audioUrl = await uploadFile(track.file, `projects/${dbUser.id}/tracks`)

        const trackResponse = await fetch('/api/tracks', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: project.id,
            title: track.title || `Track ${i + 1}`,
            audio_url: audioUrl,
            order: i,
          }),
        })

        if (!trackResponse.ok) {
          const err = await trackResponse.json()
          throw new Error(err.error || `Failed to create track ${i + 1}`)
        }
      }

      showToast('Project created successfully!', 'success')
      router.push(`/dashboard/projects/${project.id}`)
    } catch (error: any) {
      console.error('Error creating project:', error)
      showToast(error.message || 'Failed to create project. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link 
            href="/dashboard" 
            className="p-2 -ml-2 rounded-full hover:bg-gray-800 transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <h1 className="text-lg font-semibold">New Project</h1>
        </div>
      </header>

      <main className="px-4 py-6 max-w-xl mx-auto pb-8">
        <form id="new-project-form" onSubmit={handleSubmit} className="space-y-6">
          
          {/* Cover Image - Album Art Style */}
          <div className="flex flex-col items-center">
            {coverImagePreview ? (
              <div className="relative w-48 h-48 rounded-xl overflow-hidden shadow-2xl group">
                <img 
                  src={coverImagePreview} 
                  alt="Cover preview" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setCoverImage(null)
                      setCoverImagePreview(null)
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white rounded-full p-2 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ) : (
              <label 
                className={`w-48 h-48 border-2 border-dashed rounded-xl cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
                  dragOver 
                    ? 'border-neon-green bg-neon-green/10' 
                    : 'border-gray-600 hover:border-neon-green/50 hover:bg-gray-900/50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file && file.type.startsWith('image/')) {
                    setCoverImage(file)
                    const reader = new FileReader()
                    reader.onloadend = () => setCoverImagePreview(reader.result as string)
                    reader.readAsDataURL(file)
                  }
                }}
              >
                <ImagePlus className="w-10 h-10 text-gray-500" />
                <div className="text-center px-4">
                  <span className="text-sm text-neon-green font-medium block">Upload Cover Art</span>
                  <span className="text-xs text-gray-500">Click or drag image here</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageChange}
                  className="hidden"
                />
              </label>
            )}
            <p className="text-xs text-gray-500 mt-3">Optional • Square recommended</p>
          </div>

          {/* Project Details Card */}
          <div className="bg-gray-900/50 rounded-2xl p-5 border border-gray-800 space-y-5 overflow-hidden">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Project Details</h2>
            
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-2 text-white">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My New Project"
                required
                className="w-full max-w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/20 transition box-border"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2 text-white">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What's this project about?"
                className="w-full max-w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/20 transition resize-none box-border"
              />
            </div>

            {/* Allow Downloads */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">
                Allow downloads
              </span>
              <button
                type="button"
                onClick={() => setAllowDownloads(!allowDownloads)}
                className="relative w-12 h-7 rounded-full transition-colors flex-shrink-0"
                style={{ backgroundColor: allowDownloads ? '#39FF14' : '#374151' }}
              >
                <div 
                  className="absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all"
                  style={{ left: allowDownloads ? '26px' : '4px' }}
                />
              </button>
            </div>
          </div>

          {/* Tracks Section */}
          <div className="bg-gray-900/50 rounded-2xl p-5 border border-gray-800 space-y-4">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
              Tracks <span className="text-red-400">*</span>
            </h2>
            
            <p className="text-sm text-gray-500">
              Click the upload area below to select your audio files.
            </p>

            <div className="space-y-3">
              {tracks.map((track, index) => (
                <div 
                  key={index} 
                  className="bg-black rounded-xl p-4 border border-gray-700"
                >
                  <div className="flex items-start gap-3">
                    {/* Track Number */}
                    <div className="w-8 h-8 rounded-full bg-neon-green/20 flex items-center justify-center text-sm font-bold text-neon-green shrink-0">
                      {index + 1}
                    </div>
                    
                    <div className="flex-1 space-y-3 min-w-0">
                      {/* File Upload - More prominent with Upload icon */}
                      <label className="block cursor-pointer">
                        <input
                          type="file"
                          accept="audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/flac,audio/ogg,.mp3,.wav,.m4a,.aac,.flac,.ogg"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleTrackFileChange(index, file)
                          }}
                          required
                          className="hidden"
                        />
                        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed transition ${
                          track.file 
                            ? 'border-neon-green bg-neon-green/10' 
                            : 'border-gray-600 hover:border-neon-green hover:bg-gray-800'
                        }`}>
                          <Upload className={`w-5 h-5 flex-shrink-0 ${track.file ? 'text-neon-green' : 'text-gray-400'}`} />
                          <div className="min-w-0 flex-1">
                            {track.file ? (
                              <span className="text-sm text-neon-green truncate block">{track.file.name}</span>
                            ) : (
                              <>
                                <span className="text-sm text-white font-medium block">Click to upload audio</span>
                                <span className="text-xs text-gray-500">MP3, WAV, M4A, FLAC supported</span>
                              </>
                            )}
                          </div>
                        </div>
                      </label>
                      
                      {/* Track Title */}
                      <input
                        type="text"
                        value={track.title}
                        onChange={(e) => {
                          const newTracks = [...tracks]
                          newTracks[index].title = e.target.value
                          setTracks(newTracks)
                        }}
                        placeholder="Track title"
                        required
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-neon-green text-sm"
                      />
                    </div>
                    
                    {tracks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTrack(index)}
                        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition shrink-0"
                        title="Remove track"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Add Another Track Button - More visible styling */}
            <button
              type="button"
              onClick={handleAddTrack}
              className="w-full py-3 rounded-xl border border-gray-600 text-gray-300 hover:border-neon-green hover:text-neon-green hover:bg-neon-green/5 transition flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add another track
            </button>
          </div>

          {/* Action Buttons - Inside form, always visible */}
          <div className="bg-gray-900/50 rounded-2xl p-5 border border-gray-800 space-y-4 mt-6">
            {/* Helper text */}
            {(!title.trim() || tracks.every(t => !t.file)) && (
              <p className="text-center text-sm text-gray-500">
                {!title.trim() ? 'Add a title above to continue' : 'Upload at least one track to continue'}
              </p>
            )}
            
            <button
              type="submit"
              disabled={loading || !title.trim() || tracks.every(t => !t.file)}
              className="w-full px-8 py-4 rounded-full font-bold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-neon-green/30"
              style={{
                backgroundColor: '#39FF14',
                color: '#000',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Creating Project...
                </span>
              ) : (
                'Create Project'
              )}
            </button>
            
            <Link
              href="/dashboard"
              className="block w-full text-center py-3 text-gray-400 hover:text-white transition"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}

