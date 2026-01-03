'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Upload, X, Music } from 'lucide-react'

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
      <nav className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/dashboard" className="text-2xl font-bold">
            Hubba
          </Link>
        </div>
      </nav>

      <main className="px-4 py-8 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Create New Project</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cover Image */}
          <div>
            <label className="block text-sm font-medium mb-2 text-neon-green">Cover Image (Optional)</label>
            {coverImagePreview ? (
              <div className="relative w-full h-64 rounded-lg overflow-hidden mb-2">
                <img src={coverImagePreview} alt="Cover preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setCoverImage(null)
                    setCoverImagePreview(null)
                  }}
                  className="absolute top-2 right-2 bg-black bg-opacity-50 rounded-full p-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="block w-full h-64 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-gray-600 transition flex items-center justify-center">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                  <span className="text-neon-green opacity-70">Click to upload cover image</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-2 text-neon-green">Project Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-neon-green focus:outline-none focus:border-neon-green"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2 text-neon-green">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-neon-green focus:outline-none focus:border-neon-green resize-none"
            />
          </div>

          {/* Allow Downloads */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allowDownloads"
              checked={allowDownloads}
              onChange={(e) => setAllowDownloads(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="allowDownloads" className="text-sm text-neon-green">
              Allow downloads for tracks in this project
            </label>
          </div>

          {/* Tracks */}
          <div>
            <label className="block text-sm font-medium text-neon-green mb-4">Tracks *</label>

            <div className="space-y-4">
              {tracks.map((track, index) => (
                <div key={index} className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-medium text-neon-green">Track {index + 1}</h3>
                    {tracks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTrack(index)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-neon-green opacity-70 mb-1">Audio File (MP3, WAV, M4A, FLAC, OGG) *</label>
                      <input
                        type="file"
                        accept="audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/flac,audio/ogg,.mp3,.wav,.m4a,.aac,.flac,.ogg"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleTrackFileChange(index, file)
                        }}
                        required
                        className="w-full text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-neon-green opacity-70 mb-1">Track Title *</label>
                      <input
                        type="text"
                        value={track.title}
                        onChange={(e) => {
                          const newTracks = [...tracks]
                          newTracks[index].title = e.target.value
                          setTracks(newTracks)
                        }}
                        required
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-neon-green focus:outline-none focus:border-neon-green"
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Add Another Track button */}
              <button
                type="button"
                onClick={handleAddTrack}
                className="w-full py-3 border-2 border-dashed border-gray-700 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 transition flex items-center justify-center gap-2"
              >
                <Music className="w-4 h-4" />
                Add Another Track
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-4 pt-4">
            <Link
              href="/dashboard"
              className="flex-1 bg-gray-800 text-white px-6 py-3 rounded-full font-semibold text-center hover:bg-gray-700 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || tracks.length === 0}
              className="flex-1 bg-white text-black px-6 py-3 rounded-full font-semibold hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

