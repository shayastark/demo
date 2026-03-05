export const MAX_PROJECT_UPDATE_COMMENT_LENGTH = 2000

export type ProjectUpdateCommentRow = {
  id: string
  update_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
}

export function sanitizeProjectUpdateCommentContent(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const sanitized = value.trim().slice(0, MAX_PROJECT_UPDATE_COMMENT_LENGTH)
  return sanitized || null
}

export function canDeleteProjectUpdateComment(args: {
  viewerUserId: string | null | undefined
  commentUserId: string
  projectCreatorId: string
}): boolean {
  if (!args.viewerUserId) return false
  return args.viewerUserId === args.commentUserId || args.viewerUserId === args.projectCreatorId
}

