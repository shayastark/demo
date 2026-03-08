import {
  DISCOVERY_RAW_PREFERENCE_SCORE_CAP,
  capCreatorPreferenceBoost,
  capProjectPreferenceBoost,
} from '@/lib/discoveryRankingConfig'

export const ONBOARDING_GENRE_OPTIONS = [
  'hip_hop',
  'rnb',
  'electronic',
  'indie',
  'pop',
  'rock',
  'alternative',
  'country',
  'dance',
  'latin',
  'soul_funk',
  'blues',
  'jazz',
  'gospel',
  'reggae',
  'afrobeats',
  'metal',
  'classical',
] as const

export const ONBOARDING_VIBE_OPTIONS = [
  'high_energy',
  'chill',
  'emotional',
  'experimental',
  'dark',
  'uplifting',
  'minimal',
  'cinematic',
] as const

export type OnboardingGenre = (typeof ONBOARDING_GENRE_OPTIONS)[number]
export type OnboardingVibe = (typeof ONBOARDING_VIBE_OPTIONS)[number]

export const ONBOARDING_GENRE_LABELS: Record<OnboardingGenre, string> = {
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

export interface OnboardingPreferences {
  preferred_genres: OnboardingGenre[]
  preferred_vibes: OnboardingVibe[]
  onboarding_completed_at: string | null
}

export interface OnboardingPreferencesPatch {
  preferred_genres?: OnboardingGenre[]
  preferred_vibes?: OnboardingVibe[]
  completed?: boolean
}

export function toOnboardingPreferences(
  row:
    | {
        preferred_genres?: string[] | null
        preferred_vibes?: string[] | null
        onboarding_completed_at?: string | null
      }
    | null
    | undefined
): OnboardingPreferences {
  return {
    preferred_genres: normalizeOptionArray(row?.preferred_genres, ONBOARDING_GENRE_OPTIONS),
    preferred_vibes: normalizeOptionArray(row?.preferred_vibes, ONBOARDING_VIBE_OPTIONS),
    onboarding_completed_at:
      typeof row?.onboarding_completed_at === 'string' ? row.onboarding_completed_at : null,
  }
}

export function parseOnboardingPreferencesPatch(body: unknown):
  | { ok: true; patch: OnboardingPreferencesPatch }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body' }
  }

  const record = body as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0) {
    return { ok: false, error: 'At least one field is required' }
  }

  const patch: OnboardingPreferencesPatch = {}
  for (const key of keys) {
    if (key === 'preferred_genres') {
      const parsed = parseOptionArray(record[key], ONBOARDING_GENRE_OPTIONS, 'preferred_genres')
      if (!parsed.ok) return parsed
      patch.preferred_genres = parsed.values
      continue
    }
    if (key === 'preferred_vibes') {
      const parsed = parseOptionArray(record[key], ONBOARDING_VIBE_OPTIONS, 'preferred_vibes')
      if (!parsed.ok) return parsed
      patch.preferred_vibes = parsed.values
      continue
    }
    if (key === 'completed') {
      if (typeof record[key] !== 'boolean') {
        return { ok: false, error: 'completed must be boolean' }
      }
      patch.completed = record[key]
      continue
    }
    return { ok: false, error: `Unknown field: ${key}` }
  }

  return { ok: true, patch }
}

export function buildProjectPreferenceBoostById(args: {
  projects: Array<{ id: string; title?: string | null; description?: string | null }>
  preferences: Pick<OnboardingPreferences, 'preferred_genres' | 'preferred_vibes'>
}): Record<string, number> {
  const boosts: Record<string, number> = {}
  for (const project of args.projects) {
    const rawScore = getTextPreferenceScore({
      text: `${project.title || ''} ${project.description || ''}`,
      preferred_genres: args.preferences.preferred_genres,
      preferred_vibes: args.preferences.preferred_vibes,
    })
    boosts[project.id] = capProjectPreferenceBoost(rawScore)
  }
  return boosts
}

export function buildCreatorPreferenceBoostById(args: {
  projects: Array<{ creator_id: string; title?: string | null; description?: string | null }>
  preferences: Pick<OnboardingPreferences, 'preferred_genres' | 'preferred_vibes'>
}): Record<string, number> {
  const boosts: Record<string, number> = {}
  for (const project of args.projects) {
    const rawScore = getTextPreferenceScore({
      text: `${project.title || ''} ${project.description || ''}`,
      preferred_genres: args.preferences.preferred_genres,
      preferred_vibes: args.preferences.preferred_vibes,
    })
    const score = capCreatorPreferenceBoost(rawScore)
    boosts[project.creator_id] = Math.max(boosts[project.creator_id] || 0, score)
  }
  return boosts
}

function getTextPreferenceScore(args: {
  text: string
  preferred_genres: OnboardingGenre[]
  preferred_vibes: OnboardingVibe[]
}): number {
  const text = args.text.toLowerCase()
  let score = 0
  for (const genre of args.preferred_genres) {
    if (matchesSlugText(text, genre)) score += 1.2
  }
  for (const vibe of args.preferred_vibes) {
    if (matchesSlugText(text, vibe)) score += 0.8
  }
  return Math.min(score, DISCOVERY_RAW_PREFERENCE_SCORE_CAP)
}

function matchesSlugText(text: string, slug: string): boolean {
  const phrase = slug.replace(/_/g, ' ')
  if (text.includes(phrase)) return true
  const parts = phrase.split(' ').filter(Boolean)
  if (parts.length < 2) return false
  return parts.every((part) => text.includes(part))
}

function parseOptionArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string
): { ok: true; values: T[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${fieldName} must be an array` }
  }
  if (value.length > 8) {
    return { ok: false, error: `${fieldName} can include at most 8 options` }
  }
  const unique = new Set<T>()
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.includes(item as T)) {
      return { ok: false, error: `${fieldName} has invalid option: ${String(item)}` }
    }
    unique.add(item as T)
  }
  return { ok: true, values: Array.from(unique) }
}

function normalizeOptionArray<T extends string>(
  value: string[] | null | undefined,
  allowed: readonly T[]
): T[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<T>()
  for (const item of value) {
    if (typeof item === 'string' && allowed.includes(item as T)) {
      unique.add(item as T)
    }
  }
  return Array.from(unique)
}
