import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import {
  canManageProjectAccess,
  getProjectAccessIdentifierType,
  isRedundantProjectAccessGrant,
  parseProjectAccessGrantInput,
  resolveProjectAccessIdentifier,
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

async function resolveTargetUserIdByIdentifier(identifier: string) {
  const identifierType = getProjectAccessIdentifierType(identifier)

  if (identifierType === 'user_id') {
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', identifier)
      .limit(2)
    if (error) throw error
    const resolution = resolveProjectAccessIdentifier({
      identifier,
      identifierType,
      candidates: users || [],
    })
    return { identifierType, resolution }
  }

  if (identifierType === 'email') {
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .ilike('email', identifier)
      .limit(10)
    if (error) throw error
    const resolution = resolveProjectAccessIdentifier({
      identifier,
      identifierType,
      candidates: users || [],
    })
    return { identifierType, resolution }
  }

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, username')
    .ilike('username', identifier)
    .limit(10)
  if (error) throw error
  const resolution = resolveProjectAccessIdentifier({
    identifier,
    identifierType,
    candidates: users || [],
  })
  return { identifierType, resolution }
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
      return NextResponse.json(
        { error: 'Valid project_id and identifier are required', code: 'invalid_payload' },
        { status: 400 }
      )
    }

    const project = await getProject(parsed.project_id)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!canManageProjectAccess(currentUser.id, project.creator_id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const identifierResult = await resolveTargetUserIdByIdentifier(parsed.identifier)
    const { identifierType, resolution } = identifierResult
    if (resolution.status === 'not_found') {
      return NextResponse.json(
        { error: 'User not found', code: 'user_not_found', identifier_type: identifierType },
        { status: 404 }
      )
    }
    if (resolution.status === 'ambiguous') {
      return NextResponse.json(
        { error: 'Identifier matches multiple users', code: 'ambiguous_match', identifier_type: identifierType },
        { status: 409 }
      )
    }
    const resolvedUserId = resolution.userId

    if (isRedundantProjectAccessGrant({ creatorUserId: project.creator_id, targetUserId: resolvedUserId })) {
      return NextResponse.json(
        { error: 'Cannot grant project creator access to own project', code: 'self_grant', identifier_type: identifierType },
        { status: 400 }
      )
    }

    const { data: existingGrant, error: existingGrantError } = await supabaseAdmin
      .from('project_access_grants')
      .select('id')
      .eq('project_id', parsed.project_id)
      .eq('user_id', resolvedUserId)
      .maybeSingle()
    if (existingGrantError) throw existingGrantError
    if (existingGrant) {
      return NextResponse.json(
        { error: 'User already has access', code: 'already_granted', identifier_type: identifierType },
        { status: 409 }
      )
    }

    const { error } = await supabaseAdmin
      .from('project_access_grants')
      .insert({
        project_id: parsed.project_id,
        user_id: resolvedUserId,
        granted_by_user_id: currentUser.id,
      })
    if (error) throw error

    return NextResponse.json({
      success: true,
      project_id: parsed.project_id,
      user_id: resolvedUserId,
      identifier_type: identifierType,
    })
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

