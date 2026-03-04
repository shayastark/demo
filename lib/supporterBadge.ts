export interface TipSupporterRow {
  tipper_user_id: string | null
}

export function buildSupporterAuthorSet(rows: TipSupporterRow[]): Set<string> {
  const supporterIds = new Set<string>()
  for (const row of rows) {
    if (row.tipper_user_id) {
      supporterIds.add(row.tipper_user_id)
    }
  }
  return supporterIds
}

export function isSupporterForProject(authorId: string, supporterIds: Set<string>): boolean {
  return supporterIds.has(authorId)
}

