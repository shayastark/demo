import { NextRequest, NextResponse } from 'next/server'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildPaginatedItems } from '@/lib/pagination'
import { buildSharedWithMeItems, parseSharedWithMeQuery, type SharedWithMeGrantRow } from '@/lib/sharedWithMe'

type GrantColumnSupport = {
  hasExpiresAt: boolean
  hasRole: boolean
}

let cachedGrantColumnSupport: GrantColumnSupport | null = null

async function getRequiredCurrentUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

async function resolveGrantColumnSupport(): Promise<GrantColumnSupport> {
  if (cachedGrantColumnSupport) return cachedGrantColumnSupport

  try {
    const { data, error } = await supabaseAdmin
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'project_access_grants')
      .in('column_name', ['expires_at', 'role'])

    if (error) throw error

    const columnNames = new Set((data || []).map((row) => row.column_name))
    cachedGrantColumnSupport = {
      hasExpiresAt: columnNames.has('expires_at'),
      hasRole: columnNames.has('role'),
    }
  } catch (error) {
    console.error('Error probing project_access_grants columns:', error)
    cachedGrantColumnSupport = {
      hasExpiresAt: false,
      hasRole: true,
    }
  }

  return cachedGrantColumnSupport
}

export async function GET(request: NextRequest) {
  try {
    const startedAt = Date.now()
    const shouldLogPerf = process.env.NODE_ENV !== 'production' || process.env.DEBUG_API_PERF === '1'
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = parseSharedWithMeQuery({
      rawLimit: searchParams.get('limit'),
      rawOffset: searchParams.get('offset'),
      rawIncludeExpired: searchParams.get('include_expired'),
    })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const nowIso = new Date().toISOString()
    const grantColumnSupport = await resolveGrantColumnSupport()
    const chunkSize = Math.min(Math.max(parsed.limit * 3, 30), 200)
    const phases: Array<'active' | 'expired'> =
      parsed.includeExpired && grantColumnSupport.hasExpiresAt ? ['active', 'expired'] : ['active']
    const phaseOffsets: Record<'active' | 'expired', number> = {
      active: 0,
      expired: 0,
    }
    let skippedVisible = 0
    let scannedGrantRows = 0
    const collected = [] as ReturnType<typeof buildSharedWithMeItems>

    for (const phase of phases) {
      while (collected.length < parsed.limit + 1) {
        let grantsQuery = supabaseAdmin
          .from('project_access_grants')
          .select(
            [
              'project_id',
              'created_at',
              grantColumnSupport.hasExpiresAt ? 'expires_at' : null,
              grantColumnSupport.hasRole ? 'role' : null,
            ]
              .filter(Boolean)
              .join(', ')
          )
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })
          .order('project_id', { ascending: false })
          .range(phaseOffsets[phase], phaseOffsets[phase] + chunkSize - 1)

        if (grantColumnSupport.hasExpiresAt && phase === 'active') {
          grantsQuery = grantsQuery.or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        } else if (grantColumnSupport.hasExpiresAt) {
          grantsQuery = grantsQuery
            .not('expires_at', 'is', null)
            .lte('expires_at', nowIso)
        }

        const { data: grants, error: grantsError } = await grantsQuery
        if (grantsError) throw grantsError

        const grantRows = ((grants || []) as unknown) as SharedWithMeGrantRow[]
        if (grantRows.length === 0) break
        scannedGrantRows += grantRows.length
        phaseOffsets[phase] += grantRows.length

        const projectIds = Array.from(new Set(grantRows.map((row) => row.project_id)))
        if (projectIds.length === 0) {
          if (grantRows.length < chunkSize) break
          continue
        }

        const { data: projects, error: projectsError } = await supabaseAdmin
          .from('projects')
          .select('id, title, cover_image_url, creator_id, visibility, sharing_enabled')
          .in('id', projectIds)
        if (projectsError) throw projectsError

        const projectRows = projects || []
        const projectsById = projectRows.reduce<
          Record<
            string,
            {
              id: string
              title: string | null
              cover_image_url: string | null
              creator_id: string
              visibility: string | null
              sharing_enabled: boolean | null
            }
          >
        >((acc, project) => {
          if (typeof project.id === 'string') {
            acc[project.id] = {
              id: project.id,
              title: project.title || null,
              cover_image_url: project.cover_image_url || null,
              creator_id: project.creator_id,
              visibility: project.visibility || null,
              sharing_enabled: project.sharing_enabled ?? null,
            }
          }
          return acc
        }, {})

        const creatorIds = Array.from(new Set(projectRows.map((project) => project.creator_id).filter(Boolean)))
        const { data: creators, error: creatorsError } = creatorIds.length
          ? await supabaseAdmin
              .from('users')
              .select('id, username, email')
              .in('id', creatorIds)
          : { data: [], error: null }
        if (creatorsError) throw creatorsError

        const creatorsById = (creators || []).reduce<
          Record<string, { id: string; username: string | null; email: string | null }>
        >((acc, user) => {
          acc[user.id] = {
            id: user.id,
            username: user.username || null,
            email: user.email || null,
          }
          return acc
        }, {})

        const mapped = buildSharedWithMeItems({
          grants: grantRows,
          projectsById,
          creatorsById,
          includeExpired: parsed.includeExpired,
          currentUserId: currentUser.id,
        })

        for (const item of mapped) {
          if (skippedVisible < parsed.offset) {
            skippedVisible += 1
            continue
          }
          collected.push(item)
          if (collected.length >= parsed.limit + 1) break
        }

        if (grantRows.length < chunkSize) break
      }
      if (collected.length >= parsed.limit + 1) break
    }

    const paged = buildPaginatedItems({
      rows: collected,
      limit: parsed.limit,
      offset: parsed.offset,
    })

    if (shouldLogPerf) {
      console.info('[perf] /api/shared-with-me', {
        duration_ms: Date.now() - startedAt,
        rows_scanned: scannedGrantRows,
        rows_returned: paged.items.length,
        has_more: paged.hasMore,
        include_expired: parsed.includeExpired,
      })
    }

    return NextResponse.json({
      ...paged,
      include_expired: parsed.includeExpired,
    })
  } catch (error) {
    console.error('Error in shared-with-me GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
