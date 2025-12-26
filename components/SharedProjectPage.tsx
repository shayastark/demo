'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { supabase } from '@/lib/supabase'
import { Project, Track } from '@/lib/types'
import AudioPlayer from './AudioPlayer'
import { Share2, Download, Plus, Copy, Check } from 'lucide-react'

interface SharedProjectPageProps {
  token: string
}

export default function SharedProjectPage({ token }: SharedProjectPageProps) {
  const { authenticated, user, login } = usePrivy()
  const [project, setProject] = useState<Project | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [linkCopied, setLinkCopied] = useState(false)
  const [addedToProject, setAddedToProject] = useState(false)
  const checkedAddedRef = useRef<string | null>(null) // Track which project/user combo we've checked

  useEffect(() => {
    loadProject()
  }, [token])

  useEffect(() => {
    if (authenticated && user && project) {
      const checkKey = `${user.id}-${project.id}`
      // Prevent duplicate checks for the same user/project combo
      if (checkedAddedRef.current === checkKey) {
        return
      }
      checkedAddedRef.current = checkKey
      checkIfAdded()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, user?.id, project?.id]) // Only depend on user.id and project.id, not the whole objects

  const loadProject = async () => {
    try {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('share_token', token)
        .single()

      if (projectError) throw projectError
      setProject(projectData)

      const { data: tracksData, error: tracksError } = await supabase
        .from('tracks')
        .select('*')
        .eq('project_id', projectData.id)
        .order('order', { ascending: true })

      if (tracksError) throw tracksError
      setTracks(tracksData || [])

      // Track view - increment plays metric
      const { data: metrics } = await supabase
        .from('project_metrics')
        .select('plays')
        .eq('project_id', projectData.id)
        .single()

      if (metrics) {
        await supabase
          .from('project_metrics')
          .update({ plays: (metrics.plays || 0) + 1 })
          .eq('project_id', projectData.id)
      } else {
        await supabase
          .from('project_metrics')
          .insert({ project_id: projectData.id, plays: 1 })
      }
    } catch (error) {
      console.error('Error loading project:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkIfAdded = async () => {
    if (!user || !project) return

    try {
      const privyId = user.id
      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (dbUser) {
        const { data } = await supabase
          .from('user_projects')
          .select('id')
          .eq('user_id', dbUser.id)
          .eq('project_id', project.id)
          .single()

        setAddedToProject(!!data)
      }
    } catch (error) {
      // User not logged in or not added
      setAddedToProject(false)
    }
  }

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/share/${token}`
    await navigator.clipboard.writeText(url)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)

    // Track share
    if (project) {
      await supabase
        .from('project_shares')
        .insert({ project_id: project.id })

      const { data: metrics } = await supabase
        .from('project_metrics')
        .select('shares')
        .eq('project_id', project.id)
        .single()

      if (metrics) {
        await supabase
          .from('project_metrics')
          .update({ shares: (metrics.shares || 0) + 1 })
          .eq('project_id', project.id)
      } else {
        await supabase
          .from('project_metrics')
          .insert({ project_id: project.id, shares: 1 })
      }
    }
  }

  const handleAddToProject = async () => {
    if (!authenticated) {
      login()
      return
    }

    if (!user || !project) return

    try {
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

      if (!dbUser) throw new Error('User not found')
      
      await supabase
        .from('user_projects')
        .insert({ user_id: dbUser.id, project_id: project.id })

      // Track add
      const { data: metrics } = await supabase
        .from('project_metrics')
        .select('adds')
        .eq('project_id', project.id)
        .single()

      if (metrics) {
        await supabase
          .from('project_metrics')
          .update({ adds: (metrics.adds || 0) + 1 })
          .eq('project_id', project.id)
      } else {
        await supabase
          .from('project_metrics')
          .insert({ project_id: project.id, adds: 1 })
      }

      setAddedToProject(true)
    } catch (error) {
      console.error('Error adding to project:', error)
    }
  }

  const handleDownload = async (track: Track) => {
    if (!project?.allow_downloads) return

    try {
      const response = await fetch(track.audio_url)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${track.title}.mp3`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading track:', error)
    }
  }

  const handleTrackPlay = async (trackId: string) => {
    if (!project) return

    try {
      await supabase
        .from('track_plays')
        .insert({ track_id: trackId })

      // Update metrics
      const { data: metrics } = await supabase
        .from('project_metrics')
        .select('plays')
        .eq('project_id', project.id)
        .single()

      if (metrics) {
        await supabase
          .from('project_metrics')
          .update({ plays: (metrics.plays || 0) + 1 })
          .eq('project_id', project.id)
      } else {
        await supabase
          .from('project_metrics')
          .insert({ project_id: project.id, plays: 1 })
      }
    } catch (error) {
      console.error('Error tracking play:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-neon-green">Loading...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-white">Project Not Found</h1>
          <p className="text-neon-green opacity-90">This project doesn't exist or the link is invalid.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Simple app header so users can discover Hubba from shared links */}
      <header className="border-b border-gray-800 bg-black px-4 py-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight text-white">
            Hubba
          </Link>
          <div className="flex items-center gap-2">
            {!authenticated ? (
              <button
                onClick={login}
                className="px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-200 transition"
              >
                Sign in / Sign up
              </button>
            ) : (
              <Link
                href="/dashboard"
                className="px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-200 transition"
              >
                Open app
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Cover Image */}
        {project.cover_image_url && (
          <div className="w-full h-40 md:h-56 rounded-lg overflow-hidden mb-6">
            <img
              src={project.cover_image_url}
              alt={project.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Project Info */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 text-white">{project.title}</h1>
          {project.description && (
            <p className="text-neon-green text-lg mb-6 opacity-90">{project.description}</p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleAddToProject}
              disabled={addedToProject}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition ${
                addedToProject
                  ? 'bg-gray-800 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-gray-200'
              }`}
            >
              {addedToProject ? (
                <>
                  <Check className="w-4 h-4" />
                  Added
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add to My Projects
                </>
              )}
            </button>

            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-full font-semibold hover:bg-gray-700 transition"
            >
              {linkCopied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tracks */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold mb-4">Tracks</h2>
          {tracks.length === 0 ? (
            <p className="text-neon-green">No tracks in this project yet.</p>
          ) : (
            tracks.map((track) => (
              <div key={track.id} className="bg-gray-900 rounded-lg p-4">
                <div className="flex gap-4 mb-4">
                  {track.image_url && (
                    <img
                      src={track.image_url}
                      alt={track.title}
                      className="w-10 h-10 md:w-12 md:h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-2 text-neon-green">{track.title}</h3>
                    {project.allow_downloads && (
                      <button
                        onClick={() => handleDownload(track)}
                        className="flex items-center gap-2 text-sm text-neon-green hover:opacity-80 transition opacity-70"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    )}
                  </div>
                </div>
                <AudioPlayer
                  src={track.audio_url}
                  title={track.title}
                  onPlay={() => handleTrackPlay(track.id)}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
