import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Valid metric field names
const VALID_FIELDS = ['plays', 'shares', 'adds'] as const
type MetricField = typeof VALID_FIELDS[number]

// Validate UUID format
function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

// POST /api/metrics - Atomically increment a project metric
export async function POST(request: NextRequest) {
  try {
    const { project_id, field } = await request.json()

    if (!project_id || !field) {
      return NextResponse.json(
        { error: 'project_id and field are required' },
        { status: 400 }
      )
    }

    if (!isValidUUID(project_id)) {
      return NextResponse.json(
        { error: 'Invalid project_id format' },
        { status: 400 }
      )
    }

    if (!VALID_FIELDS.includes(field as MetricField)) {
      return NextResponse.json(
        { error: `Invalid field. Must be one of: ${VALID_FIELDS.join(', ')}` },
        { status: 400 }
      )
    }

    // Verify the project exists
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .single()

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Call the atomic increment RPC function
    const { error: rpcError } = await supabaseAdmin
      .rpc('increment_metric', { p_project_id: project_id, p_field: field })

    if (rpcError) {
      console.error('Error incrementing metric:', rpcError)
      return NextResponse.json(
        { error: 'Failed to update metric' },
        { status: 500 }
      )
    }

    // Return updated metrics
    const { data: metrics } = await supabaseAdmin
      .from('project_metrics')
      .select('*')
      .eq('project_id', project_id)
      .single()

    return NextResponse.json({ metrics })
  } catch (error) {
    console.error('Error in metrics endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
