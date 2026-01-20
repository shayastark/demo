import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'

// Helper to verify project ownership
async function verifyProjectOwnership(projectId: string, userId: string): Promise<boolean> {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('creator_id')
    .eq('id', projectId)
    .single()

  return project?.creator_id === userId
}

// POST /api/notes - Create or update a note
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
    const { type, project_id, track_id, content, note_id } = body

    if (!type || !content) {
      return NextResponse.json({ error: 'Type and content are required' }, { status: 400 })
    }

    if (type === 'project') {
      if (!project_id) {
        return NextResponse.json({ error: 'Project ID is required for project notes' }, { status: 400 })
      }

      // Verify ownership
      if (!(await verifyProjectOwnership(project_id, user.id))) {
        return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 })
      }

      if (note_id) {
        // Update existing note
        const { data: note, error } = await supabaseAdmin
          .from('project_notes')
          .update({ content })
          .eq('id', note_id)
          .eq('project_id', project_id)
          .select()
          .single()

        if (error) throw error
        return NextResponse.json({ note })
      } else {
        // Create new note
        const { data: note, error } = await supabaseAdmin
          .from('project_notes')
          .insert({ project_id, content })
          .select()
          .single()

        if (error) throw error
        return NextResponse.json({ note }, { status: 201 })
      }
    } else if (type === 'track') {
      if (!track_id) {
        return NextResponse.json({ error: 'Track ID is required for track notes' }, { status: 400 })
      }

      // Get track's project and verify ownership
      const { data: track } = await supabaseAdmin
        .from('tracks')
        .select('project_id')
        .eq('id', track_id)
        .single()

      if (!track) {
        return NextResponse.json({ error: 'Track not found' }, { status: 404 })
      }

      if (!(await verifyProjectOwnership(track.project_id, user.id))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      if (note_id) {
        // Update existing note
        const { data: note, error } = await supabaseAdmin
          .from('track_notes')
          .update({ content })
          .eq('id', note_id)
          .eq('track_id', track_id)
          .select()
          .single()

        if (error) throw error
        return NextResponse.json({ note })
      } else {
        // Create new note
        const { data: note, error } = await supabaseAdmin
          .from('track_notes')
          .insert({ track_id, content })
          .select()
          .single()

        if (error) throw error
        return NextResponse.json({ note }, { status: 201 })
      }
    }

    return NextResponse.json({ error: 'Invalid note type' }, { status: 400 })
  } catch (error) {
    console.error('Error saving note:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/notes - Get notes for a project
export async function GET(request: NextRequest) {
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

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Verify ownership
    if (!(await verifyProjectOwnership(projectId, user.id))) {
      return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 })
    }

    // Get project note
    const { data: projectNote } = await supabaseAdmin
      .from('project_notes')
      .select('*')
      .eq('project_id', projectId)
      .single()

    // Get track notes for all tracks in this project
    const { data: tracks } = await supabaseAdmin
      .from('tracks')
      .select('id')
      .eq('project_id', projectId)

    const trackIds = tracks?.map(t => t.id) || []
    
    let trackNotes: Record<string, unknown> = {}
    if (trackIds.length > 0) {
      const { data: notes } = await supabaseAdmin
        .from('track_notes')
        .select('*')
        .in('track_id', trackIds)

      if (notes) {
        trackNotes = Object.fromEntries(notes.map(n => [n.track_id, n]))
      }
    }

    return NextResponse.json({ projectNote, trackNotes })
  } catch (error) {
    console.error('Error getting notes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
