export type ProjectAccessIdentifierType = 'user_id' | 'email' | 'username'

export type ProjectAccessGrantInput = {
  project_id: string
  identifier: string
  identifier_type: ProjectAccessIdentifierType
}

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

