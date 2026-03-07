import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'
import { notifyNewTrackAdded } from '@/lib/notifications'
import { isValidUUID, sanitizeText } from '@/lib/validation'
import { canViewProject } from '@/lib/projectAccessPolicyServer'
import { MAX_AUDIO_UPLOAD_SIZE_BYTES, validateStoredAudioUrl } from '@/lib/audioUploadPolicy'
import {
  MAX_UPLOAD_ATTEMPTS_PER_WINDOW,
  PROJECT_AUDIO_STORAGE_LIMIT_BYTES,
  TRACKS_PER_PROJECT_LIMIT,
  USER_DAILY_UPLOAD_BUDGET_BYTES,
  getProjectAudioStorageErrorMessage,
  getRecentUploadAttemptCount,
  getTracksPerProjectErrorMessage,
  getUploadAttemptsErrorMessage,
  getUserDailyUploadBudgetErrorMessage,
  getUserDailyUploadedBytes,
  getProjectTrackQuotaUsage,
  parseUploadSizeBytes,
  recordUploadQuotaEvent,
} from '@/lib/uploadQuotas'

// Helper to verify project ownership and get project details
async function getProjectIfOwner(projectId: string, userId: string): Promise<{ id: string; title: string; creator_id: string } | null> {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, title, creator_id')
    .eq('id', projectId)
    .single()

  if (!project || project.creator_id !== userId) {
    return null
  }

  return project
}

// Legacy helper for backwards compatibility
async function verifyProjectOwnership(projectId: string, userId: string): Promise<boolean> {
  const project = await getProjectIfOwner(projectId, userId)
  return project !== null
}

async function getOptionalUser(request: NextRequest) {
  const authResult = await verifyPrivyToken(request.headers.get('authorization'))
  if (!authResult.success || !authResult.privyId) return null
  return getUserByPrivyId(authResult.privyId)
}

// GET /api/tracks?project_id=<uuid> - list tracks with project visibility enforcement
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 })
    }

    const currentUser = await getOptionalUser(request)
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, creator_id, visibility, sharing_enabled')
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const canAccess = await canViewProject({
      project: {
        id: project.id,
        creator_id: project.creator_id,
        visibility: project.visibility,
        sharing_enabled: project.sharing_enabled,
      },
      userId: currentUser?.id,
      isDirectAccess: true,
    })
    if (!canAccess) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: tracks, error } = await supabaseAdmin
      .from('tracks')
      .select('*')
      .eq('project_id', projectId)
      .order('order', { ascending: true })
    if (error) throw error

    return NextResponse.json({ tracks: tracks || [] })
  } catch (error) {
    console.error('Error loading tracks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/tracks - Create a new track
export async function POST(request: NextRequest) {
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
    const { project_id, audio_url, image_url } = body
    const sizeBytes = parseUploadSizeBytes(body.size_bytes)

    // Validate and sanitize
    const title = sanitizeText(body.title, 200)
    const order = typeof body.order === 'number' && body.order >= 0 ? Math.floor(body.order) : 0

    if (!project_id || !isValidUUID(project_id)) {
      return NextResponse.json({ error: 'Valid project ID is required' }, { status: 400 })
    }

    if (!title || !audio_url) {
      return NextResponse.json({ error: 'Title and audio URL are required' }, { status: 400 })
    }
    if (sizeBytes === null) {
      return NextResponse.json({ error: 'size_bytes must be a non-negative integer' }, { status: 400 })
    }
    if (sizeBytes > MAX_AUDIO_UPLOAD_SIZE_BYTES) {
      return NextResponse.json({ error: `Audio file exceeds the ${Math.round(MAX_AUDIO_UPLOAD_SIZE_BYTES / 1024 / 1024)}MB size limit` }, { status: 400 })
    }

    const audioUrlError = validateStoredAudioUrl(audio_url)
    if (audioUrlError) {
      return NextResponse.json({ error: audioUrlError }, { status: 400 })
    }

    // Verify ownership and get project details
    const project = await getProjectIfOwner(project_id, user.id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 })
    }

    const attemptCount = await getRecentUploadAttemptCount(user.id)
    if (attemptCount >= MAX_UPLOAD_ATTEMPTS_PER_WINDOW) {
      await recordUploadQuotaEvent({
        userId: user.id,
        projectId: project_id,
        assetClass: 'audio',
        byteSize: sizeBytes,
        success: false,
        reason: 'attempt_window_exceeded',
      })
      return NextResponse.json({ error: getUploadAttemptsErrorMessage() }, { status: 429 })
    }

    const [dailyUploadedBytes, projectUsage] = await Promise.all([
      getUserDailyUploadedBytes(user.id),
      getProjectTrackQuotaUsage(project_id),
    ])
    if (dailyUploadedBytes + sizeBytes > USER_DAILY_UPLOAD_BUDGET_BYTES) {
      await recordUploadQuotaEvent({
        userId: user.id,
        projectId: project_id,
        assetClass: 'audio',
        byteSize: sizeBytes,
        success: false,
        reason: 'daily_budget_exceeded',
      })
      return NextResponse.json({ error: getUserDailyUploadBudgetErrorMessage() }, { status: 429 })
    }
    if (projectUsage.count >= TRACKS_PER_PROJECT_LIMIT) {
      await recordUploadQuotaEvent({
        userId: user.id,
        projectId: project_id,
        assetClass: 'audio',
        byteSize: sizeBytes,
        success: false,
        reason: 'tracks_per_project_exceeded',
      })
      return NextResponse.json({ error: getTracksPerProjectErrorMessage() }, { status: 429 })
    }
    if (projectUsage.totalBytes + sizeBytes > PROJECT_AUDIO_STORAGE_LIMIT_BYTES) {
      await recordUploadQuotaEvent({
        userId: user.id,
        projectId: project_id,
        assetClass: 'audio',
        byteSize: sizeBytes,
        success: false,
        reason: 'project_audio_storage_exceeded',
      })
      return NextResponse.json({ error: getProjectAudioStorageErrorMessage() }, { status: 429 })
    }

    const { data: track, error } = await supabaseAdmin
      .from('tracks')
      .insert({
        project_id,
        title,
        audio_url,
        image_url: image_url || null,
        size_bytes: sizeBytes,
        order: order ?? 0,
      })
      .select()
      .single()

    if (error) throw error

    await recordUploadQuotaEvent({
      userId: user.id,
      projectId: project_id,
      assetClass: 'audio',
      byteSize: sizeBytes,
      success: true,
      reason: 'track_created',
    })

    // Notify users who have saved this project about the new track
    // This runs async and doesn't block the response
    notifyNewTrackAdded({
      projectId: project_id,
      creatorId: user.id,
      projectTitle: project.title,
      trackTitle: title,
    }).catch((err) => {
      console.error('Failed to send new track notifications:', err)
    })

    return NextResponse.json({ track }, { status: 201 })
  } catch (error) {
    console.error('Error creating track:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/tracks - Update a track
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
    const { id, audio_url, image_url } = body
    const sizeBytes = audio_url !== undefined ? parseUploadSizeBytes(body.size_bytes) : undefined

    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: 'Valid track ID is required' }, { status: 400 })
    }

    if (audio_url !== undefined) {
      if (typeof audio_url !== 'string' || !audio_url.trim()) {
        return NextResponse.json({ error: 'audio_url must be a non-empty string' }, { status: 400 })
      }
      if (sizeBytes === null) {
        return NextResponse.json({ error: 'size_bytes must be a non-negative integer' }, { status: 400 })
      }
      if ((sizeBytes || 0) > MAX_AUDIO_UPLOAD_SIZE_BYTES) {
        return NextResponse.json({ error: `Audio file exceeds the ${Math.round(MAX_AUDIO_UPLOAD_SIZE_BYTES / 1024 / 1024)}MB size limit` }, { status: 400 })
      }
      const audioUrlError = validateStoredAudioUrl(audio_url)
      if (audioUrlError) {
        return NextResponse.json({ error: audioUrlError }, { status: 400 })
      }
    }

    // Sanitize optional text fields
    const title = body.title !== undefined ? sanitizeText(body.title, 200) : undefined
    const order = body.order !== undefined
      ? (typeof body.order === 'number' && body.order >= 0 ? Math.floor(body.order) : undefined)
      : undefined

    // Get track and verify ownership via project
    const { data: existingTrack } = await supabaseAdmin
      .from('tracks')
      .select('project_id, size_bytes')
      .eq('id', id)
      .single()

    if (!existingTrack) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    if (!(await verifyProjectOwnership(existingTrack.project_id, user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (audio_url !== undefined) {
      const uploadSizeBytes = sizeBytes || 0
      const attemptCount = await getRecentUploadAttemptCount(user.id)
      if (attemptCount >= MAX_UPLOAD_ATTEMPTS_PER_WINDOW) {
        await recordUploadQuotaEvent({
          userId: user.id,
          projectId: existingTrack.project_id,
          assetClass: 'audio',
          byteSize: uploadSizeBytes,
          success: false,
          reason: 'attempt_window_exceeded',
        })
        return NextResponse.json({ error: getUploadAttemptsErrorMessage() }, { status: 429 })
      }

      const [dailyUploadedBytes, projectUsage] = await Promise.all([
        getUserDailyUploadedBytes(user.id),
        getProjectTrackQuotaUsage(existingTrack.project_id),
      ])
      if (dailyUploadedBytes + uploadSizeBytes > USER_DAILY_UPLOAD_BUDGET_BYTES) {
        await recordUploadQuotaEvent({
          userId: user.id,
          projectId: existingTrack.project_id,
          assetClass: 'audio',
          byteSize: uploadSizeBytes,
          success: false,
          reason: 'daily_budget_exceeded',
        })
        return NextResponse.json({ error: getUserDailyUploadBudgetErrorMessage() }, { status: 429 })
      }

      const currentTrackSizeBytes = typeof existingTrack.size_bytes === 'number' ? existingTrack.size_bytes : 0
      const projectedTotalBytes = projectUsage.totalBytes - currentTrackSizeBytes + uploadSizeBytes
      if (projectedTotalBytes > PROJECT_AUDIO_STORAGE_LIMIT_BYTES) {
        await recordUploadQuotaEvent({
          userId: user.id,
          projectId: existingTrack.project_id,
          assetClass: 'audio',
          byteSize: uploadSizeBytes,
          success: false,
          reason: 'project_audio_storage_exceeded',
        })
        return NextResponse.json({ error: getProjectAudioStorageErrorMessage() }, { status: 429 })
      }
    }

    // Build update object
    const updates: Record<string, unknown> = {}
    if (title !== undefined) updates.title = title
    if (audio_url !== undefined) updates.audio_url = audio_url
    if (audio_url !== undefined) updates.size_bytes = sizeBytes || 0
    if (image_url !== undefined) updates.image_url = image_url
    if (order !== undefined) updates.order = order

    const { data: track, error } = await supabaseAdmin
      .from('tracks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    if (audio_url !== undefined) {
      await recordUploadQuotaEvent({
        userId: user.id,
        projectId: existingTrack.project_id,
        assetClass: 'audio',
        byteSize: sizeBytes || 0,
        success: true,
        reason: 'track_audio_replaced',
      })
    }

    return NextResponse.json({ track })
  } catch (error) {
    console.error('Error updating track:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/tracks - Delete a track
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserByPrivyId(authResult.privyId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: 'Valid track ID is required' }, { status: 400 })
    }

    // Get track and verify ownership via project
    const { data: existingTrack } = await supabaseAdmin
      .from('tracks')
      .select('project_id')
      .eq('id', id)
      .single()

    if (!existingTrack) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    if (!(await verifyProjectOwnership(existingTrack.project_id, user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('tracks')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting track:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
