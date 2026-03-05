import { parseOffsetLimitQuery } from '@/lib/pagination'
import { resolveProjectVisibility } from '@/lib/projectVisibility'

export type ExploreSort = 'trending' | 'newest' | 'most_supported'

export interface ExploreProjectRow {
  id: string
  title: string | null
  cover_image_url: string | null
  creator_id: string
  visibility: string | null
  sharing_enabled: boolean | null
  share_token: string | null
  created_at: string
}

export interface ExploreCreatorRow {
  id: string
  username: string | null
  email: string | null
}

export interface ExploreProjectItem {
  project_id: string
  title: string
  cover_image_url: string | null
  creator_id: string
  creator_name: string
  created_at: string
  supporter_count: number
  target_path: string
}

export function parseExploreProjectsQuery(args: {
  rawSort: string | null
  rawLimit: string | null
  rawOffset: string | null
  rawQ: string | null
}):
  | { ok: true; sort: ExploreSort; limit: number; offset: number; q: string | null }
  | { ok: false; error: string } {
  const parsedPagination = parseOffsetLimitQuery({
    rawLimit: args.rawLimit,
    rawOffset: args.rawOffset,
    defaultLimit: 20,
    maxLimit: 50,
  })
  if (!parsedPagination.ok) return parsedPagination

  let sort: ExploreSort = 'trending'
  if (args.rawSort && args.rawSort !== '') {
    if (args.rawSort === 'newest' || args.rawSort === 'most_supported' || args.rawSort === 'trending') {
      sort = args.rawSort
    }
  }

  const q = args.rawQ?.trim() || null
  if (q && q.length > 80) {
    return { ok: false, error: 'q must be 80 characters or less' }
  }

  return {
    ok: true,
    sort,
    limit: parsedPagination.limit,
    offset: parsedPagination.offset,
    q,
  }
}

export function getExploreCreatorName(args: { username?: string | null; email?: string | null }): string {
  return args.username?.trim() || args.email?.trim() || 'Unknown creator'
}

export function selectPublicExploreRows(rows: ExploreProjectRow[]): ExploreProjectRow[] {
  return rows.filter(
    (row) => resolveProjectVisibility(row.visibility, row.sharing_enabled) === 'public'
  )
}

export function buildExploreProjectItems(args: {
  projects: ExploreProjectRow[]
  creatorsById: Record<string, ExploreCreatorRow>
  supporterCountByProjectId: Record<string, number>
  engagementCountByProjectId: Record<string, number>
  recentUpdatesCountByProjectId: Record<string, number>
  latestUpdateAtByProjectId: Record<string, string | null>
  sort: ExploreSort
}): ExploreProjectItem[] {
  const nowMs = Date.now()
  const items = selectPublicExploreRows(args.projects).map((project) => {
    const creator = args.creatorsById[project.creator_id]
    return {
      project_id: project.id,
      title: project.title?.trim() || 'Untitled project',
      cover_image_url: project.cover_image_url || null,
      creator_id: project.creator_id,
      creator_name: getExploreCreatorName({
        username: creator?.username,
        email: creator?.email,
      }),
      created_at: project.created_at,
      supporter_count: args.supporterCountByProjectId[project.id] || 0,
      target_path: `/dashboard/projects/${project.id}`,
    }
  })

  return items.sort((a, b) => {
    if (args.sort === 'trending') {
      const scoreA = getTrendingScore({
        item: a,
        engagementCount: args.engagementCountByProjectId[a.project_id] || 0,
        recentUpdatesCount: args.recentUpdatesCountByProjectId[a.project_id] || 0,
        latestUpdateAt: args.latestUpdateAtByProjectId[a.project_id] || null,
        nowMs,
      })
      const scoreB = getTrendingScore({
        item: b,
        engagementCount: args.engagementCountByProjectId[b.project_id] || 0,
        recentUpdatesCount: args.recentUpdatesCountByProjectId[b.project_id] || 0,
        latestUpdateAt: args.latestUpdateAtByProjectId[b.project_id] || null,
        nowMs,
      })
      if (scoreB !== scoreA) return scoreB - scoreA
    }

    if (args.sort === 'most_supported') {
      if (b.supporter_count !== a.supporter_count) {
        return b.supporter_count - a.supporter_count
      }
    }
    const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (timeDiff !== 0) return timeDiff
    return b.project_id.localeCompare(a.project_id)
  })
}

function getTrendingScore(args: {
  item: ExploreProjectItem
  engagementCount: number
  recentUpdatesCount: number
  latestUpdateAt: string | null
  nowMs: number
}): number {
  const latestActivityMs = Math.max(
    new Date(args.item.created_at).getTime() || 0,
    new Date(args.latestUpdateAt || '').getTime() || 0
  )
  const ageDays = latestActivityMs > 0 ? (args.nowMs - latestActivityMs) / (24 * 60 * 60 * 1000) : 365
  const recencyScore = Math.max(0, 30 - ageDays) / 30
  const socialScore = Math.log1p(args.item.supporter_count)
  const engagementScore = Math.log1p(args.engagementCount)
  const recentActivityBoost = Math.min(args.recentUpdatesCount, 6) / 6

  let score = recencyScore * 3 + socialScore * 1.25 + engagementScore * 2.25 + recentActivityBoost

  // Keep stale low-signal projects valid but lower in top slots.
  if (ageDays > 45 && args.item.supporter_count === 0 && args.engagementCount === 0) {
    score -= 2
  }
  if (ageDays > 90 && args.item.supporter_count === 0 && args.engagementCount === 0) {
    score -= 2
  }

  return score
}
