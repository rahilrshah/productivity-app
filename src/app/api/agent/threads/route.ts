import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'

/**
 * GET /api/agent/threads
 *
 * List all conversation threads for the current user.
 * Returns threads with metadata including last message, turn count, and creation date.
 *
 * Query params:
 * - limit: number (default 50)
 * - offset: number (default 0)
 *
 * Response:
 * {
 *   "threads": [
 *     {
 *       "threadId": "uuid",
 *       "lastMessage": "string",
 *       "turnCount": number,
 *       "createdAt": "ISO date string"
 *     }
 *   ],
 *   "total": number
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    // Require authentication - no fallback to shared UUID
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Get distinct thread IDs with aggregated data
    // Using a subquery to get thread metadata
    const { data: threadData, error } = await supabase
      .from('agent_logs')
      .select('thread_id, user_input, created_at, turn_index')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching threads:', error)
      return NextResponse.json(
        { error: 'Failed to fetch threads' },
        { status: 500 }
      )
    }

    // Aggregate thread data manually since Supabase doesn't support GROUP BY easily
    const threadMap = new Map<string, {
      threadId: string
      lastMessage: string
      turnCount: number
      createdAt: string
    }>()

    for (const log of threadData || []) {
      const existing = threadMap.get(log.thread_id)
      if (!existing) {
        threadMap.set(log.thread_id, {
          threadId: log.thread_id,
          lastMessage: log.user_input,
          turnCount: 1,
          createdAt: log.created_at,
        })
      } else {
        existing.turnCount++
        // Keep the most recent message
        if (new Date(log.created_at) > new Date(existing.createdAt)) {
          existing.lastMessage = log.user_input
          existing.createdAt = log.created_at
        }
      }
    }

    // Convert to array and sort by most recent
    const threads = Array.from(threadMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Apply pagination
    const paginatedThreads = threads.slice(offset, offset + limit)

    return NextResponse.json({
      threads: paginatedThreads,
      total: threads.length,
    })

  } catch (error) {
    console.error('Agent threads GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/agent/threads
 *
 * Delete a conversation thread and all its logs.
 *
 * Request body:
 * { "threadId": "uuid" }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    // Require authentication - no fallback to shared UUID
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { threadId } = body

    if (!threadId) {
      return NextResponse.json(
        { error: 'threadId is required' },
        { status: 400 }
      )
    }

    // Delete all logs for this thread (only if owned by user)
    const { error } = await supabase
      .from('agent_logs')
      .delete()
      .eq('thread_id', threadId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting thread:', error)
      return NextResponse.json(
        { error: 'Failed to delete thread' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Agent threads DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
