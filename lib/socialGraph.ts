export type SocialGraphListType = 'followers' | 'following'

export interface SocialGraphListItem {
  user_id: string
  username: string
  avatar_url: string | null
  is_following: boolean
  followed_at: string
}

export function getSocialGraphDisplayName(username?: string | null, email?: string | null): string {
  const usernameTrimmed = username?.trim()
  if (usernameTrimmed) return usernameTrimmed
  const emailTrimmed = email?.trim()
  if (emailTrimmed) return emailTrimmed
  return 'Unknown user'
}

export function parseSocialGraphListType(rawType: string | null): SocialGraphListType | null {
  if (rawType === 'followers' || rawType === 'following') return rawType
  return null
}

export function parsePaginationParam(
  raw: string | null,
  { defaultValue, min, max }: { defaultValue: number; min: number; max: number }
): number | null {
  if (raw === null || raw === '') return defaultValue
  if (!/^\d+$/.test(raw)) return null
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null
  return parsed
}

export function validateSocialGraphListRequest(params: {
  userId: string | null
  type: string | null
  limit: string | null
  offset: string | null
}): {
  valid: boolean
  error?: string
  parsed?: { userId: string; type: SocialGraphListType; limit: number; offset: number }
} {
  if (!params.userId || !isUuidLike(params.userId)) {
    return { valid: false, error: 'Valid user_id is required' }
  }

  const parsedType = parseSocialGraphListType(params.type)
  if (!parsedType) {
    return { valid: false, error: 'type must be followers or following' }
  }

  const parsedLimit = parsePaginationParam(params.limit, { defaultValue: 20, min: 1, max: 50 })
  if (parsedLimit === null) {
    return { valid: false, error: 'limit must be an integer between 1 and 50' }
  }

  const parsedOffset = parsePaginationParam(params.offset, { defaultValue: 0, min: 0, max: 1000 })
  if (parsedOffset === null) {
    return { valid: false, error: 'offset must be an integer between 0 and 1000' }
  }

  return {
    valid: true,
    parsed: {
      userId: params.userId,
      type: parsedType,
      limit: parsedLimit,
      offset: parsedOffset,
    },
  }
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

