import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserByPrivyId, verifyPrivyToken } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'

const QUALIFIED_PLAY_SECONDS = 14
const PLAY_COOLDOWN_MINUTES = 30
const PLAY_COOLDOWN_MS = PLAY_COOLDOWN_MINUTES * 60 * 1000

async function resolveOptionalCurrentUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const authResult = await verifyPrivyToken(authHeader)
  if (!authResult.success || !authResult.privyId) return null

  return getUserByPrivyId(authResult.privyId)
}

function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim()
    if (firstIp) return firstIp
  }

  const realIp = request.headers.get('x-real-ip')?.trim()
  return realIp || null
}

function buildListenerFingerprint(request: NextRequest): string {
  const ip = getClientIp(request) || 'unknown-ip'
  const userAgent = request.headers.get('user-agent') || 'unknown-ua'
  return createHash('sha256').update(`${ip}|${userAgent}`).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const trackId = typeof body?.track_id === 'string' ? body.track_id : null
    const listenedSeconds =
      typeof body?.listened_seconds === 'number' && Number.isFinite(body.listened_seconds)
        ? body.listened_seconds
        : 0

    if (!trackId || !isValidUUID(trackId)) {
      return NextResponse.json({ error: 'Valid track_id is required' }, { status: 400 })
    }

    if (listenedSeconds < QUALIFIED_PLAY_SECONDS) {
      return NextResponse.json(
        { error: `Qualified plays require at least ${QUALIFIED_PLAY_SECONDS} seconds of listening` },
        { status: 400 }
      )
    }

    const currentUser = await resolveOptionalCurrentUser(request)
    const listenerFingerprint = currentUser ? null : buildListenerFingerprint(request)

    const { data: track, error: trackError } = await supabaseAdmin
      .from('tracks')
      .select('id, project_id')
      .eq('id', trackId)
      .maybeSingle()

    if (trackError) {
      console.error('Error loading track for qualified play:', trackError)
      return NextResponse.json({ error: 'Failed to load track' }, { status: 500 })
    }

    if (!track?.project_id) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    const sinceIso = new Date(Date.now() - PLAY_COOLDOWN_MS).toISOString()

    let recentPlayQuery = supabaseAdmin
      .from('track_plays')
      .select('id, played_at')
      .eq('track_id', trackId)
      .gte('played_at', sinceIso)
      .order('played_at', { ascending: false })
      .limit(1)

    if (currentUser?.id) {
      recentPlayQuery = recentPlayQuery.eq('user_id', currentUser.id)
    } else {
      recentPlayQuery = recentPlayQuery.eq('listener_fingerprint', listenerFingerprint)
    }

    const { data: recentPlays, error: recentPlayError } = await recentPlayQuery

    if (recentPlayError) {
      console.error('Error checking qualified play cooldown:', recentPlayError)
      return NextResponse.json({ error: 'Failed to validate play cooldown' }, { status: 500 })
    }

    if ((recentPlays || []).length > 0) {
      return NextResponse.json({
        success: true,
        counted: false,
        reason: 'cooldown',
        cooldown_minutes: PLAY_COOLDOWN_MINUTES,
      })
    }

    const { error: playInsertError } = await supabaseAdmin.from('track_plays').insert({
      track_id: trackId,
      user_id: currentUser?.id || null,
      ip_address: getClientIp(request),
      listener_fingerprint: listenerFingerprint,
    })

    if (playInsertError) {
      console.error('Error inserting qualified play:', playInsertError)
      return NextResponse.json({ error: 'Failed to record qualified play' }, { status: 500 })
    }

    const { error: metricError } = await supabaseAdmin.rpc('increment_metric', {
      p_project_id: track.project_id,
      p_field: 'plays',
    })

    if (metricError) {
      console.error('Error incrementing qualified play metric:', metricError)
      return NextResponse.json({ error: 'Failed to update play metric' }, { status: 500 })
    }

    const { data: metrics, error: metricsReadError } = await supabaseAdmin
      .from('project_metrics')
      .select('*')
      .eq('project_id', track.project_id)
      .single()

    if (metricsReadError) {
      console.error('Error reading updated project metrics:', metricsReadError)
    }

    return NextResponse.json({
      success: true,
      counted: true,
      cooldown_minutes: PLAY_COOLDOWN_MINUTES,
      metrics: metrics || null,
    })
  } catch (error) {
    console.error('Error tracking qualified play:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
