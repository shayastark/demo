export const MAX_PROJECT_ACCESS_REQUEST_NOTE_LENGTH = 280
export const PROJECT_ACCESS_REQUEST_STATUSES = ['pending', 'approved', 'denied'] as const
export type ProjectAccessRequestStatus = (typeof PROJECT_ACCESS_REQUEST_STATUSES)[number]
export type ProjectAccessRequestAction = 'approve' | 'deny'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

function sanitizeRequestNote(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_PROJECT_ACCESS_REQUEST_NOTE_LENGTH)
}

export function isProjectAccessRequestStatus(value: unknown): value is ProjectAccessRequestStatus {
  return (
    typeof value === 'string' &&
    (PROJECT_ACCESS_REQUEST_STATUSES as readonly string[]).includes(value)
  )
}

export function parseProjectAccessRequestCreateInput(value: unknown): {
  project_id: string
  note: string | null
} | null {
  if (!value || typeof value !== 'object') return null
  const projectId = (value as Record<string, unknown>).project_id
  if (typeof projectId !== 'string' || !isValidUuid(projectId)) return null
  const note = sanitizeRequestNote((value as Record<string, unknown>).note)
  return { project_id: projectId, note }
}

export function parseProjectAccessRequestReviewInput(value: unknown): {
  id: string
  action: ProjectAccessRequestAction
} | null {
  if (!value || typeof value !== 'object') return null
  const id = (value as Record<string, unknown>).id
  const action = (value as Record<string, unknown>).action
  if (typeof id !== 'string' || !isValidUuid(id)) return null
  if (action !== 'approve' && action !== 'deny') return null
  return { id, action }
}

export function canReviewProjectAccessRequest(args: {
  creatorUserId: string
  viewerUserId: string | null | undefined
}): boolean {
  return !!args.viewerUserId && args.viewerUserId === args.creatorUserId
}

export function shouldNotifyCreatorOnAccessRequest(args: {
  existingStatus: ProjectAccessRequestStatus | null
  requesterAlreadyHasAccess: boolean
}): boolean {
  if (args.requesterAlreadyHasAccess) return false
  if (!args.existingStatus) return true
  return args.existingStatus !== 'pending'
}

export function shouldUpsertAccessGrantOnReview(action: ProjectAccessRequestAction): boolean {
  return action === 'approve'
}

