import { getCreatorPublicPath } from '@/lib/publicCreatorProfile'

export interface CreatorRecommendationUserRow {
  id: string
  username: string | null
  email: string | null
  avatar_url: string | null
}

export interface CreatorRecommendationActivityStats {
  creator_id: string
  recent_public_updates_count: number
  recent_public_projects_count: number
  latest_public_activity_at: string | null
  follower_count: number
}

export interface CreatorRecommendationItem {
  creator_id: string
  username: string | null
  display_name: string
  avatar_url: string | null
  short_reason: string
  reason_code: 'active_week' | 'popular_week' | 'new_public_project'
  follower_count: number
  profile_path: string
}

export function parseCreatorRecommendationsLimit(rawLimit: string | null): number | null {
  if (rawLimit === null || rawLimit === '') return 5
  if (!/^\d+$/.test(rawLimit)) return null
  const parsed = Number(rawLimit)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) return null
  return parsed
}

export function buildCreatorRecommendations(args: {
  usersById: Record<string, CreatorRecommendationUserRow>
  activityByCreatorId: Record<string, CreatorRecommendationActivityStats>
  viewerUserId: string
  alreadyFollowingIds: Set<string>
  limit: number
}): CreatorRecommendationItem[] {
  const candidates = Object.values(args.activityByCreatorId)
    .filter((row) => row.creator_id !== args.viewerUserId)
    .filter((row) => !args.alreadyFollowingIds.has(row.creator_id))
    .filter((row) => row.recent_public_projects_count > 0 || row.recent_public_updates_count > 0)

  const ranked = [...candidates].sort((a, b) => {
    const scoreA = recommendationScore(a)
    const scoreB = recommendationScore(b)
    if (scoreB !== scoreA) return scoreB - scoreA
    const timeA = a.latest_public_activity_at ? new Date(a.latest_public_activity_at).getTime() : 0
    const timeB = b.latest_public_activity_at ? new Date(b.latest_public_activity_at).getTime() : 0
    if (timeB !== timeA) return timeB - timeA
    return a.creator_id.localeCompare(b.creator_id)
  })

  return ranked.slice(0, args.limit).map((row) => {
    const user = args.usersById[row.creator_id]
    const reason_code: CreatorRecommendationItem['reason_code'] =
      row.follower_count >= 20
        ? 'popular_week'
        : row.recent_public_updates_count > 0
          ? 'active_week'
          : 'new_public_project'

    return {
      creator_id: row.creator_id,
      username: user?.username || null,
      display_name: user?.username?.trim() || user?.email?.trim() || 'Creator',
      avatar_url: user?.avatar_url || null,
      short_reason:
        reason_code === 'popular_week'
          ? 'Popular this week'
          : reason_code === 'active_week'
            ? 'Active this week'
            : 'New public project',
      reason_code,
      follower_count: row.follower_count,
      profile_path: getCreatorPublicPath({
        id: row.creator_id,
        username: user?.username || null,
      }),
    }
  })
}

function recommendationScore(row: CreatorRecommendationActivityStats): number {
  const activityScore = row.recent_public_updates_count * 3 + row.recent_public_projects_count * 2
  const socialScore = Math.min(row.follower_count, 200) / 100
  return activityScore + socialScore
}
