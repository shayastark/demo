import {
  ONBOARDING_GENRE_LABELS,
  ONBOARDING_GENRE_OPTIONS,
  type OnboardingGenre,
} from '@/lib/onboardingPreferences'

export const PROFILE_TAG_OPTIONS = ONBOARDING_GENRE_OPTIONS.map((id) => ({
  id,
  label: ONBOARDING_GENRE_LABELS[id],
})) as ReadonlyArray<{ id: OnboardingGenre; label: string }>

export type ProfileTag = OnboardingGenre

export const PROFILE_TAG_LIMIT = 5

export const AVAILABILITY_STATUS_OPTIONS = [
  { id: 'open_to_collabs', label: 'Open to collabs' },
  { id: 'available_for_hire', label: 'Available for hire' },
  { id: 'heads_down', label: 'Heads down right now' },
  { id: 'just_browsing', label: 'Just browsing' },
] as const

export type AvailabilityStatus = (typeof AVAILABILITY_STATUS_OPTIONS)[number]['id']

const LEGACY_PROFILE_TAG_ALIASES: Record<string, ProfileTag> = {
  'hip-hop': 'hip_hop',
  'r-and-b': 'rnb',
}

const PROFILE_TAG_LABELS = Object.fromEntries(PROFILE_TAG_OPTIONS.map((option) => [option.id, option.label])) as Record<ProfileTag, string>
const AVAILABILITY_STATUS_LABELS = Object.fromEntries(
  AVAILABILITY_STATUS_OPTIONS.map((option) => [option.id, option.label])
) as Record<AvailabilityStatus, string>

export function isProfileTag(value: unknown): value is ProfileTag {
  return typeof value === 'string' && PROFILE_TAG_OPTIONS.some((option) => option.id === value)
}

export function isAvailabilityStatus(value: unknown): value is AvailabilityStatus {
  return typeof value === 'string' && AVAILABILITY_STATUS_OPTIONS.some((option) => option.id === value)
}

export function getProfileTagLabel(tag: ProfileTag): string {
  return PROFILE_TAG_LABELS[tag]
}

export function getAvailabilityStatusLabel(status: AvailabilityStatus): string {
  return AVAILABILITY_STATUS_LABELS[status]
}

export function sanitizeProfileTags(value: unknown): ProfileTag[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null

  const deduped = new Set<ProfileTag>()
  for (const item of value) {
    const normalized =
      typeof item === 'string' && LEGACY_PROFILE_TAG_ALIASES[item]
        ? LEGACY_PROFILE_TAG_ALIASES[item]
        : item
    if (!isProfileTag(normalized)) continue
    deduped.add(normalized)
    if (deduped.size >= PROFILE_TAG_LIMIT) break
  }

  return Array.from(deduped)
}
