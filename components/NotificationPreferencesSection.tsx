'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, ChevronDown } from 'lucide-react'
import { showToast } from '@/components/Toast'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationDeliveryMode,
  type NotificationDigestWindow,
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
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

const PREFERENCE_ROW_CLASS = 'rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.86),rgba(7,10,16,0.95))] px-4 py-4 text-left shadow-[0_14px_30px_rgba(0,0,0,0.18)]'
const PREFERENCE_ROW_GRID_CLASS = 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2'
const PREFERENCE_TEXT_BLOCK_CLASS = 'min-w-0'
const PREFERENCE_TOGGLE_GROUP_CLASS = 'flex items-center gap-2 justify-self-end pr-1 pt-0.5'
const PREFERENCE_TOGGLE_BUTTON_CLASS =
  'relative inline-flex h-8 w-14 min-w-14 flex-shrink-0 items-center rounded-full border-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-green/70 disabled:opacity-60'
const PREFERENCE_STATUS_LABEL_CLASS = 'inline-flex min-w-7 items-center justify-end text-right text-xs font-medium leading-none'

export default function NotificationPreferencesSection({
  authenticated,
  getAccessToken,
}: NotificationPreferencesSectionProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  )
  const [loading, setLoading] = useState(false)
  const [savingField, setSavingField] = useState<NotificationToggleField | null>(null)
  const [savingDelivery, setSavingDelivery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(true)
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
    if (/failed to update notification preferences/i.test(message)) {
      return 'Could not save notification settings right now. Please try again in a moment.'
    }
    if (/invalid/i.test(message)) {
      return 'Invalid notification settings payload. Refresh and try again.'
    }
    return message
  }

  const parseApiPreferences = (
    response: Response,
    raw: unknown,
    fallbackMessage: string
  ): NotificationPreferences => {
    const parsed = parseNotificationPreferencesResponse(raw)
    if (!response.ok || !parsed.success || !parsed.preferences) {
      throw new Error(parsed.error || fallbackMessage)
    }
    return parsed.preferences
  }

  const getAuthorizedHeaders = async () => {
    const token = await getAccessToken()
    if (!token) throw new Error('Not authenticated')
    return {
      token,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  }

  const fetchPreferencesFromServer = async () => {
    const { headers } = await getAuthorizedHeaders()
    const response = await fetch('/api/notification-preferences', {
      headers,
      cache: 'no-store',
    })
    const raw = await parseApiJson(response)
    return parseApiPreferences(response, raw, 'Failed to load notification preferences')
  }

  const patchPreferences = async (updates: NotificationPreferencesUpdate) => {
    const { headers } = await getAuthorizedHeaders()
    const response = await fetch('/api/notification-preferences', {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    })
    const raw = await parseApiJson(response)
    return parseApiPreferences(response, raw, 'Failed to save notification preferences')
  }

  const preferencesMatchUpdates = (
    candidate: NotificationPreferences,
    updates: NotificationPreferencesUpdate
  ) =>
    Object.entries(updates).every(([key, value]) => {
      const preferenceKey = key as keyof NotificationPreferences
      return candidate[preferenceKey] === value
    })

  const reconcilePreferencesAfterFailure = async (updates: NotificationPreferencesUpdate) => {
    try {
      const serverPreferences = await fetchPreferencesFromServer()
      return {
        preferences: serverPreferences,
        reconciled: preferencesMatchUpdates(serverPreferences, updates),
      }
    } catch {
      return {
        preferences: null,
        reconciled: false,
      }
    }
  }

  useEffect(() => {
    if (!authenticated) return
    let cancelled = false

    const loadPreferences = async () => {
      setLoading(true)
      setError(null)
      try {
        const nextPreferences = await fetchPreferencesFromServer()
        if (!cancelled) {
          setPreferences(nextPreferences)
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
    if (!authenticated || loading || savingField || savingDelivery) return

    const previousPreferences = preferences
    const previousValue = previousPreferences[field]
    const nextValue = !previousValue
    setPreferences((prev) => ({ ...prev, [field]: nextValue }))
    setSavingField(field)
    setError(null)

    emitEvent({
      action: 'toggle',
      changed_fields: [field],
    })

    try {
      const nextPreferences = await patchPreferences({ [field]: nextValue })
      setPreferences(nextPreferences)
      setError(null)
      emitEvent({
        action: 'save_success',
        changed_fields: [field],
      })
    } catch (saveError) {
      console.error('Error saving notification preferences:', saveError)
      const reconciliation = await reconcilePreferencesAfterFailure({ [field]: nextValue })
      if (reconciliation.preferences) {
        setPreferences(reconciliation.preferences)
      } else {
        setPreferences(previousPreferences)
      }
      if (reconciliation.reconciled) {
        setError(null)
        emitEvent({
          action: 'save_success',
          changed_fields: [field],
        })
        return
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
    if (!authenticated || loading || savingField || savingDelivery) return
    const previous = preferences
    setError(null)
    setSavingDelivery(true)
    setPreferences((prev) => ({ ...prev, ...updates }))
    try {
      const nextPreferences = await patchPreferences(updates)
      setPreferences(nextPreferences)
      setError(null)
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
      const reconciliation = await reconcilePreferencesAfterFailure(updates)
      if (reconciliation.preferences) {
        setPreferences(reconciliation.preferences)
      } else {
        setPreferences(previous)
      }
      if (reconciliation.reconciled) {
        setError(null)
        emitEvent({
          action: 'save_success',
          changed_fields: Object.keys(updates),
        })
        return
      }
      const actionable = getActionableErrorMessage(saveError, 'Could not save digest mode.')
      setError(actionable)
      showToast(actionable, 'error')
      emitEvent({
        action: 'save_failure',
        changed_fields: Object.keys(updates),
        error_message: saveError instanceof Error ? saveError.message : 'unknown_error',
      })
    } finally {
      setSavingDelivery(false)
    }
  }

  const deliveryModeButtonClass = (selected: boolean) =>
    `inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
      selected
        ? 'bg-neon-green text-black shadow-[0_10px_24px_rgba(57,255,20,0.2)]'
        : 'bg-transparent text-gray-300 hover:text-white'
    }`

  const digestWindowButtonClass = (selected: boolean, disabled: boolean) =>
    `inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
      disabled
        ? 'bg-transparent text-gray-600'
        : selected
          ? 'bg-white/[0.09] text-white'
          : 'bg-transparent text-gray-400 hover:text-white'
    }`

  return (
    <div
      className="bg-gray-900 rounded-xl mb-6 border border-gray-800"
      style={{ padding: '20px 24px 24px 24px' }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <Bell className="w-4 h-4 text-neon-green" />
          <h2 className="text-lg font-semibold leading-tight text-neon-green">Notification Preferences</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="ui-pressable inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-black text-neon-green hover:border-gray-500 hover:text-neon-green/80 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs sm:font-semibold"
          style={{
            WebkitAppearance: 'none',
            appearance: 'none',
            WebkitTapHighlightColor: 'transparent',
            backgroundColor: '#000000',
            border: '1px solid #374151',
            color: '#39FF14',
          }}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse notification preferences' : 'Expand notification preferences'}
        >
          <span className="hidden sm:inline">{isOpen ? 'Collapse' : 'Expand'}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} aria-hidden />
        </button>
      </div>

      {!isOpen ? null : <p className="text-sm text-gray-500 mb-4">
        Choose which in-app notifications you want to receive.
      </p>}

      {!isOpen ? null : <div className="mb-5 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(7,10,16,0.96))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Delivery mode</p>
          <p className="mt-1 text-sm text-gray-400">
            Choose whether alerts arrive right away or as a digest.
          </p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-black/30 p-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => updateDeliveryPreference({ delivery_mode: 'instant' })}
              disabled={loading || !!savingField || savingDelivery}
              className={deliveryModeButtonClass(preferences.delivery_mode === 'instant')}
            >
              Instant
            </button>
            <button
              type="button"
              onClick={() => updateDeliveryPreference({ delivery_mode: 'digest' })}
              disabled={loading || !!savingField || savingDelivery}
              className={deliveryModeButtonClass(preferences.delivery_mode === 'digest')}
            >
              Digest
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={preferences.delivery_mode !== 'digest' || loading || !!savingField || savingDelivery}
              onClick={() => updateDeliveryPreference({ digest_window: 'daily' })}
              className={digestWindowButtonClass(
                preferences.digest_window === 'daily',
                preferences.delivery_mode !== 'digest' || loading || !!savingField || savingDelivery
              )}
            >
              Daily digest
            </button>
            <button
              type="button"
              disabled={preferences.delivery_mode !== 'digest' || loading || !!savingField || savingDelivery}
              onClick={() => updateDeliveryPreference({ digest_window: 'weekly' })}
              className={digestWindowButtonClass(
                preferences.digest_window === 'weekly',
                preferences.delivery_mode !== 'digest' || loading || !!savingField || savingDelivery
              )}
            >
              Weekly digest
            </button>
          </div>
        </div>
      </div>}

      {!isOpen ? null : error ? <p className="text-xs text-gray-500 mb-3">{error}</p> : null}

      {!isOpen ? null : <div className="space-y-2">
        {PREFERENCE_FIELDS.map((field) => {
          const enabled = preferences[field]
          const isSaving = savingField === field
          return (
            <div key={field} className={PREFERENCE_ROW_CLASS}>
              <div className={PREFERENCE_ROW_GRID_CLASS}>
                <div className={PREFERENCE_TEXT_BLOCK_CLASS}>
                  <p className="text-sm font-medium leading-5 text-white">{PREFERENCE_LABELS[field]}</p>
                </div>
                <div className={PREFERENCE_TOGGLE_GROUP_CLASS}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${PREFERENCE_LABELS[field]} notifications`}
                    onClick={() => togglePreference(field)}
                    disabled={loading || !!savingField || savingDelivery}
                    className={PREFERENCE_TOGGLE_BUTTON_CLASS}
                    style={{
                      width: '56px',
                      height: '32px',
                      borderRadius: '16px',
                      backgroundColor: enabled ? '#39FF14' : '#4B5563',
                      transition: 'background-color 0.2s',
                    }}
                  >
                    <span className="sr-only">{PREFERENCE_LABELS[field]}</span>
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: '4px',
                        left: enabled ? '28px' : '4px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '12px',
                        backgroundColor: enabled ? '#000000' : '#ffffff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                        transition: 'left 0.2s, background-color 0.2s',
                      }}
                    />
                  </button>
                  <span
                    className={`${PREFERENCE_STATUS_LABEL_CLASS} ${
                      enabled ? 'text-neon-green' : 'text-gray-400'
                    }`}
                  >
                    {isSaving ? '...' : enabled ? 'On' : 'Off'}
                  </span>
                </div>
                <p className="col-span-2 pr-2 text-sm leading-relaxed text-gray-400">
                  {PREFERENCE_DESCRIPTIONS[field]}
                </p>
              </div>
            </div>
          )
        })}
      </div>}

      {!isOpen ? null : !loading && hasAnyDisabled ? (
        <p className="text-xs text-gray-500 mt-3">Changes apply to future notifications only.</p>
      ) : null}
    </div>
  )
}

