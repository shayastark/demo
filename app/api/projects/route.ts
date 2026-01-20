import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'

// GET /api/projects - Get user's projects
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

    const { data: projects, error } = await supabaseAdmin
      .from('projects')
      .select('*, tracks(*)')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ projects })
  } catch (error) {
    console.error('Error getting projects:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/projects - Create a new project
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
    const { title, description, cover_image_url, allow_downloads } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .insert({
        creator_id: user.id,
        title,
        description: description || null,
        cover_image_url: cover_image_url || null,
        allow_downloads: allow_downloads || false,
      })
      .select()
      .single()

    if (error) throw error

    // Create initial metrics
    await supabaseAdmin
      .from('project_metrics')
      .insert({ project_id: project.id, plays: 0, shares: 0, adds: 0 })

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    console.error('Error creating project:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/projects - Update a project
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
    const { id, title, description, cover_image_url, allow_downloads, pinned, sharing_enabled } = body

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Verify ownership
    const { data: existingProject } = await supabaseAdmin
      .from('projects')
      .select('creator_id')
      .eq('id', id)
      .single()

    if (!existingProject || existingProject.creator_id !== user.id) {
      return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 })
    }

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {}
    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description
    if (cover_image_url !== undefined) updates.cover_image_url = cover_image_url
    if (allow_downloads !== undefined) updates.allow_downloads = allow_downloads
    if (pinned !== undefined) updates.pinned = pinned
    if (sharing_enabled !== undefined) updates.sharing_enabled = sharing_enabled

    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ project })
  } catch (error) {
    console.error('Error updating project:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/projects - Delete a project
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
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Verify ownership
    const { data: existingProject } = await supabaseAdmin
      .from('projects')
      .select('creator_id')
      .eq('id', id)
      .single()

    if (!existingProject || existingProject.creator_id !== user.id) {
      return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 })
    }

    const { error } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
