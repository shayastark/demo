import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isValidUUID } from '@/lib/validation'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import {
  aggregateTopSupporters,
  getSupporterName,
  parseTopSupportersLimit,
} from '@/lib/topSupporters'
import { canViewProject } from '@/lib/projectAccessPolicyServer'

let cachedHasTipSupportColumns: boolean | null = null

async function hasTipSupportColumns(): Promise<boolean> {
  if (cachedHasTipSupportColumns !== null) return cachedHasTipSupportColumns

  const { data: columns, error } = await supabaseAdmin
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'tips')
    .in('column_name', ['project_id', 'tipper_user_id'])

  if (error) {
    cachedHasTipSupportColumns = false
    return cachedHasTipSupportColumns
  }

  const names = new Set((columns || []).map((column) => column.column_name))
  cachedHasTipSupportColumns = names.has('project_id') && names.has('tipper_user_id')
  return cachedHasTipSupportColumns
}

async function getOptionalCurrentUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null
  const authResult = await verifyPrivyToken(authHeader)
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const rawLimit = searchParams.get('limit')

    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    const limit = parseTopSupportersLimit(rawLimit)
    if (limit === null) {
      return NextResponse.json({ error: 'limit must be an integer between 1 and 20' }, { status: 400 })
    }

    const [currentUser, project] = await Promise.all([
      getOptionalCurrentUser(request),
      supabaseAdmin
        .from('projects')
        .select('id, creator_id, sharing_enabled, visibility')
        .eq('id', projectId)
        .single(),
    ])

    if (!project.data) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const canAccessProject = await canViewProject({
      project: {
        id: project.data.id,
        creator_id: project.data.creator_id,
        visibility: project.data.visibility,
        sharing_enabled: project.data.sharing_enabled,
      },
      userId: currentUser?.id,
      isDirectAccess: true,
    })

    if (!canAccessProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!(await hasTipSupportColumns())) {
      return NextResponse.json({ project_id: projectId, supporters: [] })
    }

    const { data: tipRows, error: tipsError } = await supabaseAdmin
      .from('tips')
      .select('tipper_user_id, amount, created_at')
      .eq('project_id', projectId)
      .eq('status', 'completed')
      .not('tipper_user_id', 'is', null)

    if (tipsError) {
      console.error('Error loading top supporters:', tipsError)
      return NextResponse.json({ error: 'Failed to load supporters' }, { status: 500 })
    }

    const ranked = aggregateTopSupporters((tipRows || []) as Array<{
      tipper_user_id: string | null
      amount: number | null
      created_at: string | null
    }>).slice(0, limit)

    if (ranked.length === 0) {
      return NextResponse.json({ project_id: projectId, supporters: [] })
    }

    const supporterIds = ranked.map((row) => row.supporter_user_id)
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, username, email, avatar_url')
      .in('id', supporterIds)

    const usersById = (users || []).reduce<
      Record<string, { username: string | null; email: string | null; avatar_url: string | null }>
    >((acc, user) => {
      acc[user.id] = {
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
      }
      return acc
    }, {})

    const supporters = ranked.map((row) => {
      const user = usersById[row.supporter_user_id]
      return {
        supporter_user_id: row.supporter_user_id,
        supporter_name: getSupporterName(user?.username, user?.email),
        avatar_url: user?.avatar_url || null,
        total_tip_amount_cents: row.total_tip_amount_cents,
        tip_count: row.tip_count,
        last_tipped_at: row.last_tipped_at,
      }
    })

    return NextResponse.json({
      project_id: projectId,
      supporters,
    })
  } catch (error) {
    console.error('Error in top supporters API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

