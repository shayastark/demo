import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { buildPaginatedItems } from '@/lib/pagination'
import {
  buildHiddenDiscoveryItems,
  parseDiscoveryPreferencePayload,
  parseDiscoveryPreferencesListQuery,
  type DiscoveryPreferenceListRow,
} from '@/lib/discoveryPreferences'

function isMissingReasonCodeColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = String((error as { message?: string }).message || '')
  return /reason_code/i.test(message) && /(column|schema cache)/i.test(message)
}

async function supportsReasonCodeColumn(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('user_discovery_preferences')
    .select('reason_code')
    .limit(1)
  return !isMissingReasonCodeColumn(error)
}

async function getAuthenticatedUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = parseDiscoveryPreferencesListQuery({
      rawPreference: searchParams.get('preference'),
      rawTargetType: searchParams.get('target_type'),
      rawLimit: searchParams.get('limit'),
      rawOffset: searchParams.get('offset'),
    })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    let query = supabaseAdmin
      .from('user_discovery_preferences')
      .select('target_type, target_id, reason_code, created_at')
      .eq('user_id', user.id)
      .eq('preference', parsed.preference)
      .order('created_at', { ascending: false })
      .range(parsed.offset, parsed.offset + parsed.limit)

    if (parsed.target_type) {
      query = query.eq('target_type', parsed.target_type)
    }

    let preferenceRows: Array<Record<string, unknown>> | null = null
    let error: unknown = null
    {
      const initialResult = await query
      preferenceRows = (initialResult.data as Array<Record<string, unknown>> | null) || null
      error = initialResult.error
    }
    if (isMissingReasonCodeColumn(error)) {
      let fallbackQuery = supabaseAdmin
        .from('user_discovery_preferences')
        .select('target_type, target_id, created_at')
        .eq('user_id', user.id)
        .eq('preference', parsed.preference)
        .order('created_at', { ascending: false })
        .range(parsed.offset, parsed.offset + parsed.limit)
      if (parsed.target_type) {
        fallbackQuery = fallbackQuery.eq('target_type', parsed.target_type)
      }
      const fallbackResult = await fallbackQuery
      preferenceRows = (fallbackResult.data as Array<Record<string, unknown>> | null) || null
      error = fallbackResult.error
    }
    if (error) {
      console.error('Error loading discovery preferences:', error)
      return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 })
    }

    const rows = ((preferenceRows || []) as DiscoveryPreferenceListRow[]).map((row) => ({
      ...row,
      reason_code: row.reason_code || null,
    }))
    const creatorIds = Array.from(
      new Set(rows.filter((row) => row.target_type === 'creator').map((row) => row.target_id))
    )
    const projectIds = Array.from(
      new Set(rows.filter((row) => row.target_type === 'project').map((row) => row.target_id))
    )

    const [creatorsResult, projectsResult] = await Promise.all([
      creatorIds.length
        ? supabaseAdmin
            .from('users')
            .select('id, username, email, avatar_url')
            .in('id', creatorIds)
        : Promise.resolve({ data: [], error: null }),
      projectIds.length
        ? supabaseAdmin
            .from('projects')
            .select('id, title, cover_image_url')
            .in('id', projectIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (creatorsResult.error || projectsResult.error) {
      console.error('Error hydrating discovery preference metadata:', creatorsResult.error || projectsResult.error)
      return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 })
    }

    const creatorsById = (creatorsResult.data || []).reduce<
      Record<string, { id: string; username: string | null; email: string | null; avatar_url: string | null }>
    >((acc, creator) => {
      acc[creator.id] = {
        id: creator.id,
        username: creator.username || null,
        email: creator.email || null,
        avatar_url: creator.avatar_url || null,
      }
      return acc
    }, {})

    const projectsById = (projectsResult.data || []).reduce<
      Record<string, { id: string; title: string | null; cover_image_url: string | null }>
    >((acc, project) => {
      acc[project.id] = {
        id: project.id,
        title: project.title || null,
        cover_image_url: project.cover_image_url || null,
      }
      return acc
    }, {})

    const shapedItems = buildHiddenDiscoveryItems({
      rows,
      creatorsById,
      projectsById,
    })

    const paged = buildPaginatedItems({
      rows: shapedItems,
      limit: parsed.limit,
      offset: parsed.offset,
    })

    return NextResponse.json(paged)
  } catch (error) {
    console.error('Error in discovery preferences GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = parseDiscoveryPreferencePayload(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      user_id: user.id,
      target_type: parsed.target_type,
      target_id: parsed.target_id,
      preference: parsed.preference,
    }
    if (await supportsReasonCodeColumn()) {
      payload.reason_code = parsed.reason_code
    }

    const { error } = await supabaseAdmin
      .from('user_discovery_preferences')
      .upsert(payload, { onConflict: 'user_id,target_type,target_id,preference' })
    if (error) {
      console.error('Error saving discovery preference:', error)
      return NextResponse.json({ error: 'Failed to save preference' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      target_type: parsed.target_type,
      target_id: parsed.target_id,
      preference: parsed.preference,
      reason_code: parsed.reason_code,
    })
  } catch (error) {
    console.error('Error in discovery preferences POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = parseDiscoveryPreferencePayload(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('user_discovery_preferences')
      .delete()
      .eq('user_id', user.id)
      .eq('target_type', parsed.target_type)
      .eq('target_id', parsed.target_id)
      .eq('preference', parsed.preference)

    if (error) {
      console.error('Error deleting discovery preference:', error)
      return NextResponse.json({ error: 'Failed to delete preference' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      target_type: parsed.target_type,
      target_id: parsed.target_id,
      preference: parsed.preference,
      reason_code: parsed.reason_code,
    })
  } catch (error) {
    console.error('Error in discovery preferences DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
