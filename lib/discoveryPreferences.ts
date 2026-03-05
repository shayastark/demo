import { parseOffsetLimitQuery } from '@/lib/pagination'

export const DISCOVERY_TARGET_TYPES = ['project', 'creator'] as const
export type DiscoveryTargetType = (typeof DISCOVERY_TARGET_TYPES)[number]
export const DISCOVERY_PREFERENCES = ['hide'] as const
export type DiscoveryPreference = (typeof DISCOVERY_PREFERENCES)[number]
export const DISCOVERY_REASON_CODES = [
  'not_my_style',
  'too_many_updates',
  'already_seen',
  'other',
] as const
export type DiscoveryReasonCode = (typeof DISCOVERY_REASON_CODES)[number]

export type DiscoveryPreferenceRow = {
  user_id: string
  target_type: DiscoveryTargetType
  target_id: string
  preference: DiscoveryPreference
  reason_code?: DiscoveryReasonCode | null
}

export type DiscoveryPreferenceListRow = {
  target_type: DiscoveryTargetType
  target_id: string
  created_at: string
  reason_code?: DiscoveryReasonCode | null
}

export type HiddenDiscoveryItem = {
  target_type: DiscoveryTargetType
  target_id: string
  label: string
  image_url: string | null
  created_at: string
  reason_code: DiscoveryReasonCode | null
}

export function parseDiscoveryPreferencePayload(body: unknown):
  | {
      ok: true
      target_type: DiscoveryTargetType
      target_id: string
      preference: DiscoveryPreference
      reason_code: DiscoveryReasonCode | null
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid JSON body' }
  }
  const payload = body as Record<string, unknown>
  const targetType = payload.target_type
  const targetId = payload.target_id
  const preference = payload.preference
  const reasonCode = payload.reason_code

  if (targetType !== 'project' && targetType !== 'creator') {
    return { ok: false, error: 'target_type must be project or creator' }
  }
  if (preference !== 'hide') {
    return { ok: false, error: 'preference must be hide' }
  }
  if (typeof targetId !== 'string' || !isUuidLike(targetId)) {
    return { ok: false, error: 'target_id must be a valid uuid' }
  }
  if (
    reasonCode !== undefined &&
    reasonCode !== null &&
    !DISCOVERY_REASON_CODES.includes(reasonCode as DiscoveryReasonCode)
  ) {
    return {
      ok: false,
      error: 'reason_code must be one of not_my_style, too_many_updates, already_seen, other',
    }
  }

  return {
    ok: true,
    target_type: targetType,
    target_id: targetId,
    preference,
    reason_code: typeof reasonCode === 'string' ? (reasonCode as DiscoveryReasonCode) : null,
  }
}

export function parseDiscoveryPreferencesListQuery(args: {
  rawPreference: string | null
  rawTargetType: string | null
  rawLimit: string | null
  rawOffset: string | null
}):
  | { ok: true; preference: DiscoveryPreference; target_type: DiscoveryTargetType | null; limit: number; offset: number }
  | { ok: false; error: string } {
  const parsedPagination = parseOffsetLimitQuery({
    rawLimit: args.rawLimit,
    rawOffset: args.rawOffset,
    defaultLimit: 20,
    maxLimit: 50,
  })
  if (!parsedPagination.ok) return parsedPagination

  const preference = args.rawPreference || 'hide'
  if (preference !== 'hide') {
    return { ok: false, error: 'preference must be hide' }
  }

  let targetType: DiscoveryTargetType | null = null
  if (args.rawTargetType !== null && args.rawTargetType !== '') {
    if (args.rawTargetType !== 'project' && args.rawTargetType !== 'creator') {
      return { ok: false, error: 'target_type must be project or creator' }
    }
    targetType = args.rawTargetType
  }

  return {
    ok: true,
    preference: 'hide',
    target_type: targetType,
    limit: parsedPagination.limit,
    offset: parsedPagination.offset,
  }
}

export function buildHiddenTargetSets(rows: Array<{
  target_type: string | null
  target_id: string | null
  preference?: string | null
  reason_code?: string | null
}>): { hiddenProjectIds: Set<string>; hiddenCreatorIds: Set<string> } {
  const hiddenProjectIds = new Set<string>()
  const hiddenCreatorIds = new Set<string>()
  for (const row of rows) {
    if (row?.preference && row.preference !== 'hide') continue
    if (row.target_type === 'project' && typeof row.target_id === 'string') {
      hiddenProjectIds.add(row.target_id)
    }
    if (row.target_type === 'creator' && typeof row.target_id === 'string') {
      hiddenCreatorIds.add(row.target_id)
    }
  }
  return { hiddenProjectIds, hiddenCreatorIds }
}

export function buildHiddenDiscoveryItems(args: {
  rows: DiscoveryPreferenceListRow[]
  creatorsById: Record<string, { id: string; username: string | null; email: string | null; avatar_url: string | null }>
  projectsById: Record<string, { id: string; title: string | null; cover_image_url: string | null }>
}): HiddenDiscoveryItem[] {
  return args.rows.map((row) => {
    if (row.target_type === 'creator') {
      const creator = args.creatorsById[row.target_id]
      return {
        target_type: 'creator',
        target_id: row.target_id,
        label: creator?.username?.trim() || creator?.email?.trim() || 'Unknown creator',
        image_url: creator?.avatar_url || null,
        created_at: row.created_at,
        reason_code: row.reason_code || null,
      }
    }

    const project = args.projectsById[row.target_id]
    return {
      target_type: 'project',
      target_id: row.target_id,
      label: project?.title?.trim() || 'Unknown project',
      image_url: project?.cover_image_url || null,
      created_at: row.created_at,
      reason_code: row.reason_code || null,
    }
  })
}

export function removeHiddenDiscoveryItem<T extends { target_type: DiscoveryTargetType; target_id: string }>(args: {
  items: T[]
  target_type: DiscoveryTargetType
  target_id: string
}): T[] {
  return args.items.filter(
    (item) => !(item.target_type === args.target_type && item.target_id === args.target_id)
  )
}

export function upsertDiscoveryPreferenceRows(
  rows: DiscoveryPreferenceRow[],
  next: DiscoveryPreferenceRow
): DiscoveryPreferenceRow[] {
  const key = `${next.user_id}:${next.target_type}:${next.target_id}:${next.preference}`
  const existing = new Set(
    rows.map((row) => `${row.user_id}:${row.target_type}:${row.target_id}:${row.preference}`)
  )
  if (existing.has(key)) return rows
  return [...rows, next]
}

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
