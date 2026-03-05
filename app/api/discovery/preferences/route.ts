import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { parseDiscoveryPreferencePayload } from '@/lib/discoveryPreferences'

async function getAuthenticatedUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
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

    const { error } = await supabaseAdmin
      .from('user_discovery_preferences')
      .upsert(
        {
          user_id: user.id,
          target_type: parsed.target_type,
          target_id: parsed.target_id,
          preference: parsed.preference,
        },
        { onConflict: 'user_id,target_type,target_id,preference' }
      )
    if (error) {
      console.error('Error saving discovery preference:', error)
      return NextResponse.json({ error: 'Failed to save preference' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      target_type: parsed.target_type,
      target_id: parsed.target_id,
      preference: parsed.preference,
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
    })
  } catch (error) {
    console.error('Error in discovery preferences DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
