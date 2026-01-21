import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    const userId = user?.id || 'local-user'

    const { searchParams } = new URL(request.url)
    const task_id = searchParams.get('task_id')

    if (!task_id) {
      return NextResponse.json({ error: 'task_id is required' }, { status: 400 })
    }

    // Get relations where this task is the predecessor (blocking others)
    const { data: blocking, error: blockingError } = await supabase
      .from('task_relations')
      .select('*')
      .eq('predecessor_id', task_id)

    if (blockingError) {
      console.error('Error fetching blocking relations:', blockingError)
      return NextResponse.json({ error: 'Failed to fetch relations' }, { status: 500 })
    }

    // Get relations where this task is the successor (blocked by others)
    const { data: blockedBy, error: blockedByError } = await supabase
      .from('task_relations')
      .select('*')
      .eq('successor_id', task_id)

    if (blockedByError) {
      console.error('Error fetching blockedBy relations:', blockedByError)
      return NextResponse.json({ error: 'Failed to fetch relations' }, { status: 500 })
    }

    return NextResponse.json({ blocking: blocking || [], blockedBy: blockedBy || [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    const userId = user?.id || 'local-user'

    const body = await request.json()
    const { predecessor_id, successor_id, relation_type } = body

    if (!predecessor_id || !successor_id) {
      return NextResponse.json(
        { error: 'predecessor_id and successor_id are required' },
        { status: 400 }
      )
    }

    // Prevent self-referencing relations
    if (predecessor_id === successor_id) {
      return NextResponse.json(
        { error: 'Cannot create relation to self' },
        { status: 400 }
      )
    }

    const relationData = {
      user_id: userId,
      predecessor_id,
      successor_id,
      relation_type: relation_type || 'blocks',
    }

    const { data: relation, error } = await supabase
      .from('task_relations')
      .insert(relationData)
      .select()
      .single()

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Relation already exists between these tasks' },
          { status: 409 }
        )
      }
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to create relation', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ relation }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
