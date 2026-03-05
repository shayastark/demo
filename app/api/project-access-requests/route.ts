import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import { hasProjectAccessGrant } from '@/lib/projectAccessServer'
import {
  canReviewProjectAccessRequest,
  isProjectAccessRequestStatus,
  parseProjectAccessRequestCreateInput,
  parseProjectAccessRequestReviewInput,
  shouldUpsertAccessGrantOnReview,
  shouldNotifyCreatorOnAccessRequest,
} from '@/lib/projectAccessRequests'
import {
  notifyPrivateProjectAccessRequestCreated,
  notifyPrivateProjectAccessRequestReviewed,
} from '@/lib/notifications'

async function getRequiredCurrentUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

async function getProject(projectId: string) {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('id, creator_id, title')
    .eq('id', projectId)
    .single()
  return data
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const status = searchParams.get('status')
    const mine = searchParams.get('mine') === 'true'

    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }
    if (status && !isProjectAccessRequestStatus(status)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }

    if (mine) {
      const { data: myRequest, error } = await supabaseAdmin
        .from('project_access_requests')
        .select('id, project_id, requester_user_id, status, note, created_at, updated_at, reviewed_at')
        .eq('project_id', projectId)
        .eq('requester_user_id', currentUser.id)
        .maybeSingle()
      if (error) throw error
      return NextResponse.json({ request: myRequest || null })
    }

    const project = await getProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!canReviewProjectAccessRequest({ creatorUserId: project.creator_id, viewerUserId: currentUser.id })) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    let query = supabaseAdmin
      .from('project_access_requests')
      .select('id, project_id, requester_user_id, status, note, created_at, updated_at, reviewed_at, reviewed_by_user_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    const { data: requests, error } = await query
    if (error) throw error

    const requesterIds = Array.from(new Set((requests || []).map((row) => row.requester_user_id)))
    const { data: users } = requesterIds.length
      ? await supabaseAdmin
          .from('users')
          .select('id, username, email')
          .in('id', requesterIds)
      : { data: [] as Array<{ id: string; username: string | null; email: string | null }> }
    const usersById = (users || []).reduce<
      Record<string, { username: string | null; email: string | null }>
    >((acc, user) => {
      acc[user.id] = { username: user.username, email: user.email }
      return acc
    }, {})

    const pendingFirst = [...(requests || [])].sort((a, b) => {
      if (a.status === b.status) return 0
      if (a.status === 'pending') return -1
      if (b.status === 'pending') return 1
      return 0
    })

    return NextResponse.json({
      requests: pendingFirst.map((row) => ({
        ...row,
        requester_username: usersById[row.requester_user_id]?.username || null,
        requester_email: usersById[row.requester_user_id]?.email || null,
      })),
    })
  } catch (error) {
    console.error('Error in project access requests GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = parseProjectAccessRequestCreateInput(body)
    if (!parsed) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    const project = await getProject(parsed.project_id)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.creator_id === currentUser.id) {
      return NextResponse.json({ error: 'Creators cannot request access to their own project' }, { status: 400 })
    }

    const alreadyHasAccess = await hasProjectAccessGrant(parsed.project_id, currentUser.id)
    if (alreadyHasAccess) {
      return NextResponse.json({
        success: true,
        code: 'already_has_access',
        request: null,
      })
    }

    const { data: existingRequest, error: existingError } = await supabaseAdmin
      .from('project_access_requests')
      .select('id, status')
      .eq('project_id', parsed.project_id)
      .eq('requester_user_id', currentUser.id)
      .maybeSingle()
    if (existingError) throw existingError

    const shouldNotifyCreator = shouldNotifyCreatorOnAccessRequest({
      existingStatus: (existingRequest?.status as 'pending' | 'approved' | 'denied' | null) || null,
      requesterAlreadyHasAccess: alreadyHasAccess,
    })

    let requestRecord:
      | {
          id: string
          requester_user_id: string
          status: string
          note: string | null
          created_at: string
          updated_at: string
        }
      | null = null
    if (existingRequest) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('project_access_requests')
        .update({
          status: 'pending',
          note: parsed.note,
          reviewed_at: null,
          reviewed_by_user_id: null,
        })
        .eq('id', existingRequest.id)
        .select('id, requester_user_id, status, note, created_at, updated_at')
        .single()
      if (updateError) throw updateError
      requestRecord = updated
    } else {
      const { data: created, error: createError } = await supabaseAdmin
        .from('project_access_requests')
        .insert({
          project_id: parsed.project_id,
          requester_user_id: currentUser.id,
          status: 'pending',
          note: parsed.note,
        })
        .select('id, requester_user_id, status, note, created_at, updated_at')
        .single()
      if (createError) throw createError
      requestRecord = created
    }

    let notificationCreated = false
    if (shouldNotifyCreator) {
      try {
        const requesterName =
          (typeof currentUser.username === 'string' && currentUser.username.trim()) ||
          (typeof currentUser.email === 'string' && currentUser.email.trim()) ||
          null
        const notifyResult = await notifyPrivateProjectAccessRequestCreated({
          creatorUserId: project.creator_id,
          requesterUserId: currentUser.id,
          requesterName,
          projectId: project.id,
          projectTitle: project.title || null,
          note: parsed.note,
        })
        notificationCreated = notifyResult.success && !notifyResult.skippedPreference
      } catch (notificationError) {
        console.error('Failed to notify creator about access request:', notificationError)
      }
    }

    return NextResponse.json({
      success: true,
      request: requestRecord,
      notification_created: notificationCreated,
    })
  } catch (error) {
    console.error('Error in project access requests POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = parseProjectAccessRequestReviewInput(body)
    if (!parsed) {
      return NextResponse.json({ error: 'Valid id and action are required' }, { status: 400 })
    }

    const { data: accessRequest, error: requestError } = await supabaseAdmin
      .from('project_access_requests')
      .select('id, project_id, requester_user_id, status')
      .eq('id', parsed.id)
      .single()
    if (requestError || !accessRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    const project = await getProject(accessRequest.project_id)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!canReviewProjectAccessRequest({ creatorUserId: project.creator_id, viewerUserId: currentUser.id })) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    let requestStatus: 'approved' | 'denied' = parsed.action === 'approve' ? 'approved' : 'denied'
    if (shouldUpsertAccessGrantOnReview(parsed.action)) {
      const { error: grantError } = await supabaseAdmin
        .from('project_access_grants')
        .upsert(
          {
            project_id: accessRequest.project_id,
            user_id: accessRequest.requester_user_id,
            granted_by_user_id: currentUser.id,
            expires_at: null,
          },
          { onConflict: 'project_id,user_id' }
        )
      if (grantError) throw grantError
    }

    const { data: updatedRequest, error: updateError } = await supabaseAdmin
      .from('project_access_requests')
      .update({
        status: requestStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: currentUser.id,
      })
      .eq('id', parsed.id)
      .select('id, project_id, requester_user_id, status, reviewed_at, reviewed_by_user_id')
      .single()
    if (updateError) throw updateError

    try {
      const reviewerName =
        (typeof currentUser.username === 'string' && currentUser.username.trim()) ||
        (typeof currentUser.email === 'string' && currentUser.email.trim()) ||
        null
      await notifyPrivateProjectAccessRequestReviewed({
        requesterUserId: accessRequest.requester_user_id,
        reviewerUserId: currentUser.id,
        reviewerName,
        projectId: accessRequest.project_id,
        projectTitle: project.title || null,
        decision: requestStatus,
      })
    } catch (notificationError) {
      console.error('Failed to notify requester about access review:', notificationError)
    }

    return NextResponse.json({ success: true, request: updatedRequest })
  } catch (error) {
    console.error('Error in project access requests PATCH:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

