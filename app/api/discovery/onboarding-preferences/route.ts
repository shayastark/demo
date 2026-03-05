import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import {
  parseOnboardingPreferencesPatch,
  toOnboardingPreferences,
} from '@/lib/onboardingPreferences'

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
      .from('user_onboarding_preferences')
      .select('preferred_genres, preferred_vibes, onboarding_completed_at, updated_at')
      .eq('user_id', currentUser.id)
      .maybeSingle()

    if (error) {
      console.error('Error loading onboarding preferences:', error)
      return NextResponse.json({ error: 'Failed to load onboarding preferences' }, { status: 500 })
    }

    return NextResponse.json({
      preferences: toOnboardingPreferences(row),
      updated_at: row?.updated_at || null,
    })
  } catch (error) {
    console.error('Error in onboarding preferences GET:', error)
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

    const parsed = parseOnboardingPreferencesPatch(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const payload: Record<string, unknown> = { user_id: currentUser.id }
    if (parsed.patch.preferred_genres) payload.preferred_genres = parsed.patch.preferred_genres
    if (parsed.patch.preferred_vibes) payload.preferred_vibes = parsed.patch.preferred_vibes
    if (parsed.patch.completed === true) payload.onboarding_completed_at = new Date().toISOString()
    if (parsed.patch.completed === false) payload.onboarding_completed_at = null

    const { data: row, error } = await supabaseAdmin
      .from('user_onboarding_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select('preferred_genres, preferred_vibes, onboarding_completed_at, updated_at')
      .single()

    if (error) {
      console.error('Error updating onboarding preferences:', error)
      return NextResponse.json({ error: 'Failed to update onboarding preferences' }, { status: 500 })
    }

    return NextResponse.json({
      preferences: toOnboardingPreferences(row),
      updated_at: row?.updated_at || null,
    })
  } catch (error) {
    console.error('Error in onboarding preferences PATCH:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
