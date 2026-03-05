import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import {
  canManageProjectAccess,
  isRedundantProjectAccessGrant,
  parseProjectAccessGrantInput,
} from '@/lib/projectAccess'

async function getRequiredCurrentUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

async function getProject(projectId: string) {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, creator_id')
    .eq('id', projectId)
    .single()
  return project
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    const project = await getProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!canManageProjectAccess(currentUser.id, project.creator_id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data: grants, error } = await supabaseAdmin
      .from('project_access_grants')
      .select('id, project_id, user_id, granted_by_user_id, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const userIds = Array.from(new Set((grants || []).map((grant) => grant.user_id)))
    const { data: users } = userIds.length
      ? await supabaseAdmin
          .from('users')
          .select('id, username, email')
          .in('id', userIds)
      : { data: [] as Array<{ id: string; username: string | null; email: string | null }> }

    const usersById = (users || []).reduce<Record<string, { username: string | null; email: string | null }>>(
      (acc, user) => {
        acc[user.id] = { username: user.username, email: user.email }
        return acc
      },
      {}
    )

    return NextResponse.json({
      grants: (grants || []).map((grant) => ({
        ...grant,
        username: usersById[grant.user_id]?.username || null,
        email: usersById[grant.user_id]?.email || null,
      })),
    })
  } catch (error) {
    console.error('Error in project access GET:', error)
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

    const parsed = parseProjectAccessGrantInput(body)
    if (!parsed) {
      return NextResponse.json({ error: 'Valid project_id and user_id are required' }, { status: 400 })
    }

    const project = await getProject(parsed.project_id)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!canManageProjectAccess(currentUser.id, project.creator_id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    if (isRedundantProjectAccessGrant({ creatorUserId: project.creator_id, targetUserId: parsed.user_id })) {
      return NextResponse.json({ error: 'Cannot grant project creator access to own project' }, { status: 400 })
    }

    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', parsed.user_id)
      .single()
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { error } = await supabaseAdmin
      .from('project_access_grants')
      .upsert(
        {
          project_id: parsed.project_id,
          user_id: parsed.user_id,
          granted_by_user_id: currentUser.id,
        },
        { onConflict: 'project_id,user_id' }
      )
    if (error) throw error

    return NextResponse.json({ success: true, project_id: parsed.project_id, user_id: parsed.user_id })
  } catch (error) {
    console.error('Error in project access POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    let projectId = searchParams.get('project_id')
    let userId = searchParams.get('user_id')
    if (!projectId || !userId) {
      try {
        const body = await request.json()
        projectId = typeof body?.project_id === 'string' ? body.project_id : projectId
        userId = typeof body?.user_id === 'string' ? body.user_id : userId
      } catch {
        // Ignore body parse errors and use query params.
      }
    }
    if (!projectId || !userId || !isValidUUID(projectId) || !isValidUUID(userId)) {
      return NextResponse.json({ error: 'Valid project_id and user_id are required' }, { status: 400 })
    }

    const project = await getProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!canManageProjectAccess(currentUser.id, project.creator_id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    await supabaseAdmin
      .from('project_access_grants')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId)

    return NextResponse.json({ success: true, project_id: projectId, user_id: userId })
  } catch (error) {
    console.error('Error in project access DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

