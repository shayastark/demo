'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { showToast } from '@/components/Toast'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationDeliveryMode,
  type NotificationDigestWindow,
  type NotificationPreferences,
  parseNotificationPreferencesResponse,
} from '@/lib/notificationPreferences'

interface NotificationPreferencesSectionProps {
  authenticated: boolean
  getAccessToken: () => Promise<string | null>
}

type NotificationToggleField =
  | 'notify_new_follower'
  | 'notify_project_updates'
  | 'notify_tips'
  | 'notify_project_saved'

const PREFERENCE_LABELS: Record<NotificationToggleField, string> = {
  notify_new_follower: 'New followers',
  notify_project_updates: 'Project updates',
  notify_tips: 'Tips received',
  notify_project_saved: 'Project saved activity',
}

const PREFERENCE_DESCRIPTIONS: Record<NotificationToggleField, string> = {
  notify_new_follower: 'Alert me when someone follows my creator profile.',
  notify_project_updates: 'Alert me when followed or watched projects publish updates.',
  notify_tips: 'Alert me when I receive a new tip.',
  notify_project_saved: 'Alert me when someone saves or shares my project.',
}

const PREFERENCE_FIELDS: NotificationToggleField[] = [
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
  const [savingField, setSavingField] = useState<NotificationToggleField | null>(null)
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

  const parseApiJson = async (response: Response) => {
    try {
      return (await response.json()) as unknown
    } catch {
      return null
    }
  }

  const getActionableErrorMessage = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback
    if (/unauthorized|not authenticated/i.test(message)) {
      return 'Session expired. Sign in again to update notification settings.'
    }
    if (/invalid/i.test(message)) {
      return 'Invalid notification settings payload. Refresh and try again.'
    }
    return message
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
        const raw = await parseApiJson(response)
        const parsed = parseNotificationPreferencesResponse(raw)
        if (!response.ok || !parsed.success || !parsed.preferences) {
          throw new Error(parsed.error || 'Failed to load notification preferences')
        }
        if (!cancelled) {
          setPreferences(parsed.preferences)
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

  const togglePreference = async (field: NotificationToggleField) => {
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
      const raw = await parseApiJson(response)
      const parsed = parseNotificationPreferencesResponse(raw)
      if (!response.ok || !parsed.success || !parsed.preferences) {
        throw new Error(parsed.error || 'Failed to save notification preferences')
      }
      setPreferences(parsed.preferences)
      emitEvent({
        action: 'save_success',
        changed_fields: [field],
      })
    } catch (saveError) {
      console.error('Error saving notification preferences:', saveError)
      try {
        const token = await getAccessToken()
        if (token) {
          const fallbackResponse = await fetch('/api/notification-preferences', {
            headers: { Authorization: `Bearer ${token}` },
          })
          const fallbackRaw = await parseApiJson(fallbackResponse)
          const fallbackParsed = parseNotificationPreferencesResponse(fallbackRaw)
          if (fallbackResponse.ok && fallbackParsed.success && fallbackParsed.preferences) {
            setPreferences(fallbackParsed.preferences)
          } else {
            setPreferences((prev) => ({ ...prev, [field]: previousValue }))
          }
        } else {
          setPreferences((prev) => ({ ...prev, [field]: previousValue }))
        }
      } catch {
        setPreferences((prev) => ({ ...prev, [field]: previousValue }))
      }
      const actionable = getActionableErrorMessage(
        saveError,
        'Could not save notification setting right now.'
      )
      setError(actionable)
      showToast(actionable, 'error')
      emitEvent({
        action: 'save_failure',
        changed_fields: [field],
        error_message: saveError instanceof Error ? saveError.message : 'unknown_error',
      })
    } finally {
      setSavingField(null)
    }
  }

  const updateDeliveryPreference = async (updates: {
    delivery_mode?: NotificationDeliveryMode
    digest_window?: NotificationDigestWindow
  }) => {
    if (!authenticated || loading || savingField) return
    const previous = preferences
    setError(null)
    setPreferences((prev) => ({ ...prev, ...updates }))
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/notification-preferences', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })
      const raw = await parseApiJson(response)
      const parsed = parseNotificationPreferencesResponse(raw)
      if (!response.ok || !parsed.success || !parsed.preferences) {
        throw new Error(parsed.error || 'Failed to save notification preferences')
      }
      const nextPreferences = parsed.preferences
      setPreferences(nextPreferences)
      emitEvent({
        action: 'save_success',
        changed_fields: Object.keys(updates),
      })
      emitEvent({
        action: 'mode_change',
        delivery_mode: nextPreferences.delivery_mode,
        digest_window: nextPreferences.digest_window,
      })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('notification_digest_event', {
            detail: {
              schema: 'notification_digest.v1',
              action: 'mode_change',
              source: 'account',
              delivery_mode: nextPreferences.delivery_mode,
              digest_window: nextPreferences.digest_window,
              group_type: null,
              grouped_count: null,
            },
          })
        )
      }
    } catch (saveError) {
      console.error('Error saving delivery preferences:', saveError)
      setPreferences(previous)
      const actionable = getActionableErrorMessage(saveError, 'Could not save digest mode.')
      setError(actionable)
      showToast(actionable, 'error')
      emitEvent({
        action: 'save_failure',
        changed_fields: Object.keys(updates),
        error_message: saveError instanceof Error ? saveError.message : 'unknown_error',
      })
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

      <div className="mb-4 border border-gray-800 rounded-lg p-3">
        <p className="text-xs text-gray-400 mb-2">Delivery mode</p>
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => updateDeliveryPreference({ delivery_mode: 'instant' })}
            className={`text-xs px-2.5 py-1.5 rounded border ${
              preferences.delivery_mode === 'instant'
                ? 'border-neon-green text-neon-green'
                : 'border-gray-700 text-gray-300'
            }`}
          >
            Instant
          </button>
          <button
            type="button"
            onClick={() => updateDeliveryPreference({ delivery_mode: 'digest' })}
            className={`text-xs px-2.5 py-1.5 rounded border ${
              preferences.delivery_mode === 'digest'
                ? 'border-neon-green text-neon-green'
                : 'border-gray-700 text-gray-300'
            }`}
          >
            Digest
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={preferences.delivery_mode !== 'digest'}
            onClick={() => updateDeliveryPreference({ digest_window: 'daily' })}
            className={`text-xs px-2.5 py-1.5 rounded border ${
              preferences.digest_window === 'daily'
                ? 'border-neon-green text-neon-green'
                : 'border-gray-700 text-gray-300'
            } disabled:opacity-60`}
          >
            Daily
          </button>
          <button
            type="button"
            disabled={preferences.delivery_mode !== 'digest'}
            onClick={() => updateDeliveryPreference({ digest_window: 'weekly' })}
            className={`text-xs px-2.5 py-1.5 rounded border ${
              preferences.digest_window === 'weekly'
                ? 'border-neon-green text-neon-green'
                : 'border-gray-700 text-gray-300'
            } disabled:opacity-60`}
          >
            Weekly
          </button>
        </div>
      </div>

      {error ? <p className="text-xs text-gray-500 mb-3">{error}</p> : null}

      <div className="space-y-2">
        {PREFERENCE_FIELDS.map((field) => {
          const enabled = preferences[field]
          const isSaving = savingField === field
          return (
            <div
              key={field}
              className="w-full flex items-center justify-between border border-gray-800 rounded-lg px-3 py-3 text-left"
            >
              <div className="pr-3">
                <p className="text-sm text-white">{PREFERENCE_LABELS[field]}</p>
                <p className="mt-1 text-xs text-gray-500">{PREFERENCE_DESCRIPTIONS[field]}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`${PREFERENCE_LABELS[field]} notifications`}
                onClick={() => togglePreference(field)}
                disabled={loading || !!savingField}
                className={`relative inline-flex h-7 w-12 min-w-12 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-green/70 disabled:opacity-60 ${
                  enabled
                    ? 'border-neon-green bg-neon-green/25'
                    : 'border-gray-700 bg-gray-800'
                }`}
              >
                <span className="sr-only">{PREFERENCE_LABELS[field]}</span>
                <span
                  className={`inline-block h-5 w-5 transform rounded-full transition ${
                    enabled ? 'translate-x-6 bg-neon-green' : 'translate-x-1 bg-gray-300'
                  }`}
                />
              </button>
              {isSaving ? <span className="ml-2 text-xs text-gray-500">Saving...</span> : null}
            </div>
          )
        })}
      </div>

      {!loading && hasAnyDisabled ? (
        <p className="text-xs text-gray-500 mt-3">Changes apply to future notifications only.</p>
      ) : null}
    </div>
  )
}

