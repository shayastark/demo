'use client'

import { useEffect, useState } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { showToast } from '@/components/Toast'

interface ProjectSubscriptionToggleProps {
  projectId: string
  creatorId: string
  authenticated: boolean
  getAccessToken: () => Promise<string | null>
  onRequireAuth: () => void
  source: 'project_detail' | 'shared_project'
}

interface ProjectSubscriptionState {
  isSubscribed: boolean
  subscriberCount: number
  notificationMode: 'all' | 'important' | 'mute'
}

export default function ProjectSubscriptionToggle({
  projectId,
  creatorId,
  authenticated,
  getAccessToken,
  onRequireAuth,
  source,
}: ProjectSubscriptionToggleProps) {
  const [state, setState] = useState<ProjectSubscriptionState>({
    isSubscribed: false,
    subscriberCount: 0,
    notificationMode: 'all',
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const emitEvent = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('project_subscription_event', {
        detail: {
          schema: 'project_subscription.v1',
          source,
          project_id: projectId,
          creator_id: creatorId,
          ...detail,
        },
      })
    )
  }

  const emitModeEvent = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('project_notification_mode_event', {
        detail: {
          schema: 'project_notification_mode.v1',
          source,
          project_id: projectId,
          ...detail,
        },
      })
    )
  }

  const loadStatus = async () => {
    setLoading(true)
    try {
      const token = authenticated ? await getAccessToken() : null
      const response = await fetch(`/api/project-subscriptions?project_id=${encodeURIComponent(projectId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to load subscription state')
      const nextState = {
        isSubscribed: !!result.isSubscribed,
        subscriberCount: result.subscriberCount || 0,
        notificationMode:
          result.notification_mode === 'important' || result.notification_mode === 'mute'
            ? result.notification_mode
            : 'all',
      }
      setState(nextState)
      emitEvent({
        action: 'view_state',
        subscriber_count: nextState.subscriberCount,
        is_subscribed: nextState.isSubscribed,
      })
      if (nextState.isSubscribed) {
        emitModeEvent({
          action: 'view_mode',
          old_mode: null,
          new_mode: nextState.notificationMode,
        })
      }
    } catch (error) {
      console.error('Error loading project subscription state:', error)
      setState({ isSubscribed: false, subscriberCount: 0, notificationMode: 'all' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, authenticated])

  const handleToggle = async () => {
    if (!authenticated) {
      onRequireAuth()
      return
    }
    setSubmitting(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        onRequireAuth()
        return
      }

      const currentlySubscribed = state.isSubscribed
      const response = await fetch(
        currentlySubscribed
          ? `/api/project-subscriptions?project_id=${encodeURIComponent(projectId)}`
          : '/api/project-subscriptions',
        {
          method: currentlySubscribed ? 'DELETE' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: currentlySubscribed ? JSON.stringify({ project_id: projectId }) : JSON.stringify({ project_id: projectId }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update project watch state')

      const nextState = {
        isSubscribed: !!result.isSubscribed,
        subscriberCount: result.subscriberCount || 0,
        notificationMode:
          result.notification_mode === 'important' || result.notification_mode === 'mute'
            ? result.notification_mode
            : 'all',
      }
      setState(nextState)
      emitEvent({
        action: nextState.isSubscribed ? 'subscribe' : 'unsubscribe',
        subscriber_count: nextState.subscriberCount,
      })
    } catch (error) {
      console.error('Error toggling project subscription:', error)
      showToast('Failed to update watch state', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleModeChange = async (nextMode: 'all' | 'important' | 'mute') => {
    if (!authenticated || !state.isSubscribed || submitting) return
    const oldMode = state.notificationMode
    if (oldMode === nextMode) return
    setSubmitting(true)
    setState((prev) => ({ ...prev, notificationMode: nextMode }))
    try {
      const token = await getAccessToken()
      if (!token) {
        onRequireAuth()
        return
      }
      const response = await fetch('/api/project-subscriptions', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          notification_mode: nextMode,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to update notification mode')
      const resolvedMode =
        result.notification_mode === 'important' || result.notification_mode === 'mute'
          ? result.notification_mode
          : 'all'
      setState((prev) => ({ ...prev, notificationMode: resolvedMode }))
      emitModeEvent({
        action: 'change_mode',
        old_mode: oldMode,
        new_mode: resolvedMode,
      })
    } catch (error) {
      console.error('Error updating project notification mode:', error)
      setState((prev) => ({ ...prev, notificationMode: oldMode }))
      showToast('Failed to update notification mode', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading || submitting}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
          state.isSubscribed
            ? 'border-neon-green text-neon-green bg-neon-green/10'
            : 'border-gray-700 text-gray-300 hover:border-gray-600'
        }`}
      >
        {state.isSubscribed ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
        {loading ? 'Loading...' : state.isSubscribed ? 'Watching' : 'Watch project'}
      </button>
      <span className="text-xs text-gray-500">{state.subscriberCount} watching</span>
      {state.isSubscribed ? (
        <div className="inline-flex items-center gap-1 border border-gray-800 rounded-full px-1 py-1">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'important', label: 'Important' },
              { id: 'mute', label: 'Mute' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleModeChange(mode.id)}
              disabled={submitting}
              className={`text-[11px] px-2 py-1 rounded-full border transition ${
                state.notificationMode === mode.id
                  ? 'border-neon-green text-neon-green'
                  : 'border-gray-800 text-gray-400 hover:border-gray-700'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

