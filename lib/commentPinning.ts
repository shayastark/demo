type PinSortableComment = {
  is_pinned: boolean | null | undefined
  created_at: string
}

export function canUserPinComment(userId: string | null | undefined, projectCreatorId: string | null | undefined): boolean {
  return !!userId && !!projectCreatorId && userId === projectCreatorId
}

export function applySinglePinnedComment<T extends { id: string; is_pinned?: boolean | null }>(
  comments: T[],
  targetCommentId: string,
  shouldPin: boolean
): T[] {
  return comments.map((comment) => {
    if (comment.id === targetCommentId) {
      return { ...comment, is_pinned: shouldPin }
    }
    if (shouldPin) {
      return { ...comment, is_pinned: false }
    }
    return comment
  })
}

export function sortCommentsPinnedFirst<T extends PinSortableComment>(comments: T[]): T[] {
  return [...comments].sort((a, b) => {
    const aPinned = a.is_pinned ? 1 : 0
    const bPinned = b.is_pinned ? 1 : 0
    if (aPinned !== bPinned) return bPinned - aPinned

    const aTs = Date.parse(a.created_at)
    const bTs = Date.parse(b.created_at)
    return bTs - aTs
  })
}

export function normalizePinnedFlag(value: boolean | null | undefined): boolean {
  return value === true
}

export function withPinnedFlag<T extends { is_pinned?: boolean | null }>(comment: T): T & { is_pinned: boolean } {
  return {
    ...comment,
    is_pinned: normalizePinnedFlag(comment.is_pinned),
  }
}

