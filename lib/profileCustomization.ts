export const PROFILE_TAG_OPTIONS = [
  { id: 'artist', label: 'Artist' },
  { id: 'producer', label: 'Producer' },
  { id: 'songwriter', label: 'Songwriter' },
  { id: 'vocalist', label: 'Vocalist' },
  { id: 'engineer', label: 'Engineer' },
  { id: 'mixing', label: 'Mixing' },
  { id: 'mastering', label: 'Mastering' },
  { id: 'pop', label: 'Pop' },
  { id: 'r-and-b', label: 'R&B' },
  { id: 'hip-hop', label: 'Hip-Hop' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'indie', label: 'Indie' },
  { id: 'alt-pop', label: 'Alt Pop' },
] as const

export type ProfileTag = (typeof PROFILE_TAG_OPTIONS)[number]['id']

export const PROFILE_TAG_LIMIT = 5

export const AVAILABILITY_STATUS_OPTIONS = [
  { id: 'open_to_collabs', label: 'Open to collabs' },
  { id: 'available_for_hire', label: 'Available for hire' },
  { id: 'heads_down', label: 'Heads down right now' },
  { id: 'just_browsing', label: 'Just browsing' },
] as const

export type AvailabilityStatus = (typeof AVAILABILITY_STATUS_OPTIONS)[number]['id']

const PROFILE_TAG_LABELS = Object.fromEntries(PROFILE_TAG_OPTIONS.map((option) => [option.id, option.label])) as Record<
  ProfileTag,
  string
>
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
    if (!isProfileTag(item)) continue
    deduped.add(item)
    if (deduped.size >= PROFILE_TAG_LIMIT) break
  }

  return Array.from(deduped)
}
