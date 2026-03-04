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
  created_at: string
}

type ProjectLookup = { id: string; title: string | null; creator_id: string | null }
type UserLookup = { id: string; username: string | null; email: string | null }

export function sortFeedUpdatesNewestFirst(updates: FeedUpdateRow[]): FeedUpdateRow[] {
  return [...updates].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
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
      created_at: update.created_at,
      target_path: update.project_id
        ? `/dashboard/projects/${update.project_id}?update_id=${encodeURIComponent(update.id)}`
        : '/dashboard',
    }
  })
}

