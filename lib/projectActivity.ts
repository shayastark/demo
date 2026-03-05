import { buildPaginatedItems, parseOffsetLimitQuery } from '@/lib/pagination'

export type ProjectActivityType =
  | 'comment_created'
  | 'comment_reacted'
  | 'update_created'
  | 'update_reacted'
  | 'update_commented'
  | 'attachment_added'
  | 'access_granted'

export interface ProjectActivityItem {
  id: string
  type: ProjectActivityType
  actor_user_id: string | null
  actor_name: string
  created_at: string
  target_id: string
  summary_text: string
}

type ActivityActorMap = Record<string, { username: string | null; email: string | null }>

type CommentCreatedRow = { id: string; user_id: string | null; created_at: string | null }
type CommentReactionRow = {
  id: string
  comment_id: string | null
  user_id: string | null
  reaction_type?: string | null
  created_at: string | null
}
type UpdateCreatedRow = { id: string; user_id: string | null; created_at: string | null }
type UpdateReactionRow = {
  id: string
  update_id: string | null
  user_id: string | null
  reaction_type?: string | null
  created_at: string | null
}
type UpdateCommentRow = { id: string; update_id: string | null; user_id: string | null; created_at: string | null }
type AttachmentRow = { id: string; user_id: string | null; type?: string | null; created_at: string | null }
type AccessGrantRow = {
  id: string
  user_id: string | null
  granted_by_user_id: string | null
  created_at: string | null
}

export function parseProjectActivityQuery(args: {
  rawLimit: string | null
  rawOffset: string | null
}): { ok: true; limit: number; offset: number } | { ok: false; error: string } {
  return parseOffsetLimitQuery({
    rawLimit: args.rawLimit,
    rawOffset: args.rawOffset,
    defaultLimit: 20,
    maxLimit: 50,
  })
}

export function canAccessProjectActivity(args: {
  isCreator: boolean
  hasProjectAccessGrant: boolean
  canViewProject: boolean
}): boolean {
  if (!args.canViewProject) return false
  if (args.isCreator) return true
  return args.hasProjectAccessGrant
}

export function buildProjectActivityItems(args: {
  comments: CommentCreatedRow[]
  commentReactions: CommentReactionRow[]
  updates: UpdateCreatedRow[]
  updateReactions: UpdateReactionRow[]
  updateComments: UpdateCommentRow[]
  attachments: AttachmentRow[]
  accessGrants: AccessGrantRow[]
  actorsById: ActivityActorMap
}): ProjectActivityItem[] {
  const items: ProjectActivityItem[] = []

  for (const row of args.comments) {
    if (!row.id || !row.created_at) continue
    items.push({
      id: `comment_created:${row.id}`,
      type: 'comment_created',
      actor_user_id: row.user_id || null,
      actor_name: getActorName(row.user_id, args.actorsById),
      created_at: row.created_at,
      target_id: row.id,
      summary_text: `${getActorName(row.user_id, args.actorsById)} added a comment`,
    })
  }

  for (const row of args.commentReactions) {
    if (!row.id || !row.comment_id || !row.created_at) continue
    const reactionLabel = row.reaction_type ? ` (${row.reaction_type})` : ''
    items.push({
      id: `comment_reacted:${row.id}`,
      type: 'comment_reacted',
      actor_user_id: row.user_id || null,
      actor_name: getActorName(row.user_id, args.actorsById),
      created_at: row.created_at,
      target_id: row.comment_id,
      summary_text: `${getActorName(row.user_id, args.actorsById)} reacted to a comment${reactionLabel}`,
    })
  }

  for (const row of args.updates) {
    if (!row.id || !row.created_at) continue
    items.push({
      id: `update_created:${row.id}`,
      type: 'update_created',
      actor_user_id: row.user_id || null,
      actor_name: getActorName(row.user_id, args.actorsById),
      created_at: row.created_at,
      target_id: row.id,
      summary_text: `${getActorName(row.user_id, args.actorsById)} posted a project update`,
    })
  }

  for (const row of args.updateReactions) {
    if (!row.id || !row.update_id || !row.created_at) continue
    const reactionLabel = row.reaction_type ? ` (${row.reaction_type})` : ''
    items.push({
      id: `update_reacted:${row.id}`,
      type: 'update_reacted',
      actor_user_id: row.user_id || null,
      actor_name: getActorName(row.user_id, args.actorsById),
      created_at: row.created_at,
      target_id: row.update_id,
      summary_text: `${getActorName(row.user_id, args.actorsById)} reacted to an update${reactionLabel}`,
    })
  }

  for (const row of args.updateComments) {
    if (!row.id || !row.update_id || !row.created_at) continue
    items.push({
      id: `update_commented:${row.id}`,
      type: 'update_commented',
      actor_user_id: row.user_id || null,
      actor_name: getActorName(row.user_id, args.actorsById),
      created_at: row.created_at,
      target_id: row.update_id,
      summary_text: `${getActorName(row.user_id, args.actorsById)} commented on an update`,
    })
  }

  for (const row of args.attachments) {
    if (!row.id || !row.created_at) continue
    const attachmentType = row.type ? ` (${row.type})` : ''
    items.push({
      id: `attachment_added:${row.id}`,
      type: 'attachment_added',
      actor_user_id: row.user_id || null,
      actor_name: getActorName(row.user_id, args.actorsById),
      created_at: row.created_at,
      target_id: row.id,
      summary_text: `${getActorName(row.user_id, args.actorsById)} added an attachment${attachmentType}`,
    })
  }

  for (const row of args.accessGrants) {
    if (!row.id || !row.created_at || !row.user_id) continue
    items.push({
      id: `access_granted:${row.id}`,
      type: 'access_granted',
      actor_user_id: row.granted_by_user_id || null,
      actor_name: getActorName(row.granted_by_user_id, args.actorsById),
      created_at: row.created_at,
      target_id: row.user_id,
      summary_text: `${getActorName(row.granted_by_user_id, args.actorsById)} granted project access`,
    })
  }

  return items.sort((a, b) => {
    const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (timeDiff !== 0) return timeDiff
    return b.id.localeCompare(a.id)
  })
}

export function paginateProjectActivity(args: {
  items: ProjectActivityItem[]
  limit: number
  offset: number
}) {
  const rows = args.items.slice(args.offset, args.offset + args.limit + 1)
  return buildPaginatedItems({
    rows,
    limit: args.limit,
    offset: args.offset,
  })
}

function getActorName(userId: string | null | undefined, actorsById: ActivityActorMap): string {
  if (!userId) return 'Unknown user'
  return actorsById[userId]?.username?.trim() || actorsById[userId]?.email?.trim() || 'Unknown user'
}
