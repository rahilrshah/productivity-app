import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/types'

type TaskUpdate = Database['public']['Tables']['tasks']['Update']

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Allow local-user for single-user mode (use deterministic UUID)
    const userId = user?.id || '00000000-0000-0000-0000-000000000000'

    const { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 })
      }
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 })
    }

    return NextResponse.json({ task })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Allow local-user for single-user mode (use deterministic UUID)
    const userId = user?.id || '00000000-0000-0000-0000-000000000000'

    const body = await request.json()
    const updates: TaskUpdate = {}

    // Only include fields that were provided
    if (body.title !== undefined) updates.title = body.title
    if (body.content !== undefined) updates.content = body.content
    if (body.status !== undefined) {
      updates.status = body.status
      if (body.status === 'completed') {
        updates.completed_at = new Date().toISOString()
      } else if (updates.completed_at) {
        updates.completed_at = null
      }
    }
    if (body.priority !== undefined) updates.priority = body.priority
    if (body.due_date !== undefined) updates.due_date = body.due_date
    if (body.tags !== undefined) updates.tags = body.tags
    if (body.position !== undefined) updates.position = body.position
    if (body.task_type !== undefined) updates.task_type = body.task_type
    if (body.type_metadata !== undefined) updates.type_metadata = body.type_metadata

    updates.updated_at = new Date().toISOString()

    const { data: task, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', params.id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 })
      }
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
    }

    return NextResponse.json({ task })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Allow local-user for single-user mode (use deterministic UUID)
    const userId = user?.id || '00000000-0000-0000-0000-000000000000'

    // Soft delete by setting deleted_at timestamp
    const { error } = await supabase
      .from('tasks')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 })
      }
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Task deleted successfully' })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}