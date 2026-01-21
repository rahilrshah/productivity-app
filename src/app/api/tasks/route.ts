import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/types'

type TaskInsert = Database['public']['Tables']['tasks']['Insert']

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    // Allow local-user for single-user mode
    const userId = user?.id || 'local-user'

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const task_type = searchParams.get('task_type')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search')
    // v3.0 Graph filters
    const node_type = searchParams.get('node_type')
    const category = searchParams.get('category')
    const parent_id = searchParams.get('parent_id')
    const sort_by = searchParams.get('sort_by') // 'computed_priority' or 'created_at'

    let query = supabase
      .from('tasks')
      .select('*')
      .is('deleted_at', null)

    // Only filter by user_id if authenticated
    if (user?.id) {
      query = query.eq('user_id', user.id)
    }

    // Sort order
    if (sort_by === 'computed_priority') {
      query = query.order('computed_priority', { ascending: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    query = query.range(offset, offset + limit - 1)

    // Status filter (supports comma-separated values)
    if (status) {
      const statuses = status.split(',')
      if (statuses.length > 1) {
        query = query.in('status', statuses)
      } else {
        query = query.eq('status', status)
      }
    }

    if (task_type) {
      query = query.eq('task_type', task_type)
    }

    // v3.0 Graph filters
    if (node_type) {
      query = query.eq('node_type', node_type)
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (parent_id) {
      query = query.eq('parent_id', parent_id)
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

    // Allow local-user for single-user mode
    const userId = user?.id || 'local-user'

    const body = await request.json()
    const {
      title,
      content,
      rich_content,
      priority,
      manual_priority,
      due_date,
      start_date,
      tags,
      parent_id,
      task_type,
      type_metadata,
      // v3.0 Graph fields
      node_type,
      category,
      duration_minutes,
    } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Determine node_type if not provided
    const resolvedNodeType = node_type ||
      (parent_id ? 'item' :
        (['course', 'project', 'club'].includes(task_type) ? 'container' : 'item'))

    // Determine category if not provided
    const resolvedCategory = category || task_type || 'todo'

    // Get root_id if this is a child item
    let root_id = null
    if (parent_id) {
      const { data: parentTask } = await supabase
        .from('tasks')
        .select('root_id, id, node_type')
        .eq('id', parent_id)
        .single()

      if (parentTask) {
        // If parent is a container, it becomes the root
        // Otherwise, inherit the parent's root
        root_id = parentTask.node_type === 'container' ? parentTask.id : parentTask.root_id
      }
    }

    const taskData: TaskInsert = {
      user_id: userId,
      title,
      content: content || null,
      rich_content: rich_content || null,
      priority: priority || 5,
      manual_priority: manual_priority || 0,
      due_date: due_date || null,
      start_date: start_date || null,
      tags: tags || [],
      parent_id: parent_id || null,
      root_id: root_id,
      status: 'pending',
      task_type: task_type || 'todo',
      type_metadata: type_metadata || {},
      // v3.0 Graph fields
      node_type: resolvedNodeType,
      category: resolvedCategory,
      duration_minutes: duration_minutes || null,
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create task', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}