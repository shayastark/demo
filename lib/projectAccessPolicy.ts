import { hasProjectAccessRole, type ProjectAccessRole } from '@/lib/projectAccess'
import { canViewerAccessProject, resolveProjectVisibility } from '@/lib/projectVisibility'

export type PolicyProjectRow = {
  id: string
  creator_id: string
  visibility?: string | null
  sharing_enabled?: boolean | null
}

export type PolicySnapshotArgs = {
  userId?: string | null
  project: PolicyProjectRow
  isDirectAccess?: boolean
  grantRole?: ProjectAccessRole | null
  hasActiveGrant?: boolean
}

export type ProjectPolicySnapshot = {
  canView: boolean
  canComment: boolean
  canReact: boolean
  canPostUpdate: boolean
  canManageAccess: boolean
}

export function buildProjectPolicySnapshot(args: PolicySnapshotArgs): ProjectPolicySnapshot {
  const isCreator = !!args.userId && args.userId === args.project.creator_id
  const visibility = resolveProjectVisibility(args.project.visibility, args.project.sharing_enabled)
  const canView = canViewerAccessProject({
    visibility,
    isCreator,
    isDirectAccess: args.isDirectAccess ?? true,
    isGrantedUser: args.hasActiveGrant ?? false,
  })

  const hasCommentRole = hasProjectAccessRole({
    role: args.grantRole || null,
    minRole: 'commenter',
    isCreator,
  })
  const hasContributorRole = hasProjectAccessRole({
    role: args.grantRole || null,
    minRole: 'contributor',
    isCreator,
  })

  const canComment =
    !!args.userId &&
    canView &&
    (visibility !== 'private' || hasCommentRole)
  const canReact = canComment
  const canPostUpdate = !!args.userId && hasContributorRole
  const canManageAccess = !!args.userId && isCreator

  return {
    canView,
    canComment,
    canReact,
    canPostUpdate,
    canManageAccess,
  }
}
