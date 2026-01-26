import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/types'
import { z } from 'zod'
import { TransactionError, fromSupabaseError, toErrorResponse } from '@/lib/errors'

// Use ReturnType to get the actual client type
type SupabaseRouteClient = ReturnType<typeof createRouteHandlerSupabaseClient>
type SyncLogInsert = Database['public']['Tables']['sync_log']['Insert']

// Flag to enable/disable transactional sync (set via environment variable)
const USE_TRANSACTIONAL_SYNC = process.env.USE_TRANSACTIONAL_SYNC !== 'false'

// Allowed fields for task operations - prevents schema pollution
const ALLOWED_TASK_FIELDS = [
  'title', 'content', 'rich_content', 'status', 'priority', 'manual_priority',
  'due_date', 'start_date', 'completed_at', 'tags', 'parent_id', 'root_id',
  'position', 'task_type', 'type_metadata', 'node_type', 'category',
  'duration_minutes', 'computed_priority', 'updated_at'
] as const

// UUID regex for validation
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Schema for task data validation
const TaskDataSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().max(50000).nullable().optional(),
  rich_content: z.any().nullable().optional(),
  status: z.enum(['pending', 'active', 'completed', 'archived']).optional(),
  priority: z.number().min(1).max(10).optional(),
  manual_priority: z.number().optional(),
  due_date: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  parent_id: z.string().regex(uuidRegex).nullable().optional(),
  root_id: z.string().regex(uuidRegex).nullable().optional(),
  position: z.number().optional(),
  task_type: z.enum(['todo', 'course', 'project', 'club']).optional(),
  type_metadata: z.record(z.string(), z.unknown()).optional(),
  node_type: z.enum(['item', 'container']).optional(),
  category: z.string().max(50).optional(),
  duration_minutes: z.number().nullable().optional(),
  computed_priority: z.number().nullable().optional(),
  updated_at: z.string().optional()
}).strict()

// Schema for sync change validation
const SyncChangeSchema = z.object({
  operation: z.enum(['create', 'update', 'delete']),
  entity_type: z.enum(['task', 'user']),
  entity_id: z.string().regex(uuidRegex),
  data: z.record(z.string(), z.unknown()),
  vector_clock: z.record(z.string(), z.number())
})

const SyncRequestSchema = z.object({
  changes: z.array(SyncChangeSchema).max(100), // Limit batch size
  device_id: z.string().min(1).max(100)
})

/**
 * Sanitize task data to only include allowed fields
 */
function sanitizeTaskData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}

  for (const field of ALLOWED_TASK_FIELDS) {
    if (field in data) {
      sanitized[field] = data[field]
    }
  }

  return sanitized
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate request schema
    const parseResult = SyncRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid request format',
        details: parseResult.error.issues
      }, { status: 400 })
    }

    const { changes, device_id } = parseResult.data

    // Pre-validate all changes before processing
    const validatedChanges: Array<{
      operation: 'create' | 'update' | 'delete'
      entity_type: 'task' | 'user'
      entity_id: string
      data: Record<string, unknown>
      vector_clock: Record<string, number>
    }> = []

    for (const change of changes) {
      const { operation, entity_type, entity_id, data, vector_clock } = change

      // Validate and sanitize data based on entity type
      let sanitizedData: Record<string, unknown>

      if (entity_type === 'task') {
        const taskValidation = TaskDataSchema.safeParse(data)
        if (!taskValidation.success) {
          return NextResponse.json({
            error: 'Invalid task data',
            entity_id,
            details: taskValidation.error.issues[0]?.message
          }, { status: 400 })
        }
        sanitizedData = sanitizeTaskData(data)
      } else {
        // For user entity, only allow specific safe fields
        sanitizedData = {
          display_name: typeof data.display_name === 'string' ? data.display_name.slice(0, 100) : undefined,
          preferences: typeof data.preferences === 'object' ? data.preferences : undefined
        }
      }

      validatedChanges.push({
        operation,
        entity_type,
        entity_id,
        data: sanitizedData,
        vector_clock
      })
    }

    // Try transactional sync first (atomic batch operation)
    if (USE_TRANSACTIONAL_SYNC) {
      try {
        const results = await processTransactionalSync(
          supabase,
          user.id,
          device_id,
          validatedChanges
        )
        return NextResponse.json({ results, transactional: true })
      } catch (txError) {
        // Log the transaction error but fall back to non-transactional
        console.warn('Transactional sync failed, falling back to sequential:', txError)
        // Fall through to non-transactional processing
      }
    }

    // Non-transactional fallback (original behavior)
    const results = await processSequentialSync(
      supabase,
      user.id,
      device_id,
      validatedChanges
    )

    return NextResponse.json({ results, transactional: false })
  } catch (error) {
    console.error('API error:', error)
    const errorResponse = toErrorResponse(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.statusCode }
    )
  }
}

/**
 * Process sync changes using database transaction (atomic)
 * All changes succeed or all fail together
 */
async function processTransactionalSync(
  supabase: SupabaseRouteClient,
  userId: string,
  deviceId: string,
  changes: Array<{
    operation: 'create' | 'update' | 'delete'
    entity_type: 'task' | 'user'
    entity_id: string
    data: Record<string, unknown>
    vector_clock: Record<string, number>
  }>
): Promise<Array<{ entity_id: string; status: string; error?: string }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('batch_sync_changes', {
    changes: JSON.stringify(changes),
    p_user_id: userId,
    p_device_id: deviceId
  })

  if (error) {
    throw new TransactionError(
      `Batch sync failed: ${error.message}`,
      'batch_sync',
      false,
      { code: error.code, details: error.details }
    )
  }

  // Parse the results if they're a string
  const results = typeof data === 'string' ? JSON.parse(data) : data

  return Array.isArray(results) ? results : []
}

/**
 * Process sync changes sequentially (non-transactional fallback)
 * Each change is processed independently
 */
async function processSequentialSync(
  supabase: SupabaseRouteClient,
  userId: string,
  deviceId: string,
  changes: Array<{
    operation: 'create' | 'update' | 'delete'
    entity_type: 'task' | 'user'
    entity_id: string
    data: Record<string, unknown>
    vector_clock: Record<string, number>
  }>
): Promise<Array<{ entity_id: string; status: string; error?: string }>> {
  const results: Array<{ entity_id: string; status: string; error?: string }> = []

  for (const change of changes) {
    const { operation, entity_type, entity_id, data, vector_clock } = change

    try {
      // Log the sync operation
      const syncLogData: SyncLogInsert = {
        user_id: userId,
        device_id: deviceId,
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
          await handleTaskSync(supabase, userId, operation, entity_id, data)
          break
        case 'user':
          await handleUserSync(supabase, userId, operation, entity_id, data)
          break
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

  return results
}

async function handleTaskSync(
  supabase: SupabaseRouteClient,
  userId: string,
  operation: string,
  entityId: string,
  data: Record<string, unknown>
) {
  switch (operation) {
    case 'create': {
      // Build insert data with only allowed fields
      const insertData = {
        id: entityId,
        user_id: userId,
        title: (data.title as string) || 'Untitled',
        content: data.content ?? null,
        status: data.status || 'pending',
        priority: data.priority || 5,
        due_date: data.due_date ?? null,
        tags: data.tags || [],
        task_type: data.task_type || 'todo',
        type_metadata: data.type_metadata ?? {},
        parent_id: data.parent_id ?? null,
        root_id: data.root_id ?? null,
        position: data.position ?? 0,
        node_type: data.node_type || 'item',
        category: data.category ?? null,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: createError } = await (supabase as any)
        .from('tasks')
        .insert(insertData)

      if (createError) {
        throw new Error(`Failed to create task: ${createError.message}`)
      }
      break
    }

    case 'update': {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString()
      }

      // Only add fields that are present in data
      if ('title' in data) updateData.title = data.title
      if ('content' in data) updateData.content = data.content
      if ('status' in data) updateData.status = data.status
      if ('priority' in data) updateData.priority = data.priority
      if ('due_date' in data) updateData.due_date = data.due_date
      if ('tags' in data) updateData.tags = data.tags
      if ('task_type' in data) updateData.task_type = data.task_type
      if ('type_metadata' in data) updateData.type_metadata = data.type_metadata
      if ('position' in data) updateData.position = data.position

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('tasks')
        .update(updateData)
        .eq('id', entityId)
        .eq('user_id', userId)

      if (updateError) {
        throw new Error(`Failed to update task: ${updateError.message}`)
      }
      break
    }

    case 'delete': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (supabase as any)
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
    }

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

async function handleUserSync(
  supabase: SupabaseRouteClient,
  userId: string,
  operation: string,
  entityId: string,
  data: Record<string, unknown>
) {
  if (entityId !== userId) {
    throw new Error('Cannot sync other user\'s data')
  }

  switch (operation) {
    case 'update': {
      // Only allow specific safe fields for user updates
      const safeUserData: Record<string, unknown> = {}
      if ('display_name' in data) safeUserData.display_name = data.display_name
      if ('preferences' in data) safeUserData.preferences = data.preferences

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('users')
        .update(safeUserData)
        .eq('id', userId)

      if (updateError) {
        throw new Error(`Failed to update user: ${updateError.message}`)
      }
      break
    }

    default:
      throw new Error(`Unsupported user operation: ${operation}`)
  }
}
