import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { parseSnoozeDeleteBody, parseSnoozePostBody } from '@/lib/notificationSnooze'

async function getCurrentUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const includeExpired = searchParams.get('include_expired') === 'true'
    let query = supabaseAdmin
      .from('notification_snoozes')
      .select('scope_key, snoozed_until')
      .eq('user_id', currentUser.id)
      .order('snoozed_until', { ascending: false })

    if (!includeExpired) {
      query = query.gt('snoozed_until', new Date().toISOString())
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching notification snoozes:', error)
      return NextResponse.json({ error: 'Failed to fetch notification snoozes' }, { status: 500 })
    }

    return NextResponse.json({ snoozes: data || [] })
  } catch (error) {
    console.error('Error in notification snoozes GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = parseSnoozePostBody(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('notification_snoozes')
      .upsert(
        {
          user_id: currentUser.id,
          scope_key: parsed.scopeKey,
          snoozed_until: parsed.untilIso,
        },
        { onConflict: 'user_id,scope_key' }
      )
      .select('scope_key, snoozed_until')
      .single()

    if (error) {
      console.error('Error upserting notification snooze:', error)
      return NextResponse.json({ error: 'Failed to save snooze' }, { status: 500 })
    }

    return NextResponse.json({ snooze: data, duration: parsed.durationLabel })
  } catch (error) {
    console.error('Error in notification snoozes POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const parsed = parseSnoozeDeleteBody(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('notification_snoozes')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('scope_key', parsed.scopeKey)

    if (error) {
      console.error('Error deleting notification snooze:', error)
      return NextResponse.json({ error: 'Failed to delete snooze' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in notification snoozes DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
