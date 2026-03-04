'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Megaphone, Send, Trash2 } from 'lucide-react'
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
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to post update')

      setContent('')
      setVersionLabel('')
      emitEvent({
        action: 'create',
        project_id: projectId,
        update_id: result.update?.id || null,
      })
      await loadUpdates()
      showToast('Update posted', 'success')
    } catch (error) {
      console.error('Error creating project update:', error)
      showToast(error instanceof Error ? error.message : 'Failed to post update', 'error')
    } finally {
      setPosting(false)
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
                      <span className="text-[11px] text-gray-500">{new Date(update.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-100 whitespace-pre-wrap break-words">{update.content}</p>
                  </div>
                  {(canManage || update.can_delete) && (
                    <button
                      onClick={() => deleteUpdate(update.id)}
                      disabled={deletingId === update.id}
                      className="text-gray-500 hover:text-red-400 disabled:opacity-50"
                      aria-label="Delete project update"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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

