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
}

export default function ProjectSubscriptionToggle({
  projectId,
  creatorId,
  authenticated,
  getAccessToken,
  onRequireAuth,
  source,
}: ProjectSubscriptionToggleProps) {
  const [state, setState] = useState<ProjectSubscriptionState>({ isSubscribed: false, subscriberCount: 0 })
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
      }
      setState(nextState)
      emitEvent({
        action: 'view_state',
        subscriber_count: nextState.subscriberCount,
        is_subscribed: nextState.isSubscribed,
      })
    } catch (error) {
      console.error('Error loading project subscription state:', error)
      setState({ isSubscribed: false, subscriberCount: 0 })
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

  return (
    <div className="inline-flex items-center gap-2">
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
    </div>
  )
}

