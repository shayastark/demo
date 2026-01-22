import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { notifyNewTrackAdded } from '@/lib/notifications'

// Helper to verify project ownership and get project details
async function getProjectIfOwner(projectId: string, userId: string): Promise<{ id: string; title: string; creator_id: string } | null> {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, title, creator_id')
    .eq('id', projectId)
    .single()

  if (!project || project.creator_id !== userId) {
    return null
  }

  return project
}

// Legacy helper for backwards compatibility
async function verifyProjectOwnership(projectId: string, userId: string): Promise<boolean> {
  const project = await getProjectIfOwner(projectId, userId)
  return project !== null
}

// POST /api/tracks - Create a new track
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
    const { project_id, title, audio_url, image_url, order } = body

    if (!project_id || !title || !audio_url) {
      return NextResponse.json({ error: 'Project ID, title, and audio URL are required' }, { status: 400 })
    }

    // Verify ownership and get project details
    const project = await getProjectIfOwner(project_id, user.id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 })
    }

    const { data: track, error } = await supabaseAdmin
      .from('tracks')
      .insert({
        project_id,
        title,
        audio_url,
        image_url: image_url || null,
        order: order ?? 0,
      })
      .select()
      .single()

    if (error) throw error

    // Notify users who have saved this project about the new track
    // This runs async and doesn't block the response
    notifyNewTrackAdded({
      projectId: project_id,
      creatorId: user.id,
      projectTitle: project.title,
      trackTitle: title,
    }).catch((err) => {
      console.error('Failed to send new track notifications:', err)
    })

    return NextResponse.json({ track }, { status: 201 })
  } catch (error) {
    console.error('Error creating track:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/tracks - Update a track
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
    const { id, title, audio_url, image_url, order } = body

    if (!id) {
      return NextResponse.json({ error: 'Track ID is required' }, { status: 400 })
    }

    // Get track and verify ownership via project
    const { data: existingTrack } = await supabaseAdmin
      .from('tracks')
      .select('project_id')
      .eq('id', id)
      .single()

    if (!existingTrack) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    if (!(await verifyProjectOwnership(existingTrack.project_id, user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Build update object
    const updates: Record<string, unknown> = {}
    if (title !== undefined) updates.title = title
    if (audio_url !== undefined) updates.audio_url = audio_url
    if (image_url !== undefined) updates.image_url = image_url
    if (order !== undefined) updates.order = order

    const { data: track, error } = await supabaseAdmin
      .from('tracks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ track })
  } catch (error) {
    console.error('Error updating track:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/tracks - Delete a track
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
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Track ID is required' }, { status: 400 })
    }

    // Get track and verify ownership via project
    const { data: existingTrack } = await supabaseAdmin
      .from('tracks')
      .select('project_id')
      .eq('id', id)
      .single()

    if (!existingTrack) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    if (!(await verifyProjectOwnership(existingTrack.project_id, user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('tracks')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting track:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
