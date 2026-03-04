import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import {
  aggregateProjectTotals,
  buildPerProjectTotals,
  getSupporterDisplayName,
  type CreatorEarningsRecentTip,
} from '@/lib/creatorEarnings'

const RECENT_TIPS_LIMIT = 10
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

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

    const { count: totalTipsCount } = await supabaseAdmin
      .from('tips')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', currentUser.id)
      .eq('status', 'completed')

    const { data: completedTips, error: completedTipsError } = await supabaseAdmin
      .from('tips')
      .select('amount, created_at, project_id')
      .eq('creator_id', currentUser.id)
      .eq('status', 'completed')

    if (completedTipsError) {
      console.error('Error loading creator earnings totals:', completedTipsError)
      return NextResponse.json({ error: 'Failed to load earnings' }, { status: 500 })
    }

    const totalTipsAmountCents = (completedTips || []).reduce((sum, tip) => sum + (tip.amount || 0), 0)
    const thresholdIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()
    const last30dAmountCents = (completedTips || [])
      .filter((tip) => typeof tip.created_at === 'string' && tip.created_at >= thresholdIso)
      .reduce((sum, tip) => sum + (tip.amount || 0), 0)

    const { data: recentTipsRows, error: recentTipsError } = await supabaseAdmin
      .from('tips')
      .select('amount, created_at, project_id, tipper_user_id, tipper_username')
      .eq('creator_id', currentUser.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(RECENT_TIPS_LIMIT)

    if (recentTipsError) {
      console.error('Error loading recent tips:', recentTipsError)
      return NextResponse.json({ error: 'Failed to load earnings' }, { status: 500 })
    }

    const projectIds = Array.from(
      new Set(
        [
          ...(completedTips || []).map((tip) => tip.project_id),
          ...(recentTipsRows || []).map((tip) => tip.project_id),
        ].filter((id): id is string => !!id)
      )
    )
    const tipperIds = Array.from(
      new Set((recentTipsRows || []).map((tip) => tip.tipper_user_id).filter((id): id is string => !!id))
    )

    const [projectsResult, tippersResult] = await Promise.all([
      projectIds.length > 0
        ? supabaseAdmin.from('projects').select('id, title').in('id', projectIds)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string | null }> }),
      tipperIds.length > 0
        ? supabaseAdmin.from('users').select('id, username, email').in('id', tipperIds)
        : Promise.resolve({ data: [] as Array<{ id: string; username: string | null; email: string | null }> }),
    ])

    const projectTitleById = (projectsResult.data || []).reduce<Record<string, string>>((acc, project) => {
      acc[project.id] = project.title || 'Untitled project'
      return acc
    }, {})

    const tipperNameById = (tippersResult.data || []).reduce<Record<string, string>>((acc, tipper) => {
      acc[tipper.id] = getSupporterDisplayName(tipper.username || tipper.email)
      return acc
    }, {})

    const recentTips: CreatorEarningsRecentTip[] = (recentTipsRows || []).map((tip) => ({
      amount_cents: tip.amount || 0,
      created_at: tip.created_at,
      project_id: tip.project_id || null,
      project_title: tip.project_id ? projectTitleById[tip.project_id] || 'Untitled project' : 'Direct support',
      supporter_name: getSupporterDisplayName(
        tip.tipper_user_id ? tipperNameById[tip.tipper_user_id] || tip.tipper_username : tip.tipper_username
      ),
    }))

    const perProjectTotals = buildPerProjectTotals(
      aggregateProjectTotals((completedTips || []).map((tip) => ({ project_id: tip.project_id, amount: tip.amount || 0 }))),
      projectTitleById,
      5
    )

    return NextResponse.json({
      total_tips_count: totalTipsCount || 0,
      total_tips_amount_cents: totalTipsAmountCents,
      last_30d_amount_cents: last30dAmountCents,
      recent_tips: recentTips,
      per_project_totals: perProjectTotals,
    })
  } catch (error) {
    console.error('Error in creator earnings API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

