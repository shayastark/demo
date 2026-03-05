import { NextRequest, NextResponse } from 'next/server'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildSharedWithMeItems, parseSharedWithMeQuery, type SharedWithMeGrantRow } from '@/lib/sharedWithMe'

async function getRequiredCurrentUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function GET(request: NextRequest) {
  try {
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

    const fetchLimit = parsed.offset + parsed.limit + 20
    const { data: grants, error: grantsError } = await supabaseAdmin
      .from('project_access_grants')
      .select('project_id, created_at, expires_at, role')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(fetchLimit)
    if (grantsError) throw grantsError

    const grantRows = (grants || []) as SharedWithMeGrantRow[]
    const projectIds = Array.from(new Set(grantRows.map((row) => row.project_id)))
    if (projectIds.length === 0) {
      return NextResponse.json({
        items: [],
        limit: parsed.limit,
        offset: parsed.offset,
        include_expired: parsed.includeExpired,
      })
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

    const allItems = buildSharedWithMeItems({
      grants: grantRows,
      projectsById,
      creatorsById,
      includeExpired: parsed.includeExpired,
      currentUserId: currentUser.id,
    })
    const items = allItems.slice(parsed.offset, parsed.offset + parsed.limit)

    return NextResponse.json({
      items,
      limit: parsed.limit,
      offset: parsed.offset,
      include_expired: parsed.includeExpired,
    })
  } catch (error) {
    console.error('Error in shared-with-me GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
