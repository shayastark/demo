export const COMMENT_REACTION_TYPES = ['helpful', 'fire', 'agree'] as const
export type ReactionType = (typeof COMMENT_REACTION_TYPES)[number]

export function isReactionType(value: unknown): value is ReactionType {
  return typeof value === 'string' && COMMENT_REACTION_TYPES.includes(value as ReactionType)
}

export interface CommentReactionRow {
  comment_id: string
  user_id: string
  reaction_type: ReactionType
}

export interface CommentReactionSummary {
  helpful: number
  fire: number
  agree: number
  // Legacy compatibility for older clients.
  like: number
  viewerReactions: Partial<Record<ReactionType, boolean>>
  viewerReaction: ReactionType | null
}

function buildEmptySummary(): CommentReactionSummary {
  return {
    helpful: 0,
    fire: 0,
    agree: 0,
    like: 0,
    viewerReactions: {},
    viewerReaction: null,
  }
}

export function summarizeCommentReactions(
  rows: CommentReactionRow[],
  viewerUserId?: string | null
): Record<string, CommentReactionSummary> {
  const byComment: Record<string, CommentReactionSummary> = {}

  for (const row of rows) {
    if (!byComment[row.comment_id]) {
      byComment[row.comment_id] = buildEmptySummary()
    }

    byComment[row.comment_id][row.reaction_type] += 1

    if (viewerUserId && row.user_id === viewerUserId) {
      byComment[row.comment_id].viewerReactions[row.reaction_type] = true
      if (!byComment[row.comment_id].viewerReaction) {
        byComment[row.comment_id].viewerReaction = row.reaction_type
      }
    }
  }

  return byComment
}

export function getReactionToggleAction(isReacted: boolean): 'add' | 'remove' {
  return isReacted ? 'remove' : 'add'
}
