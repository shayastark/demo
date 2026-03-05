export type ProjectAccessIdentifierType = 'user_id' | 'email' | 'username'
export const PROJECT_ACCESS_ROLES = ['viewer', 'commenter', 'contributor'] as const
export type ProjectAccessRole = (typeof PROJECT_ACCESS_ROLES)[number]

export type ProjectAccessGrantInput = {
  project_id: string
  identifier: string
  identifier_type: ProjectAccessIdentifierType
}

export type ProjectAccessGrantMutationAction = 'create' | 'renew' | 'unchanged'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function getProjectAccessIdentifierType(identifier: string): ProjectAccessIdentifierType {
  if (isUuid(identifier)) return 'user_id'
  if (identifier.includes('@')) return 'email'
  return 'username'
}

export function parseProjectAccessGrantInput(value: unknown): ProjectAccessGrantInput | null {
  if (!value || typeof value !== 'object') return null
  const projectId = (value as Record<string, unknown>).project_id
  const rawIdentifier =
    normalizeIdentifier((value as Record<string, unknown>).identifier) ??
    normalizeIdentifier((value as Record<string, unknown>).user_id)
  if (typeof projectId !== 'string' || !isUuid(projectId) || !rawIdentifier) return null
  return {
    project_id: projectId,
    identifier: rawIdentifier,
    identifier_type: getProjectAccessIdentifierType(rawIdentifier),
  }
}

export function canManageProjectAccess(viewerUserId: string | null | undefined, creatorUserId: string): boolean {
  return !!viewerUserId && viewerUserId === creatorUserId
}

export function isProjectAccessRole(value: unknown): value is ProjectAccessRole {
  return (
    typeof value === 'string' &&
    (PROJECT_ACCESS_ROLES as readonly string[]).includes(value)
  )
}

export function resolveProjectAccessRole(value: unknown): ProjectAccessRole {
  return isProjectAccessRole(value) ? value : 'viewer'
}

function getProjectAccessRoleRank(role: ProjectAccessRole): number {
  if (role === 'viewer') return 0
  if (role === 'commenter') return 1
  return 2
}

export function hasProjectAccessRole(args: {
  role: ProjectAccessRole | null | undefined
  minRole: ProjectAccessRole
  isCreator?: boolean
}): boolean {
  if (args.isCreator) return true
  const role = resolveProjectAccessRole(args.role)
  return getProjectAccessRoleRank(role) >= getProjectAccessRoleRank(args.minRole)
}

export function isRedundantProjectAccessGrant(args: {
  creatorUserId: string
  targetUserId: string
}): boolean {
  return args.creatorUserId === args.targetUserId
}

type UserIdentifierCandidate = {
  id: string
  username?: string | null
  email?: string | null
}

type ProjectAccessIdentifierResolution =
  | { status: 'ok'; userId: string }
  | { status: 'not_found' }
  | { status: 'ambiguous' }

export function resolveProjectAccessIdentifier(args: {
  identifier: string
  identifierType: ProjectAccessIdentifierType
  candidates: UserIdentifierCandidate[]
}): ProjectAccessIdentifierResolution {
  if (args.identifierType === 'user_id') {
    const exactMatches = args.candidates.filter((candidate) => candidate.id === args.identifier)
    if (exactMatches.length === 0) return { status: 'not_found' }
    if (exactMatches.length > 1) return { status: 'ambiguous' }
    return { status: 'ok', userId: exactMatches[0].id }
  }

  const lowerIdentifier = args.identifier.toLowerCase()
  const exactMatches = args.candidates.filter((candidate) => {
    const value = args.identifierType === 'username' ? candidate.username : candidate.email
    return typeof value === 'string' && value.toLowerCase() === lowerIdentifier
  })

  if (exactMatches.length === 0) return { status: 'not_found' }
  const uniqueUserIds = Array.from(new Set(exactMatches.map((match) => match.id)))
  if (uniqueUserIds.length !== 1) return { status: 'ambiguous' }
  return { status: 'ok', userId: uniqueUserIds[0] }
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export function isProjectAccessGrantActive(
  expiresAt: string | null | undefined,
  nowMs = Date.now()
): boolean {
  const expiresAtMs = toTimestamp(expiresAt)
  if (expiresAtMs === null) return true
  return expiresAtMs > nowMs
}

type ProjectAccessExpiryParseResult =
  | { ok: true; expiresAt: string | null; provided: boolean }
  | { ok: false; error: string }

export function parseProjectAccessExpiryInput(args: {
  body: unknown
  requireProvided?: boolean
  now?: Date
}): ProjectAccessExpiryParseResult {
  const now = args.now || new Date()
  const record =
    args.body && typeof args.body === 'object' ? (args.body as Record<string, unknown>) : {}
  const rawExpiresAt = record.expires_at
  const rawExpiresInHours = record.expires_in_hours

  const hasExpiresAt = rawExpiresAt !== undefined
  const hasExpiresInHours = rawExpiresInHours !== undefined
  const provided = hasExpiresAt || hasExpiresInHours

  if (!provided) {
    if (args.requireProvided) {
      return { ok: false, error: 'Provide expires_at or expires_in_hours' }
    }
    return { ok: true, expiresAt: null, provided: false }
  }

  if (hasExpiresAt && hasExpiresInHours) {
    return { ok: false, error: 'Provide only one of expires_at or expires_in_hours' }
  }

  if (hasExpiresAt) {
    if (rawExpiresAt === null || rawExpiresAt === '') {
      return { ok: true, expiresAt: null, provided: true }
    }
    if (typeof rawExpiresAt !== 'string') {
      return { ok: false, error: 'expires_at must be an ISO datetime string or null' }
    }
    const expiresAtDate = new Date(rawExpiresAt)
    if (!Number.isFinite(expiresAtDate.getTime())) {
      return { ok: false, error: 'expires_at must be a valid ISO datetime string' }
    }
    if (expiresAtDate.getTime() <= now.getTime()) {
      return { ok: false, error: 'expires_at must be in the future' }
    }
    return { ok: true, expiresAt: expiresAtDate.toISOString(), provided: true }
  }

  if (!Number.isInteger(rawExpiresInHours)) {
    return { ok: false, error: 'expires_in_hours must be an integer number of hours' }
  }
  const hours = rawExpiresInHours as number
  if (hours <= 0 || hours > 24 * 365) {
    return { ok: false, error: 'expires_in_hours must be between 1 and 8760' }
  }

  const expiresAtDate = new Date(now.getTime() + hours * 60 * 60 * 1000)
  return { ok: true, expiresAt: expiresAtDate.toISOString(), provided: true }
}

export function getProjectAccessGrantMutationAction(args: {
  hasExistingGrant: boolean
  existingExpiresAt: string | null | undefined
  nextExpiresAt: string | null
}): ProjectAccessGrantMutationAction {
  if (!args.hasExistingGrant) return 'create'

  const existingExpiresAtMs = toTimestamp(args.existingExpiresAt)
  const nextExpiresAtMs = toTimestamp(args.nextExpiresAt)
  if (existingExpiresAtMs === nextExpiresAtMs) return 'unchanged'
  return 'renew'
}

