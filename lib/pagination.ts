export type PaginationParseResult =
  | { ok: true; limit: number; offset: number }
  | { ok: false; error: string }

export function parseOffsetLimitQuery(args: {
  rawLimit: string | null
  rawOffset: string | null
  defaultLimit: number
  maxLimit: number
}): PaginationParseResult {
  let limit = args.defaultLimit
  if (args.rawLimit !== null && args.rawLimit !== '') {
    if (!/^\d+$/.test(args.rawLimit)) {
      return { ok: false, error: `limit must be an integer between 1 and ${args.maxLimit}` }
    }
    const parsed = Number(args.rawLimit)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > args.maxLimit) {
      return { ok: false, error: `limit must be an integer between 1 and ${args.maxLimit}` }
    }
    limit = parsed
  }

  let offset = 0
  if (args.rawOffset !== null && args.rawOffset !== '') {
    if (!/^\d+$/.test(args.rawOffset)) {
      return { ok: false, error: 'offset must be a non-negative integer' }
    }
    const parsed = Number(args.rawOffset)
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, error: 'offset must be a non-negative integer' }
    }
    offset = parsed
  }

  return { ok: true, limit, offset }
}

export function buildPaginatedItems<T>(args: {
  rows: T[]
  limit: number
  offset: number
}): {
  items: T[]
  limit: number
  offset: number
  hasMore: boolean
  nextOffset: number | null
} {
  const hasMore = args.rows.length > args.limit
  const items = hasMore ? args.rows.slice(0, args.limit) : args.rows
  return {
    items,
    limit: args.limit,
    offset: args.offset,
    hasMore,
    nextOffset: hasMore ? args.offset + args.limit : null,
  }
}
