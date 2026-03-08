import { NextRequest, NextResponse } from 'next/server'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sanitizeText, isValidUUID } from '@/lib/validation'
import { resolveProjectVisibility } from '@/lib/projectVisibility'
import { isAvailabilityStatus, sanitizeProfileTags } from '@/lib/profileCustomization'

// GET /api/user - Get current user's profile
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserByPrivyId(authResult.privyId)
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error getting user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/user - Create or get user (called on login)
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { email } = body

    // Check if user already exists
    let { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('privy_id', authResult.privyId)
      .single()

    if (existingUser) {
      return NextResponse.json({ user: existingUser })
    }

    // Create new user
    const { data: newUser, error } = await supabaseAdmin
      .from('users')
      .insert({
        privy_id: authResult.privyId,
        email: email || null,
      })
      .select('*')
      .single()

    if (error) {
      console.error('Error creating user:', error)
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    return NextResponse.json({ user: newUser }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/user - Update current user's profile
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserByPrivyId(authResult.privyId)
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    
    // Field max lengths for sanitization
    const fieldLimits: Record<string, number> = {
      username: 50,
      display_name: 80,
      bio: 500,
      contact_email: 254,
      website: 500,
      instagram: 100,
      twitter: 100,
      farcaster: 100,
      youtube_url: 500,
      tiktok_url: 500,
      spotify_url: 500,
      discord_url: 500,
      other_link_url: 500,
      avatar_url: 1000,
      banner_image_url: 1000,
      availability_status: 50,
      wallet_address: 42,
    }

    const allowedFields = [...Object.keys(fieldLimits), 'profile_tags', 'pinned_project_id']
    
    const updates: Record<string, unknown> = {}
    
    for (const field of allowedFields) {
      if (field in body) {
        // Validate wallet address format if provided
        if (field === 'wallet_address' && body[field]) {
          const address = String(body[field]).trim()
          if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return NextResponse.json(
              { error: 'Invalid Ethereum wallet address' },
              { status: 400 }
            )
          }
          updates[field] = address || null
        } else if (field === 'profile_tags') {
          const tags = sanitizeProfileTags(body[field])
          if (tags === null) {
            return NextResponse.json({ error: 'profile_tags must be an array of supported tags' }, { status: 400 })
          }
          updates[field] = tags.length > 0 ? tags : null
        } else if (field === 'pinned_project_id') {
          if (body[field] === null || body[field] === '') {
            updates[field] = null
          } else if (typeof body[field] !== 'string' || !isValidUUID(body[field])) {
            return NextResponse.json({ error: 'Pinned project must be a valid project id' }, { status: 400 })
          } else {
            updates[field] = body[field]
          }
        } else if (field === 'availability_status') {
          const value = sanitizeText(body[field], fieldLimits[field])
          if (value && !isAvailabilityStatus(value)) {
            return NextResponse.json({ error: 'Invalid availability status' }, { status: 400 })
          }
          updates[field] = value || null
        } else if (field === 'username' && body[field]) {
          // Validate username format: alphanumeric, underscores, hyphens, 3-50 chars
          const username = String(body[field]).trim()
          if (username && !/^[a-zA-Z0-9_-]{3,50}$/.test(username)) {
            return NextResponse.json(
              { error: 'Username must be 3-50 characters and only contain letters, numbers, underscores, and hyphens' },
              { status: 400 }
            )
          }
          updates[field] = username || null
        } else if (field === 'display_name') {
          updates[field] = sanitizeText(body[field], fieldLimits[field])
        } else if (
          ['website', 'youtube_url', 'tiktok_url', 'spotify_url', 'discord_url', 'other_link_url'].includes(field) &&
          body[field]
        ) {
          // Validate link URLs start with http:// or https://
          const url = String(body[field]).trim()
          if (url && !url.match(/^https?:\/\//)) {
            return NextResponse.json(
              { error: `${field.replace(/_/g, ' ')} must start with http:// or https://` },
              { status: 400 }
            )
          }
          updates[field] = sanitizeText(url, fieldLimits[field])
        } else {
          // Trim strings, enforce max length, and convert empty strings to null
          updates[field] = sanitizeText(body[field], fieldLimits[field])
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    if (typeof updates.username === 'string' && updates.username.trim()) {
      const normalizedUsername = updates.username.trim().toLowerCase()
      const { data: existingUsername, error: usernameCheckError } = await supabaseAdmin
        .from('users')
        .select('id')
        .neq('id', user.id)
        .ilike('username', normalizedUsername)
        .limit(1)
        .maybeSingle()

      if (usernameCheckError) {
        console.error('Error checking username uniqueness:', usernameCheckError)
        return NextResponse.json({ error: 'Failed to validate username' }, { status: 500 })
      }

      if (existingUsername?.id) {
        return NextResponse.json(
          { error: 'Username is already taken', code: 'username_taken' },
          { status: 409 }
        )
      }
    }

    if (typeof updates.pinned_project_id === 'string') {
      const { data: pinnedProject, error: pinnedProjectError } = await supabaseAdmin
        .from('projects')
        .select('id, visibility, sharing_enabled')
        .eq('id', updates.pinned_project_id)
        .eq('creator_id', user.id)
        .maybeSingle()

      if (pinnedProjectError) {
        console.error('Error validating pinned project:', pinnedProjectError)
        return NextResponse.json({ error: 'Failed to validate pinned project' }, { status: 500 })
      }

      if (!pinnedProject) {
        return NextResponse.json({ error: 'Pinned project must belong to you' }, { status: 400 })
      }

      if (resolveProjectVisibility(pinnedProject.visibility, pinnedProject.sharing_enabled) !== 'public') {
        return NextResponse.json({ error: 'Pinned project must be public' }, { status: 400 })
      }
    }

    const { data: updatedUser, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select('*')
      .single()

    if (error) {
      console.error('Error updating user:', error)
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        return NextResponse.json(
          { error: 'Username is already taken', code: 'username_taken' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    console.error('Error in PATCH /api/user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
