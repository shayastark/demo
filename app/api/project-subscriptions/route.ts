import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import {
  parseProjectSubscriptionProjectIdFromBody,
  parseProjectSubscriptionProjectIdFromDelete,
} from '@/lib/projectSubscriptions'

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
    .select('id, creator_id, sharing_enabled')
    .eq('id', projectId)
    .single()
  return project
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
    const canAccess = project.sharing_enabled !== false || project.creator_id === currentUser?.id
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
    if (currentUser?.id) {
      const { data: existingSub } = await supabaseAdmin
        .from('project_subscriptions')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', currentUser.id)
        .maybeSingle()
      isSubscribed = !!existingSub
    }

    return NextResponse.json({
      isSubscribed,
      subscriberCount: subscriberCount || 0,
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
    const canAccess = project.sharing_enabled !== false || project.creator_id === currentUser.id
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
    })
  } catch (error) {
    console.error('Error in project subscriptions DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

