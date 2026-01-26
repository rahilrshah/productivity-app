import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'
import { AgentJob } from '@/types/agent'

/**
 * GET /api/agent/jobs/[id]
 *
 * Get the status of a specific job
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: job, error } = await supabase
      .from('agent_jobs')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
      console.error('Error fetching job:', error)
      return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 })
    }

    return NextResponse.json({ job })

  } catch (error) {
    console.error('Job status API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/agent/jobs/[id]
 *
 * Cancel a pending or processing job
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only cancel jobs that are pending or claimed (not yet processing)
    const { data: job, error } = await supabase
      .from('agent_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .in('status', ['pending', 'claimed'])
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Job either doesn't exist or is already processing/completed
        return NextResponse.json(
          { error: 'Job not found or cannot be cancelled' },
          { status: 404 }
        )
      }
      console.error('Error cancelling job:', error)
      return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 })
    }

    return NextResponse.json({ job, message: 'Job cancelled' })

  } catch (error) {
    console.error('Job cancel API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/agent/jobs/[id]
 *
 * Retry a failed job
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { action } = body

    if (action !== 'retry') {
      return NextResponse.json(
        { error: 'Invalid action. Supported: retry' },
        { status: 400 }
      )
    }

    // Only retry failed jobs
    const { data: existingJob, error: fetchError } = await supabase
      .from('agent_jobs')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (existingJob.status !== 'failed') {
      return NextResponse.json(
        { error: 'Only failed jobs can be retried' },
        { status: 400 }
      )
    }

    // Reset job for retry
    const { data: job, error } = await supabase
      .from('agent_jobs')
      .update({
        status: 'pending',
        error_message: null,
        completed_at: null,
        claimed_by: null,
        claimed_at: null,
        started_at: null,
        next_retry_at: null,
        progress: 0,
        progress_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Error retrying job:', error)
      return NextResponse.json({ error: 'Failed to retry job' }, { status: 500 })
    }

    return NextResponse.json({ job, message: 'Job queued for retry' })

  } catch (error) {
    console.error('Job retry API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
