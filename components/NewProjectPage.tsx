'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Upload, X, Music, ArrowLeft, Plus, Disc3 } from 'lucide-react'

export default function NewProjectPage() {
  const { user } = usePrivy()
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
      // Get or create user
      const privyId = user.id
      let { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (!dbUser) {
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({ privy_id: privyId, email: user.email?.address || null })
          .select('id')
          .single()
        
        if (userError || !newUser) throw userError || new Error('Failed to create user')
        dbUser = newUser
      }

      // Upload cover image if provided
      let coverImageUrl: string | undefined
      if (coverImage && dbUser) {
        coverImageUrl = await uploadFile(coverImage, `projects/${dbUser.id}/covers`)
      }

      // Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          creator_id: dbUser.id,
          title,
          description: description || null,
          cover_image_url: coverImageUrl,
          allow_downloads: allowDownloads,
        })
        .select('id')
        .single()

      if (projectError) throw projectError

      // Upload tracks
      if (!dbUser) throw new Error('User not found')
      
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i]
        if (!track.file) continue

        const audioUrl = await uploadFile(track.file, `projects/${dbUser.id}/tracks`)

        const { error: trackError } = await supabase
          .from('tracks')
          .insert({
            project_id: project.id,
            title: track.title || `Track ${i + 1}`,
            audio_url: audioUrl,
            order: i,
          })

        if (trackError) throw trackError
      }

      // Initialize metrics with explicit 0 values
      await supabase
        .from('project_metrics')
        .insert({ project_id: project.id, plays: 0, shares: 0, adds: 0 })

      router.push(`/dashboard/projects/${project.id}`)
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Failed to create project. Please try again.')
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

      <main className="px-4 py-6 max-w-xl mx-auto pb-32">
        <form onSubmit={handleSubmit} className="space-y-8">
          
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
                className={`w-48 h-48 border-2 border-dashed rounded-xl cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                  dragOver 
                    ? 'border-neon-green bg-neon-green/10' 
                    : 'border-gray-700 hover:border-gray-500'
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
                <Disc3 className="w-10 h-10 text-gray-600" />
                <span className="text-sm text-gray-500 text-center px-4">
                  Drop cover art<br />or click to upload
                </span>
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
          <div className="bg-gray-900/50 rounded-2xl p-5 border border-gray-800 space-y-5">
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
                className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/20 transition"
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
                className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/20 transition resize-none"
              />
            </div>

            {/* Allow Downloads */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={allowDownloads}
                onChange={(e) => setAllowDownloads(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-gray-700 rounded-full peer-checked:bg-neon-green transition relative">
                <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition peer-checked:translate-x-4 shadow" 
                  style={{ transform: allowDownloads ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </div>
              <span className="text-sm text-gray-300 group-hover:text-white transition">
                Allow downloads
              </span>
            </label>
          </div>

          {/* Tracks Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                Tracks <span className="text-red-400">*</span>
              </h2>
              <span className="text-xs text-gray-500">{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="space-y-3">
              {tracks.map((track, index) => (
                <div 
                  key={index} 
                  className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition"
                >
                  <div className="flex items-start gap-3">
                    {/* Track Number */}
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm font-medium text-gray-400 shrink-0">
                      {index + 1}
                    </div>
                    
                    <div className="flex-1 space-y-3">
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
                        className="w-full bg-transparent border-0 border-b border-gray-700 px-0 py-1 text-white placeholder-gray-600 focus:outline-none focus:border-neon-green text-sm"
                      />
                      
                      {/* File Upload */}
                      <div className="flex items-center gap-2">
                        <label className="flex-1">
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
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed cursor-pointer transition text-xs ${
                            track.file 
                              ? 'border-neon-green/50 bg-neon-green/5 text-neon-green' 
                              : 'border-gray-700 hover:border-gray-500 text-gray-500'
                          }`}>
                            <Music className="w-4 h-4" />
                            <span className="truncate">
                              {track.file ? track.file.name : 'Choose audio file'}
                            </span>
                          </div>
                        </label>
                        
                        {tracks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTrack(index)}
                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Add Track Button */}
              <button
                type="button"
                onClick={handleAddTrack}
                className="w-full py-3 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:border-neon-green/50 hover:text-neon-green hover:bg-neon-green/5 transition flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Track
              </button>
            </div>
          </div>
        </form>
      </main>

      {/* Fixed Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-sm border-t border-gray-800 p-4 pb-safe">
        <div className="max-w-xl mx-auto flex gap-3">
          <Link
            href="/dashboard"
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white px-6 py-3.5 rounded-full font-semibold text-center transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            form="new-project-form"
            onClick={handleSubmit}
            disabled={loading || !title.trim() || tracks.every(t => !t.file)}
            className="flex-1 px-6 py-3.5 rounded-full font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-neon-green/20"
            style={{
              backgroundColor: '#39FF14',
              color: '#000',
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Creating...
              </span>
            ) : (
              'Create Project'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

