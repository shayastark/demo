export interface CreatorDigestTopProject {
  id: string
  title: string
  metric_label: string
  metric_value: number
}

export interface CreatorDigestResponse {
  window_days: number
  has_complete_window: boolean
  new_followers_count: number
  new_comments_count: number
  updates_posted_count: number
  tips_count: number
  tips_amount_cents: number
  top_project: CreatorDigestTopProject | null
  highlights: string[]
}

export const DEFAULT_CREATOR_DIGEST_WINDOW_DAYS = 7
export const MAX_CREATOR_DIGEST_WINDOW_DAYS = 30

export function parseCreatorDigestWindowDays(value: string | null): number | null {
  if (value === null || value === '') return DEFAULT_CREATOR_DIGEST_WINDOW_DAYS
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CREATOR_DIGEST_WINDOW_DAYS) return null
  return parsed
}

export function buildCreatorDigestTopProject(args: {
  projectTitlesById: Record<string, string>
  commentProjectIds: string[]
  updateProjectIds: string[]
  tipRows: Array<{ project_id: string | null; amount: number }>
}): CreatorDigestTopProject | null {
  const metrics: Record<
    string,
    { title: string; comments: number; updates: number; tips_count: number; tips_amount_cents: number }
  > = {}

  for (const projectId of args.commentProjectIds) {
    if (!metrics[projectId]) {
      metrics[projectId] = {
        title: args.projectTitlesById[projectId] || 'Untitled project',
        comments: 0,
        updates: 0,
        tips_count: 0,
        tips_amount_cents: 0,
      }
    }
    metrics[projectId].comments += 1
  }

  for (const projectId of args.updateProjectIds) {
    if (!metrics[projectId]) {
      metrics[projectId] = {
        title: args.projectTitlesById[projectId] || 'Untitled project',
        comments: 0,
        updates: 0,
        tips_count: 0,
        tips_amount_cents: 0,
      }
    }
    metrics[projectId].updates += 1
  }

  for (const row of args.tipRows) {
    if (!row.project_id) continue
    const projectId = row.project_id
    if (!metrics[projectId]) {
      metrics[projectId] = {
        title: args.projectTitlesById[projectId] || 'Untitled project',
        comments: 0,
        updates: 0,
        tips_count: 0,
        tips_amount_cents: 0,
      }
    }
    metrics[projectId].tips_count += 1
    metrics[projectId].tips_amount_cents += row.amount || 0
  }

  const entries = Object.entries(metrics)
  if (entries.length === 0) return null

  entries.sort((a, b) => {
    const aTotal = a[1].comments + a[1].updates + a[1].tips_count
    const bTotal = b[1].comments + b[1].updates + b[1].tips_count
    if (bTotal !== aTotal) return bTotal - aTotal
    if (b[1].tips_amount_cents !== a[1].tips_amount_cents) return b[1].tips_amount_cents - a[1].tips_amount_cents
    return a[0].localeCompare(b[0])
  })

  const [projectId, selected] = entries[0]
  const metricCandidates: Array<{ label: string; value: number }> = [
    { label: 'new comments', value: selected.comments },
    { label: 'new tips', value: selected.tips_count },
    { label: 'updates posted', value: selected.updates },
  ]
  metricCandidates.sort((a, b) => b.value - a.value)
  if (metricCandidates[0].value <= 0) return null
  return {
    id: projectId,
    title: selected.title,
    metric_label: metricCandidates[0].label,
    metric_value: metricCandidates[0].value,
  }
}

export function buildCreatorDigestHighlights(digest: Omit<CreatorDigestResponse, 'highlights' | 'window_days'>): string[] {
  const highlights: string[] = []

  if (digest.new_followers_count > 0) {
    highlights.push(
      `${digest.new_followers_count} new follower${digest.new_followers_count === 1 ? '' : 's'} this week`
    )
  }
  if (digest.tips_amount_cents > 0) {
    highlights.push(`Earned ${(digest.tips_amount_cents / 100).toFixed(2)} USD in tips`)
  }
  if (digest.new_comments_count > 0) {
    highlights.push(`${digest.new_comments_count} new comment${digest.new_comments_count === 1 ? '' : 's'} on your projects`)
  }
  if (highlights.length === 0 && digest.updates_posted_count > 0) {
    highlights.push(`You posted ${digest.updates_posted_count} update${digest.updates_posted_count === 1 ? '' : 's'}`)
  }

  return highlights.slice(0, 3)
}

