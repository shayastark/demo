export interface TopSupporterAggregate {
  supporter_user_id: string
  total_tip_amount_cents: number
  tip_count: number
  last_tipped_at: string
}

export interface TopSupporterRowInput {
  tipper_user_id: string | null
  amount: number | null
  created_at: string | null
}

export function parseTopSupportersLimit(rawLimit: string | null): number | null {
  if (rawLimit === null || rawLimit === '') return 5
  if (!/^\d+$/.test(rawLimit)) return null
  const parsed = Number(rawLimit)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) return null
  return parsed
}

export function aggregateTopSupporters(rows: TopSupporterRowInput[]): TopSupporterAggregate[] {
  const aggregates = new Map<string, TopSupporterAggregate>()

  for (const row of rows) {
    if (!row.tipper_user_id || !row.created_at) continue
    const amount = row.amount || 0
    const existing = aggregates.get(row.tipper_user_id)
    if (!existing) {
      aggregates.set(row.tipper_user_id, {
        supporter_user_id: row.tipper_user_id,
        total_tip_amount_cents: amount,
        tip_count: 1,
        last_tipped_at: row.created_at,
      })
      continue
    }

    existing.total_tip_amount_cents += amount
    existing.tip_count += 1
    if (new Date(row.created_at).getTime() > new Date(existing.last_tipped_at).getTime()) {
      existing.last_tipped_at = row.created_at
    }
  }

  return Array.from(aggregates.values()).sort((a, b) => {
    if (b.total_tip_amount_cents !== a.total_tip_amount_cents) {
      return b.total_tip_amount_cents - a.total_tip_amount_cents
    }
    return new Date(b.last_tipped_at).getTime() - new Date(a.last_tipped_at).getTime()
  })
}

export function getSupporterName(username?: string | null, email?: string | null): string {
  const usernameTrimmed = username?.trim()
  if (usernameTrimmed) return usernameTrimmed
  const emailTrimmed = email?.trim()
  if (emailTrimmed) return emailTrimmed
  return 'Anonymous supporter'
}

