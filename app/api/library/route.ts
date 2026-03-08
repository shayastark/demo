import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import { createProjectSavedNotification } from '@/lib/notifications'
import { normalizeProjectSubscriptionNotificationMode } from '@/lib/projectSubscriptions'

// POST /api/library - Add a project to user's library
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserByPrivyId(authResult.privyId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { project_id } = body

    if (!project_id || !isValidUUID(project_id)) {
      return NextResponse.json({ error: 'Valid project ID is required' }, { status: 400 })
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, title, creator_id')
      .eq('id', project_id)
      .maybeSingle()

    if (projectError) {
      console.error('Error loading project for library save:', projectError)
      return NextResponse.json({ error: 'Failed to load project' }, { status: 500 })
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Check if already in library
    const { data: existing } = await supabaseAdmin
      .from('user_projects')
      .select('id')
      .eq('user_id', user.id)
      .eq('project_id', project_id)
      .maybeSingle()

    // Ensure save action always seeds/maintains project subscription.
    const { data: existingSubscription, error: existingSubscriptionError } = await supabaseAdmin
      .from('project_subscriptions')
      .select('id, notification_mode')
      .eq('user_id', user.id)
      .eq('project_id', project_id)
      .maybeSingle()

    if (existingSubscriptionError) {
      console.error('Error loading project subscription state:', existingSubscriptionError)
      return NextResponse.json({ error: 'Failed to seed project notifications' }, { status: 500 })
    }

    let subscriptionSeeded = false
    let resolvedNotificationMode = normalizeProjectSubscriptionNotificationMode(
      existingSubscription?.notification_mode
    )

    if (!existingSubscription) {
      const { data: createdSubscription, error: subscriptionInsertError } = await supabaseAdmin
        .from('project_subscriptions')
        .upsert(
          {
            user_id: user.id,
            project_id,
            notification_mode: 'important',
          },
          { onConflict: 'user_id,project_id' }
        )
        .select('notification_mode')
        .single()

      if (subscriptionInsertError) {
        console.error('Error seeding project subscription from library save:', subscriptionInsertError)
        return NextResponse.json({ error: 'Failed to seed project notifications' }, { status: 500 })
      }

      subscriptionSeeded = true
      resolvedNotificationMode = normalizeProjectSubscriptionNotificationMode(
        createdSubscription?.notification_mode
      )
    }

    if (existing) {
      return NextResponse.json({
        message: 'Already in library',
        alreadySaved: true,
        isSubscribed: true,
        notification_mode: resolvedNotificationMode,
        subscription_seeded: subscriptionSeeded,
      })
    }

    // Add to library
    const { data: userProject, error } = await supabaseAdmin
      .from('user_projects')
      .insert({ user_id: user.id, project_id })
      .select()
      .single()

    if (error) throw error

    // Atomically increment adds metric
    const { error: rpcError } = await supabaseAdmin
      .rpc('increment_metric', { p_project_id: project_id, p_field: 'adds' })

    if (rpcError) {
      console.error('Error incrementing adds metric:', rpcError)
    }

    if (project.creator_id) {
      const notificationResult = await createProjectSavedNotification({
        creatorId: project.creator_id,
        projectId: project.id,
        projectTitle: project.title || 'Untitled project',
        saverId: user.id,
        saverName: user.username || user.email || null,
      })

      if (!notificationResult.success) {
        console.error('Error creating project saved notification:', notificationResult.error)
      }
    }

    return NextResponse.json(
      {
        userProject,
        alreadySaved: false,
        isSubscribed: true,
        notification_mode: resolvedNotificationMode,
        subscription_seeded: subscriptionSeeded,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error adding to library:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/library - Remove a project from user's library
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserByPrivyId(authResult.privyId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')

    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project ID is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('user_projects')
      .delete()
      .eq('user_id', user.id)
      .eq('project_id', projectId)

    if (error) throw error

    // Unified behavior: removing from library also unsubscribes project notifications.
    const { error: subscriptionDeleteError } = await supabaseAdmin
      .from('project_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('project_id', projectId)

    if (subscriptionDeleteError) {
      console.error('Error unsubscribing project notifications on library remove:', subscriptionDeleteError)
    }

    return NextResponse.json({
      success: true,
      unsubscribed: !subscriptionDeleteError,
      isSubscribed: false,
      notification_mode: 'all',
      warning: subscriptionDeleteError ? 'Removed from library, but failed to unsubscribe notifications' : null,
    })
  } catch (error) {
    console.error('Error removing from library:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/library - Update pinned status
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserByPrivyId(authResult.privyId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { project_id, pinned } = body

    if (!project_id || !isValidUUID(project_id)) {
      return NextResponse.json({ error: 'Valid project ID is required' }, { status: 400 })
    }

    if (typeof pinned !== 'boolean') {
      return NextResponse.json({ error: 'Pinned must be a boolean value' }, { status: 400 })
    }

    const { data: userProject, error } = await supabaseAdmin
      .from('user_projects')
      .update({ pinned })
      .eq('user_id', user.id)
      .eq('project_id', project_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ userProject })
  } catch (error) {
    console.error('Error updating library item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
