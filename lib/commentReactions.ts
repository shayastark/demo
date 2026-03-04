export type ReactionType = 'like'

export interface CommentReactionRow {
  comment_id: string
  user_id: string
  reaction_type: ReactionType
}

export interface CommentReactionSummary {
  like: number
  viewerReaction: ReactionType | null
}

export function summarizeCommentReactions(
  rows: CommentReactionRow[],
  viewerUserId?: string | null
): Record<string, CommentReactionSummary> {
  const byComment: Record<string, CommentReactionSummary> = {}

  for (const row of rows) {
    if (!byComment[row.comment_id]) {
      byComment[row.comment_id] = {
        like: 0,
        viewerReaction: null,
      }
    }

    if (row.reaction_type === 'like') {
      byComment[row.comment_id].like += 1
    }

    if (viewerUserId && row.user_id === viewerUserId) {
      byComment[row.comment_id].viewerReaction = row.reaction_type
    }
  }

  return byComment
}
