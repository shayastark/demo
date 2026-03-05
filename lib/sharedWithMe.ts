import { isProjectAccessGrantActive, resolveProjectAccessRole, type ProjectAccessRole } from './projectAccess'
import { resolveProjectVisibility, type ProjectVisibility } from './projectVisibility'

export interface SharedWithMeGrantRow {
  project_id: string
  created_at: string
  expires_at: string | null
  role: unknown
}

export interface SharedWithMeProjectLookup {
  id: string
  title: string | null
  cover_image_url: string | null
  creator_id: string
  visibility: string | null
  sharing_enabled: boolean | null
}

export interface SharedWithMeCreatorLookup {
  id: string
  username: string | null
  email: string | null
}

export interface SharedWithMeItem {
  project_id: string
  title: string
  cover_image_url: string | null
  creator_id: string
  creator_name: string
  visibility: ProjectVisibility
  granted_at: string
  expires_at: string | null
  is_expired: boolean
  role: ProjectAccessRole
  target_path: string
}

export function parseSharedWithMeQuery(args: {
  rawLimit: string | null
  rawOffset: string | null
  rawIncludeExpired: string | null
}): { ok: true; limit: number; offset: number; includeExpired: boolean } | { ok: false; error: string } {
  const limitRaw = args.rawLimit
  const offsetRaw = args.rawOffset
  const includeExpiredRaw = args.rawIncludeExpired

  let limit = 20
  if (limitRaw !== null && limitRaw !== '') {
    if (!/^\d+$/.test(limitRaw)) {
      return { ok: false, error: 'limit must be an integer between 1 and 50' }
    }
    const parsed = Number(limitRaw)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      return { ok: false, error: 'limit must be an integer between 1 and 50' }
    }
    limit = parsed
  }

  let offset = 0
  if (offsetRaw !== null && offsetRaw !== '') {
    if (!/^\d+$/.test(offsetRaw)) {
      return { ok: false, error: 'offset must be a non-negative integer' }
    }
    const parsed = Number(offsetRaw)
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, error: 'offset must be a non-negative integer' }
    }
    offset = parsed
  }

  let includeExpired = false
  if (includeExpiredRaw !== null) {
    if (includeExpiredRaw !== 'true' && includeExpiredRaw !== 'false') {
      return { ok: false, error: 'include_expired must be true or false' }
    }
    includeExpired = includeExpiredRaw === 'true'
  }

  return { ok: true, limit, offset, includeExpired }
}

function fallbackCreatorName(creator?: SharedWithMeCreatorLookup): string {
  return creator?.username?.trim() || creator?.email?.trim() || 'Unknown creator'
}

function fallbackTitle(project?: SharedWithMeProjectLookup): string {
  return project?.title?.trim() || 'Untitled project'
}

function byGrantSort(a: SharedWithMeItem, b: SharedWithMeItem): number {
  if (a.is_expired !== b.is_expired) return a.is_expired ? 1 : -1
  const timeDiff = new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime()
  if (timeDiff !== 0) return timeDiff
  return b.project_id.localeCompare(a.project_id)
}

export function buildSharedWithMeItems(args: {
  grants: SharedWithMeGrantRow[]
  projectsById: Record<string, SharedWithMeProjectLookup>
  creatorsById: Record<string, SharedWithMeCreatorLookup>
  includeExpired: boolean
  currentUserId: string
}): SharedWithMeItem[] {
  const items: SharedWithMeItem[] = []

  for (const grant of args.grants) {
    const project = args.projectsById[grant.project_id]
    if (!project) continue
    if (!project.creator_id || project.creator_id === args.currentUserId) continue

    const isExpired = !isProjectAccessGrantActive(grant.expires_at)
    if (!args.includeExpired && isExpired) continue

    const creator = args.creatorsById[project.creator_id]
    items.push({
      project_id: project.id,
      title: fallbackTitle(project),
      cover_image_url: project.cover_image_url || null,
      creator_id: project.creator_id,
      creator_name: fallbackCreatorName(creator),
      visibility: resolveProjectVisibility(project.visibility, project.sharing_enabled),
      granted_at: grant.created_at,
      expires_at: grant.expires_at || null,
      is_expired: isExpired,
      role: resolveProjectAccessRole(grant.role),
      target_path: `/dashboard/projects/${project.id}`,
    })
  }

  return items.sort(byGrantSort)
}
