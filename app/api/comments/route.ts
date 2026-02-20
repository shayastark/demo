import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID, sanitizeText } from '@/lib/validation'

type CommentRecord = {
  id: string
  user_id: string
  project_id: string | null
  track_id: string | null
  content: string
  timestamp_seconds: number | null
  created_at: string
  updated_at: string
}

async function getTrackProject(trackId: string): Promise<{ id: string; creator_id: string; sharing_enabled: boolean | null } | null> {
  const { data: track } = await supabaseAdmin
    .from('tracks')
    .select(`
      id,
      project:projects(
        id,
        creator_id,
        sharing_enabled
      )
    `)
    .eq('id', trackId)
    .single()

  const project = track?.project as { id: string; creator_id: string; sharing_enabled: boolean | null } | undefined
  return project || null
}

async function getCurrentUserFromRequest(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const trackId = searchParams.get('track_id')

    if ((projectId && trackId) || (!projectId && !trackId)) {
      return NextResponse.json({ error: 'Provide either project_id or track_id' }, { status: 400 })
    }

    const currentUser = await getCurrentUserFromRequest(request)

    let targetCreatorId: string | null = null
    let comments: CommentRecord[] = []

    if (projectId) {
      if (!isValidUUID(projectId)) {
        return NextResponse.json({ error: 'Invalid project_id' }, { status: 400 })
      }

      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('id, creator_id, sharing_enabled')
        .eq('id', projectId)
        .single()

      if (!project || project.sharing_enabled === false) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      targetCreatorId = project.creator_id

      const { data, error } = await supabaseAdmin
        .from('comments')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (error) throw error
      comments = (data as CommentRecord[]) || []
    } else if (trackId) {
      if (!isValidUUID(trackId)) {
        return NextResponse.json({ error: 'Invalid track_id' }, { status: 400 })
      }

      const trackProject = await getTrackProject(trackId)
      if (!trackProject || trackProject.sharing_enabled === false) {
        return NextResponse.json({ error: 'Track not found' }, { status: 404 })
      }

      targetCreatorId = trackProject.creator_id

      const { data, error } = await supabaseAdmin
        .from('comments')
        .select('*')
        .eq('track_id', trackId)
        .order('created_at', { ascending: false })

      if (error) throw error
      comments = (data as CommentRecord[]) || []
    }

    const userIds = Array.from(new Set(comments.map((comment) => comment.user_id)))
    let usersById: Record<string, { username: string | null; email: string | null }> = {}

    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, username, email')
        .in('id', userIds)

      usersById = (users || []).reduce<Record<string, { username: string | null; email: string | null }>>((acc, user) => {
        acc[user.id] = { username: user.username, email: user.email }
        return acc
      }, {})
    }

    const enhancedComments = comments.map((comment) => {
      const author = usersById[comment.user_id]
      const isOwner = !!currentUser && currentUser.id === comment.user_id
      const isCreator = !!currentUser && !!targetCreatorId && currentUser.id === targetCreatorId

      return {
        ...comment,
        author_name: author?.username || author?.email || 'Unknown',
        can_edit: isOwner,
        can_delete: isOwner || isCreator,
      }
    })

    return NextResponse.json({ comments: enhancedComments })
  } catch (error) {
    console.error('Error getting comments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
    const { project_id, track_id } = body
    const content = sanitizeText(body.content, 2000)

    if ((project_id && track_id) || (!project_id && !track_id)) {
      return NextResponse.json({ error: 'Provide either project_id or track_id' }, { status: 400 })
    }

    if (!content) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
    }

    let insertPayload: Record<string, unknown> = {
      user_id: user.id,
      content,
    }

    if (project_id) {
      if (!isValidUUID(project_id)) {
        return NextResponse.json({ error: 'Invalid project_id' }, { status: 400 })
      }

      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('id, sharing_enabled')
        .eq('id', project_id)
        .single()

      if (!project || project.sharing_enabled === false) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      insertPayload.project_id = project_id
      insertPayload.track_id = null
      insertPayload.timestamp_seconds = null
    } else if (track_id) {
      if (!isValidUUID(track_id)) {
        return NextResponse.json({ error: 'Invalid track_id' }, { status: 400 })
      }

      const trackProject = await getTrackProject(track_id)
      if (!trackProject || trackProject.sharing_enabled === false) {
        return NextResponse.json({ error: 'Track not found' }, { status: 404 })
      }

      const parsedTimestamp = Number(body.timestamp_seconds)
      if (!Number.isFinite(parsedTimestamp) || parsedTimestamp < 0) {
        return NextResponse.json({ error: 'Valid non-negative timestamp_seconds is required for track comments' }, { status: 400 })
      }

      insertPayload.project_id = null
      insertPayload.track_id = track_id
      insertPayload.timestamp_seconds = Math.floor(parsedTimestamp)
    }

    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ comment }, { status: 201 })
  } catch (error) {
    console.error('Error creating comment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
    const id = body.id as string
    const content = sanitizeText(body.content, 2000)

    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: 'Valid comment id is required' }, { status: 400 })
    }

    if (!content) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
    }

    const { data: existing } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .update({ content })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ comment })
  } catch (error) {
    console.error('Error updating comment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
      return NextResponse.json({ error: 'Valid comment id is required' }, { status: 400 })
    }

    const { data: existing } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    let creatorId: string | null = null
    if (existing.project_id) {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('creator_id')
        .eq('id', existing.project_id)
        .single()
      creatorId = project?.creator_id || null
    } else if (existing.track_id) {
      const trackProject = await getTrackProject(existing.track_id)
      creatorId = trackProject?.creator_id || null
    }

    const canDelete = existing.user_id === user.id || creatorId === user.id
    if (!canDelete) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('comments')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting comment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
