'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, ChevronDown, Pencil, Trash2, Send, Pin } from 'lucide-react'
import { Comment } from '@/lib/types'
import { showToast } from './Toast'
import { COMMENT_REACTION_TYPES, type ReactionType } from '@/lib/commentReactions'
import { sortCommentsPinnedFirst } from '@/lib/commentPinning'

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
  const [pendingReactions, setPendingReactions] = useState<Record<string, boolean>>({})
  const [pendingPinCommentId, setPendingPinCommentId] = useState<string | null>(null)
  const supporterImpressionSentRef = useRef<Set<string>>(new Set())

  const reactionLabels: Record<ReactionType, string> = {
    helpful: 'helpful',
    fire: 'fire',
    agree: 'agree',
  }
  const reactionIcons: Record<ReactionType, string> = {
    helpful: '💡',
    fire: '🔥',
    agree: '✓',
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
      const nextComments = sortCommentsPinnedFirst<Comment>((result.comments || []) as Comment[])
      setProjectComments(nextComments)
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

  useEffect(() => {
    supporterImpressionSentRef.current = new Set()
  }, [projectId])

  useEffect(() => {
    for (const comment of projectComments) {
      if (!comment.is_supporter_for_project) continue
      if (supporterImpressionSentRef.current.has(comment.id)) continue

      emitEvent('supporter_badge_event', {
        schema: 'supporter_badge.v1',
        action: 'impression',
        project_id: projectId,
        comment_id: comment.id,
        author_id: comment.user_id,
        source: 'comments_panel',
      })
      supporterImpressionSentRef.current.add(comment.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectComments, projectId])

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
      const updateEngagementNotification = result.update_engagement_notification as
        | {
            action?: 'created' | 'skipped_self' | 'skipped_preference'
            project_id?: string
            update_id?: string
            actor_user_id?: string
            recipient_user_id?: string
            notification_type?: string
          }
        | undefined
      if (
        updateEngagementNotification?.action === 'created' ||
        updateEngagementNotification?.action === 'skipped_self' ||
        updateEngagementNotification?.action === 'skipped_preference'
      ) {
        emitEvent('update_engagement_notification_event', {
          schema: 'update_engagement_notification.v1',
          action: updateEngagementNotification.action,
          project_id: updateEngagementNotification.project_id || projectId,
          update_id: updateEngagementNotification.update_id || null,
          actor_user_id: updateEngagementNotification.actor_user_id || null,
          recipient_user_id: updateEngagementNotification.recipient_user_id || null,
          notification_type: updateEngagementNotification.notification_type || 'new_track',
        })
      }
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

  const withOptimisticReaction = (
    comments: Comment[],
    commentId: string,
    reactionType: ReactionType,
    shouldAdd: boolean
  ): Comment[] => {
    return comments.map((comment) => {
      if (comment.id !== commentId) return comment

      const currentCounts = comment.reactions || { helpful: 0, fire: 0, agree: 0, like: 0 }
      const nextCount = Math.max(0, (currentCounts[reactionType] || 0) + (shouldAdd ? 1 : -1))
      return {
        ...comment,
        reactions: {
          ...currentCounts,
          [reactionType]: nextCount,
          like: currentCounts.like || 0,
        },
        viewer_reactions: {
          ...(comment.viewer_reactions || {}),
          [reactionType]: shouldAdd,
        },
      }
    })
  }

  const withOptimisticPin = (
    comments: Comment[],
    commentId: string,
    shouldPin: boolean
  ): Comment[] => {
    return sortCommentsPinnedFirst(comments.map((comment) => {
      if (comment.id === commentId) {
        return { ...comment, is_pinned: shouldPin }
      }
      if (shouldPin) {
        return { ...comment, is_pinned: false }
      }
      return comment
    }))
  }

  const toggleCommentReaction = async (commentId: string, reactionType: ReactionType) => {
    if (!authenticated) {
      onRequireAuth()
      return
    }
    if (!getAccessToken) return

    const key = `${commentId}:${reactionType}`
    const targetComment = projectComments.find((comment) => comment.id === commentId)
    const currentlyReacted = !!targetComment?.viewer_reactions?.[reactionType]
    const action = currentlyReacted ? 'remove' : 'add'
    const previousComments = projectComments

    emitEvent('comment_reaction_event', {
      schema: 'comment_reaction.v1',
      action,
      reaction_type: reactionType,
      comment_id: commentId,
      source: 'comments_panel',
    })
    setPendingReactions((prev) => ({ ...prev, [key]: true }))
    setProjectComments((prev) => withOptimisticReaction(prev, commentId, reactionType, !currentlyReacted))

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch('/api/comment-reactions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comment_id: commentId, reaction_type: reactionType }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update reaction')

      await loadProjectComments()
    } catch (error) {
      setProjectComments(previousComments)
      console.error('Error toggling comment reaction:', error)
      showToast(error instanceof Error ? error.message : 'Failed to update reaction', 'error')
    } finally {
      setPendingReactions((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const togglePinComment = async (commentId: string, currentlyPinned: boolean) => {
    if (!authenticated) {
      onRequireAuth()
      return
    }
    if (!getAccessToken) return

    const shouldPin = !currentlyPinned
    const previousComments = projectComments
    setPendingPinCommentId(commentId)
    setProjectComments((prev) => withOptimisticPin(prev, commentId, shouldPin))

    emitEvent('comment_pin_event', {
      schema: 'comment_pin.v1',
      action: shouldPin ? 'pin' : 'unpin',
      comment_id: commentId,
      project_id: projectId,
      source: 'comments_panel',
    })

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch('/api/comments', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: commentId, is_pinned: shouldPin }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update pin')

      await loadProjectComments()
    } catch (error) {
      setProjectComments(previousComments)
      console.error('Error toggling comment pin:', error)
      showToast(error instanceof Error ? error.message : 'Failed to update pin', 'error')
    } finally {
      setPendingPinCommentId(null)
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
    <section className="ui-card mt-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setCommentsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 border-b border-gray-900/80 bg-gray-950/70 px-3 py-3 sm:px-4 hover:bg-gray-900/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-neon-green" />
          <h3 className="text-sm font-semibold text-white tracking-wide">Discussion</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{commentsOpen ? 'Hide' : 'Show'}{projectComments.length > 0 ? ` (${projectComments.length})` : ''}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${commentsOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {!commentsOpen && latestPreview && (
        <div className="px-3 sm:px-4 py-2.5 text-xs text-gray-400 truncate bg-black/20">
          Latest from {latestPreview.author_name}: {latestPreview.content}
        </div>
      )}

      {commentsOpen && (
        <>
          <div className="px-3 pt-3 pb-3 sm:px-4">
            <div className="flex items-end gap-2.5">
              <textarea
                value={projectInput}
                onChange={(e) => setProjectInput(e.target.value)}
                placeholder={authenticated ? 'Add a comment...' : 'Sign in to add a comment...'}
                rows={2}
                className="flex-1 resize-none rounded-xl border border-gray-800 bg-black/80 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-neon-green"
              />
              <button
                onClick={submitProjectComment}
                disabled={submittingProject || !projectInput.trim()}
                aria-label="Post comment"
                className="ui-pressable min-h-10 min-w-[86px] rounded-xl bg-neon-green px-3.5 text-xs font-semibold text-black disabled:opacity-40"
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
                  <li key={comment.id} className="group border-t border-gray-900/90 px-3 py-3.5 sm:px-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-800 text-[11px] text-gray-300">
                        {getInitial(comment.author_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-medium text-gray-100">{comment.author_name}</span>
                              {comment.is_supporter_for_project && (
                                <span className="ui-chip inline-flex items-center border-neon-green/30 bg-neon-green/10 text-neon-green">
                                  Supporter
                                </span>
                              )}
                              {comment.is_pinned && (
                                <span className="ui-chip inline-flex items-center gap-1 border-amber-400/30 bg-amber-500/10 text-amber-300">
                                  <Pin className="h-2.5 w-2.5" />
                                  Pinned
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] text-gray-500">{formatRelativeTime(comment.created_at)}</p>
                          </div>
                          <div className={`flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity`}>
                            {comment.can_pin && (
                              <button
                                onClick={() => togglePinComment(comment.id, !!comment.is_pinned)}
                                disabled={pendingPinCommentId === comment.id}
                                className="ui-pressable rounded-md p-1 text-gray-500 hover:bg-gray-800 hover:text-amber-300 disabled:opacity-50"
                                aria-label={comment.is_pinned ? 'Unpin comment' : 'Pin comment'}
                              >
                                <Pin className={`w-3.5 h-3.5 ${comment.is_pinned ? 'fill-current text-amber-300' : ''}`} />
                              </button>
                            )}
                            {comment.can_edit && (
                              <button
                                onClick={() => {
                                  setEditingCommentId(comment.id)
                                  setEditingContent(comment.content)
                                }}
                                className="ui-pressable rounded-md p-1 text-gray-500 hover:bg-gray-800 hover:text-white"
                                aria-label="Edit comment"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {comment.can_delete && (
                              <button
                                onClick={() => deleteComment(comment.id)}
                                className="ui-pressable rounded-md p-1 text-gray-500 hover:bg-gray-800 hover:text-red-400"
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
                              className="w-full resize-none rounded-xl border border-gray-700 bg-black px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                            />
                            <div className="flex gap-3">
                              <button
                                onClick={saveEdit}
                                className="ui-pressable rounded-md bg-neon-green px-2.5 py-1 text-xs font-semibold text-black"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingCommentId(null)
                                  setEditingContent('')
                                }}
                                className="ui-pressable text-xs text-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-100">{comment.content}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {COMMENT_REACTION_TYPES.map((reactionType) => {
                                const active = !!comment.viewer_reactions?.[reactionType]
                                const key = `${comment.id}:${reactionType}`
                                const isPending = !!pendingReactions[key]
                                return (
                                  <button
                                    key={reactionType}
                                    onClick={() => toggleCommentReaction(comment.id, reactionType)}
                                    disabled={isPending}
                                    className={`ui-pressable inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                      active
                                        ? 'border-neon-green/70 bg-neon-green/15 text-neon-green'
                                        : 'border-gray-800 bg-black/50 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                                    } ${isPending ? 'opacity-60' : ''}`}
                                    aria-label={`${active ? 'Remove' : 'Add'} ${reactionLabels[reactionType]} reaction`}
                                  >
                                    <span aria-hidden>{reactionIcons[reactionType]}</span>
                                    <span className="capitalize">{reactionLabels[reactionType]}</span>
                                    <span>{comment.reactions?.[reactionType] || 0}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </>
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

