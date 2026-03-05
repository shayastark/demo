import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import {
  buildNotificationDigestGroups,
  getNotificationDigestWindowSinceIso,
  paginateNotificationDigestGroups,
  parseNotificationDigestQuery,
} from '@/lib/notificationDigest'
import { toNotificationPreferences } from '@/lib/notificationPreferences'

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

    const { data: prefRow } = await supabaseAdmin
      .from('notification_preferences')
      .select('delivery_mode, digest_window')
      .eq('user_id', currentUser.id)
      .maybeSingle()
    const preferences = toNotificationPreferences(prefRow)

    const { searchParams } = new URL(request.url)
    const parsed = parseNotificationDigestQuery({
      rawWindow: searchParams.get('window'),
      rawLimit: searchParams.get('limit'),
      rawOffset: searchParams.get('offset'),
      defaultWindow: preferences.digest_window,
    })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const sinceIso = getNotificationDigestWindowSinceIso(parsed.window)
    const scanLimit = Math.min(parsed.limit * 6 + parsed.offset, 400)
    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select('id, type, title, message, data, is_read, created_at')
      .eq('user_id', currentUser.id)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(scanLimit)

    if (error) {
      console.error('Error loading notification digest rows:', error)
      return NextResponse.json({ error: 'Failed to load notification digest' }, { status: 500 })
    }

    const groups = buildNotificationDigestGroups({
      notifications: (notifications || []).map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        data: row.data as Record<string, unknown> | null,
        is_read: !!row.is_read,
        created_at: row.created_at,
      })),
    })
    const paged = paginateNotificationDigestGroups({
      groups,
      limit: parsed.limit,
      offset: parsed.offset,
    })

    return NextResponse.json({
      ...paged,
      window: parsed.window,
      delivery_mode: preferences.delivery_mode,
    })
  } catch (error) {
    console.error('Error in notifications digest API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
