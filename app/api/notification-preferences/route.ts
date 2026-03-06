import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import {
  parseNotificationPreferencesResponse,
  parseNotificationPreferencesPatch,
  toNotificationPreferences,
} from '@/lib/notificationPreferences'

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

    const { data: row, error } = await supabaseAdmin
      .from('notification_preferences')
      .select(
        'notify_new_follower, notify_project_updates, notify_tips, notify_project_saved, delivery_mode, digest_window, updated_at'
      )
      .eq('user_id', currentUser.id)
      .maybeSingle()

    if (error) {
      console.error('Error loading notification preferences:', error)
      return NextResponse.json({ error: 'Failed to load notification preferences' }, { status: 500 })
    }

    const payload = {
      preferences: toNotificationPreferences(row),
      updated_at: row?.updated_at || null,
    }
    const parsed = parseNotificationPreferencesResponse(payload)
    if (!parsed.success || !parsed.preferences) {
      return NextResponse.json(
        { error: parsed.error || 'Failed to shape notification preferences response' },
        { status: 500 }
      )
    }
    return NextResponse.json({
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
          error: parsed.error || 'Invalid notification preferences update',
          code: 'INVALID_NOTIFICATION_PREFERENCES_PATCH',
        },
        { status: 400 }
      )
    }

    const { data: row, error } = await supabaseAdmin
      .from('notification_preferences')
      .upsert(
        {
          user_id: currentUser.id,
          ...parsed.updates,
        },
        { onConflict: 'user_id' }
      )
      .select(
        'notify_new_follower, notify_project_updates, notify_tips, notify_project_saved, delivery_mode, digest_window, updated_at'
      )
      .single()

    if (error) {
      console.error('Error updating notification preferences:', error)
      return NextResponse.json(
        {
          error: 'Failed to update notification preferences',
          code: 'NOTIFICATION_PREFERENCES_UPSERT_FAILED',
          details: error.message || null,
        },
        { status: 500 }
      )
    }

    const payload = {
      preferences: toNotificationPreferences(row),
      updated_at: row?.updated_at || null,
    }
    const responseParsed = parseNotificationPreferencesResponse(payload)
    if (!responseParsed.success || !responseParsed.preferences) {
      return NextResponse.json(
        {
          error: responseParsed.error || 'Invalid response after updating notification preferences',
          code: 'INVALID_NOTIFICATION_PREFERENCES_RESPONSE',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      preferences: responseParsed.preferences,
      updated_at: responseParsed.updated_at ?? null,
    })
  } catch (error) {
    console.error('Error in notification preferences PATCH:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

