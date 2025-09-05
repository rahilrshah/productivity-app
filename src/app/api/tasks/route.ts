import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/types'

type TaskInsert = Database['public']['Tables']['tasks']['Insert']

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const task_type = searchParams.get('task_type')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search')

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('position', { ascending: true })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (task_type) {
      query = query.eq('task_type', task_type)
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`)
    }

    const { data: tasks, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
    }

    return NextResponse.json({ tasks })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, content, priority, due_date, tags, parent_id, task_type, type_metadata } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Get the maximum position for ordering
    const { data: maxPositionData } = await supabase
      .from('tasks')
      .select('position')
      .eq('user_id', user.id)
      .order('position', { ascending: false })
      .limit(1)

    const nextPosition = maxPositionData?.[0]?.position ? maxPositionData[0].position + 1 : 0

    const taskData: TaskInsert = {
      user_id: user.id,
      title,
      content: content || null,
      priority: priority || 5,
      due_date: due_date || null,
      tags: tags || [],
      parent_id: parent_id || null,
      position: nextPosition,
      status: 'pending',
      task_type: task_type || 'todo',
      type_metadata: type_metadata || {}
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
    }

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}