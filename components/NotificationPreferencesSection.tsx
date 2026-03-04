'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { showToast } from '@/components/Toast'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferenceField,
  type NotificationPreferences,
} from '@/lib/notificationPreferences'

interface NotificationPreferencesSectionProps {
  authenticated: boolean
  getAccessToken: () => Promise<string | null>
}

const PREFERENCE_LABELS: Record<NotificationPreferenceField, string> = {
  notify_new_follower: 'New followers',
  notify_project_updates: 'Project updates',
  notify_tips: 'Tips received',
  notify_project_saved: 'Project saved activity',
}

const PREFERENCE_FIELDS: NotificationPreferenceField[] = [
  'notify_new_follower',
  'notify_project_updates',
  'notify_tips',
  'notify_project_saved',
]

export default function NotificationPreferencesSection({
  authenticated,
  getAccessToken,
}: NotificationPreferencesSectionProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  )
  const [loading, setLoading] = useState(false)
  const [savingField, setSavingField] = useState<NotificationPreferenceField | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hasSentViewRef = useRef(false)

  const hasAnyDisabled = useMemo(
    () => PREFERENCE_FIELDS.some((field) => !preferences[field]),
    [preferences]
  )

  const emitEvent = (detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('notification_preferences_event', {
        detail: {
          schema: 'notification_preferences.v1',
          source: 'account',
          ...detail,
        },
      })
    )
  }

  useEffect(() => {
    if (!authenticated) return
    let cancelled = false

    const loadPreferences = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Not authenticated')
        const response = await fetch('/api/notification-preferences', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load notification preferences')
        if (!cancelled) {
          setPreferences(
            (result.preferences as NotificationPreferences) || DEFAULT_NOTIFICATION_PREFERENCES
          )
        }
      } catch (loadError) {
        console.error('Error loading notification preferences:', loadError)
        if (!cancelled) {
          setError("Couldn't load notification preferences. Using defaults.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPreferences()
    return () => {
      cancelled = true
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    if (!authenticated || loading || hasSentViewRef.current) return
    hasSentViewRef.current = true
    emitEvent({ action: 'view' })
  }, [authenticated, loading])

  const togglePreference = async (field: NotificationPreferenceField) => {
    if (!authenticated || loading || savingField) return

    const previousValue = preferences[field]
    const nextValue = !previousValue
    setPreferences((prev) => ({ ...prev, [field]: nextValue }))
    setSavingField(field)
    setError(null)

    emitEvent({
      action: 'toggle',
      changed_fields: [field],
    })

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/notification-preferences', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [field]: nextValue }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to save notification preferences')
      const nextPreferences =
        (result.preferences as NotificationPreferences) || DEFAULT_NOTIFICATION_PREFERENCES
      setPreferences(nextPreferences)
      emitEvent({
        action: 'save_success',
        changed_fields: [field],
      })
    } catch (saveError) {
      console.error('Error saving notification preferences:', saveError)
      setPreferences((prev) => ({ ...prev, [field]: previousValue }))
      setError('Failed to save preference. Please try again.')
      showToast('Failed to save notification preference', 'error')
      emitEvent({
        action: 'save_failure',
        changed_fields: [field],
      })
    } finally {
      setSavingField(null)
    }
  }

  return (
    <div
      className="bg-gray-900 rounded-xl mb-6 border border-gray-800"
      style={{ padding: '20px 24px 24px 24px' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-4 h-4 text-neon-green" />
        <h2 className="font-semibold text-neon-green text-lg">Notification Preferences</h2>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Choose which in-app notifications you want to receive.
      </p>

      {error ? <p className="text-xs text-gray-500 mb-3">{error}</p> : null}

      <div className="space-y-2">
        {PREFERENCE_FIELDS.map((field) => {
          const enabled = preferences[field]
          const isSaving = savingField === field
          return (
            <button
              key={field}
              type="button"
              onClick={() => togglePreference(field)}
              disabled={loading || !!savingField}
              className="w-full flex items-center justify-between border border-gray-800 rounded-lg px-3 py-2 text-left hover:border-gray-700 transition disabled:opacity-60"
            >
              <span className="text-sm text-white">{PREFERENCE_LABELS[field]}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  enabled ? 'bg-neon-green text-black' : 'bg-gray-800 text-gray-400'
                }`}
              >
                {isSaving ? 'Saving...' : enabled ? 'On' : 'Off'}
              </span>
            </button>
          )
        })}
      </div>

      {!loading && hasAnyDisabled ? (
        <p className="text-xs text-gray-500 mt-3">Changes apply to future notifications only.</p>
      ) : null}
    </div>
  )
}

