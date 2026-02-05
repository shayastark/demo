import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'

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

    // Check if already in library
    const { data: existing } = await supabaseAdmin
      .from('user_projects')
      .select('id')
      .eq('user_id', user.id)
      .eq('project_id', project_id)
      .single()

    if (existing) {
      return NextResponse.json({ message: 'Already in library' })
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

    return NextResponse.json({ userProject }, { status: 201 })
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

    return NextResponse.json({ success: true })
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
