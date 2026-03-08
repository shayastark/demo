import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import {
  normalizeProjectSubscriptionNotificationMode,
  parseProjectSubscriptionNotificationModeFromBody,
  parseProjectSubscriptionProjectIdFromBody,
  parseProjectSubscriptionProjectIdFromDelete,
} from '@/lib/projectSubscriptions'
import { canViewProject } from '@/lib/projectAccessPolicyServer'

async function getOptionalCurrentUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null
  const authResult = await verifyPrivyToken(authHeader)
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

async function getRequiredCurrentUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

async function getProject(projectId: string) {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, creator_id, sharing_enabled, visibility')
    .eq('id', projectId)
    .single()
  return project
}

async function getOptionalSubscriptionRow(args: {
  projectId: string
  userId: string
}): Promise<{
  data: { id: string; notification_mode?: unknown } | null
  error: unknown | null
}> {
  const withMode = await supabaseAdmin
    .from('project_subscriptions')
    .select('id, notification_mode')
    .eq('project_id', args.projectId)
    .eq('user_id', args.userId)
    .maybeSingle()

  if (!withMode.error) {
    return { data: withMode.data, error: null }
  }

  const fallback = await supabaseAdmin
    .from('project_subscriptions')
    .select('id')
    .eq('project_id', args.projectId)
    .eq('user_id', args.userId)
    .maybeSingle()

  if (fallback.error) {
    return { data: null, error: fallback.error }
  }

  return {
    data: fallback.data ? { id: fallback.data.id, notification_mode: null } : null,
    error: null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    const currentUser = await getOptionalCurrentUser(request)
    const project = await getProject(projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const canAccess = await canViewProject({
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
      userId: currentUser?.id,
      isDirectAccess: true,
    })
    if (!canAccess) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { count: subscriberCount, error: countError } = await supabaseAdmin
      .from('project_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)

    if (countError) {
      return NextResponse.json({ error: 'Failed to load subscription status' }, { status: 500 })
    }

    let isSubscribed = false
    let notificationMode: 'all' | 'important' | 'mute' = 'all'
    if (currentUser?.id) {
      const { data: existingSub, error: existingSubError } = await getOptionalSubscriptionRow({
        projectId,
        userId: currentUser.id,
      })
      if (existingSubError) {
        return NextResponse.json({ error: 'Failed to load subscription status' }, { status: 500 })
      }
      isSubscribed = !!existingSub
      notificationMode = normalizeProjectSubscriptionNotificationMode(existingSub?.notification_mode)
    }

    return NextResponse.json({
      isSubscribed,
      subscriberCount: subscriberCount || 0,
      notification_mode: notificationMode,
    })
  } catch (error) {
    console.error('Error in project subscriptions GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const projectId = parseProjectSubscriptionProjectIdFromBody(body)
    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    const project = await getProject(projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
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
    if (!canAccess) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { error: upsertError } = await supabaseAdmin
      .from('project_subscriptions')
      .upsert(
        {
          user_id: currentUser.id,
          project_id: projectId,
        },
        { onConflict: 'user_id,project_id' }
      )

    if (upsertError) {
      return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
    }

    const { count: subscriberCount } = await supabaseAdmin
      .from('project_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)

    return NextResponse.json({
      isSubscribed: true,
      subscriberCount: subscriberCount || 0,
      notification_mode: 'all',
    })
  } catch (error) {
    console.error('Error in project subscriptions POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const queryProjectId = searchParams.get('project_id')

    let bodyProjectId: string | null = null
    if (request.headers.get('content-length') !== '0') {
      try {
        const body = await request.json()
        bodyProjectId = parseProjectSubscriptionProjectIdFromBody(body)
      } catch {
        bodyProjectId = null
      }
    }

    const projectId = parseProjectSubscriptionProjectIdFromDelete({
      bodyProjectId,
      queryProjectId,
    })
    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    await supabaseAdmin
      .from('project_subscriptions')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('project_id', projectId)

    const { count: subscriberCount } = await supabaseAdmin
      .from('project_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)

    return NextResponse.json({
      isSubscribed: false,
      subscriberCount: subscriberCount || 0,
      notification_mode: 'all',
    })
  } catch (error) {
    console.error('Error in project subscriptions DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const projectId = parseProjectSubscriptionProjectIdFromBody(body)
    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }
    const mode = parseProjectSubscriptionNotificationModeFromBody(body)
    if (!mode) {
      return NextResponse.json(
        { error: 'notification_mode must be one of: all, important, mute' },
        { status: 400 }
      )
    }

    const { data: existingSub, error: existingSubError } = await getOptionalSubscriptionRow({
      projectId,
      userId: currentUser.id,
    })
    if (existingSubError) {
      return NextResponse.json({ error: 'Failed to load existing subscription' }, { status: 500 })
    }
    if (!existingSub) {
      return NextResponse.json({ error: 'Subscribe to project before changing notification mode' }, { status: 404 })
    }

    const { data: updatedSub, error: updateError } = await supabaseAdmin
      .from('project_subscriptions')
      .update({ notification_mode: mode })
      .eq('user_id', currentUser.id)
      .eq('project_id', projectId)
      .select('notification_mode')
      .single()

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update notification mode' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      notification_mode: normalizeProjectSubscriptionNotificationMode(updatedSub?.notification_mode),
      old_mode: normalizeProjectSubscriptionNotificationMode(existingSub.notification_mode),
      new_mode: normalizeProjectSubscriptionNotificationMode(updatedSub?.notification_mode),
    })
  } catch (error) {
    console.error('Error in project subscriptions PATCH:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

