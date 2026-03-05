export type ProjectAccessGrantInput = {
  project_id: string
  user_id: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

export function parseProjectAccessGrantInput(value: unknown): ProjectAccessGrantInput | null {
  if (!value || typeof value !== 'object') return null
  const projectId = (value as Record<string, unknown>).project_id
  const userId = (value as Record<string, unknown>).user_id
  if (!isUuid(projectId) || !isUuid(userId)) return null
  return { project_id: projectId, user_id: userId }
}

export function canManageProjectAccess(viewerUserId: string | null | undefined, creatorUserId: string): boolean {
  return !!viewerUserId && viewerUserId === creatorUserId
}

export function isRedundantProjectAccessGrant(args: {
  creatorUserId: string
  targetUserId: string
}): boolean {
  return args.creatorUserId === args.targetUserId
}

