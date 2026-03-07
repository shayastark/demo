'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  ONBOARDING_GENRE_OPTIONS,
  ONBOARDING_VIBE_OPTIONS,
  type OnboardingGenre,
  type OnboardingVibe,
} from '@/lib/onboardingPreferences'
import { showToast } from '@/components/Toast'

type Source = 'onboarding' | 'account_settings'

interface OnboardingPreferences {
  preferred_genres: OnboardingGenre[]
  preferred_vibes: OnboardingVibe[]
  onboarding_completed_at: string | null
}

interface OnboardingPreferencesSectionProps {
  authenticated: boolean
  getAccessToken?: () => Promise<string | null>
  source: Source
  isOnboardingMode?: boolean
}

const GENRE_LABELS: Record<OnboardingGenre, string> = {
  hip_hop: 'Hip-Hop',
  rnb: 'R&B',
  electronic: 'Electronic',
  indie: 'Indie',
  pop: 'Pop',
  rock: 'Rock',
  alternative: 'Alternative',
  country: 'Country',
  dance: 'Dance',
  latin: 'Latin',
  soul_funk: 'Soul/Funk',
  blues: 'Blues',
  jazz: 'Jazz',
  gospel: 'Gospel',
  reggae: 'Reggae',
  afrobeats: 'Afrobeats',
  metal: 'Metal',
  classical: 'Classical',
}

const VIBE_LABELS: Record<OnboardingVibe, string> = {
  high_energy: 'High Energy',
  chill: 'Chill',
  emotional: 'Emotional',
  experimental: 'Experimental',
  dark: 'Dark',
  uplifting: 'Uplifting',
  minimal: 'Minimal',
  cinematic: 'Cinematic',
}

export default function OnboardingPreferencesSection({
  authenticated,
  getAccessToken,
  source,
  isOnboardingMode = false,
}: OnboardingPreferencesSectionProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [isEditorExpanded, setIsEditorExpanded] = useState<boolean | null>(null)
  const [prefs, setPrefs] = useState<OnboardingPreferences>({
    preferred_genres: [],
    preferred_vibes: [],
    onboarding_completed_at: null,
  })
  const [edited, setEdited] = useState(false)

  const selectedCount = useMemo(
    () => prefs.preferred_genres.length + prefs.preferred_vibes.length,
    [prefs.preferred_genres.length, prefs.preferred_vibes.length]
  )
  const hasSelections = selectedCount > 0
  const isCompleted = !!prefs.onboarding_completed_at
  const collapsePreferenceKey = `demo.onboarding-preferences.editor-expanded.${source}`

  const emitEvent = (
    action: 'view' | 'save' | 'skip' | 'edit',
    detail?: Record<string, unknown>
  ) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('onboarding_preference_event', {
        detail: {
          schema: 'onboarding_preference.v1',
          source,
          action,
          selected_count: selectedCount,
          completed: !!prefs.onboarding_completed_at,
          ...detail,
        },
      })
    )
  }

  const load = async () => {
    if (!authenticated || !getAccessToken) {
      setPrefsLoaded(true)
      return
    }
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/discovery/onboarding-preferences', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to load preferences')
      setPrefs(
        result.preferences || {
          preferred_genres: [],
          preferred_vibes: [],
          onboarding_completed_at: null,
        }
      )
      setUpdatedAt(typeof result.updated_at === 'string' ? result.updated_at : null)
      emitEvent('view')
    } catch (error) {
      console.error('Error loading onboarding preferences:', error)
    } finally {
      setLoading(false)
      setPrefsLoaded(true)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  useEffect(() => {
    if (!prefsLoaded || isEditorExpanded !== null) return
    const shouldDefaultExpanded = isOnboardingMode && !isCompleted && !hasSelections
    if (typeof window === 'undefined') {
      setIsEditorExpanded(shouldDefaultExpanded)
      return
    }

    const stored = window.localStorage.getItem(collapsePreferenceKey)
    if (stored === 'true' || stored === 'false') {
      setIsEditorExpanded(stored === 'true')
      return
    }

    setIsEditorExpanded(shouldDefaultExpanded)
  }, [
    collapsePreferenceKey,
    hasSelections,
    isCompleted,
    isEditorExpanded,
    isOnboardingMode,
    prefsLoaded,
  ])

  const toggleGenre = (genre: OnboardingGenre) => {
    setEdited(true)
    emitEvent('edit')
    setPrefs((prev) => ({
      ...prev,
      preferred_genres: prev.preferred_genres.includes(genre)
        ? prev.preferred_genres.filter((item) => item !== genre)
        : [...prev.preferred_genres, genre],
    }))
  }

  const toggleVibe = (vibe: OnboardingVibe) => {
    setEdited(true)
    emitEvent('edit')
    setPrefs((prev) => ({
      ...prev,
      preferred_vibes: prev.preferred_vibes.includes(vibe)
        ? prev.preferred_vibes.filter((item) => item !== vibe)
        : [...prev.preferred_vibes, vibe],
    }))
  }

  const save = async (completed: boolean) => {
    if (!authenticated || !getAccessToken || saving) return
    setSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const response = await fetch('/api/discovery/onboarding-preferences', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferred_genres: prefs.preferred_genres,
          preferred_vibes: prefs.preferred_vibes,
          completed,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to save preferences')
      setPrefs(result.preferences || prefs)
      setUpdatedAt(typeof result.updated_at === 'string' ? result.updated_at : null)
      setEdited(false)
      if (!isOnboardingMode) {
        setIsEditorExpanded(false)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(collapsePreferenceKey, 'false')
        }
      }
      emitEvent(completed ? 'save' : 'skip')
      showToast(completed ? 'Taste preferences saved' : 'Skipped for now', 'success')
    } catch (error) {
      console.error('Error saving onboarding preferences:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save preferences', 'error')
    } finally {
      setSaving(false)
    }
  }

  const setEditorExpanded = (next: boolean) => {
    setIsEditorExpanded(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(collapsePreferenceKey, String(next))
    }
  }

  const genrePreview = prefs.preferred_genres.slice(0, 2).map((genre) => GENRE_LABELS[genre])
  const vibePreview = prefs.preferred_vibes.slice(0, 2).map((vibe) => VIBE_LABELS[vibe])
  const shouldShowCompactOnly = !loading && !isEditorExpanded
  const summaryLastUpdated =
    updatedAt && !Number.isNaN(new Date(updatedAt).getTime())
      ? new Date(updatedAt).toLocaleDateString()
      : null

  return (
    <div className="bg-gray-900 rounded-xl mb-6 border border-gray-800" style={{ padding: '20px 24px 24px 24px' }}>
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: '12px' }}>
        <h2 className="font-semibold text-neon-green text-lg">
          {isOnboardingMode ? 'Taste preferences (optional)' : 'Discovery taste preferences'}
        </h2>
        <span className="text-xs text-gray-400">{selectedCount} selected</span>
      </div>
      {shouldShowCompactOnly ? null : (
        <p className="text-sm text-gray-500 mb-4">
          Pick 3-5 options for better Explore and recommendation ordering.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading preferences...
        </p>
      ) : shouldShowCompactOnly ? (
        <div className="rounded-lg border border-gray-800 bg-black/20 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-300">
                {hasSelections ? `${selectedCount} preferences selected` : 'No preferences selected yet'}
              </p>
              {genrePreview.length || vibePreview.length ? (
                <p className="mt-1 text-xs text-gray-500">
                  {genrePreview.length ? `Genres: ${genrePreview.join(', ')}` : ''}
                  {genrePreview.length && vibePreview.length ? ' • ' : ''}
                  {vibePreview.length ? `Vibes: ${vibePreview.join(', ')}` : ''}
                </p>
              ) : null}
              {summaryLastUpdated ? (
                <p className="mt-1 text-xs text-gray-500">Updated {summaryLastUpdated}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setEditorExpanded(true)}
              aria-expanded={false}
              aria-controls="onboarding-preferences-editor"
              className="min-h-10 rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:border-gray-600 hover:text-white"
            >
              Edit preferences
            </button>
          </div>
        </div>
      ) : (
        <>
          {!isOnboardingMode ? (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setEditorExpanded(false)}
                aria-expanded
                aria-controls="onboarding-preferences-editor"
                className="min-h-10 rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:border-gray-600 hover:text-white"
              >
                Collapse editor
              </button>
            </div>
          ) : null}

          <div id="onboarding-preferences-editor">
          <div className="mb-4">
            <p className="text-xs text-gray-400 mb-2">Genres</p>
            <div className="flex items-center gap-2 flex-wrap">
              {ONBOARDING_GENRE_OPTIONS.map((genre) => {
                const active = prefs.preferred_genres.includes(genre)
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleGenre(genre)}
                    className={`min-h-9 text-xs px-2.5 py-1.5 rounded border ${
                      active ? 'border-neon-green text-neon-green' : 'border-gray-700 text-gray-300'
                    }`}
                  >
                    {GENRE_LABELS[genre]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mb-5">
            <p className="text-xs text-gray-400 mb-2">Vibes</p>
            <div className="flex items-center gap-2 flex-wrap">
              {ONBOARDING_VIBE_OPTIONS.map((vibe) => {
                const active = prefs.preferred_vibes.includes(vibe)
                return (
                  <button
                    key={vibe}
                    type="button"
                    onClick={() => toggleVibe(vibe)}
                    className={`min-h-9 text-xs px-2.5 py-1.5 rounded border ${
                      active ? 'border-neon-green text-neon-green' : 'border-gray-700 text-gray-300'
                    }`}
                  >
                    {VIBE_LABELS[vibe]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving || (!edited && !!prefs.onboarding_completed_at)}
              className="min-h-10 text-xs px-3 py-1.5 rounded border border-neon-green text-neon-green disabled:opacity-70"
            >
              {saving ? 'Saving...' : isOnboardingMode ? 'Save & continue' : 'Save preferences'}
            </button>
            {isOnboardingMode ? (
              <button
                type="button"
                onClick={() => save(false)}
                disabled={saving}
                className="min-h-10 text-xs px-3 py-1.5 rounded border border-gray-700 text-gray-300"
              >
                Skip for now
              </button>
            ) : null}
          </div>
          </div>
        </>
      )}
    </div>
  )
}
