import 'server-only'

import { getProjectAccessGrant } from '@/lib/projectAccessServer'
import {
  type PolicyProjectRow,
  type ProjectPolicySnapshot,
  buildProjectPolicySnapshot,
} from '@/lib/projectAccessPolicy'

async function resolvePolicySnapshot(args: {
  userId?: string | null
  project: PolicyProjectRow
  isDirectAccess?: boolean
}): Promise<ProjectPolicySnapshot> {
  if (!args.userId) {
    return buildProjectPolicySnapshot({
      userId: null,
      project: args.project,
      isDirectAccess: args.isDirectAccess,
      hasActiveGrant: false,
      grantRole: null,
    })
  }

  const isCreator = args.userId === args.project.creator_id
  if (isCreator) {
    return buildProjectPolicySnapshot({
      userId: args.userId,
      project: args.project,
      isDirectAccess: args.isDirectAccess,
      hasActiveGrant: false,
      grantRole: null,
    })
  }

  const grant = await getProjectAccessGrant(args.project.id, args.userId)
  return buildProjectPolicySnapshot({
    userId: args.userId,
    project: args.project,
    isDirectAccess: args.isDirectAccess,
    hasActiveGrant: !!grant,
    grantRole: grant?.role || null,
  })
}

export async function canViewProject(args: {
  userId?: string | null
  project: PolicyProjectRow
  isDirectAccess?: boolean
}): Promise<boolean> {
  const snapshot = await resolvePolicySnapshot(args)
  return snapshot.canView
}

export async function canCommentProject(args: {
  userId?: string | null
  project: PolicyProjectRow
  isDirectAccess?: boolean
}): Promise<boolean> {
  const snapshot = await resolvePolicySnapshot(args)
  return snapshot.canComment
}

export async function canReactProject(args: {
  userId?: string | null
  project: PolicyProjectRow
  isDirectAccess?: boolean
}): Promise<boolean> {
  const snapshot = await resolvePolicySnapshot(args)
  return snapshot.canReact
}

export async function canPostProjectUpdate(args: {
  userId?: string | null
  project: PolicyProjectRow
  isDirectAccess?: boolean
}): Promise<boolean> {
  const snapshot = await resolvePolicySnapshot(args)
  return snapshot.canPostUpdate
}

export async function canManageProjectAccess(args: {
  userId?: string | null
  project: PolicyProjectRow
}): Promise<boolean> {
  const snapshot = await resolvePolicySnapshot({
    userId: args.userId,
    project: args.project,
    isDirectAccess: true,
  })
  return snapshot.canManageAccess
}

// Temporary alias for compatibility while routes migrate.
export const canManageProjectAccessPolicy = canManageProjectAccess
