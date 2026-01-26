import { NextRequest, NextResponse } from 'next/server'
import { processPendingJobs } from '@/lib/agent/jobProcessor'

/**
 * POST /api/agent/jobs/process
 *
 * Trigger background job processing.
 * This endpoint is designed to be called by:
 * - Cron jobs (scheduled invocation)
 * - Webhooks (event-driven processing)
 * - Internal triggers (after job creation)
 *
 * Security: This endpoint uses a secret token for authentication
 * to prevent unauthorized job processing triggers.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.JOB_PROCESSOR_SECRET

    // In development, allow requests without token
    const isDev = process.env.NODE_ENV !== 'production'

    if (!isDev) {
      if (!expectedToken) {
        console.error('JOB_PROCESSOR_SECRET not configured')
        return NextResponse.json(
          { error: 'Server configuration error' },
          { status: 500 }
        )
      }

      if (authHeader !== `Bearer ${expectedToken}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Parse options from request body
    const body = await request.json().catch(() => ({}))
    const maxJobs = Math.min(Math.max(body.maxJobs || 10, 1), 50) // Limit between 1-50

    // Process pending jobs
    const processedCount = await processPendingJobs(maxJobs)

    return NextResponse.json({
      success: true,
      processed: processedCount,
      message: `Processed ${processedCount} jobs`,
    })

  } catch (error) {
    console.error('Job processor API error:', error)
    return NextResponse.json(
      { error: 'Failed to process jobs' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/agent/jobs/process
 *
 * Get processing status (for monitoring)
 */
export async function GET(request: NextRequest) {
  try {
    // Simple health check - no auth required
    return NextResponse.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: 'Health check failed' },
      { status: 500 }
    )
  }
}
