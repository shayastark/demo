import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  getProjectAccessGrantMutationAction,
  hasProjectAccessRole,
  isProjectAccessGrantActive,
  resolveProjectAccessRole,
  type ProjectAccessRole,
} from '@/lib/projectAccess'
import { canViewerAccessProject, resolveProjectVisibility } from '@/lib/projectVisibility'

export type ProjectAccessProjectRow = {
  id: string
  creator_id: string
  visibility?: string | null
  sharing_enabled?: boolean | null
}

type ProjectAccessGrantColumnSupport = {
  hasGrantedByUserId: boolean
  hasRole: boolean
  hasExpiresAt: boolean
  hasCreatedAt: boolean
}

type ProjectAccessGrantRow = {
  id: string
  granted_by_user_id?: string | null
  role?: unknown
  expires_at?: string | null
  created_at?: string | null
}

let cachedProjectAccessGrantColumnSupport: ProjectAccessGrantColumnSupport | null = null

async function probeGrantColumn(column: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('project_access_grants')
    .select(column)
    .limit(1)
  return !error
}

async function resolveProjectAccessGrantColumnSupport(): Promise<ProjectAccessGrantColumnSupport> {
  if (cachedProjectAccessGrantColumnSupport) return cachedProjectAccessGrantColumnSupport

  const [hasGrantedByUserId, hasRole, hasExpiresAt, hasCreatedAt] = await Promise.all([
    probeGrantColumn('granted_by_user_id'),
    probeGrantColumn('role'),
    probeGrantColumn('expires_at'),
    probeGrantColumn('created_at'),
  ])

  cachedProjectAccessGrantColumnSupport = {
    hasGrantedByUserId,
    hasRole,
    hasExpiresAt,
    hasCreatedAt,
  }
  return cachedProjectAccessGrantColumnSupport
}

async function listProjectAccessGrantRows(projectId: string, userId: string): Promise<ProjectAccessGrantRow[]> {
  const support = await resolveProjectAccessGrantColumnSupport()
  const selectFields = ['id']
  if (support.hasGrantedByUserId) selectFields.push('granted_by_user_id')
  if (support.hasRole) selectFields.push('role')
  if (support.hasExpiresAt) selectFields.push('expires_at')
  if (support.hasCreatedAt) selectFields.push('created_at')

  let query = supabaseAdmin
    .from('project_access_grants')
    .select(selectFields.join(', '))
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (support.hasCreatedAt) {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error } = await query.limit(5)
  if (error) throw error

  const rows = ((data as unknown) as ProjectAccessGrantRow[] | null) || []
  if (rows.length > 1) {
    console.warn('Multiple project access grants found for same project/user pair', {
      project_id: projectId,
      user_id: userId,
      duplicate_count: rows.length,
    })
  }
  return rows
}

function getPreferredProjectAccessGrantRow(rows: ProjectAccessGrantRow[]): ProjectAccessGrantRow | null {
  for (const row of rows) {
    if (isProjectAccessGrantActive(row.expires_at || null)) {
      return row
    }
  }
  return rows[0] || null
}

export async function getProjectAccessGrant(projectId: string, userId: string): Promise<{
  id: string
  role: ProjectAccessRole
  expires_at: string | null
} | null> {
  const rows = await listProjectAccessGrantRows(projectId, userId)
  const data = getPreferredProjectAccessGrantRow(rows)
  if (!data) return null
  if (!isProjectAccessGrantActive(data.expires_at || null)) {
    return null
  }
  return {
    id: data.id,
    role: resolveProjectAccessRole(data.role),
    expires_at: data.expires_at || null,
  }
}

export async function upsertProjectAccessGrant(args: {
  projectId: string
  userId: string
  grantedByUserId: string
  role?: ProjectAccessRole
  expiresAt?: string | null
}): Promise<{
  action: 'create' | 'renew' | 'unchanged'
  role: ProjectAccessRole
  expires_at: string | null
}> {
  const support = await resolveProjectAccessGrantColumnSupport()
  const rows = await listProjectAccessGrantRows(args.projectId, args.userId)
  const existingGrant = rows[0] || null
  const targetRole = resolveProjectAccessRole(args.role)
  const targetExpiresAt = args.expiresAt ?? null
  const mutationAction = getProjectAccessGrantMutationAction({
    hasExistingGrant: !!existingGrant,
    existingExpiresAt: support.hasExpiresAt ? existingGrant?.expires_at || null : null,
    nextExpiresAt: support.hasExpiresAt ? targetExpiresAt : null,
  })
  const roleChanged =
    support.hasRole && !!existingGrant && resolveProjectAccessRole(existingGrant.role) !== targetRole

  if (mutationAction === 'create') {
    const insertPayload: Record<string, unknown> = {
      project_id: args.projectId,
      user_id: args.userId,
    }
    if (support.hasGrantedByUserId) insertPayload.granted_by_user_id = args.grantedByUserId
    if (support.hasRole) insertPayload.role = targetRole
    if (support.hasExpiresAt) insertPayload.expires_at = targetExpiresAt

    const { error } = await supabaseAdmin.from('project_access_grants').insert(insertPayload)
    if (error) throw error
  } else if (mutationAction === 'renew' || roleChanged) {
    const updatePayload: Record<string, unknown> = {}
    if (support.hasGrantedByUserId) updatePayload.granted_by_user_id = args.grantedByUserId
    if (support.hasRole) updatePayload.role = targetRole
    if (support.hasExpiresAt) updatePayload.expires_at = targetExpiresAt

    const { error } = await supabaseAdmin
      .from('project_access_grants')
      .update(updatePayload)
      .eq('project_id', args.projectId)
      .eq('user_id', args.userId)
    if (error) throw error
  }

  return {
    action: mutationAction === 'unchanged' && roleChanged ? 'renew' : mutationAction,
    role: support.hasRole ? targetRole : 'viewer',
    expires_at: support.hasExpiresAt ? targetExpiresAt : null,
  }
}

export async function hasProjectAccessGrant(projectId: string, userId: string): Promise<boolean> {
  const grant = await getProjectAccessGrant(projectId, userId)
  return !!grant
}

export async function hasProjectRole(args: {
  projectId: string
  projectCreatorId: string
  userId?: string | null
  minRole: ProjectAccessRole
}): Promise<boolean> {
  if (!args.userId) return false
  if (args.userId === args.projectCreatorId) return true
  const grant = await getProjectAccessGrant(args.projectId, args.userId)
  if (!grant) return false
  return hasProjectAccessRole({
    role: grant.role,
    minRole: args.minRole,
  })
}

export async function canUserAccessProjectRow(args: {
  project: ProjectAccessProjectRow
  userId?: string | null
  isDirectAccess: boolean
}): Promise<boolean> {
  const resolvedVisibility = resolveProjectVisibility(args.project.visibility, args.project.sharing_enabled)
  const isCreator = !!args.userId && args.userId === args.project.creator_id

  let isGrantedUser = false
  if (resolvedVisibility === 'private' && !isCreator && args.userId) {
    isGrantedUser = await hasProjectAccessGrant(args.project.id, args.userId)
  }

  return canViewerAccessProject({
    visibility: resolvedVisibility,
    isCreator,
    isDirectAccess: args.isDirectAccess,
    isGrantedUser,
  })
}

