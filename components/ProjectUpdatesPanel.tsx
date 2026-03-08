'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, Megaphone, Send, Trash2 } from 'lucide-react'
import { ProjectUpdate } from '@/lib/types'
import { showToast } from './Toast'
import { parseUpdateDeeplink, resolveUpdateIdInList } from '@/lib/updateDeeplink'

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

    } catch (error) {
      console.error('Error loading project updates:', error)
      setUpdates([])
      setCanManage(false)
    } finally {
      setLoading(false)
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
      const scheduledIso = scheduledPublishAt ? new Date(scheduledPublishAt).toISOString() : null
      const resolvedStatus = targetStatus === 'published' && scheduledIso ? 'draft' : targetStatus
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
                status: resolvedStatus,
                scheduled_publish_at: resolvedStatus === 'draft' ? scheduledIso : null,
              }
            : {
                project_id: projectId,
                content: trimmed,
                version_label: versionLabel.trim() || null,
                is_important: isImportant,
                status: resolvedStatus,
                scheduled_publish_at: resolvedStatus === 'draft' ? scheduledIso : null,
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
      if (resolvedStatus === 'draft') {
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
        if (isImportant && resolvedStatus === 'published') {
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
        resolvedStatus === 'draft'
          ? isEditingDraft
            ? scheduledIso
              ? 'Draft scheduled'
              : 'Draft updated'
            : scheduledIso
              ? 'Update scheduled'
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
  const hasScheduledPublishAt = scheduledPublishAt.trim().length > 0

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
              placeholder="Title (optional)"
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
                {posting ? 'Saving...' : hasScheduledPublishAt ? 'Schedule' : editingDraftId ? 'Publish draft' : 'Post'}
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
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="datetime-local"
                value={scheduledPublishAt}
                onChange={(event) => setScheduledPublishAt(event.target.value)}
                className="rounded-md border border-gray-800 bg-black/70 py-1.5 pl-8 pr-2 text-xs text-white focus:outline-none focus:border-neon-green"
              />
            </div>
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
                      <span className="text-[11px] text-gray-500">
                        {new Date(update.published_at || update.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-100 whitespace-pre-wrap break-words">{update.content}</p>
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

