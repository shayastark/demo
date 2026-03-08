'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, ChevronDown, Pencil, Trash2, Send, Pin, Flame, Meh } from 'lucide-react'
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

  const displayedReactionTypes: ReactionType[] = ['hype', 'naw']
  const reactionMeta: Record<ReactionType, { label: string; icon: typeof Flame }> = {
    hype: { label: 'Hype', icon: Flame },
    naw: { label: 'Naw', icon: Meh },
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

      const currentCounts = comment.reactions || { hype: 0, naw: 0, like: 0 }
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
      if (result?.supported === false) {
        setProjectComments(previousComments)
        showToast('Comment reactions are not available yet.', 'info')
        return
      }

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

  const getDisplayName = (name?: string | null) => {
    const trimmed = name?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : 'Unknown'
  }

  const getInitials = (name?: string | null) => {
    const parts = getDisplayName(name).split(/\s+/).filter(Boolean)
    if (parts.length === 0) return 'U'
    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[24px] border border-white/8 bg-[#07080b] shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
      <button
        type="button"
        onClick={() => setCommentsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 border-b border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(8,10,15,0.96))] px-4 py-4 sm:px-5 transition-colors hover:bg-[linear-gradient(180deg,rgba(20,28,45,0.95),rgba(8,10,15,0.98))]"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-neon-green/20 bg-neon-green/10">
            <MessageCircle className="h-4 w-4 text-neon-green" />
          </div>
          <div className="text-left">
            <h3 className="text-base font-semibold tracking-tight text-white">Discussion</h3>
            <p className="text-xs text-gray-500">
              Feedback, questions, and fan conversation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-xs text-gray-300">
          <span>{commentsOpen ? 'Hide' : 'Show'}{projectComments.length > 0 ? ` (${projectComments.length})` : ''}</span>
          <ChevronDown className={`h-4 w-4 text-neon-green transition-transform ${commentsOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {!commentsOpen && latestPreview && (
        <div className="border-t border-white/6 bg-white/[0.02] px-4 py-3 text-sm text-gray-400 sm:px-5">
          <span className="text-gray-500">Latest from </span>
          <span className="font-medium text-gray-200">{getDisplayName(latestPreview.author_name)}</span>
          <span className="text-gray-500">: </span>
          <span className="truncate">{latestPreview.content}</span>
        </div>
      )}

      {commentsOpen && (
        <>
          <div className="px-4 pb-4 pt-4 sm:px-5">
            <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,12,18,0.96),rgba(6,7,10,0.96))] px-4 pb-4 pt-5 shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Join the conversation</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <textarea
                value={projectInput}
                onChange={(e) => setProjectInput(e.target.value)}
                placeholder={authenticated ? 'Add a comment...' : 'Sign in to add a comment...'}
                rows={2}
                className="block w-full flex-1 resize-none rounded-2xl border border-white/8 bg-black/70 px-4 py-3 text-sm leading-6 text-white placeholder:text-gray-500 focus:border-neon-green focus:outline-none"
              />
              <button
                onClick={submitProjectComment}
                disabled={submittingProject || !projectInput.trim()}
                aria-label="Post comment"
                className="ui-pressable min-h-11 w-full rounded-2xl bg-neon-green px-4 text-sm font-semibold text-black shadow-[0_10px_28px_rgba(57,255,20,0.22)] disabled:opacity-40 sm:min-w-[92px] sm:w-auto"
              >
                <span className="inline-flex items-center gap-1">
                  <Send className="w-3.5 h-3.5" />
                  {submittingProject ? 'Posting...' : 'Post'}
                </span>
              </button>
              </div>
            </div>
          </div>

          <div className="max-h-[28rem] overflow-y-auto px-4 pb-4 pt-1 sm:px-5 sm:pt-2">
            {loadingProjectComments ? (
              <p className="py-3 text-sm text-gray-500">Loading comments...</p>
            ) : projectComments.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-gray-500">
                No comments yet. Start the conversation.
              </div>
            ) : (
              <ul className="space-y-3">
                {projectComments.map((comment) => (
                  <li
                    key={comment.id}
                    className="group rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,12,18,0.96),rgba(7,8,12,0.96))] px-4 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.18)]"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="relative mt-0.5 h-10 w-10 min-h-10 min-w-10 max-h-10 max-w-10 flex-shrink-0 self-start overflow-hidden rounded-full border border-white/8 bg-gray-900 text-xs font-semibold text-gray-200">
                        {comment.avatar_url ? (
                          <img
                            src={comment.avatar_url}
                            alt={getDisplayName(comment.author_name)}
                            className="absolute inset-0 block h-full w-full object-cover"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center">
                            {getInitials(comment.author_name)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-white">{getDisplayName(comment.author_name)}</span>
                              {comment.is_supporter_for_project && (
                                <span className="inline-flex items-center rounded-full border border-neon-green/25 bg-neon-green/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-neon-green">
                                  Supporter
                                </span>
                              )}
                              {comment.is_pinned && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-300">
                                  <Pin className="h-2.5 w-2.5" />
                                  Pinned
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[12px] text-gray-500">{formatRelativeTime(comment.created_at)}</p>
                          </div>
                          <div className="flex items-center gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                            {comment.can_pin && (
                              <button
                                onClick={() => togglePinComment(comment.id, !!comment.is_pinned)}
                                disabled={pendingPinCommentId === comment.id}
                                className="ui-pressable inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-gray-500 hover:border-amber-300/30 hover:text-amber-300 disabled:opacity-50"
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
                                className="ui-pressable inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-gray-500 hover:border-white/15 hover:text-white"
                                aria-label="Edit comment"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {comment.can_delete && (
                              <button
                                onClick={() => deleteComment(comment.id)}
                                className="ui-pressable inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-gray-500 hover:border-red-400/30 hover:text-red-400"
                                aria-label="Delete comment"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {editingCommentId === comment.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              rows={2}
                              className="w-full resize-none rounded-2xl border border-white/8 bg-black/70 px-4 py-3 text-sm text-white focus:border-neon-green focus:outline-none"
                            />
                            <div className="flex gap-3">
                              <button
                                onClick={saveEdit}
                                className="ui-pressable rounded-full bg-neon-green px-3 py-1.5 text-xs font-semibold text-black"
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
                            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-100">{comment.content}</p>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              {displayedReactionTypes.map((reactionType) => {
                                const active = !!comment.viewer_reactions?.[reactionType]
                                const key = `${comment.id}:${reactionType}`
                                const isPending = !!pendingReactions[key]
                                const meta = reactionMeta[reactionType]
                                const Icon = meta.icon
                                return (
                                  <button
                                    key={reactionType}
                                    onClick={() => toggleCommentReaction(comment.id, reactionType)}
                                    disabled={isPending}
                                    className={`ui-pressable inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                                      active
                                        ? 'border-neon-green/40 bg-neon-green/12 text-neon-green'
                                        : 'border-white/8 bg-white/[0.03] text-gray-400 hover:border-white/15 hover:text-gray-200'
                                    } ${isPending ? 'opacity-60' : ''}`}
                                    aria-label={`${active ? 'Remove' : 'Add'} ${meta.label} reaction`}
                                  >
                                    <Icon className="h-3.5 w-3.5" />
                                    <span>{meta.label}</span>
                                    {(comment.reactions?.[reactionType] || 0) > 0 ? (
                                      <span>{comment.reactions?.[reactionType] || 0}</span>
                                    ) : null}
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

