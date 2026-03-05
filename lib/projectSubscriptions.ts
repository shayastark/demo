export interface ProjectSubscriptionStatusResponse {
  isSubscribed: boolean
  subscriberCount: number
}

export function parseProjectSubscriptionsLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return 1000
  if (!/^\d+$/.test(raw)) return null
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5000) return null
  return parsed
}

export function parseProjectSubscriptionProjectIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const projectId = (body as Record<string, unknown>).project_id
  return typeof projectId === 'string' ? projectId : null
}

export function parseProjectSubscriptionProjectIdFromDelete(args: {
  bodyProjectId: string | null
  queryProjectId: string | null
}): string | null {
  if (args.bodyProjectId && args.queryProjectId && args.bodyProjectId !== args.queryProjectId) return null
  return args.bodyProjectId || args.queryProjectId || null
}

export function buildProjectUpdateRecipientIds(args: {
  creatorId: string
  followerIds: string[]
  subscriberIds: string[]
}): string[] {
  const deduped = new Set<string>()
  for (const id of [...args.followerIds, ...args.subscriberIds]) {
    if (!id || id === args.creatorId) continue
    deduped.add(id)
  }
  return Array.from(deduped)
}

