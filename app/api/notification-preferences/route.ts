import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import {
  parseNotificationPreferencesResponse,
  parseNotificationPreferencesPatch,
  type NotificationPreferences,
  toNotificationPreferences,
} from '@/lib/notificationPreferences'

async function getCurrentUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

async function readNotificationPreferencesRow(userId: string) {
  return supabaseAdmin
    .from('notification_preferences')
    .select(
      'notify_new_follower, notify_project_updates, notify_tips, notify_project_saved, delivery_mode, digest_window, updated_at'
    )
    .eq('user_id', userId)
    .maybeSingle()
}

function buildNotificationPreferencesResponse(row: Record<string, unknown> | null | undefined) {
  const payload = {
    success: true,
    preferences: toNotificationPreferences(row as Partial<NotificationPreferences> | null),
    updated_at: typeof row?.updated_at === 'string' ? row.updated_at : null,
  }
  return parseNotificationPreferencesResponse(payload)
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: row, error } = await readNotificationPreferencesRow(currentUser.id)

    if (error) {
      console.error('Error loading notification preferences:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to load notification preferences' },
        { status: 500 }
      )
    }

    const parsed = buildNotificationPreferencesResponse(row)
    if (!parsed.success || !parsed.preferences) {
      return NextResponse.json(
        { success: false, error: parsed.error || 'Failed to shape notification preferences response' },
        { status: 500 }
      )
    }
    return NextResponse.json({
      success: true,
      preferences: parsed.preferences,
      updated_at: parsed.updated_at ?? null,
    })
  } catch (error) {
    console.error('Error in notification preferences GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
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

    const parsed = parseNotificationPreferencesPatch(body)
    if (!parsed.success || !parsed.updates) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error || 'Invalid notification preferences update',
          code: 'INVALID_NOTIFICATION_PREFERENCES_PATCH',
        },
        { status: 400 }
      )
    }

    const { data: existingRow, error: existingError } = await supabaseAdmin
      .from('notification_preferences')
      .select(
        'notify_new_follower, notify_project_updates, notify_tips, notify_project_saved, delivery_mode, digest_window'
      )
      .eq('user_id', currentUser.id)
      .maybeSingle()

    if (existingError) {
      console.error('Error reading existing notification preferences:', existingError)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update notification preferences',
          code: 'NOTIFICATION_PREFERENCES_READ_FAILED',
          details: existingError.message || null,
        },
        { status: 500 }
      )
    }

    const mergedUpdates = {
      ...toNotificationPreferences(existingRow || null),
      ...parsed.updates,
    }

    const { error } = await supabaseAdmin
      .from('notification_preferences')
      .upsert(
        {
          user_id: currentUser.id,
          ...mergedUpdates,
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('Error updating notification preferences:', error)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update notification preferences',
          code: 'NOTIFICATION_PREFERENCES_UPSERT_FAILED',
          details: error.message || null,
        },
        { status: 500 }
      )
    }

    // Re-read the row after write so the client always receives the
    // canonical persisted state rather than relying on upsert return shapes.
    const { data: persistedRow, error: persistedError } = await readNotificationPreferencesRow(currentUser.id)
    if (persistedError) {
      console.error('Error reloading notification preferences after update:', persistedError)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to confirm updated notification preferences',
          code: 'NOTIFICATION_PREFERENCES_CONFIRM_FAILED',
          details: persistedError.message || null,
        },
        { status: 500 }
      )
    }

    const responseParsed = buildNotificationPreferencesResponse(persistedRow)
    if (!responseParsed.success || !responseParsed.preferences) {
      return NextResponse.json(
        {
          success: false,
          error: responseParsed.error || 'Invalid response after updating notification preferences',
          code: 'INVALID_NOTIFICATION_PREFERENCES_RESPONSE',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      preferences: responseParsed.preferences,
      updated_at: responseParsed.updated_at ?? null,
    })
  } catch (error) {
    console.error('Error in notification preferences PATCH:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

