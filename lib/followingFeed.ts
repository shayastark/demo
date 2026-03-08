export interface FollowingFeedItem {
  update_id: string
  project_id: string
  creator_id: string
  creator_name: string
  project_title: string
  content: string
  version_label: string | null
  created_at: string
  target_path: string
}

export interface FeedUpdateRow {
  id: string
  project_id: string
  user_id: string
  content: string
  version_label: string | null
  published_at: string | null
  created_at: string
}

export function parseFollowingFeedQuery(args: {
  rawLimit: string | null
  rawOffset: string | null
}): { ok: true; limit: number; offset: number } | { ok: false; error: string } {
  let limit = 20
  if (args.rawLimit !== null && args.rawLimit !== '') {
    if (!/^\d+$/.test(args.rawLimit)) {
      return { ok: false, error: 'limit must be an integer between 1 and 50' }
    }
    const parsed = Number(args.rawLimit)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      return { ok: false, error: 'limit must be an integer between 1 and 50' }
    }
    limit = parsed
  }

  let offset = 0
  if (args.rawOffset !== null && args.rawOffset !== '') {
    if (!/^\d+$/.test(args.rawOffset)) {
      return { ok: false, error: 'offset must be a non-negative integer' }
    }
    const parsed = Number(args.rawOffset)
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, error: 'offset must be a non-negative integer' }
    }
    offset = parsed
  }

  return { ok: true, limit, offset }
}

type ProjectLookup = { id: string; title: string | null; creator_id: string | null }
type UserLookup = { id: string; username: string | null; email: string | null }

function getFeedUpdateTimestamp(update: Pick<FeedUpdateRow, 'published_at' | 'created_at'>): string {
  return update.published_at || update.created_at
}

export function sortFeedUpdatesNewestFirst(updates: FeedUpdateRow[]): FeedUpdateRow[] {
  return [...updates].sort((a, b) => {
    const timeDiff =
      new Date(getFeedUpdateTimestamp(b)).getTime() - new Date(getFeedUpdateTimestamp(a)).getTime()
    if (timeDiff !== 0) return timeDiff
    return b.id.localeCompare(a.id)
  })
}

export function getCreatorName(user?: UserLookup | null): string {
  return user?.username?.trim() || user?.email?.trim() || 'Unknown creator'
}

export function getProjectTitle(project?: ProjectLookup | null): string {
  return project?.title?.trim() || 'Untitled project'
}

export function buildFollowingFeedItems(
  updates: FeedUpdateRow[],
  projectsById: Record<string, ProjectLookup>,
  usersById: Record<string, UserLookup>
): FollowingFeedItem[] {
  return sortFeedUpdatesNewestFirst(updates).map((update) => {
    const project = projectsById[update.project_id]
    const creatorId = project?.creator_id || update.user_id
    const creator = usersById[creatorId]

    return {
      update_id: update.id,
      project_id: update.project_id,
      creator_id: creatorId,
      creator_name: getCreatorName(creator),
      project_title: getProjectTitle(project),
      content: update.content || '',
      version_label: update.version_label || null,
      created_at: getFeedUpdateTimestamp(update),
      target_path: update.project_id
        ? `/dashboard/projects/${update.project_id}?update_id=${encodeURIComponent(update.id)}`
        : '/dashboard',
    }
  })
}

