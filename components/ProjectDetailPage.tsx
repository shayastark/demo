'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Project, Track, ProjectMetrics, ProjectNote, TrackNote } from '@/lib/types'
import { Copy, Share2, Eye, Download, Plus, Edit, ArrowLeft, FileText, Save, X } from 'lucide-react'

interface ProjectDetailPageProps {
  projectId: string
}

export default function ProjectDetailPage({ projectId }: ProjectDetailPageProps) {
  const { user } = usePrivy()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [shareLinkCopied, setShareLinkCopied] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  const [projectNote, setProjectNote] = useState<ProjectNote | null>(null)
  const [projectNoteContent, setProjectNoteContent] = useState('')
  const [editingProjectNote, setEditingProjectNote] = useState(false)
  const [trackNotes, setTrackNotes] = useState<Record<string, TrackNote>>({})
  const [editingTrackNotes, setEditingTrackNotes] = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)

  useEffect(() => {
    loadProject()
  }, [projectId])

  const loadProject = async () => {
    try {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectError) throw projectError
      setProject(projectData)

      const { data: tracksData, error: tracksError } = await supabase
        .from('tracks')
        .select('*')
        .eq('project_id', projectId)
        .order('order', { ascending: true })

      if (tracksError) throw tracksError
      setTracks(tracksData || [])

      const { data: metricsData } = await supabase
        .from('project_metrics')
        .select('*')
        .eq('project_id', projectId)
        .single()

      setMetrics(metricsData)

      // Check if current user is the creator and load notes if so
      if (user) {
        const privyId = user.id
        const { data: dbUser } = await supabase
          .from('users')
          .select('id')
          .eq('privy_id', privyId)
          .single()

        if (dbUser && dbUser.id === projectData.creator_id) {
          setIsCreator(true)

          // Load project note
          const { data: projectNoteData } = await supabase
            .from('project_notes')
            .select('*')
            .eq('project_id', projectId)
            .single()

          if (projectNoteData) {
            setProjectNote(projectNoteData)
            setProjectNoteContent(projectNoteData.content)
          }

          // Load track notes
          if (tracksData && tracksData.length > 0) {
            const trackIds = tracksData.map(t => t.id)
            const { data: trackNotesData } = await supabase
              .from('track_notes')
              .select('*')
              .in('track_id', trackIds)

            if (trackNotesData) {
              const notesMap: Record<string, TrackNote> = {}
              const editingMap: Record<string, string> = {}
              trackNotesData.forEach(note => {
                notesMap[note.track_id] = note
                editingMap[note.track_id] = note.content
              })
              setTrackNotes(notesMap)
              setEditingTrackNotes(editingMap)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading project:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyShareLink = async () => {
    if (!project) return
    const url = `${window.location.origin}/share/${project.share_token}`
    await navigator.clipboard.writeText(url)
    setShareLinkCopied(true)
    setTimeout(() => setShareLinkCopied(false), 2000)
  }

  const handleSaveProjectNote = async () => {
    if (!project) return
    setSavingNote('project')

    try {
      if (projectNote) {
        // Update existing note
        const { data, error } = await supabase
          .from('project_notes')
          .update({ content: projectNoteContent })
          .eq('id', projectNote.id)
          .select()
          .single()

        if (error) throw error
        setProjectNote(data)
      } else {
        // Create new note
        const { data, error } = await supabase
          .from('project_notes')
          .insert({ project_id: project.id, content: projectNoteContent })
          .select()
          .single()

        if (error) throw error
        setProjectNote(data)
      }
      setEditingProjectNote(false)
    } catch (error) {
      console.error('Error saving project note:', error)
      alert('Failed to save note')
    } finally {
      setSavingNote(null)
    }
  }

  const handleSaveTrackNote = async (trackId: string) => {
    setSavingNote(trackId)

    try {
      const content = editingTrackNotes[trackId] || ''

      if (trackNotes[trackId]) {
        // Update existing note
        const { data, error } = await supabase
          .from('track_notes')
          .update({ content })
          .eq('id', trackNotes[trackId].id)
          .select()
          .single()

        if (error) throw error
        setTrackNotes({ ...trackNotes, [trackId]: data })
      } else {
        // Create new note
        const { data, error } = await supabase
          .from('track_notes')
          .insert({ track_id: trackId, content })
          .select()
          .single()

        if (error) throw error
        setTrackNotes({ ...trackNotes, [trackId]: data })
      }

      setEditingTrackNotes({ ...editingTrackNotes, [trackId]: content })
    } catch (error) {
      console.error('Error saving track note:', error)
      alert('Failed to save note')
    } finally {
      setSavingNote(null)
    }
  }

  const startEditingTrackNote = (trackId: string) => {
    const currentNote = trackNotes[trackId]
    setEditingTrackNotes({
      ...editingTrackNotes,
      [trackId]: currentNote?.content || ''
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div>Loading...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Project Not Found</h1>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${project.share_token}`

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/dashboard" className="flex items-center gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <Link href="/" className="text-2xl font-bold">
            Hubba
          </Link>
        </div>
      </nav>

      <main className="px-4 py-8 max-w-4xl mx-auto">
        {/* Cover Image */}
        {project.cover_image_url && (
          <div className="w-full h-64 md:h-96 rounded-lg overflow-hidden mb-6">
            <img
              src={project.cover_image_url}
              alt={project.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Project Info */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{project.title}</h1>
          {project.description && (
            <p className="text-gray-400 text-lg mb-6">{project.description}</p>
          )}

          {/* Share Link */}
          <div className="bg-gray-900 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Share Link</span>
              <button
                onClick={handleCopyShareLink}
                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
              >
                {shareLinkCopied ? (
                  <>Copied!</>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="bg-black rounded p-2 text-sm break-all text-gray-300">
              {shareUrl}
            </div>
          </div>

          {/* Metrics */}
          {metrics && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <Eye className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                <div className="text-2xl font-bold">{metrics.plays || 0}</div>
                <div className="text-sm text-gray-400">Plays</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <Share2 className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                <div className="text-2xl font-bold">{metrics.shares || 0}</div>
                <div className="text-sm text-gray-400">Shares</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <Plus className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                <div className="text-2xl font-bold">{metrics.adds || 0}</div>
                <div className="text-sm text-gray-400">Adds</div>
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="bg-gray-900 rounded-lg p-4 mb-6">
            <h3 className="font-semibold mb-3">Project Settings</h3>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Allow Downloads</div>
                <div className="text-sm text-gray-400">
                  Users can download tracks from this project
                </div>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                project.allow_downloads
                  ? 'bg-green-900 text-green-300'
                  : 'bg-gray-800 text-gray-400'
              }`}>
                {project.allow_downloads ? 'Enabled' : 'Disabled'}
              </div>
            </div>
          </div>

          {/* Project Notes (Private to Creator) - Only show if user is creator */}
          {isCreator && (
          <div className="bg-gray-900 rounded-lg p-4 mb-6 border border-yellow-900/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-yellow-400" />
                <h3 className="font-semibold">Project Notes</h3>
                <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">Private</span>
              </div>
              {!editingProjectNote && (
                <button
                  onClick={() => setEditingProjectNote(true)}
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Edit className="w-4 h-4" />
                  {projectNote ? 'Edit' : 'Add Note'}
                </button>
              )}
            </div>

            {editingProjectNote ? (
              <div className="space-y-3">
                <textarea
                  value={projectNoteContent}
                  onChange={(e) => setProjectNoteContent(e.target.value)}
                  placeholder="Add private notes about this project (not visible to listeners)..."
                  rows={6}
                  className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-yellow-600 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveProjectNote}
                    disabled={savingNote === 'project'}
                    className="flex items-center gap-2 bg-yellow-600 text-black px-4 py-2 rounded-lg text-sm font-semibold hover:bg-yellow-500 transition disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {savingNote === 'project' ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingProjectNote(false)
                      setProjectNoteContent(projectNote?.content || '')
                    }}
                    className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : projectNote ? (
              <div className="bg-black rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap">
                {projectNote.content}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No notes yet. Click "Add Note" to add private notes about this project.</p>
            )}
          </div>
          )}
        </div>

        {/* Tracks */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Tracks ({tracks.length})</h2>
          </div>

          {tracks.length === 0 ? (
            <div className="text-center py-12 bg-gray-900 rounded-lg">
              <p className="text-gray-400">No tracks in this project yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tracks.map((track, index) => {
                const trackNote = trackNotes[track.id]
                const isEditingNote = editingTrackNotes.hasOwnProperty(track.id)
                const noteContent = editingTrackNotes[track.id] || ''

                return (
                  <div key={track.id} className="bg-gray-900 rounded-lg p-4 space-y-4">
                    <div className="flex gap-4">
                      {track.image_url && (
                        <img
                          src={track.image_url}
                          alt={track.title}
                          className="w-20 h-20 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm text-gray-400 mb-1">Track {index + 1}</div>
                            <h3 className="text-xl font-semibold">{track.title}</h3>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Track Notes (Private to Creator) - Only show if user is creator */}
                    {isCreator && (
                    <div className="border-t border-gray-800 pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-yellow-400" />
                          <span className="text-sm font-medium">Track Notes</span>
                          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">Private</span>
                        </div>
                        {!isEditingNote && (
                          <button
                            onClick={() => startEditingTrackNote(track.id)}
                            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                          >
                            <Edit className="w-3 h-3" />
                            {trackNote ? 'Edit' : 'Add Note'}
                          </button>
                        )}
                      </div>

                      {isEditingNote ? (
                        <div className="space-y-2">
                          <textarea
                            value={noteContent}
                            onChange={(e) => setEditingTrackNotes({ ...editingTrackNotes, [track.id]: e.target.value })}
                            placeholder="Add private notes about this track..."
                            rows={3}
                            className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-600 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveTrackNote(track.id)}
                              disabled={savingNote === track.id}
                              className="flex items-center gap-1 bg-yellow-600 text-black px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-yellow-500 transition disabled:opacity-50"
                            >
                              <Save className="w-3 h-3" />
                              {savingNote === track.id ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => {
                                const newEditing = { ...editingTrackNotes }
                                delete newEditing[track.id]
                                setEditingTrackNotes(newEditing)
                              }}
                              className="flex items-center gap-1 bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-700 transition"
                            >
                              <X className="w-3 h-3" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : trackNote ? (
                        <div className="bg-black rounded-lg p-2 text-xs text-gray-300 whitespace-pre-wrap">
                          {trackNote.content}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic">No notes yet.</p>
                      )}
                    </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

