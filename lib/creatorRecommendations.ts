import { getCreatorPublicPath } from '@/lib/publicCreatorProfile'
import {
  applyPreferenceBoostWeight,
  capCreatorPreferenceBoost,
  shouldLogDiscoveryRankingDiagnostics,
} from '@/lib/discoveryRankingConfig'

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
  preference_seed_boost?: number
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
  hiddenCreatorIds?: Set<string>
  creatorPreferenceBoostById?: Record<string, number>
  limit: number
}): CreatorRecommendationItem[] {
  const hiddenCreatorIds = args.hiddenCreatorIds || new Set<string>()
  const candidates = Object.values(args.activityByCreatorId)
    .filter((row) => row.creator_id !== args.viewerUserId)
    .filter((row) => !args.alreadyFollowingIds.has(row.creator_id))
    .filter((row) => !hiddenCreatorIds.has(row.creator_id))
    .filter((row) => row.recent_public_projects_count > 0 || row.recent_public_updates_count > 0)

  const ranked = [...candidates].sort((a, b) => {
    const scoreA = recommendationScore(a, args.creatorPreferenceBoostById?.[a.creator_id] || 0)
    const scoreB = recommendationScore(b, args.creatorPreferenceBoostById?.[b.creator_id] || 0)
    if (scoreB !== scoreA) return scoreB - scoreA
    const timeA = a.latest_public_activity_at ? new Date(a.latest_public_activity_at).getTime() : 0
    const timeB = b.latest_public_activity_at ? new Date(b.latest_public_activity_at).getTime() : 0
    if (timeB !== timeA) return timeB - timeA
    return a.creator_id.localeCompare(b.creator_id)
  })

  if (shouldLogDiscoveryRankingDiagnostics()) {
    for (const row of ranked.slice(0, 20)) {
      const detail = recommendationScoreDetails(row, args.creatorPreferenceBoostById?.[row.creator_id] || 0)
      // Dev-only ranking diagnostics for recommendation tuning.
      console.info('[discovery_ranking][recommendations]', {
        item_id: row.creator_id,
        baseline_score: Number(detail.baseline.toFixed(4)),
        boost: Number(detail.boostApplied.toFixed(4)),
        final_score: Number(detail.final.toFixed(4)),
      })
    }
  }

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
      preference_seed_boost: capCreatorPreferenceBoost(
        args.creatorPreferenceBoostById?.[row.creator_id] || 0
      ),
      profile_path: getCreatorPublicPath({
        id: row.creator_id,
        username: user?.username || null,
      }),
    }
  })
}

export function filterCreatorsByVisiblePublicProjects(args: {
  projects: Array<{ id: string; creator_id: string }>
  hiddenProjectIds: Set<string>
}): Set<string> {
  const visibleCreatorIds = new Set<string>()
  for (const project of args.projects) {
    if (!args.hiddenProjectIds.has(project.id)) {
      visibleCreatorIds.add(project.creator_id)
    }
  }
  return visibleCreatorIds
}

export function collectSuppressedCreatorIdsFromReasonSignals(args: {
  hiddenRows: Array<{
    target_type: string | null
    target_id: string | null
    reason_code?: string | null
  }>
  hiddenCreatorIds: Set<string>
  projectCreatorById: Record<string, string>
}): Set<string> {
  const suppressed = new Set<string>(args.hiddenCreatorIds)
  for (const row of args.hiddenRows) {
    if (row.reason_code !== 'not_my_style') continue
    if (row.target_type === 'creator' && typeof row.target_id === 'string') {
      suppressed.add(row.target_id)
      continue
    }
    if (row.target_type === 'project' && typeof row.target_id === 'string') {
      const creatorId = args.projectCreatorById[row.target_id]
      if (creatorId) suppressed.add(creatorId)
    }
  }
  return suppressed
}

function recommendationScore(row: CreatorRecommendationActivityStats, preferenceBoost: number): number {
  return recommendationScoreDetails(row, preferenceBoost).final
}

function recommendationScoreDetails(
  row: CreatorRecommendationActivityStats,
  preferenceBoost: number
): { baseline: number; boostApplied: number; final: number } {
  const activityScore = row.recent_public_updates_count * 3 + row.recent_public_projects_count * 2
  const socialScore = Math.min(row.follower_count, 200) / 100
  const boostApplied = applyPreferenceBoostWeight(capCreatorPreferenceBoost(preferenceBoost))
  const baseline = activityScore + socialScore
  return {
    baseline,
    boostApplied,
    final: baseline + boostApplied,
  }
}
