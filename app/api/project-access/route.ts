import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import { notifyPrivateProjectAccessGranted } from '@/lib/notifications'
import { canManageProjectAccess } from '@/lib/projectAccessPolicyServer'
import {
  getProjectAccessGrantMutationAction,
  getProjectAccessIdentifierType,
  isProjectAccessRole,
  isProjectAccessGrantActive,
  isRedundantProjectAccessGrant,
  parseProjectAccessExpiryInput,
  parseProjectAccessGrantInput,
  resolveProjectAccessRole,
  resolveProjectAccessIdentifier,
} from '@/lib/projectAccess'

const PRIVATE_ACCESS_MIGRATIONS = [
  'supabase/add_project_access_grants_table.sql',
  'supabase/add_project_access_grants_expiry.sql',
  'supabase/add_project_access_grant_roles.sql',
] as const

type ProjectAccessSchemaSupport = {
  hasRole: boolean
  hasExpiresAt: boolean
  hasGrantedByUserId: boolean
  hasCreatedAt: boolean
}

type ProjectAccessSchemaDiagnostics = {
  criticalMissing: string[]
  optionalMissing: string[]
  missing: string[]
  suggestedMigrations: string[]
  support: ProjectAccessSchemaSupport
}

function getErrorCode(error: unknown): string | null {
  return typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code
    : null
}

function isMissingColumnError(error: unknown): boolean {
  const code = getErrorCode(error)
  return code === '42703' || code === 'PGRST204'
}

function isMissingTableError(error: unknown): boolean {
  const code = getErrorCode(error)
  return code === '42P01' || code === 'PGRST205'
}

function isSchemaMismatchError(error: unknown): boolean {
  return isMissingColumnError(error) || isMissingTableError(error)
}

async function probeColumn(args: {
  table: 'project_access_grants' | 'projects' | 'users'
  column: string
}): Promise<'present' | 'missing_column' | 'missing_table' | 'unknown_error'> {
  const { error } = await supabaseAdmin.from(args.table).select(args.column).limit(1)
  if (!error) return 'present'
  if (isMissingColumnError(error)) return 'missing_column'
  if (isMissingTableError(error)) return 'missing_table'
  return 'unknown_error'
}

function buildProjectAccessSchemaMismatchResponse(args: {
  diagnostics: ProjectAccessSchemaDiagnostics
  identifierType?: string
}): NextResponse {
  return NextResponse.json(
    {
      error: 'Migration required: private access schema is out of date in this environment.',
      code: 'schema_mismatch',
      identifier_type: args.identifierType || null,
      missing: args.diagnostics.missing,
      suggested_migrations: args.diagnostics.suggestedMigrations,
    },
    { status: 500 }
  )
}

async function collectProjectAccessSchemaDiagnostics(args: {
  identifierType?: string
}): Promise<ProjectAccessSchemaDiagnostics> {
  const criticalMissing: string[] = []
  const optionalMissing: string[] = []
  const suggested = new Set<string>()

  const support: ProjectAccessSchemaSupport = {
    hasRole: true,
    hasExpiresAt: true,
    hasGrantedByUserId: true,
    hasCreatedAt: true,
  }

  const pushMissing = (
    kind: 'critical' | 'optional',
    objectName: string,
    suggestedMigration?: string
  ) => {
    const target = kind === 'critical' ? criticalMissing : optionalMissing
    if (!target.includes(objectName)) target.push(objectName)
    if (suggestedMigration) suggested.add(suggestedMigration)
  }

  const projectIdState = await probeColumn({ table: 'projects', column: 'id' })
  if (projectIdState === 'missing_table') {
    pushMissing('critical', 'projects.table')
    pushMissing('critical', 'projects.id')
  } else if (projectIdState === 'missing_column') {
    pushMissing('critical', 'projects.id')
  }
  const projectCreatorState = await probeColumn({ table: 'projects', column: 'creator_id' })
  if (projectCreatorState === 'missing_table') {
    pushMissing('critical', 'projects.table')
    pushMissing('critical', 'projects.creator_id')
  } else if (projectCreatorState === 'missing_column') {
    pushMissing('critical', 'projects.creator_id')
  }
  const projectTitleState = await probeColumn({ table: 'projects', column: 'title' })
  if (projectTitleState === 'missing_column') {
    pushMissing('optional', 'projects.title')
  }

  const userIdState = await probeColumn({ table: 'users', column: 'id' })
  if (userIdState === 'missing_table') {
    pushMissing('critical', 'users.table')
    pushMissing('critical', 'users.id')
  } else if (userIdState === 'missing_column') {
    pushMissing('critical', 'users.id')
  }
  if (args.identifierType === 'username') {
    const usernameState = await probeColumn({ table: 'users', column: 'username' })
    if (usernameState === 'missing_table') {
      pushMissing('critical', 'users.table')
      pushMissing('critical', 'users.username')
    } else if (usernameState === 'missing_column') {
      pushMissing('critical', 'users.username')
    }
  }
  if (args.identifierType === 'email') {
    const emailState = await probeColumn({ table: 'users', column: 'email' })
    if (emailState === 'missing_table') {
      pushMissing('critical', 'users.table')
      pushMissing('critical', 'users.email')
    } else if (emailState === 'missing_column') {
      pushMissing('critical', 'users.email')
    }
  }

  const grantsIdState = await probeColumn({ table: 'project_access_grants', column: 'id' })
  if (grantsIdState === 'missing_table') {
    pushMissing('critical', 'project_access_grants.table', PRIVATE_ACCESS_MIGRATIONS[0])
    pushMissing('critical', 'project_access_grants.id', PRIVATE_ACCESS_MIGRATIONS[0])
  } else if (grantsIdState === 'missing_column') {
    pushMissing('critical', 'project_access_grants.id', PRIVATE_ACCESS_MIGRATIONS[0])
  }
  const grantsProjectState = await probeColumn({ table: 'project_access_grants', column: 'project_id' })
  if (grantsProjectState === 'missing_table') {
    pushMissing('critical', 'project_access_grants.table', PRIVATE_ACCESS_MIGRATIONS[0])
    pushMissing('critical', 'project_access_grants.project_id', PRIVATE_ACCESS_MIGRATIONS[0])
  } else if (grantsProjectState === 'missing_column') {
    pushMissing('critical', 'project_access_grants.project_id', PRIVATE_ACCESS_MIGRATIONS[0])
  }
  const grantsUserState = await probeColumn({ table: 'project_access_grants', column: 'user_id' })
  if (grantsUserState === 'missing_table') {
    pushMissing('critical', 'project_access_grants.table', PRIVATE_ACCESS_MIGRATIONS[0])
    pushMissing('critical', 'project_access_grants.user_id', PRIVATE_ACCESS_MIGRATIONS[0])
  } else if (grantsUserState === 'missing_column') {
    pushMissing('critical', 'project_access_grants.user_id', PRIVATE_ACCESS_MIGRATIONS[0])
  }

  const grantedByState = await probeColumn({ table: 'project_access_grants', column: 'granted_by_user_id' })
  if (grantedByState === 'missing_column') {
    support.hasGrantedByUserId = false
    pushMissing('optional', 'project_access_grants.granted_by_user_id', PRIVATE_ACCESS_MIGRATIONS[0])
  } else if (grantedByState === 'missing_table') {
    support.hasGrantedByUserId = false
    pushMissing('critical', 'project_access_grants.table', PRIVATE_ACCESS_MIGRATIONS[0])
  }

  const createdAtState = await probeColumn({ table: 'project_access_grants', column: 'created_at' })
  if (createdAtState === 'missing_column') {
    support.hasCreatedAt = false
    pushMissing('optional', 'project_access_grants.created_at', PRIVATE_ACCESS_MIGRATIONS[0])
  } else if (createdAtState === 'missing_table') {
    support.hasCreatedAt = false
    pushMissing('critical', 'project_access_grants.table', PRIVATE_ACCESS_MIGRATIONS[0])
  }

  const expiresAtState = await probeColumn({ table: 'project_access_grants', column: 'expires_at' })
  if (expiresAtState === 'missing_column') {
    support.hasExpiresAt = false
    pushMissing('optional', 'project_access_grants.expires_at', PRIVATE_ACCESS_MIGRATIONS[1])
  } else if (expiresAtState === 'missing_table') {
    support.hasExpiresAt = false
    pushMissing('critical', 'project_access_grants.table', PRIVATE_ACCESS_MIGRATIONS[0])
  }

  const roleState = await probeColumn({ table: 'project_access_grants', column: 'role' })
  if (roleState === 'missing_column') {
    support.hasRole = false
    pushMissing('optional', 'project_access_grants.role', PRIVATE_ACCESS_MIGRATIONS[2])
  } else if (roleState === 'missing_table') {
    support.hasRole = false
    pushMissing('critical', 'project_access_grants.table', PRIVATE_ACCESS_MIGRATIONS[0])
  }

  const missing = [...criticalMissing, ...optionalMissing]
  const suggestedMigrations = PRIVATE_ACCESS_MIGRATIONS.filter((filename) => suggested.has(filename))

  return { criticalMissing, optionalMissing, missing, suggestedMigrations, support }
}

async function getRequiredCurrentUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

async function getProject(projectId: string) {
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('id, creator_id, title')
    .eq('id', projectId)
    .single()
  if (!error) return project
  if (isMissingColumnError(error)) {
    const { data: fallbackProject, error: fallbackError } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id')
      .eq('id', projectId)
      .single()
    if (fallbackError) throw fallbackError
    return fallbackProject ? { ...fallbackProject, title: null } : null
  }
  throw error
}

async function loadUsersForProjectAccess(userIds: string[]) {
  if (!userIds.length) {
    return [] as Array<{ id: string; username: string | null; email: string | null; avatar_url: string | null }>
  }

  const full = await supabaseAdmin
    .from('users')
    .select('id, username, email, avatar_url')
    .in('id', userIds)
  if (!full.error) {
    return (full.data || []) as Array<{
      id: string
      username: string | null
      email: string | null
      avatar_url: string | null
    }>
  }

  if (!isMissingColumnError(full.error)) throw full.error

  const usernameEmail = await supabaseAdmin
    .from('users')
    .select('id, username, email')
    .in('id', userIds)
  if (!usernameEmail.error) {
    return ((usernameEmail.data || []) as Array<{
      id: string
      username: string | null
      email: string | null
    }>).map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_url: null,
    }))
  }
  if (!isMissingColumnError(usernameEmail.error)) throw usernameEmail.error

  const usernameOnly = await supabaseAdmin
    .from('users')
    .select('id, username')
    .in('id', userIds)
  if (!usernameOnly.error) {
    return ((usernameOnly.data || []) as Array<{ id: string; username: string | null }>).map((user) => ({
      id: user.id,
      username: user.username,
      email: null,
      avatar_url: null,
    }))
  }
  if (!isMissingColumnError(usernameOnly.error)) throw usernameOnly.error

  const emailOnly = await supabaseAdmin
    .from('users')
    .select('id, email')
    .in('id', userIds)
  if (!emailOnly.error) {
    return ((emailOnly.data || []) as Array<{ id: string; email: string | null }>).map((user) => ({
      id: user.id,
      username: null,
      email: user.email,
      avatar_url: null,
    }))
  }
  if (!isMissingColumnError(emailOnly.error)) throw emailOnly.error

  const idsOnly = await supabaseAdmin.from('users').select('id').in('id', userIds)
  if (idsOnly.error) throw idsOnly.error
  return ((idsOnly.data || []) as Array<{ id: string }>).map((user) => ({
    id: user.id,
    username: null,
    email: null,
    avatar_url: null,
  }))
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

function mapProjectAccessKnownError(
  error: unknown,
  context: { identifierType?: string } = {}
): { status: number; body: Record<string, unknown> } | null {
  const code = getErrorCode(error)
  const message =
    typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message
      : null

  if (code === '23505') {
    return {
      status: 409,
      body: {
        error: 'User already has project access',
        code: 'already_granted',
        identifier_type: context.identifierType || null,
      },
    }
  }

  if (code === '22P02') {
    return {
      status: 400,
      body: {
        error: 'Identifier is invalid',
        code: 'invalid_identifier',
        identifier_type: context.identifierType || null,
      },
    }
  }

  if (message && /multiple/i.test(message) && /row/i.test(message)) {
    return {
      status: 409,
      body: {
        error: 'Identifier matches multiple users',
        code: 'ambiguous_match',
        identifier_type: context.identifierType || null,
      },
    }
  }

  return null
}

function parseGrantUpdateInput(value: unknown): { project_id: string; user_id: string } | null {
  if (!value || typeof value !== 'object') return null
  const projectId = (value as Record<string, unknown>).project_id
  const userId = (value as Record<string, unknown>).user_id
  if (typeof projectId !== 'string' || !isValidUUID(projectId)) return null
  if (typeof userId !== 'string' || !isValidUUID(userId)) return null
  return { project_id: projectId, user_id: userId }
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
    const canManage = await canManageProjectAccess({
      userId: currentUser.id,
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: null,
        sharing_enabled: null,
      },
    })
    if (!canManage) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const schemaDiagnostics = await collectProjectAccessSchemaDiagnostics({})
    if (schemaDiagnostics.criticalMissing.length > 0) {
      return buildProjectAccessSchemaMismatchResponse({ diagnostics: schemaDiagnostics })
    }

    const grantSelectFields = ['id', 'project_id', 'user_id']
    if (schemaDiagnostics.support.hasGrantedByUserId) grantSelectFields.push('granted_by_user_id')
    if (schemaDiagnostics.support.hasCreatedAt) grantSelectFields.push('created_at')
    if (schemaDiagnostics.support.hasExpiresAt) grantSelectFields.push('expires_at')
    if (schemaDiagnostics.support.hasRole) grantSelectFields.push('role')

    const grantsQuery =
      schemaDiagnostics.support.hasCreatedAt
        ? (await supabaseAdmin
            .from('project_access_grants')
            .select(grantSelectFields.join(', '))
            .eq('project_id', projectId)
            .order('created_at', { ascending: false }))
        : (await supabaseAdmin
            .from('project_access_grants')
            .select(grantSelectFields.join(', '))
            .eq('project_id', projectId))

    const grantsData = grantsQuery.data
    const grantsError = grantsQuery.error

    if (grantsError) throw grantsError

    const grants = ((grantsData || []) as unknown) as Array<{
      id: string
      project_id: string
      user_id: string
      granted_by_user_id?: string | null
      created_at?: string | null
      expires_at?: string | null
      role?: string | null
    }>
    const userIds = Array.from(new Set(grants.map((grant) => grant.user_id)))
    const users = await loadUsersForProjectAccess(userIds)

    const usersById = (users || []).reduce<
      Record<string, { username: string | null; email: string | null; avatar_url: string | null }>
    >((acc, user) => {
        acc[user.id] = {
          username: user.username,
          email: user.email,
          avatar_url: user.avatar_url,
        }
        return acc
      },
      {}
    )

    return NextResponse.json({
      grants: grants.map((grant) => ({
        ...grant,
        username: usersById[grant.user_id]?.username || null,
        email: usersById[grant.user_id]?.email || null,
        avatar_url: usersById[grant.user_id]?.avatar_url || null,
        is_expired: schemaDiagnostics.support.hasExpiresAt
          ? !isProjectAccessGrantActive((grant as { expires_at?: string | null }).expires_at || null)
          : false,
        role: schemaDiagnostics.support.hasRole
          ? resolveProjectAccessRole((grant as { role?: unknown }).role)
          : 'viewer',
      })),
    })
  } catch (error) {
    console.error('Error in project access GET:', error)
    if (isSchemaMismatchError(error)) {
      const schemaDiagnostics = await collectProjectAccessSchemaDiagnostics({})
      return buildProjectAccessSchemaMismatchResponse({ diagnostics: schemaDiagnostics })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  let identifierTypeForError: string | undefined
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
    identifierTypeForError = parsed.identifier_type

    const schemaDiagnostics = await collectProjectAccessSchemaDiagnostics({
      identifierType: parsed.identifier_type,
    })
    if (schemaDiagnostics.criticalMissing.length > 0) {
      return buildProjectAccessSchemaMismatchResponse({
        diagnostics: schemaDiagnostics,
        identifierType: parsed.identifier_type,
      })
    }

    const project = await getProject(parsed.project_id)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canManage = await canManageProjectAccess({
      userId: currentUser.id,
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: null,
        sharing_enabled: null,
      },
    })
    if (!canManage) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const identifierResult = await resolveTargetUserIdByIdentifier(parsed.identifier)
    const { identifierType, resolution } = identifierResult
    identifierTypeForError = identifierType
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

    const expiryResult = parseProjectAccessExpiryInput({ body })
    if (!expiryResult.ok) {
      return NextResponse.json(
        { error: expiryResult.error, code: 'invalid_expiry', identifier_type: identifierType },
        { status: 400 }
      )
    }
    const rawRole = (body as Record<string, unknown>)?.role
    if (rawRole !== undefined && !isProjectAccessRole(rawRole)) {
      return NextResponse.json(
        { error: 'role must be one of: viewer, commenter, contributor', code: 'invalid_role' },
        { status: 400 }
      )
    }
    const targetRole = resolveProjectAccessRole(rawRole)

    const existingGrantSelectFields = ['id']
    if (schemaDiagnostics.support.hasExpiresAt) existingGrantSelectFields.push('expires_at')
    if (schemaDiagnostics.support.hasRole) existingGrantSelectFields.push('role')
    if (schemaDiagnostics.support.hasCreatedAt) existingGrantSelectFields.push('created_at')

    const existingGrantQuery =
      schemaDiagnostics.support.hasCreatedAt
        ? (await supabaseAdmin
            .from('project_access_grants')
            .select(existingGrantSelectFields.join(', '))
            .eq('project_id', parsed.project_id)
            .eq('user_id', resolvedUserId)
            .order('created_at', { ascending: false })
            .limit(2))
        : (await supabaseAdmin
            .from('project_access_grants')
            .select(existingGrantSelectFields.join(', '))
            .eq('project_id', parsed.project_id)
            .eq('user_id', resolvedUserId)
            .limit(2))
    const existingGrantRows = (existingGrantQuery.data as unknown) as Array<{
      id: string
      expires_at?: string | null
      role?: string | null
      created_at?: string | null
    }> | null
    const existingGrantError = existingGrantQuery.error
    if (existingGrantError) throw existingGrantError
    const existingGrant = Array.isArray(existingGrantRows) && existingGrantRows.length > 0 ? existingGrantRows[0] : null
    if (Array.isArray(existingGrantRows) && existingGrantRows.length > 1) {
      console.warn('Multiple project access grants found for same project/user pair', {
        project_id: parsed.project_id,
        user_id: resolvedUserId,
        duplicate_count: existingGrantRows.length,
      })
    }

    const mutationAction = getProjectAccessGrantMutationAction({
      hasExistingGrant: !!existingGrant,
      existingExpiresAt: schemaDiagnostics.support.hasExpiresAt
        ? existingGrant?.expires_at || null
        : null,
      nextExpiresAt: schemaDiagnostics.support.hasExpiresAt
        ? expiryResult.expiresAt
        : null,
    })
    const roleChanged =
      schemaDiagnostics.support.hasRole &&
      !!existingGrant &&
      resolveProjectAccessRole(existingGrant.role) !== targetRole

    if (mutationAction === 'unchanged' && !roleChanged) {
      return NextResponse.json(
        {
          error: 'User already has project access',
          code: 'already_granted',
          identifier_type: identifierType,
        },
        { status: 409 }
      )
    }

    if (mutationAction === 'create') {
      const insertPayload: Record<string, unknown> = {
        project_id: parsed.project_id,
        user_id: resolvedUserId,
      }
      if (schemaDiagnostics.support.hasGrantedByUserId) {
        insertPayload.granted_by_user_id = currentUser.id
      }
      if (schemaDiagnostics.support.hasExpiresAt) {
        insertPayload.expires_at = expiryResult.expiresAt
      }
      if (schemaDiagnostics.support.hasRole) {
        insertPayload.role = targetRole
      }
      const { error } = await supabaseAdmin
        .from('project_access_grants')
        .insert(insertPayload)
      if (error) throw error
    } else if (mutationAction === 'renew' || roleChanged) {
      const updatePayload: Record<string, unknown> = {}
      if (schemaDiagnostics.support.hasGrantedByUserId) {
        updatePayload.granted_by_user_id = currentUser.id
      }
      if (schemaDiagnostics.support.hasExpiresAt) {
        updatePayload.expires_at = expiryResult.expiresAt
      }
      if (schemaDiagnostics.support.hasRole) {
        updatePayload.role = targetRole
      }
      const { error } = await supabaseAdmin
        .from('project_access_grants')
        .update(updatePayload)
        .eq('project_id', parsed.project_id)
        .eq('user_id', resolvedUserId)
      if (error) throw error
    }

    let notificationResult:
      | {
          action: 'created' | 'skipped_self' | 'skipped_preference'
          notification_type: string
        }
      | null = null
    try {
      const grantedByName =
        (typeof currentUser.username === 'string' && currentUser.username.trim()) ||
        (typeof currentUser.email === 'string' && currentUser.email.trim()) ||
        null
      if (mutationAction !== 'unchanged' || roleChanged) {
        const result = await notifyPrivateProjectAccessGranted({
          recipientUserId: resolvedUserId,
          grantedByUserId: currentUser.id,
          grantedByName,
          projectId: parsed.project_id,
          projectTitle: typeof project.title === 'string' ? project.title : null,
        })
        notificationResult = {
          action: result.action,
          notification_type: result.notification_type,
        }
      }
    } catch (notificationError) {
      console.error('Failed to create project access invite notification:', notificationError)
    }

    return NextResponse.json({
      success: true,
      project_id: parsed.project_id,
      user_id: resolvedUserId,
      expires_at: schemaDiagnostics.support.hasExpiresAt ? expiryResult.expiresAt : null,
      grant_action: mutationAction === 'unchanged' && roleChanged ? 'renew' : mutationAction,
      role: schemaDiagnostics.support.hasRole ? targetRole : 'viewer',
      identifier_type: identifierType,
      compatibility: {
        degraded_optional_columns: schemaDiagnostics.optionalMissing,
      },
      notification: notificationResult,
    })
  } catch (error) {
    console.error('Error in project access POST:', error)
    if (isSchemaMismatchError(error)) {
      const schemaDiagnostics = await collectProjectAccessSchemaDiagnostics({
        identifierType: identifierTypeForError,
      })
      return buildProjectAccessSchemaMismatchResponse({
        diagnostics: schemaDiagnostics,
        identifierType: identifierTypeForError,
      })
    }
    const mapped = mapProjectAccessKnownError(error, { identifierType: identifierTypeForError })
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = parseGrantUpdateInput(body)
    if (!parsed) {
      return NextResponse.json({ error: 'Valid project_id and user_id are required' }, { status: 400 })
    }

    const project = await getProject(parsed.project_id)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canManage = await canManageProjectAccess({
      userId: currentUser.id,
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: null,
        sharing_enabled: null,
      },
    })
    if (!canManage) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const rawRole = (body as Record<string, unknown>)?.role
    if (rawRole !== undefined && !isProjectAccessRole(rawRole)) {
      return NextResponse.json(
        { error: 'role must be one of: viewer, commenter, contributor', code: 'invalid_role' },
        { status: 400 }
      )
    }
    const hasExpiryInput =
      (body as Record<string, unknown>)?.expires_at !== undefined ||
      (body as Record<string, unknown>)?.expires_in_hours !== undefined
    const expiryResult = parseProjectAccessExpiryInput({ body, requireProvided: false })
    if (!expiryResult.ok) {
      return NextResponse.json({ error: expiryResult.error, code: 'invalid_expiry' }, { status: 400 })
    }
    if (!hasExpiryInput && rawRole === undefined) {
      return NextResponse.json(
        { error: 'Provide role and/or expiry fields to update' },
        { status: 400 }
      )
    }
    const targetRole = rawRole === undefined ? null : resolveProjectAccessRole(rawRole)

    const { data: existingGrant, error: existingGrantError } = await supabaseAdmin
      .from('project_access_grants')
      .select('id, expires_at, role')
      .eq('project_id', parsed.project_id)
      .eq('user_id', parsed.user_id)
      .maybeSingle()
    if (existingGrantError) throw existingGrantError
    if (!existingGrant) {
      return NextResponse.json({ error: 'Grant not found', code: 'grant_not_found' }, { status: 404 })
    }

    const mutationAction = getProjectAccessGrantMutationAction({
      hasExistingGrant: true,
      existingExpiresAt: existingGrant.expires_at || null,
      nextExpiresAt: hasExpiryInput ? expiryResult.expiresAt : existingGrant.expires_at || null,
    })
    const roleChanged =
      targetRole !== null && resolveProjectAccessRole(existingGrant.role) !== targetRole

    if (mutationAction !== 'unchanged' || roleChanged) {
      const updates: Record<string, unknown> = {
        granted_by_user_id: currentUser.id,
      }
      if (hasExpiryInput) updates.expires_at = expiryResult.expiresAt
      if (targetRole !== null) updates.role = targetRole
      const { error: updateError } = await supabaseAdmin
        .from('project_access_grants')
        .update(updates)
        .eq('project_id', parsed.project_id)
        .eq('user_id', parsed.user_id)
      if (updateError) throw updateError
    }

    let notificationResult:
      | {
          action: 'created' | 'skipped_self' | 'skipped_preference'
          notification_type: string
        }
      | null = null
    if (mutationAction === 'renew') {
      try {
        const grantedByName =
          (typeof currentUser.username === 'string' && currentUser.username.trim()) ||
          (typeof currentUser.email === 'string' && currentUser.email.trim()) ||
          null
        const result = await notifyPrivateProjectAccessGranted({
          recipientUserId: parsed.user_id,
          grantedByUserId: currentUser.id,
          grantedByName,
          projectId: parsed.project_id,
          projectTitle: typeof project.title === 'string' ? project.title : null,
        })
        notificationResult = {
          action: result.action,
          notification_type: result.notification_type,
        }
      } catch (notificationError) {
        console.error('Failed to create project access renewal notification:', notificationError)
      }
    }

    return NextResponse.json({
      success: true,
      project_id: parsed.project_id,
      user_id: parsed.user_id,
      expires_at: hasExpiryInput ? expiryResult.expiresAt : existingGrant.expires_at || null,
      grant_action: mutationAction === 'unchanged' && roleChanged ? 'renew' : mutationAction,
      role: targetRole ?? resolveProjectAccessRole(existingGrant.role),
      notification: notificationResult,
    })
  } catch (error) {
    console.error('Error in project access PATCH:', error)
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
    const canManage = await canManageProjectAccess({
      userId: currentUser.id,
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: null,
        sharing_enabled: null,
      },
    })
    if (!canManage) {
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

