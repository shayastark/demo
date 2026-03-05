import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
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

export async function getProjectAccessGrant(projectId: string, userId: string): Promise<{
  id: string
  role: ProjectAccessRole
  expires_at: string | null
} | null> {
  const { data } = await supabaseAdmin
    .from('project_access_grants')
    .select('id, role, expires_at')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  if (!isProjectAccessGrantActive((data as { expires_at?: string | null }).expires_at || null)) {
    return null
  }
  return {
    id: data.id,
    role: resolveProjectAccessRole((data as { role?: unknown }).role),
    expires_at: (data as { expires_at?: string | null }).expires_at || null,
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

