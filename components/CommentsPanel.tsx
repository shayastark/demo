'use client'

import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, ChevronDown, Pencil, Trash2, Send } from 'lucide-react'
import { Comment } from '@/lib/types'
import { showToast } from './Toast'

interface CommentsPanelProps {
  projectId: string
  authenticated: boolean
  getAccessToken?: () => Promise<string | null>
  onRequireAuth: () => void
}

export default function CommentsPanel({
  projectId,
  authenticated,
  getAccessToken,
  onRequireAuth,
}: CommentsPanelProps) {
  const [projectComments, setProjectComments] = useState<Comment[]>([])
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [projectInput, setProjectInput] = useState('')
  const [loadingProjectComments, setLoadingProjectComments] = useState(false)
  const [submittingProject, setSubmittingProject] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')

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

  useEffect(() => {
    loadProjectComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, authenticated])

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
      await loadProjectComments()
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

      await loadProjectComments()
      showToast('Comment deleted', 'success')
    } catch (error) {
      console.error('Error deleting comment:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete comment', 'error')
    }
  }

  const latestPreview = useMemo(() => {
    if (projectComments.length === 0) return null
    return projectComments[0]
  }, [projectComments])

  const formatRelativeTime = (isoDate: string) => {
    const timestamp = new Date(isoDate).getTime()
    if (!Number.isFinite(timestamp)) return ''
    const diffMs = Date.now() - timestamp
    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour
    const week = 7 * day

    if (diffMs < minute) return 'just now'
    if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`
    if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
    if (diffMs < week) return `${Math.floor(diffMs / day)}d ago`
    return new Date(isoDate).toLocaleDateString()
  }

  const getInitial = (name?: string | null) => {
    if (!name) return '?'
    return name.trim().charAt(0).toUpperCase()
  }

  return (
    <section className="mt-6 border border-gray-800/80 rounded-lg bg-gray-950/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setCommentsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-neon-green" />
          <h3 className="text-sm text-white font-medium tracking-wide">Discussion</h3>
          <span className="text-xs text-gray-400">{projectComments.length}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{commentsOpen ? 'Hide' : 'Show'}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${commentsOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {!commentsOpen && latestPreview && (
        <div className="px-3 sm:px-4 pb-3 text-xs text-gray-400 truncate">
          Latest from {latestPreview.author_name}: {latestPreview.content}
        </div>
      )}

      {commentsOpen && (
        <>
          <div className="px-3 sm:px-4 pb-3">
            <div className="flex gap-2">
              <textarea
                value={projectInput}
                onChange={(e) => setProjectInput(e.target.value)}
                placeholder={authenticated ? 'Add a comment...' : 'Sign in to add a comment...'}
                rows={2}
                className="flex-1 bg-black/70 border border-gray-800 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-neon-green resize-none"
              />
              <button
                onClick={submitProjectComment}
                disabled={submittingProject || !projectInput.trim()}
                className="self-end h-9 px-3 rounded-md bg-neon-green text-black font-medium text-xs disabled:opacity-40"
              >
                <span className="inline-flex items-center gap-1">
                  <Send className="w-3.5 h-3.5" />
                  {submittingProject ? 'Posting...' : 'Post'}
                </span>
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {loadingProjectComments ? (
              <p className="px-3 sm:px-4 py-3 text-sm text-gray-500">Loading comments...</p>
            ) : projectComments.length === 0 ? (
              <p className="px-3 sm:px-4 pb-4 text-sm text-gray-500">No comments yet.</p>
            ) : (
              <ul>
                {projectComments.map((comment) => (
                  <li
                    key={comment.id}
                    className="group border-t border-gray-900 px-3 sm:px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-6 w-6 rounded-full bg-gray-800 text-gray-300 text-[11px] flex items-center justify-center">
                        {getInitial(comment.author_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="text-xs text-gray-300 truncate">{comment.author_name}</span>
                            <span className="text-[11px] text-gray-500">{formatRelativeTime(comment.created_at)}</span>
                          </div>
                          <div className={`flex items-center gap-2 ${editingCommentId === comment.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                            {comment.can_edit && (
                              <button
                                onClick={() => {
                                  setEditingCommentId(comment.id)
                                  setEditingContent(comment.content)
                                }}
                                className="text-gray-500 hover:text-white"
                                aria-label="Edit comment"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {comment.can_delete && (
                              <button
                                onClick={() => deleteComment(comment.id)}
                                className="text-gray-500 hover:text-red-400"
                                aria-label="Delete comment"
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
                              className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green resize-none"
                            />
                            <div className="flex gap-3">
                              <button
                                onClick={saveEdit}
                                className="text-xs bg-neon-green text-black px-2.5 py-1 rounded"
                              >
                                Save
                              </button>
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
                          <p className="text-sm text-gray-100 whitespace-pre-wrap break-words">{comment.content}</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}

