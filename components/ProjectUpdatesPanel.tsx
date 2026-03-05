'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Megaphone, Send, Trash2, MessageCircle } from 'lucide-react'
import { ProjectUpdate, ProjectUpdateComment } from '@/lib/types'
import { showToast } from './Toast'
import { parseUpdateDeeplink, resolveUpdateIdInList } from '@/lib/updateDeeplink'
import {
  buildEmptyProjectUpdateReactionSummary,
  type ProjectUpdateReactionType,
} from '@/lib/projectUpdateReactions'

interface ProjectUpdatesPanelProps {
  projectId: string
  authenticated: boolean
  getAccessToken?: () => Promise<string | null>
  onRequireAuth?: () => void
  source: 'project_detail' | 'shared_project'
}

type UpdatesResponse = {
  updates?: ProjectUpdate[]
  can_manage?: boolean
}

type UpdateReactionsResponse = {
  reactionsByUpdate?: Record<
    string,
    {
      helpful: number
      fire: number
      agree: number
      viewerReactions: Partial<Record<ProjectUpdateReactionType, boolean>>
    }
  >
}

type UpdateCommentsResponse = {
  comments?: ProjectUpdateComment[]
  count?: number
}

const UPDATE_REACTION_CHIPS: Array<{ key: ProjectUpdateReactionType; label: string }> = [
  { key: 'helpful', label: 'Helpful' },
  { key: 'fire', label: 'Fire' },
  { key: 'agree', label: 'Agree' },
]

export default function ProjectUpdatesPanel({
  projectId,
  authenticated,
  getAccessToken,
  onRequireAuth,
  source,
}: ProjectUpdatesPanelProps) {
  const [updates, setUpdates] = useState<ProjectUpdate[]>([])
  const [loading, setLoading] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [content, setContent] = useState('')
  const [versionLabel, setVersionLabel] = useState('')
  const [isImportant, setIsImportant] = useState(false)
  const [posting, setPosting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reactionsByUpdate, setReactionsByUpdate] = useState<
    Record<
      string,
      {
        helpful: number
        fire: number
        agree: number
        viewerReactions: Partial<Record<ProjectUpdateReactionType, boolean>>
      }
    >
  >({})
  const [reactionLoadingKey, setReactionLoadingKey] = useState<string | null>(null)
  const [threadOpenByUpdate, setThreadOpenByUpdate] = useState<Record<string, boolean>>({})
  const [commentsByUpdate, setCommentsByUpdate] = useState<Record<string, ProjectUpdateComment[]>>({})
  const [commentCountByUpdate, setCommentCountByUpdate] = useState<Record<string, number>>({})
  const [threadLoadingByUpdate, setThreadLoadingByUpdate] = useState<Record<string, boolean>>({})
  const [threadErrorByUpdate, setThreadErrorByUpdate] = useState<Record<string, string | null>>({})
  const [commentDraftByUpdate, setCommentDraftByUpdate] = useState<Record<string, string>>({})
  const [postingCommentByUpdate, setPostingCommentByUpdate] = useState<Record<string, boolean>>({})
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [highlightedUpdateId, setHighlightedUpdateId] = useState<string | null>(null)
  const [deeplinkNotice, setDeeplinkNotice] = useState<{
    action: 'resolved' | 'not_found' | 'invalid_id'
    updateId: string | null
    fromNotification: boolean
  } | null>(null)
  const hasEmittedView = useRef(false)
  const deeplinkTargetRef = useRef<string | null>(null)
  const deeplinkFromNotificationRef = useRef(false)
  const deeplinkHandledRef = useRef(false)
  const highlightTimeoutRef = useRef<number | null>(null)
  const deeplinkAttemptedRef = useRef(false)
  const updatesContainerRef = useRef<HTMLDivElement>(null)

  const emitEvent = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('project_update_event', {
        detail: {
          schema: 'project_update.v1',
          source,
          ...detail,
        },
      })
    )
  }

  const emitDeeplinkEvent = (action: 'resolved' | 'not_found' | 'invalid_id', updateId: string | null) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('update_deeplink_event', {
        detail: {
          schema: 'update_deeplink.v1',
          action,
          source,
          project_id: projectId,
          update_id: updateId,
          from_notification: deeplinkFromNotificationRef.current,
        },
      })
    )
  }

  const withAuthHeaders = async (): Promise<Record<string, string>> => {
    if (!authenticated || !getAccessToken) return {}
    const token = await getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const loadUpdates = async () => {
    setLoading(true)
    try {
      const headers = await withAuthHeaders()
      const response = await fetch(`/api/project-updates?project_id=${projectId}`, { headers })
      const result = (await response.json()) as UpdatesResponse & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Failed to load updates')
      setUpdates(result.updates || [])
      setCanManage(!!result.can_manage)

      if (!hasEmittedView.current) {
        emitEvent({ action: 'view', project_id: projectId })
        hasEmittedView.current = true
      }

      const nextUpdates = result.updates || []
      setCommentCountByUpdate((prev) => {
        const next: Record<string, number> = {}
        for (const update of nextUpdates) {
          next[update.id] = prev[update.id] || 0
        }
        return next
      })
      if (nextUpdates.length > 0) {
        await loadReactions(nextUpdates.map((update) => update.id), headers)
      } else {
        setReactionsByUpdate({})
      }
    } catch (error) {
      console.error('Error loading project updates:', error)
      setUpdates([])
      setCanManage(false)
    } finally {
      setLoading(false)
    }
  }

  const loadReactions = async (updateIds: string[], headersFromUpdates?: Record<string, string>) => {
    if (updateIds.length === 0) {
      setReactionsByUpdate({})
      return
    }
    try {
      const headers = headersFromUpdates || (await withAuthHeaders())
      const response = await fetch(
        `/api/project-update-reactions?update_ids=${encodeURIComponent(updateIds.join(','))}`,
        { headers }
      )
      const result = (await response.json()) as UpdateReactionsResponse & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Failed to load update reactions')
      setReactionsByUpdate(result.reactionsByUpdate || {})
    } catch (error) {
      console.error('Error loading update reactions:', error)
      setReactionsByUpdate({})
    }
  }

  useEffect(() => {
    hasEmittedView.current = false
    deeplinkTargetRef.current = null
    deeplinkFromNotificationRef.current = false
    deeplinkHandledRef.current = false
    deeplinkAttemptedRef.current = false
    setDeeplinkNotice(null)
    setHighlightedUpdateId(null)
    setThreadOpenByUpdate({})
    setCommentsByUpdate({})
    setCommentCountByUpdate({})
    setThreadLoadingByUpdate({})
    setThreadErrorByUpdate({})
    setCommentDraftByUpdate({})
    setPostingCommentByUpdate({})
    setDeletingCommentId(null)
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current)
      highlightTimeoutRef.current = null
    }

    if (typeof window !== 'undefined') {
      const parsed = parseUpdateDeeplink(window.location.search)
      deeplinkFromNotificationRef.current = parsed.fromNotification
      if (parsed.state === 'invalid') {
        deeplinkHandledRef.current = true
        setDeeplinkNotice({
          action: 'invalid_id',
          updateId: parsed.updateId,
          fromNotification: parsed.fromNotification,
        })
        emitDeeplinkEvent('invalid_id', parsed.updateId)
      } else if (parsed.state === 'valid') {
        deeplinkTargetRef.current = parsed.updateId
      }
    }

    loadUpdates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, authenticated])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (deeplinkHandledRef.current) return

    const targetUpdateId = deeplinkTargetRef.current
    if (!targetUpdateId) return
    if (loading) return
    if (deeplinkAttemptedRef.current) return

    deeplinkAttemptedRef.current = true

    const resolution = resolveUpdateIdInList(targetUpdateId, updates)
    if (resolution === 'resolved') {
      const targetElement = document.getElementById(`project-update-${targetUpdateId}`)
      targetElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedUpdateId(targetUpdateId)
      setDeeplinkNotice({
        action: 'resolved',
        updateId: targetUpdateId,
        fromNotification: deeplinkFromNotificationRef.current,
      })
      emitDeeplinkEvent('resolved', targetUpdateId)

      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current)
      }
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedUpdateId(null)
        highlightTimeoutRef.current = null
      }, 2400)
    } else {
      updatesContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setDeeplinkNotice({
        action: 'not_found',
        updateId: targetUpdateId,
        fromNotification: deeplinkFromNotificationRef.current,
      })
      emitDeeplinkEvent('not_found', targetUpdateId)
    }
    deeplinkHandledRef.current = true
  }, [loading, updates])

  const createUpdate = async () => {
    const trimmed = content.trim()
    if (!trimmed) return

    if (!authenticated) {
      onRequireAuth?.()
      return
    }
    if (!getAccessToken) return

    setPosting(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch('/api/project-updates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          content: trimmed,
          version_label: versionLabel.trim() || null,
          is_important: isImportant,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to post update')

      setContent('')
      setVersionLabel('')
      setIsImportant(false)
      emitEvent({
        action: 'create',
        project_id: projectId,
        update_id: result.update?.id || null,
      })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_update_importance_event', {
            detail: {
              schema: 'project_update_importance.v1',
              action: isImportant ? 'mark_important' : 'unmark_important',
              project_id: projectId,
              update_id: result.update?.id || null,
              source,
            },
          })
        )
        if (isImportant) {
          window.dispatchEvent(
            new CustomEvent('project_update_importance_event', {
              detail: {
                schema: 'project_update_importance.v1',
                action: 'important_notification_sent',
                project_id: projectId,
                update_id: result.update?.id || null,
                source,
              },
            })
          )
        }
      }
      await loadUpdates()
      showToast('Update posted', 'success')
    } catch (error) {
      console.error('Error creating project update:', error)
      showToast(error instanceof Error ? error.message : 'Failed to post update', 'error')
    } finally {
      setPosting(false)
    }
  }

  const toggleImportant = async (update: ProjectUpdate) => {
    if (!authenticated) {
      onRequireAuth?.()
      return
    }
    if (!getAccessToken) return
    const oldValue = !!update.is_important
    const nextValue = !oldValue
    const previous = updates
    setUpdates((current) =>
      current.map((item) => (item.id === update.id ? { ...item, is_important: nextValue } : item))
    )
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/project-updates', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: update.id,
          is_important: nextValue,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update importance')
      setUpdates((current) =>
        current.map((item) => (item.id === update.id ? { ...item, is_important: !!result.update?.is_important } : item))
      )
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_update_importance_event', {
            detail: {
              schema: 'project_update_importance.v1',
              action: nextValue ? 'mark_important' : 'unmark_important',
              project_id: projectId,
              update_id: update.id,
              source,
            },
          })
        )
      }
    } catch (error) {
      setUpdates(previous)
      console.error('Error updating update importance:', error)
      showToast(error instanceof Error ? error.message : 'Failed to update importance', 'error')
    }
  }

  const deleteUpdate = async (updateId: string) => {
    if (!authenticated) {
      onRequireAuth?.()
      return
    }
    if (!getAccessToken) return

    const prev = updates
    setDeletingId(updateId)
    setUpdates((current) => current.filter((update) => update.id !== updateId))
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(`/api/project-updates?id=${updateId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to delete update')

      emitEvent({
        action: 'delete',
        project_id: projectId,
        update_id: updateId,
      })
      await loadUpdates()
      showToast('Update deleted', 'success')
    } catch (error) {
      setUpdates(prev)
      console.error('Error deleting project update:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete update', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const latestSummary = useMemo(() => {
    if (updates.length === 0) return null
    const latest = updates[0]
    return latest.version_label ? `${latest.version_label}: ${latest.content}` : latest.content
  }, [updates])

  const toggleReaction = async (updateId: string, reactionType: ProjectUpdateReactionType) => {
    if (!authenticated) {
      onRequireAuth?.()
      return
    }
    if (!getAccessToken) return

    const key = `${updateId}-${reactionType}`
    setReactionLoadingKey(key)
    const previous = reactionsByUpdate
    const current = reactionsByUpdate[updateId] || buildEmptyProjectUpdateReactionSummary()
    const wasActive = !!current.viewerReactions[reactionType]
    const nextCount = Math.max(0, (current[reactionType] || 0) + (wasActive ? -1 : 1))

    setReactionsByUpdate({
      ...reactionsByUpdate,
      [updateId]: {
        ...current,
        [reactionType]: nextCount,
        viewerReactions: {
          ...current.viewerReactions,
          [reactionType]: !wasActive,
        },
      },
    })

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch('/api/project-update-reactions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          update_id: updateId,
          reaction_type: reactionType,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to toggle update reaction')

      const action = result.action === 'remove' ? 'remove' : 'add'
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_update_reaction_event', {
            detail: {
              schema: 'project_update_reaction.v1',
              action,
              source,
              project_id: projectId,
              update_id: updateId,
              reaction_type: reactionType,
              is_authenticated: !!authenticated,
            },
          })
        )
      }
    } catch (error) {
      setReactionsByUpdate(previous)
      console.error('Error toggling project update reaction:', error)
      showToast(error instanceof Error ? error.message : 'Failed to toggle reaction', 'error')
    } finally {
      setReactionLoadingKey(null)
    }
  }

  const loadUpdateComments = async (updateId: string) => {
    setThreadLoadingByUpdate((prev) => ({ ...prev, [updateId]: true }))
    setThreadErrorByUpdate((prev) => ({ ...prev, [updateId]: null }))
    try {
      const headers = await withAuthHeaders()
      const response = await fetch(`/api/project-update-comments?update_id=${encodeURIComponent(updateId)}`, { headers })
      const result = (await response.json()) as UpdateCommentsResponse & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Failed to load update comments')

      const comments = result.comments || []
      setCommentsByUpdate((prev) => ({ ...prev, [updateId]: comments }))
      setCommentCountByUpdate((prev) => ({ ...prev, [updateId]: result.count ?? comments.length }))
    } catch (error) {
      console.error('Error loading update comments:', error)
      setThreadErrorByUpdate((prev) => ({
        ...prev,
        [updateId]: error instanceof Error ? error.message : 'Failed to load comments',
      }))
    } finally {
      setThreadLoadingByUpdate((prev) => ({ ...prev, [updateId]: false }))
    }
  }

  const toggleThread = async (updateId: string) => {
    const willOpen = !threadOpenByUpdate[updateId]
    setThreadOpenByUpdate((prev) => ({ ...prev, [updateId]: willOpen }))
    if (willOpen) {
      if (typeof commentCountByUpdate[updateId] !== 'number') {
        setCommentCountByUpdate((prev) => ({ ...prev, [updateId]: 0 }))
      }
      if (!commentsByUpdate[updateId]) {
        await loadUpdateComments(updateId)
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_update_comment_event', {
            detail: {
              schema: 'project_update_comment.v1',
              action: 'expand_thread',
              source,
              project_id: projectId,
              update_id: updateId,
            },
          })
        )
      }
    }
  }

  const createUpdateComment = async (updateId: string) => {
    const draft = (commentDraftByUpdate[updateId] || '').trim()
    if (!draft) return

    if (!authenticated) {
      onRequireAuth?.()
      return
    }
    if (!getAccessToken) return

    setPostingCommentByUpdate((prev) => ({ ...prev, [updateId]: true }))
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/project-update-comments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          update_id: updateId,
          content: draft,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to create update comment')

      const createdComment = result.comment as ProjectUpdateComment
      setCommentsByUpdate((prev) => ({
        ...prev,
        [updateId]: [...(prev[updateId] || []), createdComment],
      }))
      setCommentCountByUpdate((prev) => ({ ...prev, [updateId]: (prev[updateId] || 0) + 1 }))
      setCommentDraftByUpdate((prev) => ({ ...prev, [updateId]: '' }))

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_update_comment_event', {
            detail: {
              schema: 'project_update_comment.v1',
              action: 'create',
              source,
              project_id: projectId,
              update_id: updateId,
              comment_id: createdComment.id,
            },
          })
        )
      }
    } catch (error) {
      console.error('Error creating update comment:', error)
      showToast(error instanceof Error ? error.message : 'Failed to comment', 'error')
    } finally {
      setPostingCommentByUpdate((prev) => ({ ...prev, [updateId]: false }))
    }
  }

  const deleteUpdateComment = async (updateId: string, commentId: string) => {
    if (!authenticated) {
      onRequireAuth?.()
      return
    }
    if (!getAccessToken) return

    const prevComments = commentsByUpdate[updateId] || []
    setDeletingCommentId(commentId)
    setCommentsByUpdate((prev) => ({
      ...prev,
      [updateId]: (prev[updateId] || []).filter((comment) => comment.id !== commentId),
    }))
    setCommentCountByUpdate((prev) => ({
      ...prev,
      [updateId]: Math.max(0, (prev[updateId] || 0) - 1),
    }))
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch(`/api/project-update-comments?id=${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to delete update comment')

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('project_update_comment_event', {
            detail: {
              schema: 'project_update_comment.v1',
              action: 'delete',
              source,
              project_id: projectId,
              update_id: updateId,
              comment_id: commentId,
            },
          })
        )
      }
    } catch (error) {
      setCommentsByUpdate((prev) => ({ ...prev, [updateId]: prevComments }))
      setCommentCountByUpdate((prev) => ({ ...prev, [updateId]: prevComments.length }))
      console.error('Error deleting update comment:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete comment', 'error')
    } finally {
      setDeletingCommentId(null)
    }
  }

  return (
    <section
      ref={updatesContainerRef}
      className="mt-6 border border-gray-800/80 rounded-lg bg-gray-950/40 overflow-hidden"
    >
      <div className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-neon-green" />
          <h3 className="text-sm text-white font-medium tracking-wide">Project Updates</h3>
          <span className="text-xs text-gray-400">{updates.length}</span>
        </div>
        {latestSummary && <p className="text-[11px] text-gray-500 truncate max-w-[50%]">{latestSummary}</p>}
      </div>

      {deeplinkNotice && (
        <div className="mx-3 sm:mx-4 mb-3 rounded-md border border-neon-green/30 bg-neon-green/10 px-3 py-2 text-xs text-neon-green flex items-center justify-between gap-3">
          <span>
            {deeplinkNotice.action === 'resolved'
              ? 'Jumped from notification to this update.'
              : deeplinkNotice.action === 'not_found'
                ? 'Linked update was not found. Showing latest updates.'
                : 'Invalid update link. Showing latest updates.'}
          </span>
          <button
            type="button"
            onClick={() => {
              setHighlightedUpdateId(null)
              setDeeplinkNotice(null)
            }}
            className="text-[11px] text-neon-green/90 hover:text-neon-green underline underline-offset-2"
          >
            Clear focus
          </button>
        </div>
      )}

      {canManage && (
        <div className="px-3 sm:px-4 pb-3">
          <div className="flex gap-2 mb-2">
            <input
              value={versionLabel}
              onChange={(event) => setVersionLabel(event.target.value)}
              maxLength={40}
              placeholder="Version (optional)"
              className="w-36 bg-black/70 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-neon-green"
            />
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={800}
              rows={2}
              placeholder="Share a quick update..."
              className="flex-1 bg-black/70 border border-gray-800 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-neon-green resize-none"
            />
            <button
              onClick={createUpdate}
              disabled={posting || !content.trim()}
              className="self-end h-9 px-3 rounded-md bg-neon-green text-black font-medium text-xs disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1">
                <Send className="w-3.5 h-3.5" />
                {posting ? 'Posting...' : 'Post'}
              </span>
            </button>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={isImportant}
              onChange={(event) => setIsImportant(event.target.checked)}
              className="accent-[#39FF14]"
            />
            Mark as important
          </label>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto">
        {loading ? (
          <p className="px-3 sm:px-4 py-3 text-sm text-gray-500">Loading updates...</p>
        ) : updates.length === 0 ? (
          <p className="px-3 sm:px-4 pb-4 text-sm text-gray-500">No project updates yet.</p>
        ) : (
          <ul>
            {updates.map((update) => (
              <li key={update.id} className="border-t border-gray-900 px-3 sm:px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div
                    id={`project-update-${update.id}`}
                    className={`min-w-0 rounded-md px-2 py-1 -mx-2 -my-1 transition-colors ${
                      highlightedUpdateId === update.id ? 'bg-neon-green/10 border border-neon-green/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-300">{update.author_name || 'Creator'}</span>
                      {update.version_label && (
                        <span className="text-[10px] rounded-full border border-gray-700 px-2 py-0.5 text-gray-400">
                          {update.version_label}
                        </span>
                      )}
                      {update.is_important ? (
                        <span className="text-[10px] rounded-full border border-neon-green/60 px-2 py-0.5 text-neon-green">
                          Important
                        </span>
                      ) : null}
                      <span className="text-[11px] text-gray-500">{new Date(update.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-100 whitespace-pre-wrap break-words">{update.content}</p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {UPDATE_REACTION_CHIPS.map((chip) => {
                        const reactionState =
                          reactionsByUpdate[update.id] || buildEmptyProjectUpdateReactionSummary()
                        const isActive = !!reactionState.viewerReactions[chip.key]
                        const count = reactionState[chip.key] || 0
                        const isLoading = reactionLoadingKey === `${update.id}-${chip.key}`

                        return (
                          <button
                            key={`${update.id}-${chip.key}`}
                            type="button"
                            onClick={() => toggleReaction(update.id, chip.key)}
                            disabled={isLoading}
                            className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                              isActive
                                ? 'border-neon-green text-neon-green bg-neon-green/10'
                                : 'border-gray-700 text-gray-400 hover:border-gray-600'
                            }`}
                          >
                            {chip.label} {count}
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => toggleThread(update.id)}
                        className="text-[11px] text-gray-400 hover:text-gray-300 inline-flex items-center gap-1"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Comments ({commentCountByUpdate[update.id] || 0})
                      </button>

                      {threadOpenByUpdate[update.id] ? (
                        <div className="mt-2 border border-gray-800 rounded-md bg-black/30 p-2.5 space-y-2">
                          {threadLoadingByUpdate[update.id] ? (
                            <p className="text-[11px] text-gray-500">Loading comments...</p>
                          ) : threadErrorByUpdate[update.id] ? (
                            <p className="text-[11px] text-gray-500">Couldn&apos;t load comments right now.</p>
                          ) : (commentsByUpdate[update.id] || []).length === 0 ? (
                            <p className="text-[11px] text-gray-500">No comments yet.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {(commentsByUpdate[update.id] || []).map((comment) => (
                                <li key={comment.id} className="rounded border border-gray-800 px-2 py-1.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-[11px] text-gray-300">
                                        {comment.author_name || 'User'} •{' '}
                                        <span className="text-gray-500">{new Date(comment.created_at).toLocaleString()}</span>
                                      </p>
                                      <p className="text-xs text-gray-100 whitespace-pre-wrap break-words mt-0.5">
                                        {comment.content}
                                      </p>
                                    </div>
                                    {comment.can_delete ? (
                                      <button
                                        type="button"
                                        disabled={deletingCommentId === comment.id}
                                        onClick={() => deleteUpdateComment(update.id, comment.id)}
                                        className="text-gray-500 hover:text-red-400 disabled:opacity-50"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    ) : null}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="flex items-end gap-2 pt-1">
                            <textarea
                              rows={1}
                              value={commentDraftByUpdate[update.id] || ''}
                              onChange={(event) =>
                                setCommentDraftByUpdate((prev) => ({
                                  ...prev,
                                  [update.id]: event.target.value,
                                }))
                              }
                              onFocus={(event) => {
                                if (!authenticated) {
                                  event.currentTarget.blur()
                                  onRequireAuth?.()
                                }
                              }}
                              maxLength={2000}
                              placeholder="Add a comment..."
                              className="flex-1 bg-black/70 border border-gray-800 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-neon-green resize-none"
                            />
                            <button
                              type="button"
                              onClick={() => createUpdateComment(update.id)}
                              disabled={
                                !!postingCommentByUpdate[update.id] ||
                                !(commentDraftByUpdate[update.id] || '').trim()
                              }
                              className="h-7 px-2 rounded-md bg-neon-green text-black text-[11px] font-medium disabled:opacity-40"
                            >
                              {postingCommentByUpdate[update.id] ? '...' : 'Send'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {(canManage || update.can_delete) && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleImportant(update)}
                        className={`text-[10px] px-2 py-1 rounded-full border ${
                          update.is_important
                            ? 'border-neon-green text-neon-green'
                            : 'border-gray-700 text-gray-400'
                        }`}
                      >
                        {update.is_important ? 'Unmark' : 'Important'}
                      </button>
                      <button
                        onClick={() => deleteUpdate(update.id)}
                        disabled={deletingId === update.id}
                        className="text-gray-500 hover:text-red-400 disabled:opacity-50"
                        aria-label="Delete project update"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

