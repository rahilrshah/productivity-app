import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/types'

type SyncLogInsert = Database['public']['Tables']['sync_log']['Insert']

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { changes, device_id } = body

    if (!changes || !Array.isArray(changes) || !device_id) {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400 })
    }

    const results = []
    
    for (const change of changes) {
      const { operation, entity_type, entity_id, data, vector_clock } = change

      if (!operation || !entity_type || !entity_id || !data || !vector_clock) {
        results.push({ entity_id, status: 'error', error: 'Missing required fields' })
        continue
      }

      try {
        // Log the sync operation
        const syncLogData: SyncLogInsert = {
          user_id: user.id,
          device_id,
          operation,
          entity_type,
          entity_id,
          changes: data,
          vector_clock,
        }

        const { error: syncLogError } = await supabase
          .from('sync_log')
          .insert(syncLogData)

        if (syncLogError) {
          console.error('Sync log error:', syncLogError)
          results.push({ entity_id, status: 'error', error: 'Failed to log sync operation' })
          continue
        }

        // Apply the change to the appropriate table
        switch (entity_type) {
          case 'task':
            await handleTaskSync(supabase, user.id, operation, entity_id, data)
            break
          case 'user':
            await handleUserSync(supabase, user.id, operation, entity_id, data)
            break
          default:
            results.push({ entity_id, status: 'error', error: 'Unknown entity type' })
            continue
        }

        results.push({ entity_id, status: 'success' })
      } catch (error) {
        console.error('Sync processing error:', error)
        results.push({ 
          entity_id, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleTaskSync(
  supabase: any,
  userId: string,
  operation: string,
  entityId: string,
  data: any
) {
  switch (operation) {
    case 'create':
      const { error: createError } = await supabase
        .from('tasks')
        .insert({ 
          id: entityId, 
          user_id: userId,
          ...data 
        })
      
      if (createError) {
        throw new Error(`Failed to create task: ${createError.message}`)
      }
      break

    case 'update':
      const { error: updateError } = await supabase
        .from('tasks')
        .update(data)
        .eq('id', entityId)
        .eq('user_id', userId)
      
      if (updateError) {
        throw new Error(`Failed to update task: ${updateError.message}`)
      }
      break

    case 'delete':
      const { error: deleteError } = await supabase
        .from('tasks')
        .update({ 
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', entityId)
        .eq('user_id', userId)
      
      if (deleteError) {
        throw new Error(`Failed to delete task: ${deleteError.message}`)
      }
      break

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

async function handleUserSync(
  supabase: any,
  userId: string,
  operation: string,
  entityId: string,
  data: any
) {
  if (entityId !== userId) {
    throw new Error('Cannot sync other user\'s data')
  }

  switch (operation) {
    case 'update':
      const { error: updateError } = await supabase
        .from('users')
        .update(data)
        .eq('id', userId)
      
      if (updateError) {
        throw new Error(`Failed to update user: ${updateError.message}`)
      }
      break

    default:
      throw new Error(`Unsupported user operation: ${operation}`)
  }
}