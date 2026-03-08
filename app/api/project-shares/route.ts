import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserByPrivyId, verifyPrivyToken } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import { createProjectSharedNotification } from '@/lib/notifications'

async function resolveOptionalCurrentUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const authResult = await verifyPrivyToken(authHeader)
  if (!authResult.success || !authResult.privyId) return null

  return getUserByPrivyId(authResult.privyId)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const projectId = typeof body?.project_id === 'string' ? body.project_id : null

    if (!projectId || !isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Valid project ID is required' }, { status: 400 })
    }

    const currentUser = await resolveOptionalCurrentUser(request)

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, title, creator_id')
      .eq('id', projectId)
      .maybeSingle()

    if (projectError) {
      console.error('Error loading project for share tracking:', projectError)
      return NextResponse.json({ error: 'Failed to load project' }, { status: 500 })
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { error: shareInsertError } = await supabaseAdmin.from('project_shares').insert({
      project_id: project.id,
      user_id: currentUser?.id || null,
    })

    if (shareInsertError) {
      console.error('Error inserting project share:', shareInsertError)
    }

    const { error: metricError } = await supabaseAdmin.rpc('increment_metric', {
      p_project_id: project.id,
      p_field: 'shares',
    })

    if (metricError) {
      console.error('Error incrementing shares metric:', metricError)
      return NextResponse.json({ error: 'Failed to update metric' }, { status: 500 })
    }

    const { data: metrics, error: metricsReadError } = await supabaseAdmin
      .from('project_metrics')
      .select('*')
      .eq('project_id', project.id)
      .single()

    if (metricsReadError) {
      console.error('Error reading updated project metrics:', metricsReadError)
    }

    if (project.creator_id) {
      const notificationResult = await createProjectSharedNotification({
        creatorId: project.creator_id,
        projectId: project.id,
        projectTitle: project.title || 'Untitled project',
        sharerId: currentUser?.id || null,
        sharerName: currentUser?.username || currentUser?.email || null,
      })

      if (!notificationResult.success) {
        console.error('Error creating project shared notification:', notificationResult.error)
      }
    }

    return NextResponse.json({
      success: true,
      metrics: metrics || null,
    })
  } catch (error) {
    console.error('Error tracking project share:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
