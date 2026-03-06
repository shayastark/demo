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
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [scheduledPublishAt, setScheduledPublishAt] = useState('')
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

  const emitDraftEvent = (
    action: 'save_draft' | 'edit_draft' | 'publish_draft',
    updateId: string | null
  ) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('project_update_draft_event', {
        detail: {
          schema: 'project_update_draft.v1',
          action,
          project_id: projectId,
          update_id: updateId,
          source,
        },
      })
    )
  }

  const emitScheduleEvent = (
    action: 'schedule_set' | 'schedule_cleared' | 'schedule_autopublish',
    updateId: string | null,
    scheduledIso: string | null
  ) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('project_update_schedule_event', {
        detail: {
          schema: 'project_update_schedule.v1',
          action,
          project_id: projectId,
          update_id: updateId,
          scheduled_publish_at: scheduledIso,
          source,
        },
      })
    )
  }

  const toDateTimeLocalValue = (iso: string | null | undefined): string => {
    if (!iso) return ''
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) return ''
    const tzOffsetMinutes = date.getTimezoneOffset()
    const local = new Date(date.getTime() - tzOffsetMinutes * 60 * 1000)
    return local.toISOString().slice(0, 16)
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
      const response = await fetch(
        `/api/project-updates?project_id=${projectId}&include_drafts=true`,
        { headers }
      )
      const result = (await response.json()) as UpdatesResponse & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Failed to load updates')
      setUpdates(result.updates || [])
      setCanManage(!!result.can_manage)

      if (!hasEmittedView.current) {
        emitEvent({ action: 'view', project_id: projectId })
        hasEmittedView.current = true
      }

      const nextUpdates = result.updates || []
      const publishedOnly = nextUpdates.filter((update) => update.status !== 'draft')
      setCommentCountByUpdate((prev) => {
        const next: Record<string, number> = {}
        for (const update of publishedOnly) {
          next[update.id] = prev[update.id] || 0
        }
        return next
      })
      if (publishedOnly.length > 0) {
        await loadReactions(publishedOnly.map((update) => update.id), headers)
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

  const createUpdate = async (targetStatus: 'draft' | 'published') => {
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

      const isEditingDraft = !!editingDraftId
      const previousEditingDraft = isEditingDraft
        ? updates.find((update) => update.id === editingDraftId)
        : null
      const scheduledIso =
        targetStatus === 'draft' && scheduledPublishAt
          ? new Date(scheduledPublishAt).toISOString()
          : null
      const response = await fetch('/api/project-updates', {
        method: isEditingDraft ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          isEditingDraft
            ? {
                id: editingDraftId,
                content: trimmed,
                version_label: versionLabel.trim() || null,
                is_important: isImportant,
                status: targetStatus,
                scheduled_publish_at: targetStatus === 'draft' ? scheduledIso : null,
              }
            : {
                project_id: projectId,
                content: trimmed,
                version_label: versionLabel.trim() || null,
                is_important: isImportant,
                status: targetStatus,
                scheduled_publish_at: targetStatus === 'draft' ? scheduledIso : null,
              }
        ),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to post update')

      setContent('')
      setVersionLabel('')
      setIsImportant(false)
      setScheduledPublishAt('')
      setEditingDraftId(null)
      emitEvent({
        action: 'create',
        project_id: projectId,
        update_id: result.update?.id || null,
      })
      if (targetStatus === 'draft') {
        emitDraftEvent(isEditingDraft ? 'edit_draft' : 'save_draft', result.update?.id || null)
        if (scheduledIso) {
          emitScheduleEvent('schedule_set', result.update?.id || null, scheduledIso)
        } else if (previousEditingDraft?.scheduled_publish_at) {
          emitScheduleEvent('schedule_cleared', result.update?.id || null, null)
        }
      } else if (isEditingDraft) {
        emitDraftEvent('publish_draft', result.update?.id || null)
      }
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
        if (isImportant && targetStatus === 'published') {
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
      showToast(
        targetStatus === 'draft'
          ? isEditingDraft
            ? 'Draft updated'
            : 'Draft saved'
          : isEditingDraft
            ? 'Draft published'
            : 'Update posted',
        'success'
      )
    } catch (error) {
      console.error('Error creating project update:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save update', 'error')
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

  const editDraft = (update: ProjectUpdate) => {
    setEditingDraftId(update.id)
    setContent(update.content)
    setVersionLabel(update.version_label || '')
    setIsImportant(!!update.is_important)
    setScheduledPublishAt(toDateTimeLocalValue(update.scheduled_publish_at))
  }

  const publishDraft = async (update: ProjectUpdate) => {
    if (!authenticated) {
      onRequireAuth?.()
      return
    }
    if (!getAccessToken) return
    const previous = updates
    setPosting(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/project-updates', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: update.id, status: 'published' }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to publish draft')
      emitDraftEvent('publish_draft', update.id)
      await loadUpdates()
      showToast('Draft published', 'success')
      if (typeof window !== 'undefined' && !!result.update?.is_important) {
        window.dispatchEvent(
          new CustomEvent('project_update_importance_event', {
            detail: {
              schema: 'project_update_importance.v1',
              action: 'important_notification_sent',
              project_id: projectId,
              update_id: update.id,
              source,
            },
          })
        )
      }
    } catch (error) {
      setUpdates(previous)
      console.error('Error publishing draft:', error)
      showToast(error instanceof Error ? error.message : 'Failed to publish draft', 'error')
    } finally {
      setPosting(false)
    }
  }

  const publishedUpdates = useMemo(
    () => updates.filter((update) => update.status !== 'draft'),
    [updates]
  )
  const draftUpdates = useMemo(
    () => updates.filter((update) => update.status === 'draft'),
    [updates]
  )

  const latestSummary = useMemo(() => {
    if (publishedUpdates.length === 0) return null
    const latest = publishedUpdates[0]
    return latest.version_label ? `${latest.version_label}: ${latest.content}` : latest.content
  }, [publishedUpdates])

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
      className="ui-card mt-6 overflow-hidden"
    >
      <div className="flex w-full items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-neon-green" />
          <h3 className="text-sm font-semibold text-white tracking-wide">Project Updates</h3>
          <span className="text-xs text-gray-400">{publishedUpdates.length}</span>
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
        <div className="px-3 pb-3 sm:px-4">
          <div className="mb-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              value={versionLabel}
              onChange={(event) => setVersionLabel(event.target.value)}
              maxLength={40}
              placeholder="Version (optional)"
              className="w-full rounded-lg border border-gray-800 bg-black/70 px-2.5 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-neon-green sm:w-36"
            />
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={800}
              rows={2}
              placeholder="Share a quick update..."
              className="flex-1 resize-none rounded-lg border border-gray-800 bg-black/70 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-neon-green"
            />
            <button
              onClick={() => createUpdate('published')}
              disabled={posting || !content.trim()}
              className="ui-pressable h-9 shrink-0 rounded-lg bg-neon-green px-3 text-xs font-semibold text-black disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1">
                <Send className="w-3.5 h-3.5" />
                {posting ? 'Saving...' : editingDraftId ? 'Publish draft' : 'Post'}
              </span>
            </button>
            <button
              onClick={() => createUpdate('draft')}
              disabled={posting || !content.trim()}
              className="ui-pressable h-9 shrink-0 rounded-lg border border-gray-700 px-3 text-xs font-semibold text-gray-200 disabled:opacity-40"
            >
              {posting ? 'Saving...' : editingDraftId ? 'Save draft' : 'Save draft'}
            </button>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={isImportant}
              onChange={(event) => setIsImportant(event.target.checked)}
              className="accent-[#39FF14]"
            />
            Mark as important
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={scheduledPublishAt}
              onChange={(event) => setScheduledPublishAt(event.target.value)}
              className="rounded-md border border-gray-800 bg-black/70 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-neon-green"
            />
            <button
              type="button"
              onClick={() => {
                setScheduledPublishAt('')
                if (editingDraftId) {
                  emitScheduleEvent('schedule_cleared', editingDraftId, null)
                }
              }}
              className="rounded-md border border-gray-800 px-2 py-1 text-[11px] text-gray-300 hover:border-gray-700"
            >
              Clear schedule
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Mark important to notify followers who prefer important-only updates.
          </p>
          {editingDraftId ? (
            <button
              type="button"
              onClick={() => {
                setEditingDraftId(null)
                setContent('')
                setVersionLabel('')
                setIsImportant(false)
                setScheduledPublishAt('')
              }}
              className="mt-1 text-[11px] text-gray-400 hover:text-gray-200 underline underline-offset-2"
            >
              Cancel draft edit
            </button>
          ) : null}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto">
        {loading ? (
          <p className="px-3 sm:px-4 py-3 text-sm text-gray-500">Loading updates...</p>
        ) : publishedUpdates.length === 0 ? (
          <p className="px-3 sm:px-4 pb-4 text-sm text-gray-500">No project updates yet.</p>
        ) : (
          <ul>
            {canManage && draftUpdates.length > 0 ? (
              <li className="border-t border-gray-900 px-3 py-3.5 sm:px-4 bg-gray-950/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-gray-200">Drafts</span>
                  <span className="ui-chip border-gray-700 text-gray-300">
                    {draftUpdates.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {draftUpdates.map((update) => (
                    <div key={`draft-${update.id}`} className="rounded-lg border border-gray-800 bg-black/20 px-2.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-100 truncate">
                            {update.version_label ? `${update.version_label}: ` : ''}
                            {update.content}
                          </p>
                          <p className="mt-0.5 text-[10px] text-gray-400">
                            <span className="ui-chip border-gray-700 text-gray-300">Draft</span>
                            <span className="ml-1.5">{new Date(update.created_at).toLocaleString()}</span>
                          </p>
                          {update.scheduled_publish_at ? (
                            <p className="mt-1 text-[10px] text-neon-green">
                              Scheduled for {new Date(update.scheduled_publish_at).toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => editDraft(update)}
                            className="ui-pressable rounded-full border border-gray-700 px-2 py-1 text-[10px] text-gray-200"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => publishDraft(update)}
                            className="ui-pressable rounded-full border border-neon-green px-2 py-1 text-[10px] font-medium text-neon-green"
                          >
                            Publish
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </li>
            ) : null}
            {publishedUpdates.map((update) => (
              <li key={update.id} className="border-t border-gray-900 px-3 py-3.5 sm:px-4">
                <div className="flex items-start justify-between gap-3">
                  <div
                    id={`project-update-${update.id}`}
                    className={`min-w-0 rounded-md px-2 py-1 -mx-2 -my-1 transition-colors ${
                      highlightedUpdateId === update.id ? 'bg-neon-green/10 border border-neon-green/20' : ''
                    }`}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-gray-200">{update.author_name || 'Creator'}</span>
                      {update.version_label && (
                        <span className="ui-chip border-gray-700 text-gray-300">
                          {update.version_label}
                        </span>
                      )}
                      {update.is_important ? (
                        <span className="ui-chip border-neon-green/60 bg-neon-green/10 font-medium text-neon-green">
                          Important
                        </span>
                      ) : null}
                      <span className="text-[11px] text-gray-500">{new Date(update.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-100 whitespace-pre-wrap break-words">{update.content}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
                            aria-label={`${isActive ? 'Remove' : 'Add'} ${chip.label} reaction`}
                            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                              isActive
                                ? 'border-neon-green text-neon-green bg-neon-green/10'
                                : 'border-gray-700 text-gray-300 hover:border-gray-600'
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
                        className="inline-flex items-center gap-1 text-[11px] text-gray-300 hover:text-gray-100"
                        aria-label={`Toggle comments for update ${update.id}`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Comments ({commentCountByUpdate[update.id] || 0})
                      </button>

                      {threadOpenByUpdate[update.id] ? (
                        <div className="mt-2 rounded-lg border border-gray-800 bg-black/30 p-2.5 space-y-2">
                          {threadLoadingByUpdate[update.id] ? (
                            <p className="text-[11px] text-gray-500">Loading comments...</p>
                          ) : threadErrorByUpdate[update.id] ? (
                            <p className="text-[11px] text-gray-500">Couldn&apos;t load comments right now.</p>
                          ) : (commentsByUpdate[update.id] || []).length === 0 ? (
                            <p className="text-[11px] text-gray-500">No comments yet.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {(commentsByUpdate[update.id] || []).map((comment) => (
                                <li key={comment.id} className="rounded-md border border-gray-800 px-2 py-1.5">
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
                                        className="rounded-md p-1 text-gray-500 hover:bg-gray-800 hover:text-red-400 disabled:opacity-50"
                                        aria-label="Delete update comment"
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
                              className="flex-1 resize-none rounded-md border border-gray-800 bg-black/70 px-2 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-neon-green"
                            />
                            <button
                              type="button"
                              onClick={() => createUpdateComment(update.id)}
                              disabled={
                                !!postingCommentByUpdate[update.id] ||
                                !(commentDraftByUpdate[update.id] || '').trim()
                              }
                              className="h-7 rounded-md bg-neon-green px-2.5 text-[11px] font-semibold text-black disabled:opacity-40"
                            >
                              {postingCommentByUpdate[update.id] ? '...' : 'Send'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {(canManage || update.can_delete) && (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <button
                        onClick={() => toggleImportant(update)}
                        className={`ui-pressable rounded-full border px-2 py-1 text-[10px] font-medium ${
                          update.is_important
                            ? 'border-neon-green bg-neon-green/10 text-neon-green'
                            : 'border-gray-700 text-gray-300'
                        }`}
                        aria-label={update.is_important ? 'Unmark update as important' : 'Mark update as important'}
                      >
                        {update.is_important ? 'Unmark' : 'Important'}
                      </button>
                      <button
                        onClick={() => deleteUpdate(update.id)}
                        disabled={deletingId === update.id}
                        className="rounded-md p-1 text-gray-500 hover:bg-gray-800 hover:text-red-400 disabled:opacity-50"
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

