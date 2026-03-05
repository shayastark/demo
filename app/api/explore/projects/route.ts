import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildPaginatedItems } from '@/lib/pagination'
import {
  buildExploreProjectItems,
  parseExploreProjectsQuery,
  type ExploreCreatorRow,
  type ExploreProjectRow,
} from '@/lib/explore'

const SEARCH_SCAN_LIMIT = 1000

type TipSupportRow = {
  project_id: string | null
  tipper_user_id: string | null
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = parseExploreProjectsQuery({
      rawSort: searchParams.get('sort'),
      rawLimit: searchParams.get('limit'),
      rawOffset: searchParams.get('offset'),
      rawQ: searchParams.get('q'),
    })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const projectQuery = supabaseAdmin
      .from('projects')
      .select('id, title, cover_image_url, creator_id, visibility, sharing_enabled, share_token, created_at')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(0, SEARCH_SCAN_LIMIT - 1)

    const { data: publicProjectRows, error: projectError } = await projectQuery
    if (projectError) {
      console.error('Error loading explore projects:', projectError)
      return NextResponse.json({ error: 'Failed to load explore projects' }, { status: 500 })
    }

    const rawProjects = (publicProjectRows || []) as ExploreProjectRow[]
    if (rawProjects.length === 0) {
      return NextResponse.json(buildPaginatedItems({ rows: [], limit: parsed.limit, offset: parsed.offset }))
    }

    const creatorIds = Array.from(new Set(rawProjects.map((row) => row.creator_id)))
    const { data: creatorRows, error: creatorError } = await supabaseAdmin
      .from('users')
      .select('id, username, email')
      .in('id', creatorIds)

    if (creatorError) {
      console.error('Error loading explore creators:', creatorError)
      return NextResponse.json({ error: 'Failed to load explore creators' }, { status: 500 })
    }

    const creatorsById = (creatorRows || []).reduce<Record<string, ExploreCreatorRow>>((acc, row) => {
      acc[row.id] = row as ExploreCreatorRow
      return acc
    }, {})

    const qLower = parsed.q?.toLowerCase() || null
    const qFilteredProjects = qLower
      ? rawProjects.filter((project) => {
          const title = project.title?.toLowerCase() || ''
          const creatorName = creatorsById[project.creator_id]?.username?.toLowerCase() || ''
          return title.includes(qLower) || creatorName.includes(qLower)
        })
      : rawProjects

    const projectIds = qFilteredProjects.map((project) => project.id)
    let supporterCountByProjectId: Record<string, number> = {}
    if (projectIds.length > 0) {
      const { data: tipRows } = await supabaseAdmin
        .from('tips')
        .select('project_id, tipper_user_id')
        .in('project_id', projectIds)
        .eq('status', 'completed')
        .not('tipper_user_id', 'is', null)

      const supporterSets: Record<string, Set<string>> = {}
      for (const row of (tipRows || []) as TipSupportRow[]) {
        if (!row.project_id || !row.tipper_user_id) continue
        if (!supporterSets[row.project_id]) supporterSets[row.project_id] = new Set<string>()
        supporterSets[row.project_id].add(row.tipper_user_id)
      }

      supporterCountByProjectId = Object.keys(supporterSets).reduce<Record<string, number>>((acc, projectId) => {
        acc[projectId] = supporterSets[projectId].size
        return acc
      }, {})
    }

    const items = buildExploreProjectItems({
      projects: qFilteredProjects,
      creatorsById,
      supporterCountByProjectId,
      sort: parsed.sort,
    })

    const pageRows = items.slice(parsed.offset, parsed.offset + parsed.limit + 1)
    return NextResponse.json(buildPaginatedItems({ rows: pageRows, limit: parsed.limit, offset: parsed.offset }))
  } catch (error) {
    console.error('Error in explore projects API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
