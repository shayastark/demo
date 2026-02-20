'use client'

import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Clock3, Pencil, Trash2, Send } from 'lucide-react'
import { Comment, Track } from '@/lib/types'
import { showToast } from './Toast'

interface CommentsPanelProps {
  projectId: string
  tracks: Track[]
  authenticated: boolean
  getAccessToken?: () => Promise<string | null>
  onRequireAuth: () => void
  playbackTrackId?: string | null
  playbackCurrentTime?: number
  onSeekToTimestamp?: (trackId: string, time: number) => void
}

export default function CommentsPanel({
  projectId,
  tracks,
  authenticated,
  getAccessToken,
  onRequireAuth,
  playbackTrackId,
  playbackCurrentTime = 0,
  onSeekToTimestamp,
}: CommentsPanelProps) {
  const [projectComments, setProjectComments] = useState<Comment[]>([])
  const [trackComments, setTrackComments] = useState<Comment[]>([])
  const [selectedTrackId, setSelectedTrackId] = useState<string>('')
  const [projectInput, setProjectInput] = useState('')
  const [trackInput, setTrackInput] = useState('')
  const [trackTimestamp, setTrackTimestamp] = useState(0)
  const [loadingProjectComments, setLoadingProjectComments] = useState(false)
  const [loadingTrackComments, setLoadingTrackComments] = useState(false)
  const [submittingProject, setSubmittingProject] = useState(false)
  const [submittingTrack, setSubmittingTrack] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')

  useEffect(() => {
    if (tracks.length > 0 && !selectedTrackId) {
      setSelectedTrackId(tracks[0].id)
    }
  }, [tracks, selectedTrackId])

  useEffect(() => {
    if (playbackTrackId && tracks.some((track) => track.id === playbackTrackId)) {
      setSelectedTrackId(playbackTrackId)
    }
  }, [playbackTrackId, tracks])

  const selectedTrack = useMemo(
    () => tracks.find((track) => track.id === selectedTrackId) || null,
    [tracks, selectedTrackId]
  )

  const formatTime = (seconds: number | null) => {
    if (seconds === null || !Number.isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const withAuthHeaders = async (): Promise<Record<string, string>> => {
    if (!authenticated || !getAccessToken) return {}
    const token = await getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const loadProjectComments = async () => {
    setLoadingProjectComments(true)
    try {
      const headers = await withAuthHeaders()
      const response = await fetch(`/api/comments?project_id=${projectId}`, { headers })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to load comments')
      setProjectComments(result.comments || [])
    } catch (error) {
      console.error('Error loading project comments:', error)
    } finally {
      setLoadingProjectComments(false)
    }
  }

  const loadTrackComments = async (trackId: string) => {
    if (!trackId) return
    setLoadingTrackComments(true)
    try {
      const headers = await withAuthHeaders()
      const response = await fetch(`/api/comments?track_id=${trackId}`, { headers })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to load track comments')
      setTrackComments(result.comments || [])
    } catch (error) {
      console.error('Error loading track comments:', error)
    } finally {
      setLoadingTrackComments(false)
    }
  }

  useEffect(() => {
    loadProjectComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, authenticated])

  useEffect(() => {
    if (!selectedTrackId) return
    loadTrackComments(selectedTrackId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrackId, authenticated])

  const emitEvent = (name: string, detail?: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(name, { detail }))
  }

  const submitProjectComment = async () => {
    const content = projectInput.trim()
    if (!content) return
    if (!authenticated) {
      onRequireAuth()
      return
    }
    if (!getAccessToken) return

    setSubmittingProject(true)
    emitEvent('comment_post_started', { target: 'project' })

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ project_id: projectId, content }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to post comment')

      setProjectInput('')
      await loadProjectComments()
      emitEvent('comment_post_succeeded', { target: 'project' })
      showToast('Comment posted', 'success')
    } catch (error) {
      emitEvent('comment_post_failed', { target: 'project' })
      console.error('Error posting project comment:', error)
      showToast(error instanceof Error ? error.message : 'Failed to post comment', 'error')
    } finally {
      setSubmittingProject(false)
    }
  }

  const submitTrackComment = async () => {
    const content = trackInput.trim()
    if (!content || !selectedTrackId) return
    if (!authenticated) {
      onRequireAuth()
      return
    }
    if (!getAccessToken) return

    const timestamp = Math.max(0, Math.floor(trackTimestamp))
    setSubmittingTrack(true)
    emitEvent('comment_post_started', { target: 'track' })

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          track_id: selectedTrackId,
          timestamp_seconds: timestamp,
          content,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to post track comment')

      setTrackInput('')
      await loadTrackComments(selectedTrackId)
      emitEvent('comment_post_succeeded', { target: 'track' })
      showToast('Track comment posted', 'success')
    } catch (error) {
      emitEvent('comment_post_failed', { target: 'track' })
      console.error('Error posting track comment:', error)
      showToast(error instanceof Error ? error.message : 'Failed to post track comment', 'error')
    } finally {
      setSubmittingTrack(false)
    }
  }

  const saveEdit = async () => {
    if (!editingCommentId || !getAccessToken) return
    const content = editingContent.trim()
    if (!content) return

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch('/api/comments', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: editingCommentId, content }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to edit comment')

      setEditingCommentId(null)
      setEditingContent('')
      await Promise.all([
        loadProjectComments(),
        selectedTrackId ? loadTrackComments(selectedTrackId) : Promise.resolve(),
      ])
      showToast('Comment updated', 'success')
    } catch (error) {
      console.error('Error editing comment:', error)
      showToast(error instanceof Error ? error.message : 'Failed to edit comment', 'error')
    }
  }

  const deleteComment = async (commentId: string) => {
    if (!getAccessToken) return
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(`/api/comments?id=${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to delete comment')

      await Promise.all([
        loadProjectComments(),
        selectedTrackId ? loadTrackComments(selectedTrackId) : Promise.resolve(),
      ])
      showToast('Comment deleted', 'success')
    } catch (error) {
      console.error('Error deleting comment:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete comment', 'error')
    }
  }

  return (
    <div className="mt-10 space-y-6">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-4 h-4 text-neon-green" />
          <h3 className="text-white font-semibold">Project Feedback</h3>
        </div>
        <div className="flex gap-2">
          <input
            value={projectInput}
            onChange={(e) => setProjectInput(e.target.value)}
            placeholder="Leave project-level feedback..."
            className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
          />
          <button
            onClick={submitProjectComment}
            disabled={submittingProject || !projectInput.trim()}
            className="px-3 py-2 rounded-lg bg-neon-green text-black font-medium disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2 mt-4">
          {loadingProjectComments ? (
            <p className="text-sm text-gray-500">Loading comments...</p>
          ) : projectComments.length === 0 ? (
            <p className="text-sm text-gray-500">No project comments yet.</p>
          ) : (
            projectComments.map((comment) => (
              <div key={comment.id} className="bg-black/40 border border-gray-800 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-xs text-gray-400">{comment.author_name}</span>
                  <div className="flex items-center gap-2">
                    {comment.can_edit && (
                      <button
                        onClick={() => {
                          setEditingCommentId(comment.id)
                          setEditingContent(comment.content)
                        }}
                        className="text-gray-500 hover:text-white"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {comment.can_delete && (
                      <button
                        onClick={() => deleteComment(comment.id)}
                        className="text-gray-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {editingCommentId === comment.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={2}
                      className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="text-xs bg-neon-green text-black px-2 py-1 rounded">Save</button>
                      <button
                        onClick={() => {
                          setEditingCommentId(null)
                          setEditingContent('')
                        }}
                        className="text-xs text-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-white whitespace-pre-wrap">{comment.content}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock3 className="w-4 h-4 text-neon-green" />
          <h3 className="text-white font-semibold">Track Timestamp Feedback</h3>
        </div>
        <div className="space-y-2 mb-3">
          <select
            value={selectedTrackId}
            onChange={(e) => setSelectedTrackId(e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
          >
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>{track.title}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={trackTimestamp}
              onChange={(e) => setTrackTimestamp(Number(e.target.value) || 0)}
              className="w-28 bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
            />
            <button
              onClick={() => setTrackTimestamp(Math.max(0, Math.floor(playbackCurrentTime || 0)))}
              className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-300 hover:text-white"
            >
              Use current ({formatTime(Math.floor(playbackCurrentTime || 0))})
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={trackInput}
              onChange={(e) => setTrackInput(e.target.value)}
              placeholder="Leave feedback at this timestamp..."
              className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
            />
            <button
              onClick={submitTrackComment}
              disabled={submittingTrack || !trackInput.trim() || !selectedTrackId}
              className="px-3 py-2 rounded-lg bg-neon-green text-black font-medium disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {loadingTrackComments ? (
            <p className="text-sm text-gray-500">Loading track comments...</p>
          ) : trackComments.length === 0 ? (
            <p className="text-sm text-gray-500">No timestamp comments for this track yet.</p>
          ) : (
            trackComments.map((comment) => (
              <div key={comment.id} className="bg-black/40 border border-gray-800 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-gray-400">{comment.author_name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (selectedTrack && comment.timestamp_seconds !== null) {
                          onSeekToTimestamp?.(selectedTrack.id, comment.timestamp_seconds)
                          emitEvent('timestamp_jump_clicked', {
                            trackId: selectedTrack.id,
                            timestamp: comment.timestamp_seconds,
                          })
                        }
                      }}
                      className="text-xs text-neon-green hover:underline"
                    >
                      {formatTime(comment.timestamp_seconds)}
                    </button>
                    {comment.can_edit && (
                      <button
                        onClick={() => {
                          setEditingCommentId(comment.id)
                          setEditingContent(comment.content)
                        }}
                        className="text-gray-500 hover:text-white"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {comment.can_delete && (
                      <button
                        onClick={() => deleteComment(comment.id)}
                        className="text-gray-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {editingCommentId === comment.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={2}
                      className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="text-xs bg-neon-green text-black px-2 py-1 rounded">Save</button>
                      <button
                        onClick={() => {
                          setEditingCommentId(null)
                          setEditingContent('')
                        }}
                        className="text-xs text-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-white whitespace-pre-wrap">{comment.content}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

