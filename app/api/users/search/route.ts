import { NextRequest, NextResponse } from 'next/server'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mapUserSearchRows, parseUserSearchQuery } from '@/lib/userSearch'

async function getRequiredCurrentUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getRequiredCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = parseUserSearchQuery({
      rawQuery: searchParams.get('q'),
      rawLimit: searchParams.get('limit'),
    })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, username, avatar_url')
      .neq('id', currentUser.id)
      .ilike('username', `%${parsed.query}%`)
      .limit(parsed.limit)

    if (error) throw error

    return NextResponse.json({
      users: mapUserSearchRows((data || []) as Array<{ id: string; username: string | null; avatar_url: string | null }>),
    })
  } catch (error) {
    console.error('Error in user search GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
