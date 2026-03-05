import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID, sanitizeText } from '@/lib/validation'
import {
  parseProjectVisibility,
  resolveProjectVisibility,
} from '@/lib/projectVisibility'
import { canUserAccessProjectRow } from '@/lib/projectAccessServer'

async function getOptionalUserFromAuthorizationHeader(value: string | null) {
  const authResult = await verifyPrivyToken(value)
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

// GET /api/projects - Get user's projects
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const shareToken = searchParams.get('share_token')
    const optionalUser = await getOptionalUserFromAuthorizationHeader(request.headers.get('authorization'))

    // Additive read mode: allow fetching a single project by id/share_token with visibility enforcement.
    if (id || shareToken) {
      if (id && !isValidUUID(id)) {
        return NextResponse.json({ error: 'Valid project ID is required' }, { status: 400 })
      }
      if (shareToken && typeof shareToken !== 'string') {
        return NextResponse.json({ error: 'Invalid share token' }, { status: 400 })
      }

      let query = supabaseAdmin.from('projects').select('*')
      if (id) query = query.eq('id', id)
      if (shareToken) query = query.eq('share_token', shareToken)

      const { data: project } = await query.single()
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      const resolvedVisibility = resolveProjectVisibility(project.visibility, project.sharing_enabled)
      const canAccess = await canUserAccessProjectRow({
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

      return NextResponse.json({
        project: {
          ...project,
          visibility: resolvedVisibility,
        },
      })
    }

    if (!optionalUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: projects, error } = await supabaseAdmin
      .from('projects')
      .select('*, tracks(*)')
      .eq('creator_id', optionalUser.id)
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
    const { cover_image_url, allow_downloads } = body
    const visibility = body.visibility !== undefined ? parseProjectVisibility(body.visibility) : 'unlisted'

    // Validate and sanitize text fields
    const title = sanitizeText(body.title, 200)
    const description = sanitizeText(body.description, 2000)

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (!visibility) {
      return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 })
    }

    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .insert({
        creator_id: user.id,
        title,
        description: description || null,
        cover_image_url: cover_image_url || null,
        allow_downloads: allow_downloads || false,
        visibility,
        sharing_enabled: visibility !== 'private',
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
    const { id, cover_image_url, allow_downloads, pinned, sharing_enabled } = body
    const visibility = body.visibility !== undefined ? parseProjectVisibility(body.visibility) : undefined

    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: 'Valid project ID is required' }, { status: 400 })
    }
    if (body.visibility !== undefined && !visibility) {
      return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 })
    }

    // Sanitize text fields if provided
    const title = body.title !== undefined ? sanitizeText(body.title, 200) : undefined
    const description = body.description !== undefined ? sanitizeText(body.description, 2000) : undefined

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
    if (visibility !== undefined) {
      updates.visibility = visibility
      // TODO: Remove sharing_enabled once all routes enforce visibility directly.
      updates.sharing_enabled = visibility !== 'private'
    }

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

    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: 'Valid project ID is required' }, { status: 400 })
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
