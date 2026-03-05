export const DISCOVERY_TARGET_TYPES = ['project', 'creator'] as const
export type DiscoveryTargetType = (typeof DISCOVERY_TARGET_TYPES)[number]
export const DISCOVERY_PREFERENCES = ['hide'] as const
export type DiscoveryPreference = (typeof DISCOVERY_PREFERENCES)[number]

export type DiscoveryPreferenceRow = {
  user_id: string
  target_type: DiscoveryTargetType
  target_id: string
  preference: DiscoveryPreference
}

export function parseDiscoveryPreferencePayload(body: unknown):
  | { ok: true; target_type: DiscoveryTargetType; target_id: string; preference: DiscoveryPreference }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid JSON body' }
  }
  const payload = body as Record<string, unknown>
  const targetType = payload.target_type
  const targetId = payload.target_id
  const preference = payload.preference

  if (targetType !== 'project' && targetType !== 'creator') {
    return { ok: false, error: 'target_type must be project or creator' }
  }
  if (preference !== 'hide') {
    return { ok: false, error: 'preference must be hide' }
  }
  if (typeof targetId !== 'string' || !isUuidLike(targetId)) {
    return { ok: false, error: 'target_id must be a valid uuid' }
  }

  return {
    ok: true,
    target_type: targetType,
    target_id: targetId,
    preference,
  }
}

export function buildHiddenTargetSets(rows: Array<{
  target_type: string | null
  target_id: string | null
  preference?: string | null
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
