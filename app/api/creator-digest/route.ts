import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import {
  buildCreatorDigestHighlights,
  buildCreatorDigestTopProject,
  parseCreatorDigestWindowDays,
} from '@/lib/creatorDigest'
import { autoPublishScheduledUpdatesForProjects } from '@/lib/projectUpdateAutopublishServer'

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

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getUserByPrivyId(authResult.privyId)
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const windowDays = parseCreatorDigestWindowDays(searchParams.get('window_days'))
    if (windowDays === null) {
      return NextResponse.json({ error: 'window_days must be an integer between 1 and 30' }, { status: 400 })
    }

    const accountCreatedAt =
      typeof currentUser.created_at === 'string' ? new Date(currentUser.created_at).getTime() : Number.NaN
    const windowStartIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
    const hasCompleteWindow =
      Number.isFinite(accountCreatedAt) ? accountCreatedAt <= Date.now() - windowDays * 24 * 60 * 60 * 1000 : true
    const followColumn = await resolveFollowColumn()

    const { data: projects, error: projectsError } = await supabaseAdmin
      .from('projects')
      .select('id, title')
      .eq('creator_id', currentUser.id)

    if (projectsError) {
      console.error('Error loading creator projects for digest:', projectsError)
      return NextResponse.json({ error: 'Failed to load digest' }, { status: 500 })
    }

    const projectIds = (projects || []).map((project) => project.id)
    const projectTitlesById = (projects || []).reduce<Record<string, string>>((acc, project) => {
      acc[project.id] = project.title || 'Untitled project'
      return acc
    }, {})

    await autoPublishScheduledUpdatesForProjects(
      (projects || []).map((project) => ({ id: project.id, title: project.title || null }))
    )

    const followerCountPromise = supabaseAdmin
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq(followColumn, currentUser.id)
      .gte('created_at', windowStartIso)

    const commentsCountPromise =
      projectIds.length === 0
        ? Promise.resolve({ count: 0, error: null })
        : supabaseAdmin
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .in('project_id', projectIds)
            .gte('created_at', windowStartIso)

    const updatesCountPromise = supabaseAdmin
      .from('project_updates')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('status', 'published')
      .gte('published_at', windowStartIso)

    const tipsRowsPromise = supabaseAdmin
      .from('tips')
      .select('project_id, amount')
      .eq('creator_id', currentUser.id)
      .eq('status', 'completed')
      .gte('created_at', windowStartIso)

    const commentProjectRowsPromise =
      projectIds.length === 0
        ? Promise.resolve({ data: [] as Array<{ project_id: string }>, error: null })
        : supabaseAdmin
            .from('comments')
            .select('project_id')
            .in('project_id', projectIds)
            .gte('created_at', windowStartIso)

    const updateProjectRowsPromise = supabaseAdmin
      .from('project_updates')
      .select('project_id')
      .eq('user_id', currentUser.id)
      .eq('status', 'published')
      .gte('published_at', windowStartIso)

    const [followerResult, commentsResult, updatesResult, tipsResult, commentProjectsResult, updateProjectsResult] =
      await Promise.all([
        followerCountPromise,
        commentsCountPromise,
        updatesCountPromise,
        tipsRowsPromise,
        commentProjectRowsPromise,
        updateProjectRowsPromise,
      ])

    if (
      followerResult.error ||
      commentsResult.error ||
      updatesResult.error ||
      tipsResult.error ||
      commentProjectsResult.error ||
      updateProjectsResult.error
    ) {
      console.error('Error loading digest aggregates:', {
        followers: followerResult.error,
        comments: commentsResult.error,
        updates: updatesResult.error,
        tips: tipsResult.error,
        commentProjects: commentProjectsResult.error,
        updateProjects: updateProjectsResult.error,
      })
      return NextResponse.json({ error: 'Failed to load digest' }, { status: 500 })
    }

    const tipsRows = tipsResult.data || []
    const digestCore = {
      new_followers_count: followerResult.count || 0,
      new_comments_count: commentsResult.count || 0,
      updates_posted_count: updatesResult.count || 0,
      tips_count: tipsRows.length,
      tips_amount_cents: tipsRows.reduce((sum, row) => sum + (row.amount || 0), 0),
      top_project: buildCreatorDigestTopProject({
        projectTitlesById,
        commentProjectIds: (commentProjectsResult.data || []).map((row) => row.project_id),
        updateProjectIds: (updateProjectsResult.data || []).map((row) => row.project_id),
        tipRows: tipsRows.map((row) => ({ project_id: row.project_id, amount: row.amount || 0 })),
      }),
    }

    return NextResponse.json({
      window_days: windowDays,
      has_complete_window: hasCompleteWindow,
      ...digestCore,
      highlights: buildCreatorDigestHighlights(digestCore),
    })
  } catch (error) {
    console.error('Error in creator digest API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

