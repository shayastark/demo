export const PROJECT_UPDATE_REACTION_TYPES = ['helpful', 'fire', 'agree'] as const
export type ProjectUpdateReactionType = (typeof PROJECT_UPDATE_REACTION_TYPES)[number]

export interface ProjectUpdateReactionRow {
  update_id: string
  user_id: string
  reaction_type: ProjectUpdateReactionType
}

export interface ProjectUpdateReactionSummary {
  helpful: number
  fire: number
  agree: number
  viewerReactions: Partial<Record<ProjectUpdateReactionType, boolean>>
}

export function isProjectUpdateReactionType(value: unknown): value is ProjectUpdateReactionType {
  return typeof value === 'string' && PROJECT_UPDATE_REACTION_TYPES.includes(value as ProjectUpdateReactionType)
}

export function getProjectUpdateReactionToggleAction(isReacted: boolean): 'add' | 'remove' {
  return isReacted ? 'remove' : 'add'
}

export function buildEmptyProjectUpdateReactionSummary(): ProjectUpdateReactionSummary {
  return {
    helpful: 0,
    fire: 0,
    agree: 0,
    viewerReactions: {},
  }
}

export function summarizeProjectUpdateReactions(
  rows: ProjectUpdateReactionRow[],
  viewerUserId?: string | null
): Record<string, ProjectUpdateReactionSummary> {
  const byUpdate: Record<string, ProjectUpdateReactionSummary> = {}

  for (const row of rows) {
    if (!byUpdate[row.update_id]) {
      byUpdate[row.update_id] = buildEmptyProjectUpdateReactionSummary()
    }
    byUpdate[row.update_id][row.reaction_type] += 1
    if (viewerUserId && row.user_id === viewerUserId) {
      byUpdate[row.update_id].viewerReactions[row.reaction_type] = true
    }
  }

  return byUpdate
}

