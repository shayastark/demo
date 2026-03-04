export interface CreatorEarningsRecentTip {
  amount_cents: number
  created_at: string
  project_id: string | null
  project_title: string
  supporter_name: string
}

export interface CreatorEarningsProjectTotal {
  project_id: string
  project_title: string
  tips_count: number
  amount_cents: number
}

export function getSupporterDisplayName(value?: string | null): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : 'Anonymous supporter'
}

export function aggregateProjectTotals(
  rows: Array<{ project_id: string | null; amount: number }>
): Record<string, { tips_count: number; amount_cents: number }> {
  const totals: Record<string, { tips_count: number; amount_cents: number }> = {}
  for (const row of rows) {
    if (!row.project_id) continue
    if (!totals[row.project_id]) {
      totals[row.project_id] = { tips_count: 0, amount_cents: 0 }
    }
    totals[row.project_id].tips_count += 1
    totals[row.project_id].amount_cents += row.amount || 0
  }
  return totals
}

export function buildPerProjectTotals(
  totals: Record<string, { tips_count: number; amount_cents: number }>,
  titleByProjectId: Record<string, string>,
  topN = 5
): CreatorEarningsProjectTotal[] {
  return Object.entries(totals)
    .map(([projectId, total]) => ({
      project_id: projectId,
      project_title: titleByProjectId[projectId] || 'Untitled project',
      tips_count: total.tips_count,
      amount_cents: total.amount_cents,
    }))
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, topN)
}

