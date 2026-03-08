import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import { resolveProjectVisibility } from '@/lib/projectVisibility'
import { canViewProject } from '@/lib/projectAccessPolicyServer'
import { normalizeProjectSubscriptionNotificationMode } from '@/lib/projectSubscriptions'

async function getOptionalUserFromAuthorizationHeader(value: string | null) {
  const authResult = await verifyPrivyToken(value)
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const shareToken = searchParams.get('share_token')
    const optionalUser = await getOptionalUserFromAuthorizationHeader(request.headers.get('authorization'))

    if (!id && !shareToken) {
      return NextResponse.json({ error: 'Provide id or share_token' }, { status: 400 })
    }
    if (id && !isValidUUID(id)) {
      return NextResponse.json({ error: 'Valid project ID is required' }, { status: 400 })
    }
    if (shareToken && typeof shareToken !== 'string') {
      return NextResponse.json({ error: 'Invalid share token' }, { status: 400 })
    }

    let projectQuery = supabaseAdmin.from('projects').select('*')
    if (id) projectQuery = projectQuery.eq('id', id)
    if (shareToken) projectQuery = projectQuery.eq('share_token', shareToken)

    const { data: project, error: projectError } = await projectQuery.single()
    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const resolvedVisibility = resolveProjectVisibility(project.visibility, project.sharing_enabled)
    const canAccess = await canViewProject({
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
      userId: optionalUser?.id,
      isDirectAccess: !!shareToken,
    })

    if (!canAccess) {
      if (resolvedVisibility === 'private') {
        let requestStatus: 'pending' | 'approved' | 'denied' | null = null
        if (optionalUser && optionalUser.id !== project.creator_id) {
          const { data: accessRequest } = await supabaseAdmin
            .from('project_access_requests')
            .select('status')
            .eq('project_id', project.id)
            .eq('requester_user_id', optionalUser.id)
            .maybeSingle()
          const rawStatus = accessRequest?.status
          if (rawStatus === 'pending' || rawStatus === 'approved' || rawStatus === 'denied') {
            requestStatus = rawStatus
          }
        }

        return NextResponse.json(
          {
            error: 'Private project access required',
            code: 'private_access_required',
            project_id: project.id,
            project_title: project.title || null,
            request_status: requestStatus,
          },
          { status: 403 }
        )
      }

      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const viewerUserId = optionalUser?.id || null
    const creatorPromise = supabaseAdmin
      .from('users')
      .select('id, username, email, avatar_url')
      .eq('id', project.creator_id)
      .maybeSingle()
    const tracksPromise = supabaseAdmin
      .from('tracks')
      .select('*')
      .eq('project_id', project.id)
      .order('order', { ascending: true })
    const metricsPromise = supabaseAdmin
      .from('project_metrics')
      .select('*')
      .eq('project_id', project.id)
      .maybeSingle()
    const subscriptionCountPromise = supabaseAdmin
      .from('project_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)

    const savedProjectPromise = viewerUserId
      ? supabaseAdmin
          .from('user_projects')
          .select('id, pinned')
          .eq('user_id', viewerUserId)
          .eq('project_id', project.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })

    const subscriptionPromise = viewerUserId
      ? supabaseAdmin
          .from('project_subscriptions')
          .select('id, notification_mode')
          .eq('project_id', project.id)
          .eq('user_id', viewerUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })

    const [
      { data: creator, error: creatorError },
      { data: tracks, error: tracksError },
      { data: metrics, error: metricsError },
      { count: subscriberCount, error: subscriptionCountError },
      { data: savedProject, error: savedProjectError },
      { data: subscription, error: subscriptionError },
    ] = await Promise.all([
      creatorPromise,
      tracksPromise,
      metricsPromise,
      subscriptionCountPromise,
      savedProjectPromise,
      subscriptionPromise,
    ])

    if (creatorError) throw creatorError
    if (tracksError) throw tracksError
    if (metricsError) throw metricsError
    if (subscriptionCountError) throw subscriptionCountError
    if (savedProjectError) throw savedProjectError
    if (subscriptionError) throw subscriptionError

    return NextResponse.json({
      project: {
        ...project,
        visibility: resolvedVisibility,
      },
      tracks: tracks || [],
      metrics: metrics || null,
      creator: creator
        ? {
            id: creator.id,
            username: creator.username || null,
            email: creator.email || null,
            avatar_url: creator.avatar_url || null,
          }
        : null,
      viewer: {
        is_creator: viewerUserId === project.creator_id,
        saved_to_library: !!savedProject,
        pinned_in_library: !!savedProject?.pinned,
        is_subscribed: !!subscription,
        subscriber_count: subscriberCount || 0,
        notification_mode: normalizeProjectSubscriptionNotificationMode(subscription?.notification_mode),
      },
    })
  } catch (error) {
    console.error('Error loading project bootstrap:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
