import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { canViewerAccessProject, resolveProjectVisibility } from '@/lib/projectVisibility'

export type ProjectAccessProjectRow = {
  id: string
  creator_id: string
  visibility?: string | null
  sharing_enabled?: boolean | null
}

export async function hasProjectAccessGrant(projectId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('project_access_grants')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
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

