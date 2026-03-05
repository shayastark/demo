export const USER_SEARCH_MIN_QUERY_LENGTH = 2
export const USER_SEARCH_DEFAULT_LIMIT = 6
export const USER_SEARCH_MAX_LIMIT = 10

export type UserSearchRow = {
  id: string
  username: string | null
  avatar_url: string | null
}

export function parseUserSearchQuery(args: {
  rawQuery: string | null
  rawLimit: string | null
}): { ok: true; query: string; limit: number } | { ok: false; error: string } {
  const query = (args.rawQuery || '').trim()
  if (query.length < USER_SEARCH_MIN_QUERY_LENGTH) {
    return { ok: false, error: `q must be at least ${USER_SEARCH_MIN_QUERY_LENGTH} characters` }
  }

  let limit = USER_SEARCH_DEFAULT_LIMIT
  if (args.rawLimit !== null && args.rawLimit !== '') {
    if (!/^\d+$/.test(args.rawLimit)) {
      return { ok: false, error: `limit must be an integer between 1 and ${USER_SEARCH_MAX_LIMIT}` }
    }
    const parsed = Number(args.rawLimit)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > USER_SEARCH_MAX_LIMIT) {
      return { ok: false, error: `limit must be an integer between 1 and ${USER_SEARCH_MAX_LIMIT}` }
    }
    limit = parsed
  }

  return { ok: true, query, limit }
}

export function mapUserSearchRows(rows: Array<{ id: string; username: string | null; avatar_url: string | null }>): UserSearchRow[] {
  return rows.map((row) => ({
    id: row.id,
    username: typeof row.username === 'string' && row.username.trim() ? row.username : null,
    avatar_url: typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url : null,
  }))
}
