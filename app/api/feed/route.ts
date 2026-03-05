import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { buildPaginatedItems } from '@/lib/pagination'
import { buildFollowingFeedItems, parseFollowingFeedQuery, type FeedUpdateRow } from '@/lib/followingFeed'
import { canViewProject } from '@/lib/projectAccessPolicyServer'

type FollowColumnName = 'following_id' | 'followed_id'
let cachedFollowColumn: FollowColumnName | null = null

async function resolveFollowColumn(): Promise<FollowColumnName> {
  if (cachedFollowColumn) return cachedFollowColumn

  const { data: newColumn } = await supabaseAdmin
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'user_follows')
    .eq('column_name', 'following_id')
    .maybeSingle()

  if (newColumn?.column_name === 'following_id') {
    cachedFollowColumn = 'following_id'
    return cachedFollowColumn
  }

  cachedFollowColumn = 'followed_id'
  return cachedFollowColumn
}

function readFollowTargetId(row: unknown, column: FollowColumnName): string | null {
  if (!row || typeof row !== 'object') return null
  const value = (row as Record<string, unknown>)[column]
  return typeof value === 'string' ? value : null
}

export async function GET(request: NextRequest) {
  try {
    const startedAt = Date.now()
    const shouldLogPerf = process.env.NODE_ENV !== 'production' || process.env.DEBUG_API_PERF === '1'
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getUserByPrivyId(authResult.privyId)
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const parsedPagination = parseFollowingFeedQuery({
      rawLimit: searchParams.get('limit'),
      rawOffset: searchParams.get('offset'),
    })
    if (!parsedPagination.ok) {
      return NextResponse.json({ error: parsedPagination.error }, { status: 400 })
    }
    const { limit, offset } = parsedPagination
    const followColumn = await resolveFollowColumn()

    const { data: followRows, error: followsError } = await supabaseAdmin
      .from('user_follows')
      .select(`follower_id, ${followColumn}`)
      .eq('follower_id', currentUser.id)

    if (followsError) {
      console.error('Error fetching follows for feed:', followsError)
      return NextResponse.json({ error: 'Failed to load feed' }, { status: 500 })
    }

    const creatorIds = Array.from(
      new Set([
        ...(followRows || [])
          .map((row) => readFollowTargetId(row, followColumn))
          .filter((id): id is string => !!id),
        currentUser.id,
      ])
    )

    if (creatorIds.length === 0) {
      return NextResponse.json({
        items: [],
        limit,
        offset,
        hasMore: false,
        nextOffset: null,
      })
    }

    const chunkSize = Math.min(Math.max(limit * 3, 30), 200)
    let rawOffset = 0
    let skippedVisible = 0
    const collected: ReturnType<typeof buildFollowingFeedItems> = []
    let scannedUpdateRows = 0

    while (collected.length < limit + 1) {
      const { data: updateRows, error: updatesError } = await supabaseAdmin
        .from('project_updates')
        .select('id, project_id, user_id, content, version_label, created_at')
        .in('user_id', creatorIds)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(rawOffset, rawOffset + chunkSize - 1)

      if (updatesError) {
        console.error('Error fetching feed updates:', updatesError)
        return NextResponse.json({ error: 'Failed to load feed' }, { status: 500 })
      }

      const updates = (updateRows || []) as FeedUpdateRow[]
      if (updates.length === 0) break
      scannedUpdateRows += updates.length
      rawOffset += updates.length

      const projectIds = Array.from(new Set(updates.map((row) => row.project_id)))
      const creatorIdsFromUpdates = Array.from(new Set(updates.map((row) => row.user_id)))
      const [{ data: projects }, { data: users }] = await Promise.all([
        supabaseAdmin
          .from('projects')
          .select('id, title, creator_id, visibility, sharing_enabled')
          .in('id', projectIds),
        supabaseAdmin
          .from('users')
          .select('id, username, email')
          .in('id', creatorIdsFromUpdates),
      ])

      const visibleProjectsById: Record<string, { id: string; title: string | null; creator_id: string | null }> = {}
      for (const project of projects || []) {
        const canAccess = await canViewProject({
          project: {
            id: project.id,
            creator_id: project.creator_id,
            visibility: project.visibility,
            sharing_enabled: project.sharing_enabled,
          },
          userId: currentUser.id,
          isDirectAccess: true,
        })
        if (canAccess) {
          visibleProjectsById[project.id] = {
            id: project.id,
            title: project.title,
            creator_id: project.creator_id,
          }
        }
      }

      const usersById = (users || []).reduce<Record<string, { id: string; username: string | null; email: string | null }>>((acc, user) => {
        acc[user.id] = { id: user.id, username: user.username, email: user.email }
        return acc
      }, {})

      const visibleUpdates = updates.filter((row) => !!visibleProjectsById[row.project_id])
      const mapped = buildFollowingFeedItems(visibleUpdates, visibleProjectsById, usersById)
      for (const item of mapped) {
        if (skippedVisible < offset) {
          skippedVisible += 1
          continue
        }
        collected.push(item)
        if (collected.length >= limit + 1) break
      }

      if (updates.length < chunkSize) break
    }

    const paged = buildPaginatedItems({
      rows: collected,
      limit,
      offset,
    })

    if (shouldLogPerf) {
      console.info('[perf] /api/feed', {
        duration_ms: Date.now() - startedAt,
        rows_scanned: scannedUpdateRows,
        rows_returned: paged.items.length,
        has_more: paged.hasMore,
      })
    }

    return NextResponse.json(paged)
  } catch (error) {
    console.error('Error in feed API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

